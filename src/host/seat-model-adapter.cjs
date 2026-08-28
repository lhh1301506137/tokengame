"use strict";

// 座位模型适配器。宿主中立：不引用 Codex / Claude / MCP / Hook。
//
// 这一层把已有的 ModelCommandSurface 接到 adapter-contract 上。它自己几乎不做事——
// 权限边界在 ModelCommandSurface 里（模型面白名单、身份字段拒收、句柄由托管层补），
// 凭据边界在 SeatCustody 里。本文件加的只有合同要求的那几件：角色、能力协商、生命周期、
// 可检视状态、释放。
//
// 为什么值得单独一层。让真实实现去过一致性套件，是唯一能证明「这份合同可实现」的办法：
// 模拟器过了只说明套件自洽。本轮反复撞到的缺陷类就是「一段永远走不到的检查」，而一份
// 只有模拟器实现的合同整个就是那种东西。
//
// 三条不做的事：
//   1. 不新增产品语义。命令面、拒收清单、扇出逻辑全在 ModelCommandSurface 里，这里一条
//      都不解释。
//   2. 不持有句柄。holdsSeatHandle 恒为 false，inspectableState() 只报数目。
//   3. 不实现 Advisor / Autopilot。那需要真人先逐席开启显式授权，本轮不做。

const {
  CONTRACT_VERSION,
  ContractError,
  commandsForRole,
  errorEnvelope,
  negotiate,
  nextLifecycleState,
  okEnvelope,
} = require("../contract/adapter-contract.cjs");
const { ModelCommandSurface } = require("./model-command-surface.cjs");

const ROLE = "seat_model";

// 本适配器声明的能力。
//
// proactive_wake 刻意不在这里，而且不是「暂时没实现」：它在两个宿主上都未验证
// （SAME_VISIBLE_TASK_SPIKE_V1 未执行）。声明它等于把一个未验证的能力写成已具备，
// 而协商结果会据此不给出降级路径——后果是宿主不轮询，牌局静默停住。
//
// structured_ui / private_hand_view / persistent_session 都是真人面的事，模型面本来
// 就不该声明。
const DECLARED_CAPABILITIES = Object.freeze(["command_dispatch"]);

class SeatModelAdapter {
  // custody：SeatCustody 实例。
  // dispatch(command, params) -> result：打到核心的那一跳。与 ModelCommandSurface 的
  //   request 签名不同（那边要 { ok, status, body }），转换在下面 makeRequest 里。
  constructor({ custody, dispatch, capabilities = DECLARED_CAPABILITIES } = {}) {
    // custody 的校验不在这里：ModelCommandSurface 的构造函数已经查了，而且报的是同一个
    // 码和同一个字段名（invalid_field / custody）。曾经这里也查一遍，一次变异证明那份
    // 检查不可观测——两条路径的可见结果完全相同，只有异常类名不同，而没有任何调用点按
    // 类名分支。删掉而不是补一条钉类名的断言。
    //
    // dispatch 不同，它必须在这里查：ModelCommandSurface 收到的 request 永远是下面那个
    // 闭包，所以它看不到 dispatch 是否缺失。少了这一条，真正的失败会推迟到第一次调用时，
    // 而那时的报错指向闭包内部，读不出「宿主没接上」。
    if (typeof dispatch !== "function") {
      throw new ContractError("invalid_field", { field: "dispatch" });
    }
    this.role = ROLE;
    this.capabilities = capabilities;
    this.state = "created";
    this.negotiation = null;
    this.dispatchImpl = dispatch;
    this.surface = new ModelCommandSurface({
      custody,
      request: (command, params) => this.makeRequest(command, params),
    });
  }

  // 合同侧恒为假。不写成 `this.role !== "host_command"`：那种写法读起来像「将来可能变」，
  // 而模型面持有句柄这件事不是配置项。
  get holdsSeatHandle() {
    return false;
  }

  // 一致性套件用它查「有没有偷偷存一份秘密」。报数目不报值——值一旦进了报告就等于凭据
  // 落进日志，本轮刚在验收产物里修过同一类问题。
  //
  // 字段名刻意用 tracked_id_count 而不是 handle_count：这一侧记的是权威发的一次性 id，
  // 报成 handle_count 会让人以为模型面也在管句柄。
  inspectableState() {
    return {
      role: this.role,
      state: this.state,
      capabilities: this.capabilities,
      tracked_id_count: this.surface.issued.size,
    };
  }

  // 一致性套件用它把适配器带到「持有可数资源」的状态，好让释放检查有东西可清。
  //
  // 这里塞的是一个假 id，不经过核心。真实路径是 ai.take_intents 回来之后 track()，
  // 而那需要一个活的核心与真的席位绑定——一致性套件必须能在没有核心的情况下跑。
  seedForRelease() {
    this.surface.track("intent-conformance-seed", "handle-conformance-seed", null);
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

  assertUsable(command) {
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
      // 本地拒绝，不发出去。ModelCommandSurface.call 也会拒（它是那条边界的正主），
      // 这里再拦一次是为了拦在生命周期检查之后、发请求之前——靠核心兜的话，一次拒绝
      // 也要先把请求发出去，而模型面越界发出去的那条请求带着的正是它不该有的权限。
      throw new ContractError("command_not_model_facing", { command, role: this.role });
    }
  }

  // ModelCommandSurface 要的 request 形状是 { ok, status, body }，而宿主给的 dispatch
  // 是「成功回 result，失败抛 CoreError」。转换只在这一个地方做。
  async makeRequest(command, params) {
    try {
      const result = await this.dispatchImpl(command, params);
      return { ok: true, status: 200, body: { result } };
    } catch (error) {
      return {
        ok: false,
        status: error?.status ?? 502,
        body: { code: error?.code ?? "core_request_failed", details: error?.details },
      };
    }
  }

  async call(command, params = {}) {
    this.assertUsable(command);
    let inner;
    try {
      inner = await this.surface.call(command, params);
    } catch (error) {
      // ModelSurfaceError 是本地拒绝（越界命令、模型自带身份字段、认不出的 authority id）。
      // 它不是传输失败，所以不进 degraded——把本地拒绝算成降级会让「适配器刚失败过」
      // 这个状态失去意义，而宿主正是靠它决定要不要退回轮询。
      return errorEnvelope(error?.code ?? "unknown_error", 400, error?.details);
    }
    if (inner.ok === false) {
      // 传输或核心侧失败。degraded 让宿主知道自己刚失败过，而 degraded 不是终态：
      // 下一次成功会回到 bound。
      if (this.state === "negotiated" || this.state === "bound") {
        this.state = nextLifecycleState(this.state, "degraded");
      }
      return errorEnvelope(
        inner.body?.code ?? "core_request_failed",
        inner.status ?? 502,
        inner.body?.details,
      );
    }
    if (this.state === "negotiated" || this.state === "degraded") {
      this.state = nextLifecycleState(this.state, "bound");
    }
    return okEnvelope(inner.body?.result ?? null, inner.status ?? 200);
  }

  release() {
    // 重复释放不抛。用户关页面之后连接租约又超时，两条路都会调它。
    if (this.state !== "released") this.state = nextLifecycleState(this.state, "released");
    // 一次性 id 一并清掉。留着的后果是下一个实例复用同一张表时，一个陈旧映射会帮一条
    // 早该失效的 turn_id 成立——而那种残留只在复用时才露头。
    this.surface.issued.clear();
    this.negotiation = null;
  }
}

module.exports = { DECLARED_CAPABILITIES, SeatModelAdapter };
