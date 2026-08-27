# Research: 宿主主动回合与同 surface UI 能力刷新

- Query: 截至 2026-08-27，Codex Desktop/CLI/plugins/hooks/apps/MCP 与 Claude Desktop/Cowork/hooks/MCP Apps 是否支持“外部牌桌事件主动唤醒当前会话模型并把输出回送牌桌”，以及 Hook/主动唤醒与牌桌 UI 能否位于同一 surface。
- Scope: mixed（仓库代码 + 官方一手外部资料）
- Date: 2026-08-27（Asia/Shanghai）
- 访问日期: 下列外部链接均于 2026-08-27 访问。

## 结论摘要

1. **Codex 当前可见任务：仍未被官方文档证明可由外部牌桌事件无点击唤醒。** OpenAI Hook 文档已经给出明确负边界：后台 Hook 在没有活动 turn 时会等到下一次用户 turn，完成后台 Hook 本身不会启动新 turn。`Stop` continuation 只能续接刚结束的现有 turn，也不是空闲唤醒器。因此，仅靠 Codex Hook 的 Gate 5 应判 **明确不支持**。
2. **Codex App Server：明确支持协调器拥有的线程闭环。** 外部程序可 `thread/start|resume`、`turn/start` 并订阅输出事件，所以“牌桌事件 → 模型 turn → 输出回桌”对 App Server 自己加载/拥有的线程是 **明确支持**。但官方没有承诺另一个 App Server 进程可以安全接管 Codex Desktop 当前已经打开的可见任务，或与 Desktop 同时写同一 live thread；这一点仍是 **文档未说明 + 必须实机验证**。
3. **Codex MCP Apps 同任务路径只有协议候选，没有宿主级 Gate 5 证据。** OpenAI 的通用插件文档说明 Codex Desktop 可使用含 MCP/custom UI 的插件；OpenAI UI 文档说明 ChatGPT 实现 `ui/message`/`sendFollowUpMessage`。但文档没有明确承诺 Codex 会话 surface 实现同样的 `ui/message` follow-up，也没有承诺可由组件收到网络事件后无用户手势自动调用。MCP Apps 规范本身还允许宿主请求用户同意。因此 Codex Gate 5 的 `user_click_required` 目前必须记为 `unknown`。
4. **Claude Desktop Chat：MCP Apps UI 明确支持，插件 Hook 明确不运行。** Anthropic 明确说 interactive connectors 可在 Claude Desktop/Cowork 内嵌或全屏显示；同时明确说插件 Hooks 只在 Cowork 运行、Chat 中置灰。故“Chat 同 surface 的 Hook + UI”是 **明确不支持**；依靠 MCP App `ui/message` 自己触发 follow-up 是否无需点击，官方未说明，仍须实机验证。
5. **Claude Cowork：Hook 与 MCP Apps UI 两个组件分别被官方声明支持，而且可以作为同一 Cowork surface 的候选；但主动唤醒交集未被证明。** 官方没有说明 Cowork 插件 Hook 是否实现 Claude Code 的 `asyncRewake`，也没有说明 Cowork 对 MCP Apps `ui/message` 是否无点击执行。故旧判断“Cowork 可能没有 MCP Apps UI”已经过时，但 Gate 5 仍是 `not_run`，不能声称主动 AI 已成立。
6. **Claude Desktop 的 Code tab 是一个需要单独建模的第三 surface。** Claude Code 正式文档明确：`asyncRewake: true` 的后台 Hook 以退出码 2 结束时，即使 session idle 也会立即唤醒 Claude；Hook 在 Desktop 的 Code tab 同样生效，`Stop.last_assistant_message` 可捕获最终文本。由此，Code tab 上的“外部监听器 → 当前 Code session 唤醒 → Stop 回传”具有 **高强度官方支持**。但是 Code tab 是否渲染 TokenGame MCP App、能否与该 Hook 在同一 UI surface 共存，官方未说明，必须实机验证。
7. **核心开发不应等待 Gate 5。** 权威牌局状态机、房间/席位协议、SSE/重连、聊天配额、事件归并、幂等、取消、确定性 fake `SEAT_AI`、牌桌 UI 与“唯一 App Server 线程”回退可以独立推进。被 Gate 5 阻塞的只有“当前可见宿主任务无点击主动 AI”适配器、宿主输入默认公开语义以及对应真实宿主 E2E/交付声明。

