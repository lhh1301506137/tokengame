# Codex 插件 UI 与席位绑定研究

## 研究问题

MVP-0 如何让玩家从当前 Codex 专用游戏任务加入临时私人房，并让该任务的用户文本、模型回合与图形牌桌共同绑定到唯一席位，同时不把席位密钥暴露给模型或普通 Codex 任务。

> 状态修正：本文已经确定“从当前任务加入并绑定席位”的入口方向，但没有证明远端牌局事件能唤醒同一个可见任务。主动回合承载边界与技术尖峰门禁见 `codex-visible-task-proactive-turn-boundary.md`；两项决策不得混为一谈。

## 当前官方能力

- OpenAI 当前插件文档说明：插件可在 ChatGPT 桌面端的 Codex 中安装和使用，可包含 Skill、Connector、MCP server、Hook；Connector 可选自定义 UI。官方推荐用 `@` 在提示框中显式调用插件或其 Skill。
- 插件 UI 快速入门明确展示 MCP tool 返回 web component，并在 ChatGPT iframe 中渲染；UI 指南说明组件通过 MCP Apps bridge 与宿主通信。文档同时要求工具在无 UI 时仍可用，但没有在同一页面明确承诺所有 Codex/CLI 宿主都具备相同 iframe 渲染能力。因此“Codex 任务内嵌牌桌”必须在目标桌面版本上做能力验收，不能只凭插件已安装就视为 UI 可用。
- Codex Hook 的公共输入包含稳定的当前 `session_id`；`UserPromptSubmit` 还包含即将发送的 `prompt` 与 `turn_id`，`Stop` 包含最终 assistant message。这比读取 transcript 更适合把当前 Codex 任务绑定到本地协调器；官方明确说 transcript 格式不是稳定接口。
- Codex App Server 支持 `thread/start`、`thread/resume`、`turn/start`、流式事件和取消，适合本地协调器驱动专用游戏线程。其 WebSocket 传输仍标为 experimental/unsupported，不应暴露到 TokenGame 公网；MVP 使用本地 stdio/受控本地传输，远端只连接 TokenGame 房间服务。
- 插件附带 Hook 在安装后不会自动获得信任，用户必须审阅并信任当前 Hook 定义；安装动线必须显式处理这一点。

## 当前仓库事实

- `plugins/tokengame/hooks/hook-lib.cjs` 已按 `session_id + turn_id` 建立 pending marker，并写入 `PLUGIN_DATA`；已有结构可扩展为 `session_id -> room/seat binding`，无需把绑定存进项目文件。
- 当前 Hook 只识别 `$tokengame public`、`@tokengame public` 和显式标签，普通 prompt 不进桥；目标 MVP 需要在“该 session 已绑定活跃席位”时改为默认 TABLE_PUBLIC，未绑定 session 仍保持零牌桌流量。
- 当前 MCP server 只返回文本工具结果，没有声明 UI resource；当前牌桌是单独 Web 页。因此内嵌 UI 必须新增 MCP Apps resource/tool 合同，不能把已有页面存在当作已完成。

## 可行进入方式

### A. Codex 任务优先，内嵌牌桌（推荐）

1. 玩家在专用 Codex 任务发送 `@tokengame join <invite>`。
2. 可信 Hook/本地协调器通过该任务的 `session_id` 兑换邀请并保存 room-scoped 绑定；seat/recovery 凭据写入 `PLUGIN_DATA` 的本机私密存储，不写入模型可见提示、项目文件、公开事件或 URL。
3. 插件 MCP tool 返回牌桌 UI resource；兼容宿主在当前任务中渲染牌桌组件。按钮直接调用受约束工具/本地协调器提交结构化动作。玩家聊天是否继续走主任务输入框，取决于同任务主动回合技术尖峰，不由席位绑定方案预先决定。
4. 目标 Codex 宿主若未提供所需 UI bridge，插件返回一次性 handoff URL，在外部本地页面显示同一牌桌。URL 只含短期单用交换码，不含长期 seat/recovery secret；此 fallback 是否还能让当前可见任务承担主动 AI，必须单独降级标注，不能假定成立。

优点：符合用户的核心产品心智；主路径一步加入；UI 和席位绑定属于同一任务。缺点：必须验证 Codex 宿主的 MCP Apps UI 兼容性；聊天和模型是否也能稳定留在同一可见任务尚需尖峰；Hook 信任和插件重启/新任务边界需要清晰提示。

### B. 邀请网页优先，再配对 Codex

玩家先打开邀请页选择空席，网页显示一次性配对码，再在 Codex 任务输入 `@tokengame pair <code>`。兼容性最好，Web UI 与现有代码最接近；但每位玩家必须跨两个窗口完成两步配对，更容易把错误任务绑定到席位，也削弱“游戏就在 Codex 任务中”的差异。

### C. 独立 Web 牌桌，Codex 只做后台 AI

牌局全程在浏览器，Codex 任务仅作为模型运行器。这是最容易交付的回退，但不能视为用户要求的最终 MVP 体验，只能作为 UI 宿主不兼容时的降级验证。

## 建议

采用 A，并把 B 的一次性配对机制收纳为 A 的兼容 fallback，而不是建立两个并列产品入口。加入命令使用官方插件调用习惯 `@tokengame join`，不发明一个可能与 Codex 内置命令冲突的 `/tokengame` 全局 slash command。

席位绑定必须由可信本地协调器处理，模型只能看见净化后的“已加入哪个房间/哪个席位”状态，不能读取可复用 secret。远端房间服务也不接触 Codex session id；本地协调器负责在 `session_id` 与 room-scoped seat credential 之间做私有映射。

## 来源

- [OpenAI：Plugins](https://learn.chatgpt.com/docs/plugins)：桌面端 Codex 插件支持范围、插件构成和 `@` 调用方式。
- [OpenAI：MCP server and UI quickstart](https://developers.openai.com/plugins/build/app-quickstart#introduction)：MCP 工具与可选 iframe web component。
- [OpenAI：Add UI to your MCP server](https://developers.openai.com/plugins/build/chatgpt-ui#overview)：MCP Apps bridge 与无 UI 工具可用性原则。
- [OpenAI：Hooks](https://learn.chatgpt.com/docs/hooks#common-input-fields)：`session_id`、`UserPromptSubmit` 与 `Stop` 合同。
- [OpenAI：Codex App Server](https://learn.chatgpt.com/docs/app-server)：线程/回合生命周期、本地 stdio 与实验性 WebSocket 边界。
- [OpenAI：Package your plugin](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)：插件 Hook 需要用户审阅和信任。
