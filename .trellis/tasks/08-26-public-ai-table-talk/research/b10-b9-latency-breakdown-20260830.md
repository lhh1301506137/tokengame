# Research: B9 两次真实生成的可观测耗时与最小协议候选

- Query: 从 B9 已过滤实机证据拆解 62.996 秒跨手丢弃、44.917 秒成功发布；区分任务整轮、工具包络、生成输出窗口与发布后收尾，并评估不改变产品合同的最小协议候选。
- Scope: internal；仅 B9 过滤证据、现行公开座位 AI 合同及 take/start/resolve 必要调用链。不研究新的 Codex queue 唤醒入口。
- Date: 2026-08-30
- 风险：`risk_tier: low`，本次仅研究；唯一授权写入为本文件。未改代码、规范、状态、计划树、合同或既有证据，未运行测试、游戏服务、模型、线程操作或任何 git 命令。
- 诊断边界：可确认协议编排差异，属于技术层事实；非工具时间内部的根因归属为 `insufficient_evidence`。按 `diagnose-only` 限定不实施候选；按 Trellis researcher 要求将已授权研究落盘。

## Findings

### 1. 结论摘要

1. **62.996 秒 / 44.917 秒是原生任务整轮 wall duration，不是纯模型推理时延。** 两轮所有可见执行包络合计分别只有 244 ms / 174 ms；剩余时间含模型工作、宿主调度、工具调用文本形成和最终文字收尾，无法继续可靠分摊。
2. **第 4 轮已经把 `ai.take_intents → ai.start` 放在同一个 `exec` 内串行执行。** 第 3 轮才将它们分为两个执行单元，其间空档为 9.573 秒。三条权威命令不等于必须三次模型往返；底层模型请求数仍是 unknown。
3. 完整本席 `model_context` 返回至提交 `resolve` 的可见窗口分别为 **26.815 秒 / 10.974 秒**。这是形成基于该次上下文的决定、公开文字及提交参数的包络上限，不是纯推理计时，也不是全部模型工作量的上限。
4. 成功轮次中，来源公开事件至权威发布为 **33.460 秒**；权威发布之后，到原生任务最终可见文字又过了 **11.556 秒**。不能把整轮 44.917 秒都记作玩家等待公开气泡的时间；浏览器首次渲染延迟是 unknown。
5. 价值优先级：先固定化已成功的串行准备流程，避免模型逐轮重新编写准备脚本；其次缩短 `resolve` 之后的终态收尾。二者均是待验证候选，不承诺提速比例，也不能据两次不同牌局样本证明因果。
6. **B9 五轮全部由显式任务消息触发。Codex 与 Claude 的 Gate 5 均仍为 `not_run`。** 本报告不把发布成功当作主动唤醒，也不判定主动唤醒不可能，不给整体验收结论。

### 2. 证据身份与定位方式

以下路径相对 `H:/tokengold/tokengame`。`N`、`R` 只是本报告内的文件简称；数组下标为零基。

| 简称 / 文件 | SHA256 | 用途与可定位字段 |
| --- | --- | --- |
| N：`artifacts/b9-real-host-20260830/native-task-evidence.json` | `5e57cad725afcb79669ff7ac7fe3bc73cd0e6b09d8144539eeab3a6bf2f922e4` | `reasoning_content_excluded=true`；`model_contexts` 5 条宿主模型元数据；`tool_executions` 18 条可见调用/输出；`public_final_messages` 5 条最终可见文字。 |
| R：`artifacts/b9-real-host-20260830/result.json` | `48d88e5e7656f1832a35bd8411a07727fa03cd45c1d1b13861aad8d0e95f2d24` | `statistics.native_turns[2..3]` 整轮耗时；`published_speech` 权威事件；`checks_current` 既有页面核对；`gate_5_runs` 与 `limits` 范围限制。 |

关键定位：

