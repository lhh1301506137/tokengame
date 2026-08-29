"use strict";

// 真人命令适配器（host_command 剖面）的参考实现。宿主中立：不引用 Codex / Claude / MCP / Hook。
//
// 为什么要有这一层，和 SeatModelAdapter 同一条理由：让真实实现去过一致性套件，是唯一能
// 证明「这份合同可实现」的办法。此前 host_command 那一侧只有模拟器实现，而模拟器过了只
// 说明套件自洽——一份只有模拟器实现的剖面，整个就是本轮反复撞到的那类缺陷：一段永远走不到
// 的检查。
//
// 这一层与 TableWebHost 的关系要说清楚，因为它最容易被读成「重写了牌桌」：
//
//   TableWebHost 是**产品**。它有 HTTP 路由、会话表、轮询租约、驱动定时器、视图投影，
//   并且已经闭合、有 209 条浏览器验收看着。本文件一条都不碰它。
//
//   本文件是**参考适配器**。它只做合同要求的那几件事：角色、能力协商、生命周期、句柄托管、
//   越界拒绝、可检视状态、释放。它不是 TableWebHost 的替代品，也不打算成为。
//
// 那么它凭什么说自己反映真实行为？靠特征测试：test/host-command-adapter.test.cjs 里有一组
// 断言，同一件事在 TableWebHost 和本适配器上各测一遍，两边结果必须相同。那组测试的作用是
// 「本适配器的语义不是我现编的」，而不是「TableWebHost 从此可以照本适配器改」。
//
// 三条不做的事：
//   1. 不新增产品语义。凭据注入、命令归属、错误分类全部引用已有模块，本文件一条都不解释。
//   2. 不起服务、不开定时器、不碰网络。一致性套件必须能在没有核心的情况下构造它。
//   3. 不声明 proactive_wake。理由与模型侧完全相同，写在 DECLARED_CAPABILITIES 那里。

const {
  CONTRACT_VERSION,
  ContractError,
  commandsForRole,
  errorEnvelope,
  negotiate,
  nextLifecycleState,
  okEnvelope,
} = require("../contract/adapter-contract.cjs");

const ROLE = "host_command";

// 本适配器声明的能力。
//
// proactive_wake 刻意不在这里，而且不是「暂时没实现」：它在两个宿主上都未验证
// （SAME_VISIBLE_TASK_SPIKE_V1 未执行）。声明它等于把一个未验证的能力写成已具备，
// 而协商结果会据此不给出降级路径——后果是宿主不轮询，牌局静默停住。
//
// structured_ui 也不声明。真人面确实有 UI，但那个 UI 是 TableWebHost 的 HTTP 页面，
// 不是本适配器提供的。声明一个自己不提供的能力，与声明一个未验证的能力是同一种错。
const DECLARED_CAPABILITIES = Object.freeze(["command_dispatch"]);

class HostCommandAdapter {
  // custody：SeatCustody 实例。真人面持有句柄，所以这一侧**必须**有托管层——
  //   句柄进不了托管层的话，凭据原文就得由本适配器自己拿着，而那正是 F6 要禁的。
  // dispatch(command, params) -> result：打到核心的那一跳。成功回 result，失败抛 CoreError。
  constructor({ custody, dispatch, capabilities = DECLARED_CAPABILITIES } = {}) {
    // 两样都在这里查，且理由不同。
    //
    // dispatch：少了这一条，真正的失败会推迟到第一次调用时，而那时的报错指向调用点内部，
    // 读不出「宿主没接上」。与模型侧同理。
    //
    // custody：模型侧不查它，因为 ModelCommandSurface 的构造函数已经查了并报同一个码。
    // 本适配器没有那一层中介——它直接持有 custody——所以这里是唯一的检查点。
    // 少了它，一个没接托管层的真人适配器会一路构造成功，直到第一次发席位授权命令时才炸。
    if (typeof dispatch !== "function") {
      throw new ContractError("invalid_field", { field: "dispatch" });
    }
    if (custody === null || typeof custody !== "object"
      || typeof custody.inject !== "function") {
      throw new ContractError("invalid_field", { field: "custody" });
    }
    this.role = ROLE;
    this.capabilities = capabilities;
    this.state = "created";
    this.negotiation = null;
    // 私有字段，不是命名约定。理由与模型侧那三个字段完全相同：公开属性会让
    // adapter.custody.resolve(handle) 一步取出凭据原文，而文本出口净化得再干净都没用。
    //
    // 真人侧比模型侧更要紧：这一侧**真的**持有句柄，所以「取不到」必须是结构上的，
    // 不能靠 inspectableState() 选择不展示。
    this.#custody = custody;
    this.#dispatch = dispatch;
    this.#handles = new Set();
  }

