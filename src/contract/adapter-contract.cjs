"use strict";

// 两个宿主适配器共享的合同。宿主中立：本文件不引用 Codex / Claude / MCP / Hook /
// 浏览器，一个专有判断都不许出现——这条由 test/adapter-contract.test.cjs 的源码断言守着。
//
// 为什么是两份合同而不是一份。Plan Tree 里 TG-EU-HOST-ADAPTER-CONTRACT 写的是单数
// 「HostAdapter 合同」，而仓库里实际存在两个权限完全不同的面，host-surface.cjs 已经把它们
// 分开了：HUMAN_COMMANDS 与 MODEL_COMMANDS。合成一份的后果就是那个二分存在要否定的东西
// ——一份平坦的适配器接口会让「把整份清单交给模型可见的工具」成为最省事的做法。
//
// 所以这里的结构是：一份共享底座（信封、错误分类、身份、生命周期、能力协商）+ 两份面向
// 不同主体的合同。共享的是「怎么说话」，分开的是「能说什么」。节点名与份数的偏离不由我
// 单方面改，已列为待裁决项（见 REVIEW-LOG.md）——本文件不许出现任何宿主专有判断，
// 这条由 test/adapter-contract.test.cjs 的源码断言守着。

const {
  HUMAN_COMMANDS,
  MODEL_COMMANDS,
  classifyActor,
} = require("../authority/host-surface.cjs");

// ---- 合同版本 ----
//
// 单调整数，不用 semver。适配器与宿主的兼容判断只需要「你认得我说的话吗」这一个答案，
// 而 semver 的三段式会诱使人去实现「minor 兼容」那套推断——两边由不同的人在不同时间写，
// 那种推断迟早会错，而错的表现是一次静默的语义漂移。
const CONTRACT_VERSION = 1;

// ---- 信封 ----
//
// 请求与响应各一种形状，两个适配器共用。
//
// 为什么响应里 ok 与 status 都留着：ok 是适配器唯一该分支的字段；status 是给日志和
// 人看的。只留 status 会逼每个调用点写 `status >= 200 && status < 300`，那种判断迟早
// 有人写成 `status === 200`，而 201 与 204 都是成功。
//
// 响应里刻意没有「重试建议」「用户提示文案」这类字段。前者由错误分类推出（见
// ERROR_CLASSES），后者是宿主的事——合同里放一句文案就等于替所有宿主决定了 UI 语气。

function requestEnvelope(command, params = {}) {
  if (typeof command !== "string" || command === "") {
    throw new ContractError("invalid_field", { field: "command" });
  }
  const safe = params === null || typeof params !== "object" || Array.isArray(params)
    ? {}
    : params;
  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    command,
    params: safe,
  });
}

function okEnvelope(result, status = 200) {
  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    ok: true,
    status,
    result: result === undefined ? null : result,
  });
}

function errorEnvelope(code, status = 400, details = undefined) {
  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    ok: false,
    status,
    code: typeof code === "string" && code !== "" ? code : "unknown_error",
    // details 原样带出。合同不裁剪它：裁剪的判断依赖于「哪些字段是秘密」，而那是
    // 托管层（seat-custody.cjs）的职责，在这里再做一次会出现两份不一致的清单。
    ...(details === undefined ? {} : { details }),
  });
}

class ContractError extends Error {
  constructor(code, details = undefined) {
    super(code);
    this.name = "ContractError";
    this.code = code;
    this.details = details;
  }
}