- 第 3 轮原生任务 turn：`01a052cc-c754-7b83-b742-8dea8417b772`；游戏评估 turn：`turn-1bf63a5d-3767-49c4-bb1a-15e82ee4eead`。来源分别为 `R#/statistics/native_turns/2`、`R#/attempt_history/3`。
- 第 4 轮原生任务 turn：`01a052cf-a3d0-70f1-9462-9b3513af1b59`；游戏评估 turn：`turn-3c66928f-5371-4a26-a983-3dc37853cfd3`。来源为 `R#/statistics/native_turns/3` 及 N 的第 13、14、15 条工具记录。
- 第 3 轮上下文：解析 `N#/tool_executions/9/output/1/text` 内的 JSON，再取 `content[0].text.result.model_context`。
- 第 4 轮上下文：解析 `N#/tool_executions/13/output/1/text` 内的 JSON，再取 `response.result.model_context`。
- 叙述核对：`REVIEW-LOG.md:1906` 的 `b9-real-host-seat-probe` 节；耗时、触发方式、版本分别见 `REVIEW-LOG.md:1934`、`:1975`、`:1920`。
- N 中 `source` 指向原始 rollout，但本次**没有打开该路径**；没有读取、解析或导出隐藏思维链。用量计数不用于反推出隐藏推理内容或持续时间。

### 3. 原生任务时间：标量 wall duration 与可见时间锚分开

所有绝对时间均为 **2026-08-30 UTC**（北京时间加 8 小时）。N 的 `model_contexts` 是宿主模型/effort 元数据，**不是** `ai.start` 返回的游戏 `model_context`。

| 项目 | 第 3 轮：跨手丢弃 | 第 4 轮：发布 |
| --- | --- | --- |
| R 中 task wall duration | 62,996 ms | 44,917 ms |
| 完整任务的精确 started/completed 时间 | unknown / unknown | unknown / unknown |
| N 中宿主 context 元数据锚 | `13:12:27.290Z`，`model_contexts[2].at` | `13:15:34.799Z`，`model_contexts[3].at` |
| N 中最终可见文字 | `13:13:30.134Z`，`public_final_messages[2].at` | `13:16:19.552Z`，`public_final_messages[3].at` |
| 上述两可见锚之间 | 62,844 ms | 44,753 ms |
| wall duration 减去可见锚间跨度 | 152 ms | 164 ms |

152 / 164 ms 仅为对账残差：过滤文件未保留精确任务开始/结束事件，不能把残差武断分配给“排队”“首 token”“末 token”或某一端。不得倒推一个猜测的任务开始时间，再把它当实测。

### 4. 每个 MCP 调用的可观测边界

N 记录的是 `custom_tool_call(name=exec)` 与对应 `custom_tool_call_output`，不是嵌套 MCP 的独立 span。下表的起止是**包住 MCP 的 exec 记录时间**；嵌套 MCP 的精确开始、结束与 duration 均为 **unknown**，单调用只能受该包络时长约束。包络还含函数调度、解析、脱敏与日志开销。