  #custody;

  #dispatch;

  #handles;

  // 合同侧恒为真。不写成 `this.role === "host_command"`：那种写法读起来像「将来可能变」，
  // 而真人面持有句柄这件事不是配置项——句柄只在 room.create / room.join 的返回里产生，
  // 而那两条命令只在这一面上。
  get holdsSeatHandle() {
    return true;
  }

  // 一致性套件用它查「有没有偷偷存一份秘密」。报数目不报值。
  //
  // 真人侧这一条比模型侧更关键：这一侧确实持有句柄，所以这里泄一次就是真泄。
  // 套件的 human_inspectable_has_no_secret 按 /seat_handle-|credential/ 扫序列化结果，
  // 而句柄的真实前缀正是 `seat_handle-`——把 this.#handles 直接摊进来会当场红。
  inspectableState() {
    return {
      role: this.role,
      state: this.state,
      // 冻结的副本。给出内部数组等于给出一条可写路径，调用方 push 一个能力名就能让之后的
      // 协商结果变样。
      capabilities: Object.freeze([...this.capabilities]),
      // 数目，不是句柄本身。字段名用 seat_handle_count 而不是 tracked_id_count：
      // 这一侧管的确实是句柄，报成后者会让人以为真人面也只有一次性 id。
      seat_handle_count: this.#handles.size,
    };
  }

  // 一致性套件用它把适配器带到「持有可数资源」的状态，好让释放检查有东西可清。
  //
  // 这里塞的是一个假句柄，不经过核心。真实路径是 room.create / room.join 回来之后
  // 由 openSession 收下 bound.seat_handle，而那需要一个活的核心——一致性套件必须能在
  // 没有核心的情况下跑。
  //
  // 两条，理由与模型侧那两条相同：一条也能证明「释放会清」，两条还顺带钉住「共用一张表」。
  seedForRelease() {
    this.#handles.add("seat_handle-conformance-seed-1");
    this.#handles.add("seat_handle-conformance-seed-2");
  }

  negotiate() {
    this.state = nextLifecycleState(this.state, "negotiated");
    this.negotiation = negotiate({
      role: this.role,
      contract_version: CONTRACT_VERSION,
      capabilities: this.capabilities,
    });
    return this.negotiation;
  }

  // 记下一张句柄。真实宿主在 room.create / room.join 的返回里拿到它。
  //
  // 单独一个方法而不是让调用方写 adapter.handles.add(...)：后者要求 #handles 是公开的，
  // 而那正是上面拒绝的事。
  rememberHandle(handle) {
    if (typeof handle !== "string" || handle === "") {
      throw new ContractError("invalid_field", { field: "seat_handle" });
    }
    this.#handles.add(handle);
  }

  assertUsable(command) {
    // 与模型侧不同：这里**不**对 command 做 assertNoLeak。
    //
    // 那道闸在模型侧的理由是「command 原样来自模型，它能构造任意字符串，而拒绝信息会经
    // MCP 转成模型可见文本」。真人面的 command 来自宿主自己的路由表，不来自模型，而拒绝
    // 信息回的是操作牌桌的那个真人——他本来就持有自己的凭据。
    //
    // 照抄那道闸会让人以为真人面也有一条模型可达的路径，那是把边界画错位置：真人面的风险
    // 不是「模型塞了东西进来」，而是「句柄漏出去」，而后者由 #handles 私有加 inspectableState
    // 只报数目挡着。
    if (this.state === "released") {
      throw new ContractError("illegal_lifecycle_transition", { from: "released", command });
    }
    if (this.negotiation === null) {
      throw new ContractError("required_capability_missing", {
        command,
        reason: "not_negotiated",
      });
    }
    if (!commandsForRole(this.role).includes(command)) {
      // 本地拒绝，不发出去。核心也会拒，但靠核心兜的话这条请求要先带着真人面的权限发出去。
      //
      // 错误码与模型侧那条刻意不同：模型侧是 command_not_model_facing，这里是
      // command_not_host_facing。用同一个码会让日志里读不出是哪一面越界了，而两个方向的
      // 严重性差得很远——模型面越界意味着模型可能拿到下注权限。
      throw new ContractError("command_not_host_facing", { command, role: this.role });
    }
  }