// ---- 错误分类 ----
//
// 仓库里此刻有 65 个错误码。适配器不该认得全部 65 个——它需要知道的是「拿到这个码该怎么
// 办」，而那只有五种答案。分类是给适配器的，不是给人读日志的。
//
// 未列出的码归 "unknown"，而 "unknown" 的处置与 "bug" 相同（原样上报，不重试、不改 UI
// 状态）。默认落到最保守的一档：新增一个码时忘了归类，后果是它被当成 bug 显示出来，
// 而不是被静默重试或被当成正常状态。反过来会让一个真错误看起来像一次普通拒绝。
const ERROR_CLASSES = Object.freeze({
  // 参数不对。重试同样的请求不会变好，改参数才行。
  invalid_request: Object.freeze([
    "invalid_duration_ms",
    "invalid_expected_revision",
    "invalid_field",
    "field_too_long",
    "message_too_long",
    "unknown_command",
    "seat_stack_missing",
  ]),
  // 身份或授权不成立。适配器要么补身份，要么走恢复流程；不能靠重试。
  identity: Object.freeze([
    "authority_token_rejected",
    "command_not_model_facing",
    "credential_not_model_supplied",
    "invite_rejected",
    "local_bridge_auth_unresolved",
    "player_credentials_incomplete",
    "player_token_rejected",
    "recovery_credential_rejected",
    "seat_credential_revoked",
    "seat_handle_missing",
    "seat_handle_required",
    "seat_handle_unknown",
    "seat_id_not_model_supplied",
    "seat_identity_not_model_supplied",
    "web_session_unknown",
    "unknown_authority_id",
  ]),
  // 当前状态下这个动作不成立。牌桌本来就会经过这些状态，UI 该照常显示，不该报错。
  // 这一类最容易被误当成 bug 上报，而那会让正常对局途中弹出一串技术错误。
  state: Object.freeze([
    "action_window_closed",
    "action_window_expired",
    "ai_answer_already_submitted",
    "default_public_scope_not_acknowledged",
    "default_public_scope_not_confirmed",
    "evaluation_cooldown",
    "hand_already_active",
    "hand_mismatch",
    "hand_not_complete",
    "hand_start_blocked",
    "intent_claim_superseded",
    "intent_not_found",
    "intent_seat_mismatch",
    "no_action_window",
    "no_active_hand",
    "player_binding_not_released",
    "request_window_missing",
    "room_already_exists",
    "room_full",
    "room_not_found",
    "seat_ai_off",
    "seat_already_registered",
    "seat_leaving",
    "seat_not_connected",
    "seat_not_found",
    "seat_released",
    "seat_turn_already_active",
    "table_reset_not_allowed",
    "turn_already_registered",
    "turn_not_active",
    "unknown_ai_request",
    "window_already_open",
  ]),
  // 配额与限流。等一会儿可能就好了，但等多久由权威说，适配器不该自己定重试节奏。
  quota: Object.freeze([
    "ai_hand_quota_exhausted",
    "ai_request_quota_used",
    "player_hand_quota_exhausted",
    "player_rate_limited",
  ]),
  // 并发冲突。同一个键配了不同内容，或版本号陈旧。适配器该重读再决定，不是重发。
  conflict: Object.freeze([
    "entry_key_conflict",
    "idempotency_key_conflict",
    "revision_conflict",
    "stale_hand_revision",
  ]),
  // 传输层。核心不可达或答非所问。这一类是唯一「原样重试有意义」的。
  transport: Object.freeze([
    "core_request_failed",
    "core_response_not_json",
    "core_unreachable",
  ]),
  // 合同本身没谈成。全是接线错误：版本不匹配、角色名不认、能力名拼错、生命周期乱跳。
  // 一条都不该在正常运行时出现，所以处置与 unknown 相同（当缺陷、不重试）——它们不是
  // 运行期的可恢复状况，是有人接错了线。
  //
  // 单列一类而不是并入 invalid_request：后者是「这次调用的参数不对」，可以换参数重来；
  // 这一类是「你我谈的不是同一份合同」，换参数没用，得改代码或改版本。
  contract: Object.freeze([
    "contract_version_mismatch",
    "illegal_lifecycle_transition",
    "required_capability_missing",
    "unknown_adapter_role",
    "unknown_capability",
  ]),
});