| 轮次 / MCP 命令 | N 调用→输出索引 | 外层起点 → 终点（UTC） | 可观测包络 | 真实 MCP 时间界限 |
| --- | --- | --- | --- | --- |
| 1 / `view.projection` | 2 → 3 | `13:09:01.625` → `13:09:01.714` | 89 ms | 起止 unknown；耗时 ≤ 89 ms；连接文件不可用 |
| 2 / `view.projection` | 4 → 5 | `13:10:59.577` → `13:10:59.663` | 86 ms | 起止 unknown；耗时 ≤ 86 ms |
| 3 / `ai.take_intents` | 6 → 7 | `13:12:37.422` → `13:12:37.509` | 87 ms | 起止 unknown；耗时 ≤ 87 ms |
| 3 / `ai.start` | 8 → 9 | `13:12:47.082` → `13:12:47.173` | 91 ms | 起止 unknown；耗时 ≤ 91 ms |
| 3 / `ai.resolve` | 10 → 11 | `13:13:13.988` → `13:13:14.054` | 66 ms | 起止 unknown；耗时 ≤ 66 ms；`hand_advanced` |
| 4 / `ai.take_intents` | 12 → 13，共用包络 | `13:15:56.897` → `13:15:56.992` | 与下一行合计 95 ms | 个别起止/耗时 unknown；两者串行合计 ≤ 95 ms |
| 4 / `ai.start` | 12 → 13，共用包络 | 同上 | 不重复累计 | 个别起止/耗时 unknown；在 take 成功后执行 |
| 4 / `ai.resolve` | 14 → 15 | `13:16:07.966` → `13:16:08.045` | 79 ms | 起止 unknown；耗时 ≤ 79 ms；成功公开 |
| 5 / `view.projection` | 16 → 17 | `13:17:37.383` → `13:17:37.466` | 83 ms | 起止 unknown；耗时 ≤ 83 ms；撤销拒绝 |

这恰好对应 R 的 `statistics.game_mcp_invocations=9`。另有 N 的索引 0→1 工具发现执行：`13:08:49.881`→`13:08:49.944`、63 ms，它不调用游戏 MCP，也不属于两次生成。

第 4 轮组合的直接依据是 `N#/tool_executions/12/input`：先 `await ai.take_intents`，检查成功及新 accepted intent，再 `await ai.start`，最后只输出 start 结果。中间没有等待模型读一次 take 结果后再决定如何 start；它也不是并行调用。

输出头的 `Wall time 0.0 seconds / 0.1 seconds` 只有粗粒度显示，不能将 `0.0` 当零延迟。本报告按配对记录的 `at` 相减，并保留包络与真实 MCP span 的区别。

### 5. 两次生成逐段分解

| 可见阶段 | 第 3 轮 | 第 4 轮 | 可说与不可说 |
| --- | --- | --- | --- |
| 宿主 context 锚 → 首个准备 exec | 10.132 s | 22.098 s | 没有游戏 MCP span 在此段；调度、输入处理、工具调用文本生成等细分 unknown |
| take 执行包络 | 0.087 s | 与 start 合计 0.095 s | 小于百毫秒级的可见包络，不能拆作服务端 CPU / HTTP / stdio 时间 |
| take 返回 → start exec | 9.573 s | 同一 exec 内，无独立模型往返边界 | 第 3 轮确实多一个可见模型重新介入的边界；不证明这 9.573 s 全是可移除成本 |
| start 执行包络 | 0.091 s | 已计入 0.095 s | start 的权威开始时刻仍 unknown |
| start 返回 → resolve exec | 26.815 s | 10.974 s | 基于完整授权上下文形成决定/公开文字/提交脚本的可见窗口上限；非纯推理时长 |
| resolve 执行包络 | 0.066 s | 0.079 s | 分别返回跨手丢弃 / 成功公开 |
| resolve 返回 → 最终可见文字 | 16.080 s | 11.507 s | 发布/丢弃决定已经返回，仍有任务说明文字收尾；不能回算成“生成发言前等待” |
| 可见锚间合计 | 62.844 s | 44.753 s | 分别再与 0.152 / 0.164 s 未定位残差对账到 task wall duration |

补充边界：

- 第 3 轮 `start` 包络返回 `13:12:47.173Z`，`resolve` 调用文本在 `13:13:13.988Z` 已包含决定与拟公开句子。26.815 秒中没有其他可见工具调用，但可能含模型、宿主与文本序列化等时间。模型在 take 返回后也可能已处理公共信息，因此这不是“整个回合推理仅 26.815 秒”的证据。
- 第 4 轮对应界限为 `13:15:56.992Z`→`13:16:07.966Z`，10.974 秒。两轮都没有 token 流、首 token、生成开始/结束、提供商队列或底层模型请求 span。
- 第 3 轮准备与 resolve 包络合计 `87+91+66=244 ms`；第 4 轮为 `95+79=174 ms`。可见大块时间在这些包络之外，但不能据此把“包络之外”全部命名为推理。
- 第 4 轮虽然减少了一个模型可见边界，首次准备前却比第 3 轮更久；不同输入、上下文、牌局和脚本长度同时变化。总耗时差不能归因于 take/start 合并，更不能报告可复现的加速率。