  // 真人侧的凭据注入。
  //
  // 语义与 TableWebHost.injected 相同，且是同一条实现：都调 custody.inject，都传句柄，
  // 都不自己拼 seat_id / recovery_credential。抄一份的后果是两处会漂移，而漂移的方向一定
  // 是某一侧把凭据原文写进了参数——test/host-command-adapter.test.cjs 里有一组特征测试
  // 拿两侧的结果逐字段对账。
  //
  // 句柄从哪来：调用方传 seatHandle。没传时**不猜**，哪怕只记着一张。
  //
  // 「只有一席就用那一席」看着方便，而它在多席宿主上的表现是替错的人行动。托管层里那条
  // seat_handle_required 的注释已经把这件事写死了（「不按反正只绑了一席去猜」），本层
  // 再开一个猜的口子等于把那条判断绕过去。
  //
  // 哪些命令要凭据这件事**不在本层判断**。托管层的 inject 自己就按 CREDENTIAL_COMMANDS
  // 分流：要凭据的换成 seat_id + recovery_credential，不要的把句柄摘掉原样通过。本层再抄
  // 一份清单的话，漏一条表现为某个操作偶尔不管用，多一条表现为建房第一步就失败，两个方向
  // 都不报错——所以句柄有就交上去，由 inject 决定用不用它。
  #injected(command, params, seatHandle) {
    const withHandle = seatHandle === null
      ? { ...params }
      : { ...params, seat_handle: seatHandle };
    return this.#custody.inject(command, withHandle);
  }

  async call(command, params = {}, { seatHandle = null } = {}) {
    this.assertUsable(command);
    let payload;
    try {
      // 注入失败是本地拒绝，不是传输失败：不能进 degraded。把本地拒绝算成降级会让
      // 「适配器刚失败过」这个状态失去意义，而宿主正是靠它决定要不要退回轮询。
      //
      // 这条路径也是浏览器传进 seat_id / recovery_credential 时的落点——custody.inject
      // 会抛，而那正是要的行为。
      payload = this.#injected(command, params, seatHandle);
    } catch (error) {
      const code = error?.code ?? "unknown_error";
      return errorEnvelope(code, error?.status ?? 400, error?.details ?? null);
    }
    try {
      const result = await this.#dispatch(command, payload);
      if (this.state === "negotiated" || this.state === "degraded") {
        this.state = nextLifecycleState(this.state, "bound");
      }
      return okEnvelope(result ?? null, 200);
    } catch (error) {
      // 传输或核心侧失败。degraded 让宿主知道自己刚失败过，而 degraded 不是终态：
      // 下一次成功会回到 bound。
      if (this.state === "negotiated" || this.state === "bound") {
        this.state = nextLifecycleState(this.state, "degraded");
      }
      // details 原样转交。真人面**不**净化：这一侧的收件人就是持有该席凭据的那个真人，
      // 而净化会把 seat_handle_missing 这类诊断信息摘掉，让掉线恢复无从排查。
      // 模型面必须净化，因为那一侧的收件人是模型——两侧收件人不同，处置就该不同。
      return errorEnvelope(error?.code ?? "core_request_failed", error?.status ?? 502,
        error?.details ?? null);
    }
  }

  release() {
    // 重复释放不抛。用户关页面之后连接租约又超时，两条路都会调它。
    if (this.state !== "released") this.state = nextLifecycleState(this.state, "released");
    // 句柄一并忘掉，并且真的走托管层的 forget——只清本地 Set 的话，托管层里那份
    // 句柄到凭据的映射还在，而那份映射正是凭据原文的存放处。
    //
    // forget 不存在时只清本地：一致性套件传的托管替身可能没实现它，而「释放会清」这件事
    // 本身仍然要成立。不是宽容，是把两件事分开——少一个 forget 是替身的缺陷，
    // 不该表现成本适配器释放不干净。
    if (typeof this.#custody.forget === "function") {
      for (const handle of this.#handles) this.#custody.forget(handle);
    }
    this.#handles.clear();
    this.negotiation = null;
  }
}

module.exports = { DECLARED_CAPABILITIES, HostCommandAdapter };