// 分类 -> 适配器该怎么办。分开成两张表而不是把处置塞进上面那张：处置是可以改的工程判断
// （比如将来给 quota 加退避），分类是对错误本身的陈述。混在一起会让人以为改处置就得改分类。
const ERROR_DISPOSITIONS = Object.freeze({
  invalid_request: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
  identity: Object.freeze({ retryable: false, user_visible: true, is_defect: false }),
  // 状态类不当缺陷，也不弹错误——UI 照常渲染当前状态就是了。
  state: Object.freeze({ retryable: false, user_visible: false, is_defect: false }),
  quota: Object.freeze({ retryable: false, user_visible: true, is_defect: false }),
  conflict: Object.freeze({ retryable: false, user_visible: false, is_defect: false }),
  transport: Object.freeze({ retryable: true, user_visible: true, is_defect: false }),
  contract: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
  unknown: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
});

function classifyError(code) {
  for (const [name, codes] of Object.entries(ERROR_CLASSES)) {
    if (codes.includes(code)) return name;
  }
  return "unknown";
}

function dispositionFor(code) {
  return ERROR_DISPOSITIONS[classifyError(code)];
}

// ---- 身份 ----
//
// 三层，谁持有谁不持有是这份合同最要紧的一句话。
//
//   player_id        真人在这个宿主里的标识。适配器知道它。
//   seat_handle      席位句柄。只有 HostCommand 适配器能拿到，而且只在 room.create /
//                    room.join 的返回里出现一次。SeatModel 适配器永远看不到它。
//   authority_id     权威一次性铸造的 intent_id / turn_id。SeatModel 适配器唯一能
//                    出示的凭证。
//
// 席位凭据（seat credential）刻意不在这三层里：它不属于适配器的身份模型，只存在于
// 协调器的托管层。适配器连「有一个凭据」这件事都不需要知道。
const IDENTITY_LAYERS = Object.freeze({
  player_id: Object.freeze({
    held_by: Object.freeze(["host_command"]),
    persists: "across_hands",
    note: "真人在本宿主里的标识。不是全局账号，跨宿主不保证相同。",
  }),
  seat_handle: Object.freeze({
    held_by: Object.freeze(["host_command"]),
    persists: "until_seat_released",
    note: "席位句柄。只在 room.create / room.join 的返回里产生一次。模型面拿不到。",
  }),
  authority_id: Object.freeze({
    held_by: Object.freeze(["host_command", "seat_model"]),
    persists: "single_use",
    note: "权威铸造的 intent_id / turn_id。一次性，只有三条 AI 回路命令认它。",
  }),
});

function describeIdentity(layer) {
  return IDENTITY_LAYERS[layer] ?? null;
}

// ---- 生命周期 ----
//
// 适配器自己的状态机，不是席位的。席位状态归权威（seated / connected / released 那一套）；
// 这里说的是「这个适配器实例现在能不能发命令」。
//
// 两者必须分开：适配器重连时席位仍在保留窗内，混成一个状态机会让「适配器掉线」被读成
// 「席位掉线」，而那会触发一次不该发生的释放。
const LIFECYCLE_STATES = Object.freeze([
  "created",     // 对象已建，还没协商能力。
  "negotiated",  // 能力已协商，可以发命令。
  "bound",       // 已经绑上至少一个席位（HostCommand 侧）或领到过 authority_id（SeatModel 侧）。
  "degraded",    // 传输类错误后的降级态。仍可发命令，但适配器知道自己刚失败过。
  "released",    // 已释放。不可再发命令，也不可回到前面任何状态。
]);

// 允许的迁移。released 是终态——没有 released -> 任何 的条目。
//
// 为什么终态不可逆：释放要删 web session、托管绑定与凭据。允许回头就得回答「回来时凭据
// 从哪来」，而唯一的答案是「适配器自己留了一份」，那正是 F6 要禁的。
const LIFECYCLE_TRANSITIONS = Object.freeze({
  created: Object.freeze(["negotiated", "released"]),
  negotiated: Object.freeze(["bound", "degraded", "released"]),
  bound: Object.freeze(["degraded", "released"]),
  degraded: Object.freeze(["bound", "negotiated", "released"]),
  released: Object.freeze([]),
});