### 6. 玩家等到公开事件，与任务等到收尾，是两条时间线

成功轮次直接证据：

| 时间点 / 区间 | 数值 | 来源与含义 |
| --- | --- | --- |
| 来源公开事件 | `13:15:34.536Z` | 第 4 轮 start 上下文 `source_event.observed_at=1788095734536`；来源 `sae-3d1b2451-8260-40c1-a629-dcb40c59cdf7` |
| 权威公开事件 | `13:16:07.996Z` | `R#/published_speech/at=1788095767996`，sequence 16，`TABLE_PUBLIC / SEAT_AI` |
| 来源事件 → 权威公开 | **33.460 s** | 同一来源到发布的 wall 差，不是事件自动唤醒时延：任务仍由显式消息启动 |
| 宿主 context 锚 → 权威公开 | 33.197 s | 可见锚口径；精确 task-start → 公开仍 unknown |
| 权威公开 → resolve 返回 | 0.049 s | 同一成功包络内的后半段；不是纯网络耗时 |
| 权威公开 → 最终可见文字 | **11.556 s** | 公开已发生后仍在完成任务说明；精确 task-complete 时刻未保留 |
| 两页同一发言的既有核对 | `13:17:24.020Z` | `R#/checks_current/10`；证明检查时已经可见，不证明首次显示发生于此时 |

浏览器收到事件、首次 DOM 渲染和玩家第一次看到气泡的时间均 unknown。不能把上述页面核对晚于发布的 76.024 秒当作前端延迟。

第 3 轮没有发布时刻：从来源事件 `13:12:26.927Z` 到 `resolve` 返回为 47.127 秒，后者返回 `started_hand_index=1/current_hand_index=2/reason=hand_advanced`。权威丢弃发生在 resolve 包络内，精确事件时间 unknown；最后 16.080 秒只是已知丢弃后的最终文字收尾。

正常牌局时序还有一个重要限制：第 4 轮 start 上下文中的行动截止为 `13:16:04.174Z`，成功公开在该截止 **3.822 秒之后**。`late=false` 不是“赶上行动时钟”的证明，当前代码的迟到标注按是否跨街决定（`src/authority/seat-ai-store.cjs:980`）。B9 使用正常“本手后暂离”避免自动开下一手，未改变 30 秒行动时钟（`R#/limits/2`、`REVIEW-LOG.md:1929`）。这使旧手保护得以满足，不等于正常连续多手的实时体验已经合格。

### 7. 协议调用链、可合并点与不可绕过的边界

#### 7.1 当前代码承担的职责

