"use strict";

// 席位凭据的本机托管。宿主中立：不引用 Codex / Claude / MCP / Hook。
//
// 存在的理由（F6）：席位凭据是长期有效的秘密，而适配器面向的是一个语言模型。凭据一旦
// 作为文本进入模型上下文，它就会出现在 transcript、错误回显、诊断日志和对手可见的公开
// 发言旁边——每一处都是泄漏面，而且模型无法可靠地「记住不要说出来」。
//
// 所以边界是：核心继续校验凭据（那是权威的信任边界，不能削弱），但凭据只在协调器进程内
// 存在。模型拿到的是一个不透明句柄，句柄的作用域就是这个进程的内存，进程结束即失效。
//
// 句柄不是「更弱的凭据」这么简单：它确实也是一份能代表该席行动的能力，但它不可移植、
// 不能过网、不能用来在别的进程上恢复席位，而凭据可以。F6 要防的正是那个可移植的秘密
// 被复制出去。
//
// 为什么泄漏扫描比对原文而不是用正则：协调器手里本来就有那几份秘密，逐份精确比对能说清
// 「扫到的就是它」。正则只能猜「长得像令牌的东西」，既会漏掉换了格式的凭据，也会把无关
// 字符串误判成秘密——一个会误报的门迟早被关掉。

const crypto = require("node:crypto");
const { CREDENTIAL_COMMANDS } = require("../authority/host-surface.cjs");

// 从核心返回里必须摘掉的字段。名字取自命令面实际吐出的键，不是猜的。
//
// invite_code 刻意不在这里。它也是一份能力，但性质不同：建房的人必须看得见邀请码才能
// 转给朋友，净化掉它等于把入房这件事删掉。而席位凭据不需要任何人肉眼看见——它只在
// 协调器与核心之间走。两者的判断标准是「有没有人必须读它」，不是「像不像秘密」。
//
// 邀请码的风险面也确实更小：一次性、房间最多四席、谁入座了同桌的人都看得见；而席位凭据
// 长期有效，泄漏就等于可以冒名一个已经在场的人。
const SECRET_FIELDS = Object.freeze(["recovery_credential", "credential"]);

class CredentialLeak extends Error {
  constructor(where, field) {
    super(`credential_leak:${where}`);
    this.name = "CredentialLeak";
    this.code = "credential_leak";
    // 刻意不带秘密原文，也不带片段。泄漏报告本身不该成为第二次泄漏。
    this.details = { where, field: field ?? null };
  }
}

class CustodyError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = "CustodyError";
    this.code = code;
    this.details = details;
  }
}

class SeatCustody {
  constructor(options = {}) {
    this.handleFactory = typeof options.handleFactory === "function"
      ? options.handleFactory
      : () => `seat-handle-${crypto.randomUUID()}`;
    // handle -> { seat_id, credential }
    this.bindings = new Map();
    // 已托管过的凭据原文。扫描用，不随 forget 清空：一份凭据只要曾经进过这个进程，
    // 它出现在模型可见文本里就仍然是泄漏。离桌后凭据失效，但泄漏的事实不会因此消失。
    this.knownSecrets = new Set();
  }

  bind(input = {}) {
    const seatId = requireText(input.seatId, "seatId");
    const credential = requireText(input.credential, "credential");
    const handle = String(this.handleFactory());
    this.bindings.set(handle, { seat_id: seatId, credential });
    this.knownSecrets.add(credential);
    // 只回句柄与公开的 seat_id。seat_id 本来就在公开投影里，藏它没有意义。
    return { seat_handle: handle, seat_id: seatId };
  }

  resolve(handleValue) {
    const handle = requireText(handleValue, "seatHandle");
    const bound = this.bindings.get(handle);
    if (bound === undefined) {
      // details 里不放任何已持有的秘密，也不放句柄清单：那会把这里变成枚举口。
      throw new CustodyError("seat_handle_unknown");
    }
    return { seat_id: bound.seat_id, credential: bound.credential };
  }

  // 把模型给的句柄换成核心要的 seat_id + recovery_credential。
  //
  // 模型自带的 seat_id / recovery_credential 一律报错而不是覆盖。覆盖看起来更宽容，
  // 实际是把绕过口留着：模型只要传一个别席的公开 seat_id，句柄制就白做了。而模型手里
  // 出现凭据本身就说明托管已经破了，此时静默采信等于把泄漏升级成可用权限。
  inject(command, params = {}) {
    const incoming = params === null || typeof params !== "object" ? {} : { ...params };
    if (!CREDENTIAL_COMMANDS.includes(command)) {
      // 不要凭据的命令原样通过。但句柄也不该往核心发——核心不认识它。
      delete incoming.seat_handle;
      return incoming;
    }

    if (incoming.seat_id !== undefined) {
      throw new CustodyError("seat_id_not_model_supplied", { command });
    }
    if (incoming.recovery_credential !== undefined) {
      throw new CustodyError("credential_not_model_supplied", { command });
    }
    if (incoming.seat_handle === undefined) {
      // 不按「反正只绑了一席」去猜。单席时猜对了，多席适配器上就是替错的人行动。
      throw new CustodyError("seat_handle_required", { command });
    }

    const { seat_id: seatId, credential } = this.resolve(incoming.seat_handle);
    delete incoming.seat_handle;
    return { ...incoming, seat_id: seatId, recovery_credential: credential };
  }

