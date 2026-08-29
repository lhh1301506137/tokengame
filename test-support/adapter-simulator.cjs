"use strict";

// 合同模拟器。两个参考适配器 + 一组故意坏掉的变体。
//
// 宿主中立：不引用 Codex / Claude / MCP / 浏览器。这里的「宿主」是一个假的，只实现合同要求
// 的那几件事，用来回答两个问题：
//
//   1. 一致性套件对着一个合规实现是全绿的吗（否则套件本身有 bug）。
//   2. 一致性套件真的能抓到不合规吗（否则它是一组恒为真的断言——本轮反复撞到的那一类）。
//
// 第二个问题是这个文件存在的主要理由。BROKEN 里每一项都恰好破坏一条不变量，
// test/adapter-conformance.test.cjs 逐个跑过去，要求每一项都至少让一条检查变红。

const {
  CONTRACT_VERSION,
  ContractError,
  commandsForRole,
  errorEnvelope,
  negotiate,
  nextLifecycleState,
  okEnvelope,
} = require("../src/contract/adapter-contract.cjs");

// 按角色挑一个已验证 command_dispatch 的剖面。
//
// 只在这份模拟器里推，合同不提供「替我猜剖面」的 API：真适配器知道自己是哪个宿主，各自
// 写死一个 DEFAULT_PROFILE（seat-model-adapter 是 codex_cli，host-command-adapter 是
// web_table）。给合同加一个猜的入口会把「适配器必须说明自己是谁」这件事削回去。
//
// 模拟器不同，它是按角色参数化的——一致性套件对两个角色跑同一批检查，不该为了剖面名多传
// 一个参数。claude_desktop 刻意不选：那个剖面连必需能力都没验证过，一致性套件会全线红，
// 而那不是套件要测的东西。
const PROFILE_FOR_ROLE = Object.freeze({
  host_command: "web_table",
  seat_model: "codex_cli",
});

// 参考实现。两个角色共用一个类：差别全在协商结果里，而那正是合同的意思——
// 「怎么说话」共享，「能说什么」由角色决定。
class SimulatedAdapter {
  constructor({
    role,
    profile = PROFILE_FOR_ROLE[role],
    capabilities = ["command_dispatch"],
    // 假核心。真适配器这里是 HttpCoreClient / InProcessCoreClient。
    dispatch = async () => ({}),
  } = {}) {
    this.role = role;
    this.profile = profile;
    this.capabilities = capabilities;
    this.state = "created";
    this.dispatchImpl = dispatch;
    this.negotiation = null;
    // 句柄只有真人面存。模型面这个字段永远是空的——而 inspectableState() 会把它暴露给
    // 一致性套件去查，所以「模型面不持有句柄」这句话有人对账。
    this.handles = [];
    // 模型面这一侧记的是权威发的一次性 id（intent_id / turn_id）。它不是秘密，但它是
    // 模型面唯一持有的东西，所以「释放清空了什么」在这一侧只能靠它对账。
    this.trackedIds = [];
  }

  get holdsSeatHandle() {
    return this.role === "host_command";
  }

  // 一致性套件用它查「有没有偷偷存一份秘密」。真适配器也该实现：不实现就等于
  // 那条检查永远看不到任何东西，而看不到会被读成通过。
  inspectableState() {
    return {
      role: this.role,
      profile: this.profile,
      state: this.state,
      capabilities: this.capabilities,
      // 报数目，不报值。数目足够让套件确认「这一侧确实在管这些东西、释放时确实清了」，
      // 而值一旦进了报告就等于凭据落进了日志——本轮刚在验收产物里修过同一类问题。
      //
      // 两侧都报，字段不同：真人面管句柄，模型面管权威发的一次性 id。少了模型面这一个，
      // 套件的「释放后 *_count 归零」在那一侧就没有任何东西可查。
      ...(this.role === "host_command"
        ? { handle_count: this.handles.length }
        : { tracked_id_count: this.trackedIds.length }),
    };
  }

  // 一致性套件用它把适配器带到「持有可数资源」的状态，好让释放检查有东西可清。真适配器
  // 里这一步是真的落座（真人面）或真的领到一条意图（模型面）；这里直接塞。
  //
  // 存在的理由是套件那边写着的：跑到释放检查时真人面本来一张句柄都没有，于是
  // 「handle_count 归零」在 0 上成立，什么都证明不了。
  seedForRelease() {
    if (this.role === "host_command") this.handles.push("seat_handle-simulated");
    else this.trackedIds.push("intent-simulated");
  }

  negotiate() {
    this.state = nextLifecycleState(this.state, "negotiated");
    this.negotiation = negotiate({
      role: this.role,
      profile: this.profile,
      contract_version: CONTRACT_VERSION,
      capabilities: this.capabilities,
    });
    return this.negotiation;
  }