| 步骤 / 代码位置 | 事实与约束 |
| --- | --- |
| MCP 转运：`plugins/tokengame/mcp/server.cjs:105`、`:337` | 每个命令从私有连接配置取得受限模型令牌，向协调器 POST；工具说明列出 take/start/resolve。实际 MCP 配置、用户连接文件本次未访问。 |
| 本席认证：`src/host/table-web-host.cjs:996` | 先从传输令牌找到绑定，命令前后 `verifyModelSession`，构造可信 `seat_handle + binding_id`；出门再脱敏与扫漏。 |
| 领取：`src/host/model-command-surface.cjs:245` | 外部调用只取可信绑定的一席；核心返回后复查 scope；把 `intent_id → handle/claimToken/binding/generation` 留在私有映射，移除模型不需的 `seat_id/claim_token`。 |
| 权威 claim：`src/authority/seat-ai-store.cjs:518` | 促进最新 pending，释放到期 claim，再只领本席未被占用项。claim 本身改变调度状态，**不是只读查询**。每次领取换 claim token。 |
| 启动：`src/host/model-command-surface.cjs:297` | 只用已登记 intent id，注入本席凭据和隐藏 claim token；异步返回后复查当前绑定，成功登记 turn id 并删除 intent 映射。 |
| 权威启动和私有上下文：`src/authority/command-surface.cjs:283`；`src/authority/table-orchestrator.cjs:631` | `ai.start` 在同次同步权威 dispatch 内启动，再返回该席合法手牌与实际启动来源、公共 timeline；不是使用模型回传快照重建事实。 |
| 单回合与预算：`src/authority/seat-ai-store.cjs:728` | 校验本席、OFF、claim 世代、已有 active turn、冷却和额度后才消费工作项；同时最多一个 active turn。 |
| 提交：`src/host/model-command-surface.cjs:317`；`src/authority/seat-ai-store.cjs:853` | 由 turn id 定位本席；权威再判 OFF/取消/租约、跨手丢弃、silent、公开确认、字素和额度、跨街标注。只有权威接纳才是公开。 |

不能把 `ai.start` 命名误读为它“在服务器里启动模型推理”：它建立评估状态并返回上下文，模型仍由原生宿主运行。`command-surface.cjs:271` 的概括注释写有旧顺序，实际 handler `:283` 与 B9 真实工具顺序更有判定力。

#### 7.2 take → start → resolve 是否必须三次模型往返

- **权威操作仍有三步，模型可见准备可以只占一次。** take 成功后的 accepted intent 选择与 start 参数搬运可以确定性完成，不需要模型重新推理。B9 第 4 轮已经证明在既有接口上可串行组合；不能将它重新包装成尚未实现的“三变二”性能成果。
- 不能用 `Promise.all(take, start)`：start 依赖新 intent id 及宿主私有映射，也必须消费正确 claim 世代。
- start 与 resolve 之间必须允许**同一真实原生 AI**消费成功 start 返回的上下文、自主选择 silent/public_speech。把 resolve 预填为固定文案、由协调器代替模型决定，或另用影子模型，都不满足本任务。
- 过滤证据没有提供商层请求日志，因此“第 3 轮恰好三次底层模型 API、第 4 轮恰好两次”均为 unknown。可确认的是分别 3 个 / 2 个包含游戏命令的 exec 单元，以及第 4 轮准备内部没有模型返回边界。

#### 7.3 安全的预读 / 合并边界

| 候选动作 | 判断与前提 |
| --- | --- |
| 把 take→start 做成固定的串行准备封装 | 可作为最小候选，复用同一绑定与现有权威命令；空队列、失败、不合格 intent 必须停，不伪装成正常空结果。每个异步边界保留绑定世代检查。 |
| 本地先领 intent，稍后交同一席同一执行者 start | 有条件可行，但属于 claim、不是无副作用预读。`INTENT_CLAIM_LEASE_MS=30_000`（`seat-ai-store.cjs:59`）；原生任务排队可能消耗租约。不得一边预领一边让模型再 take 同一份；必须保留单一领取所有权、撤销/换绑清除、到期与重领换代。不能靠延长租约或真人时钟掩盖等待。其性能收益本证据未证明。 |
| 预读公开 projection / timeline | 模型面已有只读能力，但 start 已返回当前必要公共信息；在本样本中新增独立读取只会增加待测调用点，不能当作必需优化。 |
| 提前把本席底牌放入 take、通知文字或公共事件 | 不可按现合同这样做。私有上下文必须经成功 start 返回，独立 `view.hand` 刻意不在模型白名单（`src/authority/host-surface.cjs:136`）。不得扩大到对手底牌或无关宿主内容。 |
| 复用领取时的 context 作最终生成依据 | 不可靠。claim 后新相关事件可就地更新同一工作项、保留 id 和 claim（`seat-ai-store.cjs:431`）；必须消费实际 start 返回的最新 `source_event/context_revision` 与私有投影。 |
| 合并 resolve 与下一次领取 / 启动 | 不是本次最小候选。权威 resolve 已负责促进唯一 dirty context（`seat-ai-store.cjs:842`），但下一轮仍需当前资格、单 active、冷却、额度与取消约束，不能展开无界模型循环；B9 无连续自动跟进时序证据。 |