function nextLifecycleState(from, to) {
  if (!LIFECYCLE_STATES.includes(from)) {
    throw new ContractError("invalid_field", { field: "from", value: from ?? null });
  }
  if (!LIFECYCLE_STATES.includes(to)) {
    throw new ContractError("invalid_field", { field: "to", value: to ?? null });
  }
  if (!LIFECYCLE_TRANSITIONS[from].includes(to)) {
    throw new ContractError("illegal_lifecycle_transition", { from, to });
  }
  return to;
}

// ---- 能力协商 ----
//
// 这一节存在的唯一理由：两个宿主能做的事不一样，而**差异必须可检测**，不能靠试出来。
//
// 最要紧的一条是 proactive_wake（收到权威事件后无需玩家点击就能启动一次 follow-up）。
// 它在两个宿主上都还没验证过。合同的作用不是让它变成真的，而是让「没有这个能力」表现为
// 一个适配器必须声明、宿主必须据此降级的事实——而不是一次静默的不动作：牌局停在那里，
// 谁都不知道是在等模型还是已经死了。
//
// 每一项都写明「缺了它宿主该怎么退」。没有降级路径的能力不该出现在这张表里：那种能力
// 缺失时只会表现为卡住，而卡住读不出原因。
const CAPABILITIES = Object.freeze({
  proactive_wake: Object.freeze({
    required: false,
    verified_on_any_host: false,
    degrade_to: "polling",
    note: "无点击主动唤醒。缺失时宿主必须退回轮询，并在 UI 上说明该席在等待唤醒——"
      + "静默不动作会让牌局停住而读不出原因。两个宿主都未验证（SAME_VISIBLE_TASK_SPIKE_V1 未执行）。",
  }),
  structured_ui: Object.freeze({
    required: false,
    verified_on_any_host: true,
    degrade_to: "text_commands",
    note: "结构化控件（按钮、表单）。缺失时退回文本命令。章程要求真人的筹码动作由结构化"
      + "控件提交，所以缺失时 hand.act 必须显式不可用，不能改成让模型代下。",
  }),
  private_hand_view: Object.freeze({
    required: false,
    verified_on_any_host: true,
    degrade_to: "public_only",
    note: "能只给本人看底牌。缺失时退回只显示公开信息——绝不许退成「给所有人看」。",
  }),
  persistent_session: Object.freeze({
    required: false,
    verified_on_any_host: true,
    degrade_to: "recover_on_reconnect",
    note: "跨重启保持会话。缺失时走 seat.recover。注意保留窗只有 120 秒，"
      + "而协调器重启会连同凭据一起丢，那种情况下恢复不了，按正常释放处理。",
  }),
  // 必需项。缺了它适配器根本没法参与，所以没有 degrade_to。
  command_dispatch: Object.freeze({
    required: true,
    verified_on_any_host: true,
    degrade_to: null,
    note: "能把一条命令发给核心并拿回信封。这是唯一的必需能力。",
  }),
});

const REQUIRED_CAPABILITIES = Object.freeze(
  Object.entries(CAPABILITIES).filter(([, spec]) => spec.required).map(([name]) => name),
);

// ---- 两份合同 ----
//
// 共享上面全部，分开的只有「能发什么命令」。清单不在这里重写一遍，直接引 host-surface.cjs
// ——那里已经逐条写明了每条命令归谁以及为什么。抄一份的后果是两处会漂移，而漂移的方向
// 一定是模型面变宽（新命令默认落到真人面这条规则只写在那一边）。
const ADAPTER_ROLES = Object.freeze({
  host_command: Object.freeze({
    actor: "human",
    commands: HUMAN_COMMANDS,
    holds_seat_handle: true,
    note: "真人操作面 + UI。筹码动作、Ready、隐私确认、亮牌都在这一侧。",
  }),
  seat_model: Object.freeze({
    actor: "model",
    commands: MODEL_COMMANDS,
    holds_seat_handle: false,
    note: "该席 AI 的参赛回路 + 公开读取。一张句柄也没有。",
  }),
});