  assertUsable(command) {
    if (this.state === "released") {
      throw new ContractError("illegal_lifecycle_transition", { from: "released", command });
    }
    if (this.negotiation === null) {
      throw new ContractError("required_capability_missing", { command, reason: "not_negotiated" });
    }
    if (!commandsForRole(this.role).includes(command)) {
      // 本地拒绝，不发出去。靠核心兜的话，一次拒绝也要先把请求发出去，而模型面越界
      // 发出去的那条请求带着的正是它不该有的权限。
      throw new ContractError("command_not_model_facing", { command, role: this.role });
    }
  }

  async call(command, params = {}) {
    this.assertUsable(command);
    try {
      const result = await this.dispatchImpl(command, params);
      // negotiated 与 degraded 都要能回到 bound。第一版只写了 negotiated，于是一次网络
      // 抖动之后适配器永远停在 degraded——而 degraded 不是终态，卡在那里等于「一次抖动
      // 让这一席再也不动了」，读起来又和「在等模型」分不开。
      if (this.state === "negotiated" || this.state === "degraded") {
        this.state = nextLifecycleState(this.state, "bound");
      }
      // 模型侧记一条一次性 id，让「释放清空了什么」在那一侧有东西可查。真适配器里这一步
      // 是 track(intent_id) / track(turn_id)。
      if (this.role === "seat_model") this.trackedIds.push(`${command}-${this.trackedIds.length}`);
      return okEnvelope(result);
    } catch (error) {
      if (this.state === "bound" || this.state === "negotiated") {
        this.state = nextLifecycleState(this.state, "degraded");
      }
      return errorEnvelope(error?.code ?? "core_request_failed", error?.status ?? 502);
    }
  }

  release() {
    // 已经释放过就不再迁移。重复释放是正常的（用户关页面又超时），不该抛。
    if (this.state !== "released") this.state = nextLifecycleState(this.state, "released");
    this.handles = [];
    this.trackedIds = [];
    this.negotiation = null;
  }
}

// ---- 故意坏掉的变体 ----
//
// 每一项只破坏一条。名字就是那条不变量。
//
// roles 显式写出来，不从名字前缀推。第一版按 name.startsWith("model_") 分派，于是
// release_keeps_tracked_ids 被拿去真人面上跑——那一侧本来就没有一次性 id，所以它不构成
// 违规，而「没抓到」被读成了「套件有洞」。猜错角色的测试和恒真的断言一样读不出真东西。
const BOTH = Object.freeze(["host_command", "seat_model"]);