核心内部允许未领取工作项的受控快照直接 start（`seat-ai-store.cjs:758`），**不代表外部 MCP 可跳过当前授权映射**：`ModelCommandSurface.issuedFor`（`:196`）仍要求可信登记与绑定。不能让模型自带 seat、claim token 或随意从事件中抄一个 id 旁路授权。

撤销是组合方案最易漏掉的边界：`table-web-host.cjs:270` 先增加绑定世代并清映射，`model-command-surface.cjs:159` 在异步响应后检查；组合不得把这些检查优化掉。已经从核心返回但尚未给模型的旧上下文，也必须沿用现有拒绝/扣下机制（`table-web-host.cjs:1050`）。上述为代码边界与后续验证义务，不声称 B9 已穷尽所有取消竞态。

### 8. 按价值排序的两个最小候选（尚未实施）

#### 候选 1：固定化“一次准备返回本席上下文”

- 做法：把已证实的 take→校验→start 串行路径固化为小型确定性准备封装或稳定调用模板，复用既有三条权威命令；模型只接收成功 start 的上下文和 turn id。不要每轮重新生成大段通用 decode/redact 程序。
- 依据：第 3 轮有可观察的 9.573 秒 take→start 空档；第 4 轮已避免该边界。但第 4 轮准备调用输入仍有 2,237 个字符，且准备前空档 22.098 秒。**脚本生成是否导致该空档是推测**，未有 token/调度分段证据。
- 价值：优先防止重复准备、无必要的模型介入与领取租约空耗；不以压缩已有毫秒级 HTTP 为主要卖点。对 B9 第 4 轮不能再计一次“三变二”的收益。
- 最小验证：在不改变模型/effort/行动时钟的后续获准验证中，分别记录 intent/turn 关联、准备入口起止、各嵌套 MCP 起止、上下文交付、resolve/权威公开与任务终态。检查重复调用、claim 过期、跨席/换绑、OFF、撤销穿越 await、空队列和失败关闭。现有测试入口可参考 `test/intent-claim-fencing.test.cjs`、`test/ai-intent-claim.test.cjs`、`test/seat-model-binding.test.cjs:230`，本次只查文件/测试名称，未执行。
- 收益声明：unknown；需要同口径重复样本。封装不是主动唤醒证明，也不能替代 Gate 5。

#### 候选 2：最小终态回执，减少 resolve 后重复说明

- 做法：在专用游戏回合中，以 resolve 的结构化结果为提交事实；最终可见回执只简述成功、沉默或丢弃，不再重复整段公开话术、hand id、turn id 和解释性清单。审计身份继续留在必要的机器记录，不移除错误可见性。
- 依据：第 3 / 4 轮 resolve 返回后仍分别有 16.080 / 11.507 秒到最终可见文字。当前可见最终文字包含再次引用发言和多个 id（N 的 `public_final_messages[2..3]`）。缩短文字不保证缩短全部该窗口，其余调度/推理仍 unknown。
- 价值：减少原生游戏任务的收尾占用。**不会让已经发生的本次权威发布提前**；只有后续工作依赖任务 idle 时，才可能改善后续待办等待。B9 无此连续消费证据，收益待测。
- 最小验证：分别度量权威发布、resolve 返回、最终可见回执、宿主任务 idle；确保不把 `hand_advanced` 或 revoke 拒绝改写成成功，不二次 resolve，不增加公开事件，不自动展开新生成。