  // 本进程托管的句柄。给模型命令面扇出用（ai.take_intents 要遍历本机拥有的席位）。
  //
  // 只回句柄，不回 seat_id 也不回凭据：调用方要的是「往哪些席位各发一次」，而不是
  // 「这些席位是谁」。返回数组的副本，外部拿到的东西改不动这里的绑定。
  handles() {
    return [...this.bindings.keys()];
  }

  forget(handleValue) {
    return this.bindings.delete(String(handleValue));
  }

  // 记住一份不经 bind 的秘密（例如邀请码），只为让扫描认得它。
  remember(secret) {
    if (typeof secret === "string" && secret.length > 0) {
      this.knownSecrets.add(secret);
    }
    return secret;
  }

  // 把核心返回净化成模型可见的形状：摘掉秘密字段，并为其中的凭据换发句柄。
  //
  // 顺序要紧。先 bind 再删字段：bind 需要原文才能建立句柄，也才能把这份凭据登记进
  // knownSecrets 供之后扫描。删完再 bind 就什么都绑不上了。
  sanitizeResult(value) {
    const cleaned = stripSecrets(value, (secret) => this.remember(secret));
    return cleaned;
  }

  // 从 room.create / room.join 的返回里取出凭据、换成句柄，返回给模型看的那份。
  // 这两条命令是凭据唯一的产生点，所以托管的入口也只有这里。
  bindFromResult(result) {
    const found = findSeatAndCredential(result);
    const sanitized = this.sanitizeResult(result);
    if (found === null) {
      return { result: sanitized, seat_handle: null };
    }
    const bound = this.bind({ seatId: found.seatId, credential: found.credential });
    return { result: sanitized, seat_handle: bound.seat_handle, seat_id: bound.seat_id };
  }

  // 模型可见文本的负向扫描。命中即抛，不做「打码后放过」——打码后的文本仍然证明这条
  // 路径会搬运秘密，下一次换个字段名就又漏出去了。要修的是搬运，不是显示。
  assertNoLeak(text, where = "tool_result") {
    const haystack = typeof text === "string" ? text : JSON.stringify(text) ?? "";
    // 值扫描：整段文本里任何位置出现凭据原文都算泄漏，不限键位。
    // 这一条才是真正的防线，下面那条只是补漏。
    for (const secret of this.knownSecrets) {
      if (haystack.includes(secret)) {
        throw new CredentialLeak(where, null);
      }
    }
    for (const field of SECRET_FIELDS) {
      // 字段名也扫，但只扫**键位**。此刻值可能还没进 knownSecrets（比如换了新凭据的
      // 返回），而一个叫 recovery_credential 的键出现在模型可见结构里，本身就是搬运。
      //
      // 为什么必须限定键位：不限的话，安全边界报不出自己拒了什么。
      // ModelCommandSurface 拒收模型自带身份字段时，details.field 的**值**正是
      // "recovery_credential"，那条拒绝是边界起作用的证据，却会被这里判成泄漏——
      // 一次成功的拦截于是显示成一次内部泄漏，读日志的人得到完全相反的结论，
      // 而模型也拿不到「你不该自己带这个字段」这句话。
      //
      // 这没有放宽对值的判据：凭据原文出现在值位仍然由上面那圈命中。
      // JSON.stringify 可能带缩进（server.cjs 用 null, 2），所以冒号前允许空白。
      if (new RegExp(`"${field}"\\s*:`).test(haystack)) {
        throw new CredentialLeak(where, field);
      }
    }
    return haystack;
  }
}

// 深拷贝并摘掉秘密字段。摘掉而不是置空：留一个 recovery_credential: null 会让下游以为
// 「这里本来该有凭据」，于是有人把它填回去。
function stripSecrets(value, onSecret) {
  if (Array.isArray(value)) {
    return value.map((item) => stripSecrets(item, onSecret));
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_FIELDS.includes(key)) {
      if (typeof item === "string") onSecret(item);
      continue;
    }
    out[key] = stripSecrets(item, onSecret);
  }
  return out;
}

// 在返回里找「这一席 + 它的凭据」。只认命令面实际的形状（result.seat.seat_id 与
// result.recovery_credential），不做全树启发式搜索：猜错席位比找不到更糟。
function findSeatAndCredential(value) {
  const result = value?.result ?? value;
  if (result === null || typeof result !== "object") return null;
  const seatId = result.seat?.seat_id;
  const credential = result.recovery_credential;
  if (typeof seatId !== "string" || typeof credential !== "string") return null;
  return { seatId, credential };
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CustodyError("invalid_field", { field });
  }
  return value;
}

module.exports = {
  CredentialLeak,
  CustodyError,
  SeatCustody,
  SECRET_FIELDS,
  CREDENTIAL_COMMANDS,
};