## 判定口径

| 状态 | 本文含义 |
|---|---|
| 明确支持 | 官方产品文档或正式协议直接描述了目标行为；不靠搜索摘要或类比推导。 |
| 明确不支持 | 官方文档直接给出相反行为或 surface 排除。 |
| 文档未说明 | 找到相关组件说明，但没有目标组合/边界的正式承诺。 |
| 必须实机验证 | 目标由多个可选能力组合而成、可能随宿主版本/权限变化，静态文档不足以通过 Gate。 |

“MCP Apps 协议允许”不等于“某个具体宿主已实现”；“两个组件分别可用”也不等于“同一会话、同一 surface、无需点击、恰好一次”已经成立。

## OpenAI Codex 能力矩阵

| surface / 机制 | 外部事件启动真实模型 turn | 输出回送牌桌 | 同 surface 牌桌 UI | 用户点击事实 | 判定 |
|---|---|---|---|---|---|
| Codex Hook：`UserPromptSubmit` | 只在用户提交 prompt 时触发 | 可为该用户 turn 注入上下文 | 与插件 UI 可分别存在，但不构成唤醒 | 需要先有用户 prompt | 对空闲主动唤醒：明确不支持 |
| Codex Hook：后台 `async` | 官方明确：无活动 turn 时等到下一用户 turn；完成 Hook 不开新 turn | 输出只能到下一安全点/下一用户 turn | 无关 | 新用户 turn 必需 | 明确不支持 Gate 5 |
| Codex Hook：同步 `Stop` continuation | 可在现有 turn 结束点自动创建 continuation prompt | `last_assistant_message` 可由 Hook 读取 | 可作为已有 turn 的有界续接 | continuation 本身无需再点，但必须先有原 turn | 明确支持“续接”，明确不是 idle wake |
| Codex App Server（协调器加载的线程） | `thread/start|resume` + `turn/start` 明确支持 | `item/agentMessage/delta`、`item/completed`、`turn/completed` 等事件明确支持 | UI 由 TokenGame/调用方自建；不是 Codex 当前可见任务内 UI 保证 | 程序调用不要求玩家每事件点击；审批另论 | 明确支持协调器线程闭环 |
| 独立 App Server 接管当前 Desktop live thread | 可按 ID `thread/resume` 已存线程，但并发附着/当前 Desktop 所有权未定义 | 未定义 | 未定义 | 未定义 | 文档未说明；不可作为 MVP 主路径承诺 |
| Codex SDK | 可 start/continue/resume SDK 自己驱动的 thread | SDK 可取得结果 | 不是 Desktop 当前可见 UI | 程序化 | 明确支持 SDK 自有线程；当前可见任务未说明 |
| 普通 MCP tool/server | MCP 提供工具/上下文；调用发生在宿主/model 已经运行的回合中 | tool result 回到当前回合 | MCP server 可声明 UI resource，前提是宿主实现 MCP Apps | 无入站 wake 合同 | 单独用 MCP：不构成主动唤醒 |
| Codex Desktop 插件 + MCP App `ui/message` | 协议的 `ui/message` 会发用户角色消息并触发 follow-up；但 Codex surface 的实现未被 OpenAI 文档明确点名 | 若 follow-up 成立，可由 Stop/工具发布 | 通用插件文档允许 custom UI；具体 Codex 渲染与桥能力需探针 | MCP Apps 规范允许宿主请求 consent；Codex 行为未知 | 候选可行；Gate 5 必须实机验证 |
| Codex CLI | 支持插件、Hooks、MCP；终端本身不是内嵌牌桌 UI surface | Hook/App Server 可回传 | 未见 CLI 渲染 MCP App iframe 的正式承诺 | 未定义 | 主动 turn 仍依赖 App Server 或用户输入；同 surface UI 未说明 |