暂不优先做连接文件缓存、移除双侧资格校验或公共历史压缩：两个样本里工具包络已很小，start timeline 仅 2 / 3 条；这些改动无本次直接收益证据，却可能削弱撤销、隐私或上下文完整性。

### 9. 找到的文件、规范与版本

| 文件 | 一句话描述 |
| --- | --- |
| `src/host/model-command-surface.cjs` | 本席范围、权威 id 映射、claim token 隐藏以及 take/start/resolve 的异步世代围栏。 |
| `plugins/tokengame/mcp/server.cjs` | 原生工具 schema、stdio→HTTP 转运、连接配置读取和最终敏感字段扫描。 |
| `src/host/table-web-host.cjs` | 模型绑定、撤销、前后资格检查、可信 scope 及唯一模型 HTTP 入口。 |
| `src/authority/command-surface.cjs` | 核心凭据校验，以及同次 dispatch 的 start + 私有上下文返回。 |
| `src/authority/seat-ai-store.cjs` | 单工作项/单 active、claim 租约与世代、最新上下文归并、OFF/迟到/跨手与公开配额。 |
| `src/authority/table-orchestrator.cjs` | 调用权威 AI store，并组装该席私有牌面和公共 timeline。 |
| `src/authority/host-surface.cjs` | 模型命令白名单，明确排除独立私有 `view.hand` 与真人扑克操作。 |
| `package.json` | 本地项目版本 `0.1.0`、Node `>=22`、现有脚本；本次不执行其中脚本。 |

本次读取的源码 SHA256：

| 文件 | SHA256 |
| --- | --- |
| `src/host/model-command-surface.cjs` | `8e39885e54c7b2e23ccc950710b054d9be94e77a11146ff8878593bb7825382d` |
| `plugins/tokengame/mcp/server.cjs` | `6a6a80dbdb361605b663f5e68f9fec90905ea425fe461340db1bfdac845ec855` |
| `src/host/table-web-host.cjs` | `d49ae9d630a0233192a6ba8802519e6d287833afa03da0320bf5996316d2bd0c` |
| `src/authority/command-surface.cjs` | `96b78562a27bdbd75d7ddd2438d6c497e0e3f3d6f1a521efca44ef5df6933b22` |
| `src/authority/seat-ai-store.cjs` | `3bb01eaeef54761a04db2ec369163f730f676e14c753f7fe86eb3daf25382e3e` |
| `src/authority/table-orchestrator.cjs` | `cb6472c058bef041b8ccaf9b3ee42b58441275f25ee27279c8dd172b403f49b7` |
| `src/authority/host-surface.cjs` | `0cdf56054da0d5efa60bdab710e7e7a1931e35d02a81469f38363f2ef9e8ed83` |

相关规范：

