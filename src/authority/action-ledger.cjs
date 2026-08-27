"use strict";

// 官方动作的幂等账。
//
// 存在的理由（Codex 复核 F2）：一次丢了响应的正常重试可以替玩家执行下一街的动作。
// 双人桌里 check 让街推进后仍由同一玩家先行动，于是重放同一个请求看起来完全合法——
// 演员对得上、动作合法、引擎照常接受。没有任何单条规则被违反，但玩家的一个决定
// 变成了两个。
//
// 三个字段各挡一件不同的事，缺一个都留洞：
//   hand_id           挡「上一手的请求打到这一手」。
//   expected_revision 挡「用过期状态形成的请求在新状态上执行」。
//   idempotency_key   挡「重试被当成第二个动作」。
//
// 只有前两个字段时，一次真实的网络重试会被 revision_conflict 确定性拒绝——状态是对的，
// 但客户端反而无法判断自己那一手到底成没成，只能再试或者问人。幂等键把「重试」与
// 「新动作」区分开，这是它不可省的那一半。
//
// 本模块不认识德扑，也不认识席位状态。它只回答一个问题：这个 (scope, key) 我见过吗，
// 见过的话当时的请求指纹是不是同一个。
//
// 为什么是 scope 而不是 hand_id：F2 要求 4 说的是「hand.reveal 和其他可重放写命令采用
// 同一套幂等策略」，而不是「所有写命令都按手记账」。chat.say 就不按手——牌局之间也能发言，
// 此时根本没有 hand_id。所以账本收一个不透明的作用域串，由调用方决定它的含义：
//   hand:<hand_id>      官方动作，随手清理。
//   room:<room_binding_id>  公开发言，跨手存活。
// 作用域的语义留在调用方，本模块只负责隔离：两个不同作用域的同名键互不相干。

const { ProbeError } = require("./event-store.cjs");

function requiredKey(value, field) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new ProbeError("invalid_field", 400, { field });
  }
  return value;
}

// revision 是用来比大小的整数，不接受字符串数字。收下 "3" 就等于把类型错误推迟到
// 「为什么这一手重复执行了」那一步才暴露，而那时离出错点已经很远。
function requiredRevision(value, field) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ProbeError("invalid_field", 400, { field });
  }
  return value;
}

// 请求指纹。调用方给出的必须是**不含秘密**的字段集：席位凭据在进入本模块之前就已经
// 由命令面验证过，账里只需要席位身份。把凭据放进指纹等于把它写进一个会长期驻留的结构，
// 而 F6 要求的正是凭据不出协调器。
function fingerprint(fields) {
  const keys = Object.keys(fields).sort();
  return JSON.stringify(keys.map((key) => [key, fields[key] ?? null]));
}

// 单个作用域最多记多少条。跨手存活的作用域（room:）必须有上界，否则一场长牌局的
// 聊天会让账本无界增长。超上界时按插入顺序丢最早的：一条在其后又来了 512 条消息才到达的
// 「重试」不是重试，它已经不该被当成同一次提交。hand: 作用域一手之内到不了这个数。
const MAX_ENTRIES_PER_SCOPE = 512;

// 作用域串的构造只有这两个出口，免得调用方各自拼前缀，把 "hand:x" 和 "hand-x" 写成两个
// 互不相干的账。
function handScope(handId) {
  return `hand:${requiredKey(handId, "hand_id")}`;
}

function roomScope(roomBindingId) {
  return `room:${requiredKey(roomBindingId, "room_binding_id")}`;
}

class ActionLedger {
  constructor({ maxEntriesPerScope = MAX_ENTRIES_PER_SCOPE } = {}) {
    // scope -> Map<idempotencyKey, {fingerprint, envelope}>
    this.byScope = new Map();
    this.maxEntriesPerScope = maxEntriesPerScope;
  }

  // 新的一手开始时丢掉别手的账。旧手的键本来就会被 hand_id 门禁拒绝，所以这只是防止
  // 长会话里无界增长，不改变任何判定。
  //
  // 只动 hand: 作用域：room: 记的是公开发言，它按房间存活，跨手清掉就等于让一次跨手的
  // 聊天重试重新发一遍言。
  forgetHandScopesExcept(handId) {
    const keep = handScope(handId);
    for (const scope of [...this.byScope.keys()]) {
      if (scope.startsWith("hand:") && scope !== keep) {
        this.byScope.delete(scope);
      }
    }
  }

  entries(scope) {
    let bucket = this.byScope.get(scope);
    if (bucket === undefined) {
      bucket = new Map();
      this.byScope.set(scope, bucket);
    }
    return bucket;
  }

  // 查账。三种结果：
  //   {replay: true, envelope}  见过且指纹相同 -> 调用方直接返回原信封，不执行。
  //   抛 idempotency_key_conflict 见过但指纹不同 -> 确定性拒绝，不猜。
  //   {replay: false}           没见过 -> 调用方执行，随后 commit。
  lookup({ scope, idempotencyKey, fields }) {
    const bucket = requiredKey(scope, "scope");
    const key = requiredKey(idempotencyKey, "idempotency_key");
    const print = fingerprint(fields);
    const recorded = this.entries(bucket).get(key);
    if (recorded === undefined) {
      return { replay: false, fingerprint: print };
    }
    if (recorded.fingerprint !== print) {
      // 同键不同 payload。可能是客户端 bug，也可能是有人拿别人的键做别的事。
      // 无论哪种都不能猜：猜「按新 payload 执行」会让键失去意义，猜「返回原结果」
      // 会让调用方以为自己那个不同的动作成功了。
      throw new ProbeError("idempotency_key_conflict", 409, {
        scope: bucket,
        idempotency_key: key,
      });
    }
    return { replay: true, envelope: recorded.envelope, fingerprint: print };
  }

  commit({ scope, idempotencyKey, fingerprint: print, envelope }) {
    const bucket = requiredKey(scope, "scope");
    const key = requiredKey(idempotencyKey, "idempotency_key");
    const entries = this.entries(bucket);
    entries.set(key, { fingerprint: print, envelope });
    // Map 保持插入顺序，所以第一个键就是最早的那条。
    while (entries.size > this.maxEntriesPerScope) {
      entries.delete(entries.keys().next().value);
    }
    return envelope;
  }

  // 诊断用：某个作用域记了多少条。测试用它确认账真的按作用域隔离、真的被清理。
  size(scope) {
    return this.byScope.get(scope)?.size ?? 0;
  }

  scopeCount() {
    return this.byScope.size;
  }
}

module.exports = {
  ActionLedger,
  requiredRevision,
  requiredKey,
  fingerprint,
  handScope,
  roomScope,
  MAX_ENTRIES_PER_SCOPE,
};