### Codex 的硬边界

- [OpenAI Hooks：后台 Hook](https://learn.chatgpt.com/docs/hooks#run-hooks-in-the-background) 明确规定：空闲 session 要等下一个用户 turn，后台 Hook 完成不启动新 turn。这是直接的负证据，不是“暂时没找到 API”。
- [OpenAI Hooks：Stop](https://learn.chatgpt.com/docs/hooks#stop) 明确规定：`decision: "block"` 会用 reason 自动创建 continuation prompt；它发生在已有 turn 的 Stop 事件上。因此可以用于**有界续接**，不能无限挂住来伪造任意时刻的牌桌事件唤醒。
- [Codex App Server](https://learn.chatgpt.com/docs/app-server#core-primitives) 明确给出 `turn/start` 与流式事件；这是当前唯一有高强度文档支持的、由 TokenGame 本地协调器主动驱动模型回合并读取输出的 Codex 方案。
- App Server 的 `thread/resume` 证明“可继续已存 thread”，不证明“可无冲突接管另一客户端当前正在显示/加载的 live thread”。官方没有给出 live ownership、并发 writer、Desktop UI 同步或锁语义，不能补写成支持。
- [OpenAI Plugins](https://learn.chatgpt.com/docs/plugins) 明确说 Codex in ChatGPT desktop 可使用插件，插件可包含 connector/MCP/custom UI/Hook；但 [OpenAI MCP UI 指南](https://developers.openai.com/plugins/build/chatgpt-ui) 的宿主实现承诺主要写作 ChatGPT。故 Codex Desktop 的 UI resource、`ui/message`、PiP/fullscreen 和无点击行为必须按固定版本做 capability probe。

## Anthropic Claude 能力矩阵

| surface / 机制 | 外部事件启动真实模型 turn | 输出回送牌桌 | 同 surface 牌桌 UI | 用户点击事实 | 判定 |
|---|---|---|---|---|---|
| Claude Desktop Chat / claude.ai Chat 插件 Hook | Anthropic 明确说 Hooks 在 Chat 中置灰、不运行 | 无 Hook Stop 回传 | MCP Apps/interactive connector 明确支持 | UI 内动作可交互；自动 `ui/message` 行为未说明 | Hook + UI 同 surface：明确不支持 |
| Claude Desktop Chat MCP App `ui/message` | 协议允许 follow-up；Claude 宿主是否接受无手势自动消息未明确 | 若 follow-up 成立，可由 connector/tool 回服务 | inline/fullscreen 明确支持 | 未说明；协议允许 consent | 必须实机验证，不能据 UI 可见直接判 Gate 5 通过 |
| Claude Cowork 插件 Hooks | `UserPromptSubmit`/`Stop` 等生命周期 Hook 被官方声明可运行 | Stop 组件候选可取得回答；真实 wire 行为需探针 | interactive connector/MCP App 明确可在 Cowork 显示 | 普通 Hook 仍依赖生命周期事件 | 组件支持明确；主动唤醒未说明 |
| Claude Cowork + MCP App `ui/message` | 这是 Gate 5 最相关候选；官方没有承诺无点击、恰好一次 follow-up | 需同会话关联 + Stop/权威终态 | Hook 和 MCP App 可分别在 Cowork 使用 | unknown | 同 surface 候选成立；组合必须实机验证 |
| Claude Cowork `asyncRewake` | 未找到 Anthropic 正式产品文档把 Claude Code 的 `asyncRewake` 行为承诺给 Cowork runtime | 未说明 | Cowork UI 本身支持 MCP Apps | 未说明 | 文档未说明；禁止从 Claude Code 外推 |
| Claude Desktop Code tab / Claude Code `asyncRewake` | 退出码 2 可在 session idle 时立即唤醒 Claude | `Stop.last_assistant_message` 明确可捕获最终响应，Hook 可回传本地/远端权威服务 | Code tab 的 MCP Apps iframe 支持未被明确说明 | 每次事件唤醒不要求玩家点击；首次 workspace trust/安装仍可能要确认 | 主动 wake 明确支持；同 surface UI 必须实机验证 |
| Claude Desktop Code tab 普通 async Hook | 空闲时输出等下一次用户交互 | 下一 turn 可见 | 未说明 | 需要下一用户交互 | 对 Gate 5 明确不够；只有 `asyncRewake` 是例外 |
| Claude Desktop local MCP server / extension | 提供对话工具和本地能力 | 工具结果回当前回合 | Chat 的 MCP App UI 明确；Code tab 未明确 | 无外部入站 turn 合同 | MCP 单独不构成 wake |

### Claude 的硬边界与本次修正

- [Anthropic：Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude) 明确：插件可用于 web Chat、Claude Desktop Chat 与 Cowork，但 Hooks/sub-agents **只在 Cowork 运行**，Chat 中置灰。因此普通 Chat 不能承担“主输入 Hook + Stop Hook + UI”的完整回路。
- [Anthropic：Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude) 明确把 interactive connectors 列为 Claude、Cowork、Claude Desktop 可用，并说明 inline/fullscreen UI 与 conversation input 可同时存在。这推翻了“Cowork 没有 MCP Apps UI 文档证据”的旧顾虑；当前问题已缩小为**组合、关联和主动 turn 是否成立**。
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background) 明确给出 `asyncRewake`：后台 Hook 退出码 2 时，即使会话空闲也立即唤醒 Claude。该页还明确 Hooks 在 Claude Code Desktop 生效。
- [Claude Desktop quickstart](https://code.claude.com/docs/en/desktop-quickstart) 明确 Desktop 分 Chat、Cowork、Code 三个 tab，并说明 Claude Code 文档聚焦 Code tab。故 `asyncRewake` 证据属于 Code tab/Claude Code，不能自动归给 Cowork 或 Chat。
- Anthropic 的 Cowork 文档只证明 Hook 和 interactive connector 组件分别可用，没有公开说明 Cowork 是否接受 `asyncRewake` 字段，也没有给出 MCP App `ui/message` 的无手势执行承诺。
- Cowork connector 请求通过 Anthropic 云端访问外部服务；官方要求自定义 connector 指向公网可达服务。TokenGame 不能假设 Cowork 的 connector 能直接访问只监听 `127.0.0.1` 的本地权威进程。牌局 relay、鉴权、最小数据暴露与本地 Hook 回路需分层设计。

## MCP Apps 协议事实与“需不需要点击”

[MCP Apps 2026-01-26 规范](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) 对 `ui/message` 的协议语义是：View 向 Host 发送一个用户角色消息，Host 应把它加入会话上下文；该消息会触发 follow-up。与此同时，Host **可以请求用户同意**。因此：

- 协议层：`ui/message` 是可用于启动 follow-up 的正确候选，不只是更新 UI 状态。
- 宿主层：是否自动执行、是否弹确认、是否限于用户手势、是否节流/去重，必须由该宿主和版本直接证明。
- TokenGame Gate 5：只有 `user_click_required: no`、`new_user_prompt_required: no`、恰好一次真实模型评估和唯一 `silent | public_speech` 终态都有直接日志证据，才可 PASS。
- 如果宿主弹出 consent、要求玩家点击组件、要求玩家重新发送 prompt，Gate 5 对“主动 AI”应 FAIL；这至多是半主动/被动模式。
- 首次安装、connector 授权、workspace trust 属于**一次性 setup consent**，应与“每个牌桌事件是否需要点击”分开记录，避免把正常安装授权误判为 Gate 5 失败。

当前 [Claude 宿主探针清单](../../../../docs/CLAUDE-HOST-PROBE-CHECKLIST.md) 已在 Gate 5 记录中包含 `user_click_required` 与 `new_user_prompt_required`，其方法论与本次官方资料刷新一致。

## 对 TokenGame MVP 的直接架构结论

### 1. 保留双载体接口，不把宿主猜测写进核心

本地协调器应面向以下最小 capability contract，而不是按产品名硬编码：

```text
ui.inline_or_fullscreen
ui.message_followup
ui.message_requires_user_consent
wake.external_event_while_idle
wake.same_visible_context
turn.cancel_or_steer
output.final_message_capture
binding.stable_session_key
```

运行时 capability probe 只启用真实通过的组合；未知能力不得乐观默认。

### 2. Codex 的实现顺序

1. 保留 `SAME_VISIBLE_TASK_SPIKE_V1`，在固定 Codex Desktop/插件版本验证：MCP App 是否渲染、能否接收 fixture 的网络事件、组件能否无点击调用 `ui/message`、是否恰好启动一次当前可见任务 follow-up、Stop 是否只发布一个终态。
2. 如果任一关键门禁失败，直接使用既定回退：“牌桌聊天框 + 本地协调器唯一 App Server 游戏线程”。这条链在官方文档层面已经具备主动 turn 和输出流合同。
3. 不要用后台 Hook、无限 Stop continuation、轮询模型或同时运行可见任务/后台线程来掩盖 Gate 失败。

### 3. Claude 的实现顺序

1. Claude Desktop Chat 只作为“内嵌牌桌 UI + 被动对话”候选；不能规划插件 Hook 捕获主输入。
2. Claude Cowork 是“Hook + MCP App 同 surface”的首要产品候选，但需执行现有 Gate 1–9，尤其验证 `ui/message` 是否无点击、Hook/connector 是否有稳定同会话绑定字段，以及 connector 云端路由。
3. Claude Desktop Code tab 可作为第二个技术候选：用一个受控、去重、可取消的 `asyncRewake` 长运行监听 Hook 接收牌桌事件，模型结束后由 Stop Hook 发布。该方案的主动 wake 有官方依据；牌桌 UI 若不能在 Code tab 内渲染，则只能使用外部/邻接 UI，不能冒充同 surface。

### 4. 阻塞与非阻塞边界

**可以立即继续开发：**

- 权威扑克状态机、动作合法性、计时、Ready/掉线/退出/结算；
- 房间、席位、binding generation、恢复凭据与公开投影；
- TABLE_PUBLIC / AI_PUBLIC 事件合同、配额、屏蔽/隐藏、审计；
- 牌桌 UI、SSE/重连、事件合并、迟到/取消、exactly-once 终态；
- 宿主无关 `SEAT_AI` adapter 接口、确定性 fake adapter；
- Codex App Server 单线程回退与其自动化测试；
- Claude remote connector 所需的最小公网 relay 合同，但不应在未做威胁建模前暴露本地权威接口。

**必须等待真实宿主证据：**

- 宣称 Codex 当前可见任务能被牌桌事件无点击主动唤醒；
- 宣称 Claude Cowork 能无点击主动唤醒；
- 宣称任一宿主已实现 Hook/wake 与 MCP App UI 的同 surface 完整闭环；
- 将主宿主输入框设为“入桌后自由文本默认公开”的最终启用；
- 真实双宿主 E2E、发布包 surface 选择和“主动 AI 已交付”声明。

因此，Gate 5 是**载体适配器与产品声明的门禁，不是核心牌局开发的总阻塞**。核心代码应以 fake + App Server fallback 推进，并把同任务/Cowork 主动能力保留为可替换 adapter。

## 仓库文件与当前代码模式

### Files found

- `plugins/tokengame/hooks/user_prompt_submit.cjs`：当前 Codex 用户提示 Hook，只处理显式 TokenGame 公开前缀。
- `plugins/tokengame/hooks/stop.cjs`：当前 Codex Stop Hook，只为同一 `session_id + turn_id` 的 pending 请求发布最终回答。
- `plugins/tokengame/hooks/hook-lib.cjs`：本地桥请求与 pending marker 存储；没有外部事件唤醒器。
- `plugins/tokengame/mcp/server.cjs`：当前 MCP server 只声明 text tool capability，没有 UI resources/MCP Apps bridge。
- `.trellis/spec/frontend/hook-guidelines.md`：现有 Hook 隐私、幂等与失败关闭规范。
- `.trellis/tasks/08-26-public-ai-table-talk/prd.md`：`SAME_VISIBLE_TASK_SPIKE_V1`、Gate 5、单 App Server 回退与双跑禁令。
- `docs/CLAUDE-HOST-PROBE-CHECKLIST.md`：Claude Chat/Cowork 九项实机门禁，Gate 5 已区分是否需要点击。
- `.trellis/tasks/08-26-public-ai-table-talk/research/codex-visible-task-proactive-turn-boundary.md`：上一轮 Codex 主动 turn 边界研究。
- `.trellis/tasks/08-26-public-ai-table-talk/research/codex-plugin-ui-seat-binding.md`：上一轮 Codex UI/session/seat 绑定研究。

### Code patterns

- `plugins/tokengame/hooks/user_prompt_submit.cjs:13-16`：解析显式前缀，普通 prompt 直接结束，当前并非“绑定任务内自由文本默认公开”。
- `plugins/tokengame/hooks/user_prompt_submit.cjs:32-40`：只有用户 turn 已存在时，Hook 才把 prompt 发布到本地桥。
- `plugins/tokengame/hooks/user_prompt_submit.cjs:57-72`：pending 以 `session_id + turn_id` 建立并向当前 turn 注入上下文；没有外部事件入口。
- `plugins/tokengame/hooks/stop.cjs:18-23`：没有同 turn pending marker 的 Stop 零桥接。
- `plugins/tokengame/hooks/stop.cjs:33-50`：读取 `last_assistant_message` 后发布同一个已登记 turn 的回答。
- `plugins/tokengame/hooks/hook-lib.cjs:66-83`：marker 由 `session_id + turn_id` 哈希定位，适合幂等配对，不等于 idle wake。
- `plugins/tokengame/mcp/server.cjs:98-106`：MCP capabilities 目前只有 `{ tools: {} }`。
- `plugins/tokengame/mcp/server.cjs:112-120`：只处理 `tools/list`、`tools/call`；没有 resources、`ui://`、`_meta.ui.resourceUri` 或 MCP Apps bridge。
- `.trellis/spec/frontend/hook-guidelines.md:11-14`：普通会话零桥接、公开提示模型前写入、Stop 重入与幂等仍是后续 adapter 必须保持的安全不变量。
- `.trellis/tasks/08-26-public-ai-table-talk/prd.md:286-291`：Codex Gate 要求无点击 `ui/message` 恰好启动一次当前任务 follow-up；失败时自动切换唯一 App Server 线程。
- `.trellis/tasks/08-26-public-ai-table-talk/prd.md:642-646`：双宿主主动唤醒仍是技术事实门禁，Gate 记录必须说明是否需要用户点击。

当前仓库因此只证明“用户先发 prompt → Codex 生成 → Stop 回传”的旧桥接路径；没有实现任何宿主的“远端牌桌事件 → idle session wake”。

## External references

以下均为官方文档、官方规范或官方仓库；未把搜索结果摘要作为结论依据。

### OpenAI / Codex

- [OpenAI Hooks](https://learn.chatgpt.com/docs/hooks) — 后台 Hook 空闲边界、`UserPromptSubmit`、`Stop` continuation、`last_assistant_message`。证据强度：**高（正式产品文档）**。
- [Codex App Server](https://learn.chatgpt.com/docs/app-server) — thread/turn 生命周期、`turn/start`、streaming events、`thread/resume`。证据强度：**高（正式协议文档）**。
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) — 程序化 start/continue/resume thread。证据强度：**高（正式 SDK 文档）**。
- [Plugins in ChatGPT and Codex](https://learn.chatgpt.com/docs/plugins) — Codex Desktop/CLI 插件 surface 与 connector/MCP/custom UI/Hook 组件。证据强度：**高（正式产品文档）**。
- [Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui) — ChatGPT 的 MCP Apps bridge、`ui/message`、inline/fullscreen/PiP。证据强度：**高（ChatGPT 实现文档）；对 Codex surface 仅中等**。
- [OpenAI plugin UI reference](https://developers.openai.com/plugins/reference) — `window.openai.sendFollowUpMessage` 的 ChatGPT 行为。证据强度：**高（ChatGPT）；不可直接外推 Codex**。
- [Codex MCP](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) — Codex MCP 工具/上下文 surface。证据强度：**高（正式产品文档）**。

### Anthropic / Claude

- [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude) — Chat/Cowork 插件范围、Hooks 只在 Cowork 运行、Cowork connector 云端路由。证据强度：**高（官方产品支持文档）**。
- [Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude) — Claude/Cowork/Desktop 的 MCP Apps UI、inline/fullscreen 与同屏输入。证据强度：**高（官方产品支持文档）**。
- [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks) — Desktop Code tab Hook、`asyncRewake` idle wake、普通 async 限制、Stop 输出。证据强度：**高（正式技术文档）**。
- [Claude Desktop quickstart](https://code.claude.com/docs/en/desktop-quickstart) — Chat/Cowork/Code 三个 tab 的 surface 边界。证据强度：**高（正式产品文档）**。
- [Local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop) — 本地 Desktop extension/MCP 工具范围。证据强度：**高（官方支持文档）**。
- [Anthropic knowledge-work-plugins component schemas](https://github.com/anthropics/knowledge-work-plugins/blob/main/cowork-plugin-management/skills/create-cowork-plugin/references/component-schemas.md) — Cowork plugin 的 Hook 事件与 MCP server 结构。证据强度：**中（Anthropic 官方仓库中的作者指南，不等同宿主 conformance 测试）**。

### MCP Apps 标准

- [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview) — iframe UI、host capability negotiation 与 compatible hosts。证据强度：**高（官方标准文档）；不证明具体宿主的可选能力已启用**。
- [MCP Apps 2026-01-26 specification](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) — `ui/message` follow-up 与 Host 可请求用户同意。证据强度：**高（官方版本化规范）**。
- [MCP Apps extension support matrix](https://modelcontextprotocol.io/extensions/client-matrix) — extension 是 opt-in、必须做 capability negotiation；该矩阵注明由社区维护。证据强度：**中/低（官方站点但社区维护，不用作单一宿主 PASS 证据）**。

## Related specs

- `.trellis/spec/frontend/hook-guidelines.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
- `.trellis/tasks/08-26-public-ai-table-talk/prd.md`
- `.trellis/tasks/08-26-public-ai-table-talk/research/codex-visible-task-proactive-turn-boundary.md`
- `.trellis/tasks/08-26-public-ai-table-talk/research/codex-plugin-ui-seat-binding.md`
- `docs/CLAUDE-HOST-PROBE-CHECKLIST.md`

## Caveats / Not Found

- 未执行 Codex Desktop、Codex CLI、Claude Desktop Chat、Claude Cowork 或 Claude Desktop Code tab 的真实宿主探针；本文件不把静态资料冒充 Gate PASS。
- 未找到 OpenAI 对“Codex Desktop 当前可见任务实现 MCP Apps `ui/message` 且允许无用户手势自动 follow-up”的明确承诺。
- 未找到 OpenAI 对“独立 App Server 可并发接管 Desktop 已加载 live thread”的所有权/同步合同。
- 未找到 Anthropic 对“Cowork 实现 Claude Code `asyncRewake`”的明确承诺。
- 未找到 Anthropic 对 Claude/Cowork MCP Apps `ui/message` 无需用户同意、无手势自动执行的明确承诺。
- 未找到 Anthropic 对 Claude Desktop Code tab 渲染 MCP Apps iframe 的明确承诺。
- `ui/message` 的协议级 follow-up 不自动证明网络事件可在 iframe 后台长期连接、休眠恢复、窗口未聚焦时执行、或恰好一次；这些都属于 Gate 5/7 的实机内容。
- 官方产品与文档在 2026 年变化较快。探针证据必须记录 Desktop/CLI/plugin/connector 的精确版本和日期，不得把本报告永久视为版本无关事实。