function commandsForRole(role) {
  const spec = ADAPTER_ROLES[role];
  if (spec === undefined) {
    throw new ContractError("unknown_adapter_role", { role: role ?? null });
  }
  return spec.commands;
}

// 协商。适配器报它自己有什么，合同答「行/不行」以及每项缺失该怎么退。
//
// 返回值刻意不含 boolean 之外的裁决理由聚合（比如「总体可用性评分」）：一个分数会诱使
// 调用方用阈值判断，而这里每一项的降级路径都不一样，平均不出任何有意义的东西。
function negotiate({ role, contract_version: version, capabilities = [] } = {}) {
  const spec = ADAPTER_ROLES[role];
  if (spec === undefined) {
    throw new ContractError("unknown_adapter_role", { role: role ?? null });
  }
  if (version !== CONTRACT_VERSION) {
    // 版本不同直接不成立，不做「向后兼容」推断。见 CONTRACT_VERSION 的注释。
    throw new ContractError("contract_version_mismatch", {
      expected: CONTRACT_VERSION,
      received: version ?? null,
    });
  }
  const declared = Array.isArray(capabilities)
    ? capabilities.filter((name) => typeof name === "string")
    : [];
  const unknown = declared.filter((name) => CAPABILITIES[name] === undefined);
  if (unknown.length > 0) {
    // 认不出的能力名报错而不是忽略：忽略会让一处拼写错误表现为「这个能力没有」，
    // 而适配器那边以为自己声明过了。两边都不会有人发现。
    throw new ContractError("unknown_capability", { unknown });
  }
  const missingRequired = REQUIRED_CAPABILITIES.filter((name) => !declared.includes(name));
  if (missingRequired.length > 0) {
    throw new ContractError("required_capability_missing", { missing: missingRequired });
  }
  // 只按「声明了没有」过滤。曾经这里还多一个 !capSpec.required，而那个条件恒为真：
  // 必需能力没声明时上面已经抛了，所以走到这里的必需能力一定在 declared 里，
  // !declared.includes(name) 对它必为假。一次变异证明了它不可达，删掉而不是留着——
  // 与本轮删掉的那个 sessions.has 检查是同一类。
  //
  // 顺序也是不变量的一部分：必需能力的检查必须在这之前。放到后面的话，缺失的必需能力会
  // 变成一条 degrade_to 为 null 的降级项，而调用方从那条项里读不出该怎么办。
  const degradations = Object.entries(CAPABILITIES)
    .filter(([name]) => !declared.includes(name))
    .map(([name, capSpec]) => Object.freeze({
      capability: name,
      degrade_to: capSpec.degrade_to,
      note: capSpec.note,
    }));
  return Object.freeze({
    contract_version: CONTRACT_VERSION,
    role,
    actor: spec.actor,
    commands: spec.commands,
    holds_seat_handle: spec.holds_seat_handle,
    granted: Object.freeze(declared.filter((name) => CAPABILITIES[name] !== undefined)),
    degradations: Object.freeze(degradations),
    // 协商本身不改变生命周期状态，返回下一个状态名让调用方自己迁移——在这里替它改会让
    // 「谁持有状态」变得含糊，而适配器实例才是持有者。
    lifecycle_state: "negotiated",
  });
}

module.exports = {
  ADAPTER_ROLES,
  CAPABILITIES,
  CONTRACT_VERSION,
  ContractError,
  ERROR_CLASSES,
  ERROR_DISPOSITIONS,
  IDENTITY_LAYERS,
  LIFECYCLE_STATES,
  LIFECYCLE_TRANSITIONS,
  REQUIRED_CAPABILITIES,
  // classifyActor 从 host-surface 借来再导出：适配器要判断「这条命令属于我这一面吗」，
  // 而那个判断只该有一份实现。
  classifyActor,
  classifyError,
  commandsForRole,
  describeIdentity,
  dispositionFor,
  errorEnvelope,
  negotiate,
  nextLifecycleState,
  okEnvelope,
  requestEnvelope,
};