- `.trellis/workflow.md`：研究成果落入当前任务 research；本子任务不接管 Primary 的整合、验收或状态更新。
- `.trellis/spec/guides/cross-layer-thinking-guide.md`：区分模型、MCP、宿主、权威及浏览器的证据边界，不能混用时间戳口径。
- `.trellis/spec/frontend/state-management.md`：只有权威拥有业务结果、claim 和配额；协调器与浏览器不得维护第二份事实。
- `.trellis/spec/frontend/type-safety.md`：本席模型令牌不进模型文字；`model_context` 只来自获授权 `ai.start`；未知边界字段不可放宽。
- `.trellis/spec/frontend/quality-guidelines.md`：幂等、截止、隐私与多身份负例不可为了性能放宽；假模型不能替代真实宿主证据。
- `.trellis/spec/frontend/hook-guidelines.md`：普通宿主会话零桥接；本研究不借优化扩大到普通任务或旧桥 Hook。
- `PROJECT-DECISION-LOG.md:1337`（`DEC-20260827-023`）：现行 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D`，digest `584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54`；主动评估、单席单循环、四层预算、真人计时不延长、跨手丢弃、OFF/隐私边界均保持。未在本次重跑合同校验或更新合同。

外部参考与版本：本次不进行外部检索，不用网页证明性能或宿主唤醒能力。R 的 `native_task` 仅记录 B9 当时的 Codex Desktop `26.825.6671.0`、捆绑后端 `0.151.0-alpha.7.2`、报告模型 `gpt-5.6-sol / max`，`overrides_applied=false`，提供商证明仍 `unknown`。`server.cjs:426` 的 `2025-06-18` 是本地 MCP 初始化默认版本，不足以证明当时实际协商版本。

代码上下文方式：`provider=rg_fallback`、`target_level=task`。这是给定文件集合的隔离日志研究；直接读取当前代码足够，不初始化/刷新 CodeGraph，不安装工具。源码行号仅绑定上述读取快照，后续并行实施若改变文件，以哈希和符号重新定位。

### 10. 实际命令与复算口径

仅执行了纯读取/计算及唯一报告写入：

- `python ./.trellis/scripts/task.py current --source`：返回 `.trellis/tasks/08-26-public-ai-table-talk`，source 为当前 Codex session；未启动或切换任务。
- 检查 research 目录存在，因已存在未新建目录；检查本报告路径此前不存在。
- `Get-Content -LiteralPath ... -Raw`、按行选择：读取上述证据、合同、规范与代码；未访问 N 的原始 rollout 路径或任何用户连接/凭据文件。
- `rg --files --hidden .trellis/spec`；`rg -n` 查 `DEC-20260827-023`、`b9-real-host-seat-probe`、take/start/resolve/claim 与模型入口；`rg --files test` 及 `rg -n '^test\('` 只发现相关测试入口。
- `Get-FileHash -Algorithm SHA256 -LiteralPath ...`：取得证据和源码身份。
- PowerShell `ConvertFrom-Json` 解析过滤 JSON，按同一 `call_id` 对应的调用/输出记录配对；`([datetimeoffset]$end - [datetimeoffset]$start).TotalMilliseconds` 计算可见跨度；`[datetimeoffset]::FromUnixTimeMilliseconds(...)` 转换权威事件/行动截止时间；未执行日志中的脚本。
- 纯计算得到：`87+91+66=244 ms`、`95+79=174 ms`；`62996-62844=152 ms`、`44917-44753=164 ms`；`13:16:07.996-13:15:34.536=33.460 s`，`13:16:19.552-13:16:07.996=11.556 s`。
- `apply_patch`：仅新建本文件。没有补跑测试、真实模型调用、线程消息/创建、游戏服务或 git 操作；本报告中的“验证”均指未来候选验证计划或明确标注的既有 B9 证据。

## Caveats / Not Found

- 精确原生任务 started/completed、嵌套 MCP 单独 span、服务端 CPU/传输分段、提供商排队、首 token/末 token、纯推理时间、底层模型调用数、浏览器首次显示时间：均 **unknown**。不读取未过滤 rollout 来补这些缺口。
- 第 4 轮的 take/start 只有共享 95 ms 包络，不能把它拆成两个独立已测 duration，更不能各计 95 ms 后相加。
- 两次生成只有一次发布，样本/上下文/牌局/准备脚本不同；没有对照实验，不能给平均响应保障、可靠性百分比或加速率。
- B9 的同手保护、撤销拒绝与两页可见各有窄范围直接证据；它们不能替代正常连续多手、四真人体验或任何主动唤醒验收。
- 5 次 `task_inputs` 均由显式消息启动。`R#/gate_5_runs/0/status` 与 `/1/status` 均为 `not_run`；自动触发、是否需点击/新提示和同一可见上下文主动处理均未由本次证明。
- 本报告只向 Primary 提供证据与候选，不创建第二份路线真相，不变更模型、推理强度、行动计时、权威合同或用户验收状态。
