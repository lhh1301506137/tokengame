"use strict";

// 两个宿主适配器共享的合同。宿主中立的口径在 2026-08-29（A3）精确了一次，这里说清。
//
// 原来写的是「本文件不引用 Codex / Claude / MCP / Hook / 浏览器」。那句话现在不成立了，
// 而且不该成立：A3 要求能力协商按「角色 + 具体宿主剖面」验证，而「哪个宿主验证过哪一项」
// 不写宿主名字就无法表达。不表达它的代价是具体的——一个宿主跑通一次实机 Gate 5 就会连带
// 授权另一个宿主，而后者什么都没验证过。
//
// 现在的口径是：**本文件不以宿主名字做判断**。宿主名字只出现在下面的 HOST_PROFILES 登记表
// 与各能力的 verified_on 里，那些是事实清单——加一个宿主是加一行数据。任何 if / switch /
// 三元 / 等值比较以宿主名字为条件都不许出现，连「先把比较结果存进变量再分支」也不行。
// 这条由 test/adapter-contract.test.cjs 的源码断言守着，射程比原来大：整个 src/ 都查。
//
// 结构是**一套 HostAdapter 协议 + 两个权限剖面**：`host_command` 与 `seat_model`。
//
// 共用的是这里的全部——版本、三个信封、七类错误、三层身份、生命周期、能力协商。
// 两个剖面之间唯一不同的字段是 `commands`，它按对象身份引 host-surface.cjs 的
// HUMAN_COMMANDS 与 MODEL_COMMANDS，不复制。
//
// 为什么不叫「两份合同」（之前的说法）。除 commands 之外没有一样东西是分开的，把一个
// 字段的差别叫做两份合同，会让读者以为存在两套要各自实现、各自验证的协议，于是一致性
// 套件也该跑两批不同的检查——实际是同一批检查跑两个剖面，只有权限相关的几条按剖面分叉。
// Plan Tree 的节点名本来就是单数，这个措辞与它一致，那个「份数待裁决」的悬置项因此关闭。
//
// 剖面不比合同弱：模型剖面一张句柄也没有，两个剖面的命令面不重叠，而且两侧都不许出现
// host-surface.cjs 之外的命令——这几条与「本文件不出现任何宿主专有判断」一样，
// 由 test/adapter-contract.test.cjs 的源码断言守着。

const {
  HUMAN_COMMANDS,
  MODEL_COMMANDS,
  classifyActor,
} = require("../authority/host-surface.cjs");