const BROKEN = Object.freeze({
  // 释放只改标记，资源还在。
  release_only_flips_flag: { roles: BOTH, expect: ["release_zeroes_counts"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.release = function release() { this.state = "released"; };
    return adapter;
  } },
  // 释放后还能发命令。
  usable_after_release: { roles: BOTH, expect: ["no_call_after_release"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.assertUsable = function assertUsable(command) {
      if (!commandsForRole(this.role).includes(command)) {
        throw new ContractError("command_not_model_facing", { command });
      }
    };
    return adapter;
  } },
  // 释放后能重新协商。released 不再是终态。
  renegotiable_after_release: { roles: BOTH, expect: ["no_renegotiate_after_release"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.negotiate = function renegotiate() {
      this.state = "negotiated";
      this.negotiation = negotiate({
        role: this.role,
        // 剖面照传。这个破坏项要破坏的只有「released 是终态」这一条，漏掉 profile 会让它
        // 连协商都过不去，于是套件抓到的是 negotiate_succeeds 而不是
        // no_renegotiate_after_release——一个破坏项测出了另一件事，那条检查就没被验证过。
        profile: this.profile,
        contract_version: CONTRACT_VERSION,
        capabilities: this.capabilities,
      });
      return this.negotiation;
    };
    return adapter;
  } },
  // 越界命令放过去，让核心兜。把 assertUsable 整个清空，所以它同时也不查释放后的状态
  // ——于是套件是靠「释放后不能再发命令」抓到它的，而不是靠越界那一条。
  out_of_face_passthrough: { roles: BOTH, expect: ["out_of_face_rejected"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.assertUsable = function assertUsable() {};
    return adapter;
  } },
  // 只放过越界命令，生命周期照旧把关。上一项抓不出「越界检查是不是空的」，因为它连带
  // 破坏了释放语义；这一项把破坏收窄到那一条上。
  //
  // 两项都留着：一个宽的破坏被某条检查抓住，不等于每条检查都不空。
  out_of_face_only: { roles: BOTH, expect: ["out_of_face_rejected"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.assertUsable = function assertUsable(command) {
      if (this.state === "released") {
        throw new ContractError("illegal_lifecycle_transition", { from: "released", command });
      }
      if (this.negotiation === null) {
        throw new ContractError("required_capability_missing", { command, reason: "not_negotiated" });
      }
      // 命令面那一条不查。
    };
    return adapter;
  } },
  // 信封里不带合同版本。
  envelope_without_version: { roles: BOTH, expect: ["envelope_has_contract_version"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    const inner = adapter.call.bind(adapter);
    adapter.call = async function call(command, params) {
      const { contract_version: _dropped, ...rest } = await inner(command, params);
      return rest;
    };
    return adapter;
  } },
  // 命令面抄了一份副本。内容相同，但漂移就此可能。
  copied_command_face: { roles: BOTH, expect: ["command_face_by_identity"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    const inner = adapter.negotiate.bind(adapter);
    adapter.negotiate = function negotiateCopied() {
      const result = inner();
      const copied = { ...result, commands: [...result.commands] };
      this.negotiation = copied;
      return copied;
    };
    return adapter;
  } },
  // 模型面偷偷存了一份句柄。
  model_holds_handle: { roles: ["seat_model"], expect: ["model_holds_no_seat_handle"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.handles = ["seat_handle-abc123"];
    adapter.inspectableState = function inspectableState() {
      return { role: this.role, state: this.state, seat_handle: this.handles[0] };
    };
    return adapter;
  } },
  // 模型面声明自己持有句柄。
  model_claims_handle: { roles: ["seat_model"], expect: ["model_does_not_claim_handle"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    Object.defineProperty(adapter, "holdsSeatHandle", { get: () => true });
    return adapter;
  } },
  // 没声明主动唤醒，却读不出降级路径——协商结果里把降级清单清空了。
  // 这是最要紧的一项：它对应的真实后果是牌局静默停住。
  hides_wake_degradation: { roles: BOTH, expect: ["wake_declaration_consistent"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    const inner = adapter.negotiate.bind(adapter);
    adapter.negotiate = function negotiateHiding() {
      const result = inner();
      const hidden = { ...result, degradations: [] };
      this.negotiation = hidden;
      return hidden;
    };
    return adapter;
  } },
  // 初始状态就报成已协商。
  starts_negotiated: { roles: BOTH, expect: ["initial_state_created"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.state = "negotiated";
    return adapter;
  } },
  // 不实现 inspectableState。套件那三条身份检查会看到空对象——「看不到」不能被读成通过。
  no_inspectable_state: { roles: BOTH, expect: ["inspectable_state_implemented"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.inspectableState = undefined;
    return adapter;
  } },
  // 不实现 seedForRelease。释放检查就没有东西可清，于是在空状态上成立。
  // 这一项对应的是套件第一版的真实缺陷，留着它是为了那个缺陷不会回来。
  no_seed_for_release: { roles: BOTH, expect: ["seed_for_release_implemented"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.seedForRelease = undefined;
    return adapter;
  } },
  // 把命令改写成别的再交给传输。这一项此刻的后果是隐蔽的：适配器自己的边界检查照旧
  // 通过（改写发生在检查之后），信封形状也合法，只是内容指向另一条命令。
  // 只有看得见交给传输的那份载荷才抓得住。
  rewrites_dispatch_command: { roles: BOTH, expect: ["dispatch_payload_envelope_ready"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    const inner = adapter.dispatchImpl;
    adapter.dispatchImpl = async function dispatchRewritten(command, params) {
      // 改写成一个两侧命令面都没有的命令。改写成 room.create 之类的话，
      // 那条命令在真人面里是合法的，于是这一项在那一侧不构成违规——
      // 而「没抓到」会被读成「套件有洞」。
      return inner("tg.not.in.any.face", params);
    };
    return adapter;
  } },
  // 交一份过不了 JSON 往返的参数。带方法的对象序列化之后方法没了，
  // 传输那一跳静默丢字段——形状检查看不出来，因为顶层还是个对象。
  unserializable_dispatch_params: { roles: BOTH, expect: ["dispatch_payload_envelope_ready"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    const inner = adapter.dispatchImpl;
    adapter.dispatchImpl = async function dispatchUnserializable(command, params) {
      return inner(command, { ...params, onDone() { return 1; } });
    };
    return adapter;
  } },
  // 释放清了句柄，但没清一次性 id。部分清理最难查：状态看着对，残留只在下一次
  // 复用同一个 id 时才露头。
  release_keeps_tracked_ids: { roles: ["seat_model"], expect: ["release_zeroes_counts"], make: (options) => {
    const adapter = new SimulatedAdapter(options);
    adapter.release = function release() {
      if (this.state !== "released") this.state = nextLifecycleState(this.state, "released");
      this.handles = [];
      this.negotiation = null;
      // trackedIds 留着。
    };
    return adapter;
  } },
});

module.exports = { BROKEN, SimulatedAdapter };