// ---- 合同版本 ----
//
// 数字本身住在 src/shared/contract-version.cjs，理由写在那里：说这个版本号的有两侧
// （这里构造信封，command-server 校验进来的信封），而抄两份迟早差一，让传输 require
// 合同层则把依赖方向倒过来。这里按对象身份引用，不复制。
const { CONTRACT_VERSION } = require("../shared/contract-version.cjs");

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
// 仓库里此刻有九十来个错误码。适配器不该认得全部——它需要知道的是「拿到这个码该怎么办」，
// 而那只有十来种答案。分类是给适配器的，不是给人读日志的。
//
// 这里刻意不写确切数字。写了就得有人在每次加码时改它，而没有任何测试会因为它过期而红
// ——「注册表里没有源码不存在的码」那条对账管的是码本身，管不了注释里的数字。
//
// 未列出的码归 "unknown"，而 "unknown" 的处置与 "bug" 相同（原样上报，不重试、不改 UI
// 状态）。默认落到最保守的一档：新增一个码时忘了归类，后果是它被当成 bug 显示出来，
// 而不是被静默重试或被当成正常状态。反过来会让一个真错误看起来像一次普通拒绝。
const ERROR_CLASSES = Object.freeze({
  // 参数不对。重试同样的请求不会变好，改参数才行。
  invalid_request: Object.freeze([
    "ai_receipt_invalid_limits",
    // 声明了一项尚未在任何宿主上验证过的能力。归 invalid_request 而不是 state：
    // 重试同一份声明不会变好，改声明才行。也不归 identity——它与谁是谁无关。
    "capability_not_verified",
    "invalid_duration_ms",
    "invalid_expected_revision",
    "invalid_field",
    "field_too_long",
    "message_too_long",
    "model_connection_invalid",
    "model_connection_origin_conflict",
    "unknown_command",
    "seat_stack_missing",
  ]),
  // 身份或授权不成立。适配器要么补身份，要么走恢复流程；不能靠重试。
  identity: Object.freeze([
    // 浏览器发来一条不在允许清单里的命令。归 identity 而不是 http_request：这一条问的是
    // 「你这一侧有没有资格发这条命令」，与 command_not_host_facing / command_not_model_facing
    // 同类。未知命令与不允许的命令刻意共用这一个码，区分它们会把那个出口变成命令面的探测口。
    "action_not_permitted",
    "authority_token_rejected",
    "authority_id_scope_mismatch",
    "wake_thread_not_authorized",
    // 两面各一个码，刻意不合成一个 command_out_of_face。合成之后日志里读不出是哪一面
    // 越界了，而两个方向的严重性差得很远：真人面越界是宿主自己的路由表写错了，
    // 模型面越界意味着模型可能拿到下注权限。
    "command_not_host_facing",
    "command_not_model_facing",
    "credential_not_model_supplied",
    "invite_rejected",
    "local_bridge_auth_unresolved",
    // 模型命令口的令牌不对。与 authority_token_rejected 同类同处置，刻意不合成一个码：
    // 两者守的是不同的口，日志里读不出是哪一个被试探等于看不见试探。
    "model_command_token_rejected",
    "model_scope_rejected",
    "model_binding_changed",
    "model_connection_changed",
    "wake_connector_changed",
    "player_credentials_incomplete",
    "player_token_rejected",
    "recovery_credential_rejected",
    "seat_credential_revoked",
    "seat_handle_missing",
    "seat_handle_required",
    "seat_handle_unknown",
    "seat_id_not_model_supplied",
    "seat_identity_not_model_supplied",
    // 一条真人命令没带会话令牌。与 web_session_unknown 分成两个码：那一条是「你给的这个
    // 会话我不认」，这一条是「你根本没说你是哪个会话」。协调器刻意不在只有一个会话时替
    // 调用方猜——猜对一次，就会有第二个会话进来时把命令记到别人头上。
    "web_session_required",
    "web_session_unknown",
    "unknown_authority_id",
  ]),
  // 当前状态下这个动作不成立。牌桌本来就会经过这些状态，UI 该照常显示，不该报错。
  // 这一类最容易被误当成 bug 上报，而那会让正常对局途中弹出一串技术错误。
  state: Object.freeze([
    "cancelled",
    "core_request_cancelled",
    "wake_cancelled",
    "wake_session_active",
    "wake_result_pending",
    "wake_thread_in_use",
    "wake_request_unknown",
    "wake_start_failed",
    "wake_resolve_failed",
    "wake_intent_already_attempted",
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
    "test_chip_refill_during_hand",
    "test_chip_refill_not_available",
    "test_chip_refill_required",
    "table_reset_not_allowed",
    "turn_already_registered",
    "turn_not_active",
    "unknown_ai_request",
    "window_already_open",
    "wake_connector_busy",
    "wake_connector_cancelled",
    "wake_connector_in_use",
    "wake_connector_poll_active",
    "wake_notification_unknown",
  ]),
  // 配额与限流。等一会儿可能就好了，但等多久由权威说，适配器不该自己定重试节奏。
  quota: Object.freeze([
    "ai_hand_quota_exhausted",
    "ai_request_quota_used",
    "player_hand_quota_exhausted",
    "player_rate_limited",
    "model_binding_history_full",
    "wake_history_full",
    "wake_thread_history_full",
    "wake_intent_history_full",
    "wake_connector_capacity",
  ]),
  // 并发冲突。同一个键配了不同内容，或版本号陈旧。适配器该重读再决定，不是重发。
  conflict: Object.freeze([
    "entry_key_conflict",
    "wake_request_conflict",
    "wake_ack_conflict",
    "model_binding_request_conflict",
    "idempotency_key_conflict",
    "revision_conflict",
    "stale_hand_revision",
  ]),
  // 传输层。核心不可达或答非所问。这一类是唯一「原样重试有意义」的。
  transport: Object.freeze([
    // adapter_timeout 与 table_unavailable 是「对面没答」，重试有意义。
    // 前者出在 table-web-host 的推理运行时超时，后者出在插件 MCP 连不上协调器。
    //
    // core_unavailable 曾在这里。它出在插件 MCP 连不上**核心**，而 B6 收敛后插件不再
    // 直接打核心——那一跳由协调器做。留着一个源码里已经没有的码不是「向后兼容」：
    // 它会让「注册表里没有源码不存在的码」那条对账永远绿不了，于是下一次真的漂了也看不出来。
    "adapter_timeout",
    "core_request_failed",
    "core_response_not_json",
    "core_unreachable",
    "table_unavailable",
    // 仅连接器同次 poll/ACK 的网络故障可重试，绝不据此重试本机 queue。
    "wake_connector_network_unavailable",
  ]),
  // queue可能已经被宿主接收。即使底层表现为I/O错误，也不能按普通网络错误重发。
  execution_uncertain: Object.freeze([
    "wake_io_timeout",
    "wake_queue_timeout",
    "wake_queue_unknown",
    "wake_queue_failed",
    "wake_cleanup_failed",
    "wake_result_unknown",
    "wake_receipt_unavailable",
    "queue_timeout",
    "queue_child_error",
    "queue_io_error",
    "queue_output_limit",
    "wake_connector_queue_unknown",
    "wake_connector_queue_failed",
    "wake_connector_cleanup_unknown",
    "wake_connector_cleanup_failed",
    "wake_connector_start_timeout",
    "wake_connector_detach_failed",
  ]),
  // 这台机器没配这条路。改配置能好，重试不能，也不是缺陷——不配是合法的默认。
  //
  // 单列一类而不是并入 identity 或 transport，两边都会读错：
  //   归 identity  → 读成「你的令牌不对」，于是运维去换令牌，而问题是根本没设令牌；
  //   归 transport → 处置里 retryable 为真，于是模型客户端对一条永远不会变好的 503
  //                  一直重试。
  // 这一类的正确处置是「把该配什么告诉运维」，那与上面两类都不同。
  //
  // 两条码分居两侧，刻意不合成一个：协调器没设令牌（路整个关着）与插件没设令牌
  // （路开着但本进程无凭出示）要靠不同的人改不同的配置。合成之后读不出该改哪一边。
  configuration: Object.freeze([
    "invalid_configuration",
    "child_start_failed",
    "wake_disabled",
    // B11 本地回执：远程核心没有本地事实源；文件目标、已有证据与存储可用性需要操作者
    // 检查后另开一次捕获。write 可能已经产生效果，绝不能按网络故障自动重发或覆盖旧文件。
    "ai_receipt_remote_core_unsupported",
    "ai_receipt_invalid_file",
    "ai_receipt_file_exists",
    "ai_receipt_open_failed",
    "ai_receipt_write_failed",
    "ai_receipt_read_failed",
    "model_command_route_disabled",
    "model_command_token_not_configured",
    "model_binding_required",
    "model_connection_unavailable",
    "remote_origin_required",
    "remote_https_required",
    "remote_beta_start_failed",
    "wake_connector_configuration_invalid",
    "wake_connector_disabled",
    "wake_connector_unavailable",
    "wake_connector_start_failed",
    "tokengame_codex_project_invalid",
    "tokengame_codex_environment_invalid",
    "tokengame_codex_thread_invalid",
    // 本地入口校验的稳定错误码，不声明任何宿主实机验证已通过。
    "tokengame_codex_executable_invalid",
    "tokengame_codex_executable_not_found",
    "tokengame_codex_executable_required",
    "tokengame_codex_executable_untrusted",
    "tokengame_codex_beta_start_failed",
    "tokengame_public_origin_invalid",
  ]),
  // 例行 HTTP 状况。客户端问的方式不对，不是本地缺陷。
  //
  // 这一类是 A4 补上的。此前它们一个都没归类，全落 unknown——而 unknown 的处置是
  // 「当缺陷、弹给用户」，于是一次拼错的 URL 会在用户面前变成一条「程序出错了」。
  //
  // 单列一类而不是并入 invalid_request：后者说的是「这次调用的参数不对」，处置里
  // is_defect 为真（调用方写错了代码）；这一类是「这个地址/方法/大小不对」，多数时候
  // 是浏览器或脚本在探路，不该记成缺陷。
  http_request: Object.freeze([
    "method_not_allowed",
    "not_found",
    "request_body_too_large",
    "unknown_route",
  ]),
  // 失败关闭的安全把关。命中就整份扣下，绝不重试。
  //
  // 这两条此前也是 is_defect: true，但那是 unknown 兜底的结果而不是归类的结果。差别在
  // 哪天有人把兜底改宽——比如让 unknown 可重试以「提高健壮性」——它们会跟着变宽，而一次
  // 重试的凭据泄漏检测等于把泄漏又发一次。
  security_fail_closed: Object.freeze([
    "credential_leak",
    "response_withheld_secret_detected",
  ]),
  // 本地缺陷。走到这里说明有代码路径没考虑到，重试和换参数都没用。
  //
  // invalid_core_response 归这里而不是 transport：对面确实答了，只是答的不是 JSON。
  // 重发同一条请求会得到同一份坏响应，所以它不可重试——这是它与 core_unreachable 的
  // 分界，两者读起来都像「对面有问题」，处置却相反。
  internal: Object.freeze([
    "wake_protocol_invalid",
    "wake_clock_invalid",
    // 观察源/事件形状与订阅接线不符合本地契约；和用户选择了不可用文件路径不是一类。
    "ai_receipt_invalid_source",
    "ai_receipt_invalid_event",
    "ai_receipt_subscription_failed",
    "ai_receipt_startup_failed",
    "internal_error",
    "invalid_core_response",
    "wake_connector_protocol_invalid",
    "wake_connector_failed",
    // 入口接线/兜底错误不改变 HOST_PROFILES 的宿主验证状态。
    "tokengame_codex_config_result_invalid",
    "tokengame_codex_beta_invalid",
    "tokengame_codex_play_failed",
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
    // 剖面相关的三条归这里而不是 invalid_request：它们说的都是「你我谈的不是同一份合同」
    // ——剖面名不认、剖面与角色对不上、这个角色不该声明这项能力。换参数重来没用，得改代码。
    //
    // capability_not_verified 是唯一的例外，它在 invalid_request 里：那一条说的是「这次
    // 声明超出了你已验证的范围」，而跑一次实机 Gate 5 之后同一次调用就成立了。它是可以
    // 通过外部动作变绿的，所以不属于「接错线」。
    "unknown_host_profile",
    "profile_role_mismatch",
    "capability_not_for_role",
    // 请求信封缺版本号。归 contract 而不是 invalid_request：缺的不是一个参数，是
    // 「你我谈的是哪一份合同」这件事本身，换参数重来没用。
    "contract_version_missing",
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
  execution_uncertain: Object.freeze({ retryable: false, user_visible: true, is_defect: false }),
  contract: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
  // 配置缺失。user_visible 为真是这一档最要紧的一位：一条静默的「路关着」会让宿主 AI
  // 对着一个永远不答的口轮询下去，而运维那边看不到任何该改配置的信号。
  configuration: Object.freeze({ retryable: false, user_visible: true, is_defect: false }),
  // 例行 HTTP 状况。不记缺陷（多数是浏览器或脚本在探路），但要让调用方看见——
  // 一次静默的 404 会让人以为请求成功了。
  http_request: Object.freeze({ retryable: false, user_visible: true, is_defect: false }),
  // 失败关闭的安全把关。当缺陷、绝不重试。retryable 为假是这一档最要紧的一位：
  // 重试一条凭据泄漏检测等于把泄漏再发一次。
  security_fail_closed: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
  // 本地缺陷。与 unknown 的处置相同，但分开命名有意义：unknown 是「没归类」，
  // internal 是「归了类，结论就是这里有 bug」。混在一起会让覆盖检查读不出缺口。
  internal: Object.freeze({ retryable: false, user_visible: true, is_defect: true }),
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
// ---- 宿主剖面 ----
//
// 「哪个宿主的哪一侧」。这份登记表存在的理由是一句在旧设计里不可表达的话：**这个**宿主
// 验证过这项能力没有。
//
// 旧设计用一个全局布尔 `verified_on_any_host`，而名字本身就是那个缺陷。它记录「有没有
// 任何宿主验证过」，于是 Codex 侧真跑通一次实机 Gate 5、把标志翻成 true 之后，Claude 侧
// 的同一项声明立刻也变成合法的——而 Claude 那边什么都没验证过。一次实机证据授权了另一个
// 宿主，这正是不能发生的事。
//
// 剖面名进 CAPABILITIES.verified_on 的数组里，所以「验证过什么」是逐剖面记录的事实清单，
// 翻一项只影响一个剖面。
const HOST_PROFILES = Object.freeze({
  codex_cli: Object.freeze({
    role: "seat_model",
    note: "Codex CLI 的座位 AI 侧。0.145.0 上跑过桥探针（docs/HOST-PROBE-CHECKLIST.md），"
      + "命令派发这条路径有实机产物；界面支持仍是未关闭的 U-TG-CODEX-UI-SUPPORT。",
  }),
  claude_desktop: Object.freeze({
    role: "seat_model",
    note: "Claude Desktop / Cowork 的座位 AI 侧。本机没有装，探针从未开始执行——"
      + "见 docs/ACCEPTANCE-EVIDENCE.md 的 Blocked evidence。所以它一项能力都没验证过，"
      + "包括必需的 command_dispatch：这个剖面现在协商不过去，而那是准确的。",
  }),
  web_table: Object.freeze({
    role: "host_command",
    note: "浏览器牌桌，真人操作面。浏览器验收跑过多轮（结构化控件、逐席私有底牌视图、"
      + "掉线后 seat.recover），所以它的 UI 能力有实测支撑。",
  }),
});

// 每一项都写明「缺了它宿主该怎么退」。没有降级路径的能力不该出现在这张表里：那种能力
// 缺失时只会表现为卡住，而卡住读不出原因。
//
// verified_on 是剖面名的清单，空数组意思是「没有任何剖面验证过」。往里加一项必须有实机
// 产物支撑，不是有人觉得应该能行。
const CAPABILITIES = Object.freeze({
  proactive_wake: Object.freeze({
    required: false,
    verified_on: Object.freeze([]),
    degrade_to: "polling",
    note: "无点击主动唤醒。缺失时宿主必须退回轮询，并在 UI 上说明该席在等待唤醒——"
      + "静默不动作会让牌局停住而读不出原因。任何剖面都未验证（SAME_VISIBLE_TASK_SPIKE_V1 未执行）。",
  }),
  structured_ui: Object.freeze({
    required: false,
    verified_on: Object.freeze(["web_table"]),
    degrade_to: "text_commands",
    note: "结构化控件（按钮、表单）。缺失时退回文本命令。章程要求真人的筹码动作由结构化"
      + "控件提交，所以缺失时 hand.act 必须显式不可用，不能改成让模型代下。",
  }),
  private_hand_view: Object.freeze({
    required: false,
    verified_on: Object.freeze(["web_table"]),
    degrade_to: "public_only",
    note: "能只给本人看底牌。缺失时退回只显示公开信息——绝不许退成「给所有人看」。",
  }),
  persistent_session: Object.freeze({
    required: false,
    verified_on: Object.freeze(["web_table"]),
    degrade_to: "recover_on_reconnect",
    note: "跨重启保持会话。缺失时走 seat.recover。注意保留窗只有 120 秒，"
      + "而协调器重启会连同凭据一起丢，那种情况下恢复不了，按正常释放处理。",
  }),
  // 必需项。缺了它适配器根本没法参与，所以没有 degrade_to。
  //
  // claude_desktop 不在 verified_on 里，后果是那个剖面现在协商不过去。这不是疏漏：本机没有
  // 装 Claude Desktop，那一侧从来没有把一条命令发给核心再拿回信封过。一个登记了但用不了的
  // 剖面比一个假装能用的剖面有用——前者让「还差一次实机」变成机器可判定的事实，后者只会在
  // 第一次真的接上时才暴露。
  command_dispatch: Object.freeze({
    required: true,
    verified_on: Object.freeze(["codex_cli", "web_table"]),
    degrade_to: null,
    note: "能把一条命令发给核心并拿回信封。这是唯一的必需能力。",
  }),
});

const REQUIRED_CAPABILITIES = Object.freeze(
  Object.entries(CAPABILITIES).filter(([, spec]) => spec.required).map(([name]) => name),
);

// ---- 两个权限剖面 ----
//
// 措辞现在统一为：**一套 HostAdapter 协议、`host_command` 与 `seat_model` 两个权限剖面**。
//
// 为什么改这个说法。之前写「两份合同」，而上面每一样东西——版本、三个信封、七类错误、
// 三层身份、生命周期、协商——两侧完全共用，分开的只有 `commands` 这一个字段。把「一个
// 字段不同」叫做两份合同，会让读者以为存在两套需要各自实现、各自验证的协议，于是
// 一致性套件也该跑两遍不同的检查。实际不是：套件对两侧跑同一批检查，只有权限相关的
// 几条按剖面分叉。Plan Tree 的节点名本来就是单数，这个措辞与它一致。
//
// 「剖面」不比「合同」弱。二分仍然是硬的：模型剖面一张句柄也没有，命令面不重叠，
// 而下面 test/adapter-contract.test.cjs 扫源码盯着两侧不出现 host-surface.cjs 之外的命令。
//
// 清单不在这里重写一遍，直接引 host-surface.cjs——那里已经逐条写明了每条命令归谁以及
// 为什么。按对象身份引用，不复制：抄一份的后果是两处会漂移，而漂移的方向一定是模型面
// 变宽（「新命令默认落到真人面」这条规则只写在那一边）。
// allowed_capabilities 是「这个角色声明哪些能力才有意义」。
//
// 三项 UI 能力对模型剖面不可能为真：它们描述的是真人面的表面，而模型面里连 view.hand 都
// 没有——声明「我能只给本人看底牌」时，它连底牌出口都不持有。
//
// 危害按实情说，不夸大。今天 degradations 与 granted 只有测试在读，产品代码里还没有消费者
// （B7 的轮询兜底未建），所以现在的后果是「合同接受了一句永远不可能为真的声明，并把它记进
// granted」。等 B7 把 degradations 接成轮询与 UI 提示的依据之后，同一句假声明就会变成「该退
// 的降级没退」。趁没有消费者的时候关掉比等它长出消费者再关便宜。
//
// proactive_wake 对模型剖面是有意义的（被叫起来说话），所以它在允许集里——它过不去是因为
// 另一道检查：任何剖面都还没验证过它。两道门各管一件事，别合并。
const ADAPTER_ROLES = Object.freeze({
  host_command: Object.freeze({
    actor: "human",
    commands: HUMAN_COMMANDS,
    holds_seat_handle: true,
    allowed_capabilities: Object.freeze([
      "command_dispatch",
      "persistent_session",
      "private_hand_view",
      "proactive_wake",
      "structured_ui",
    ]),
    note: "真人操作面 + UI。筹码动作、Ready、隐私确认、亮牌都在这一侧。",
  }),
  seat_model: Object.freeze({
    actor: "model",
    commands: MODEL_COMMANDS,
    holds_seat_handle: false,
    allowed_capabilities: Object.freeze(["command_dispatch", "proactive_wake"]),
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
function negotiate({ role, profile, contract_version: version, capabilities = [] } = {}) {
  const spec = ADAPTER_ROLES[role];
  if (spec === undefined) {
    throw new ContractError("unknown_adapter_role", { role: role ?? null });
  }
  // 剖面必传。允许省略等于允许「不说自己是谁」，而那正是这一节要消灭的状态：一个不报剖面的
  // 适配器只能按「随便哪个宿主」处理，于是任何一处实机证据都会授权它。
  //
  // 认不出的剖面名报错而不是当成「哪里都没验证过」：静默降级会让一处拼写错误和一个诚实的
  // 未验证宿主长得一模一样，而前者该改代码、后者该去跑实机。
  const profileSpec = HOST_PROFILES[profile];
  if (profileSpec === undefined) {
    throw new ContractError("unknown_host_profile", {
      profile: profile ?? null,
      known: Object.keys(HOST_PROFILES),
    });
  }
  if (profileSpec.role !== role) {
    // 拿真人面的剖面协商模型角色，等于声称「我这一侧既是那个宿主的真人面又是模型面」。
    // 两个剖面的权限不重叠正是二分的全部意义，允许这种组合就把二分作废了。
    throw new ContractError("profile_role_mismatch", {
      profile,
      role,
      profile_role: profileSpec.role,
    });
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
  // 这个角色声明这项能力有没有意义。按角色的允许集走，不把能力名写死：下一项 UI 能力加进来
  // 时，写死名字的实现不会红，而它同样会被模型剖面静默接受——与从前写死 proactive_wake 那次
  // 是同一类。
  //
  // 这道检查在验证检查之前。顺序有意义：一项对该角色根本无意义的能力，报「你这个角色不该
  // 声明它」比报「这个剖面还没验证过它」准确——后者会让人以为跑一次实机就能拿到。
  const notForRole = declared.filter((name) => !spec.allowed_capabilities.includes(name));
  if (notForRole.length > 0) {
    throw new ContractError("capability_not_for_role", { role, rejected: notForRole });
  }
  // 这个剖面还没验证过的能力，声明即拒。
  //
  // 此前「绝不声明 proactive_wake」这条规则只写在每个适配器自己的 DECLARED_CAPABILITIES
  // 里，而这里从不检查。两份参考适配器都恰好做对了，于是没有任何东西要求过这件事——
  // 与 policy epoch 那一处同形：规则只在记得它的地方成立。
  //
  // 后果不是「多了一条声明」。下面的 degradations 将是宿主决定要不要轮询的依据：声明了
  // proactive_wake，polling 那一条就不在清单里，于是宿主不轮询，而那个能力实际上并不存在。
  // 表现是牌局停在某一席上，谁都不知道是在等模型还是已经死了。
  //
  // 按 verified_on 逐剖面判，不看全局：一个宿主的实机证据不该授权另一个宿主。
  //
  // 这道检查会自己退休。某个剖面真跑通一次实机 Gate 5 之后把它加进那一项的 verified_on，
  // 该剖面的声明就合法了——所以它不是「永久禁止」，而是「你没验证过之前不许声明」。加名字
  // 必须有实机产物支撑，而 test/capability-honesty.test.cjs 最后一条会在翻转时提醒把断言
  // 方向一起改。
  const unverified = declared.filter((name) => !CAPABILITIES[name].verified_on.includes(profile));
  if (unverified.length > 0) {
    throw new ContractError("capability_not_verified", { profile, unverified });
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
    profile,
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
  HOST_PROFILES,
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
