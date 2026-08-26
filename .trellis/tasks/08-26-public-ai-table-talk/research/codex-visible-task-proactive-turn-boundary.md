# 当前可见 Codex 任务的主动回合边界

> 决策状态（2026-08-26）：用户选择先执行方案 A 的 `SAME_VISIBLE_TASK_SPIKE_V1`；只有全部关键门禁通过才升格为 MVP 主路径，失败按方案 B 回退，方案 C 仅保留显式降级。

## 研究问题

TokenGame 能否同时满足两件事：玩家继续在当前 Codex 专用游戏任务的主输入框说话；同一席 AI 又能在玩家没有新输入时，因远端牌局事件在同一个可见任务中主动评估并公开发言。

## 官方合同能够确认的事实

1. `UserPromptSubmit` 只在用户提示即将发送时运行，可读取稳定的 `session_id`、`turn_id` 与 `prompt`。它适合把已绑定任务中的玩家文本立即转成 TABLE_PUBLIC，但本身不是远端事件唤醒器。
2. 同步 `Stop` Hook 可以在模型准备结束当前回合时返回 `decision: block`，Codex 会用 Hook 的 `reason` 自动创建 continuation prompt 并继续当前回合。Hook 可配置超时；大多数 Hook 未配置时默认 600 秒。
3. 异步 Hook 即使在后台拿到了新信息，也不会在空闲时启动新回合；官方明确说明：没有活跃回合时，其输出要等到下一次用户回合才交付。
4. MCP Apps UI 提供标准 `ui/message`，兼容别名为 `window.openai.sendFollowUpMessage(...)`，用于让组件向宿主发送一条“由组件创作的 follow-up message”。官方同时要求按能力检测，而不是按宿主名称假定支持。
5. Codex App Server 提供 `thread/start`、`thread/resume` 和 `turn/start`，因此本地协调器可以可靠驱动一个由自己控制的专用游戏线程。官方文档没有承诺：独立插件进程可以接管 Codex Desktop 当前已经打开的可见任务，或让另一个 App Server 进程安全地向该任务注入回合。
6. 插件 UI 文档把组件描述为运行在 ChatGPT iframe、并可在兼容 MCP Apps 宿主运行；它没有单独承诺目标 Codex Desktop 版本一定渲染 UI、一定实现 `ui/message`，更没有保证组件可在无用户点击时因 WebSocket 事件自动发送 follow-up。因此这一段必须以目标版本实测为准。

## 对原分析的修正

- “插件绝不可能让当前任务主动继续”过强。`Stop` continuation 和 UI `ui/message` 都提供了可实验的同任务续跑路径。
- “只装 Hook 就能让空闲任务随时响应牌局”同样错误。异步 Hook 明确不能唤醒空闲任务；同步 `Stop` 只能在当前回合准备结束的生命周期点介入。
- 所以当前结论不是“可行”或“不可行”，而是：存在一条保留主输入框的候选实现，但它依赖 Codex Desktop 宿主行为，必须通过技术尖峰后才能写成 MVP 承诺。

## 方案 A：同一可见任务 + UI/Stop 唤醒（推荐先验证）

### 运行序列

1. 玩家在主输入框发送普通文本；`UserPromptSubmit` 依据本机私有的 session-seat 绑定做确定性校验并立即发布 TABLE_PUBLIC，同时把最新净化牌局投影加入模型上下文。
2. 当前 Codex 任务回答；`Stop` 读取最终 assistant message，按结构化输出合同发布 `silent | public_speech`。
3. 内嵌牌桌组件通过 WSS 接收新的权威事件并在本机先做配额、去重和 dirty-context 合并；需要评估时，以保留的 LOCAL_CONTROL 唤醒消息调用 `ui/message`。该消息不是玩家桌聊，不能进入 TABLE_PUBLIC。
4. 若模型刚结束而组件唤醒尚不可用，同步 `Stop` 可在短窗口内等待事件；事件到达后用 continuation prompt 续跑，牌局结束、AI OFF 或等待超时时正常结束任务。
5. 任一时刻同席仍只有一个模型回合和一个上下文；禁止同时启动第二个后台游戏线程来“补主动性”。

### 风险

- 组件自动调用 `ui/message` 是否会在目标 Codex Desktop 生效、是否要求用户手势，官方文档没有给出保证。
- 长等待 `Stop` 会让任务保持运行态，可能影响玩家发送新消息、队列/steer 语义、停止按钮和任务完成感；不能用无限 continuation 常驻。
- 组件 follow-up 可能进入可见 transcript。内部唤醒必须使用可识别、幂等、无秘密的控制 envelope，不能伪装成玩家发言，也不能把原始 seat credential 写入提示。
- 组件折叠、卸载、Codex 切换任务或 UI bridge 缺失时，`ui/message` 路径可能消失；必须给出 DEGRADED/OFFLINE，而不是悄悄切到第二模型。
- `Stop`、组件和玩家输入可能同时争抢下一回合，必须验证恰好一次启动、事件合并与取消。

## 方案 B：内嵌牌桌聊天框 + 协调器专用 App Server 线程

玩家桌聊改由牌桌组件直接发布；本地协调器用 App Server 驱动唯一 `SEAT_AI` 线程，统一处理玩家消息和主动事件。它的事件驱动、并发、取消和恢复最清晰，也不依赖唤醒当前可见任务；代价是主 Codex 输入框不再默认属于牌桌，AI 上下文与可见主任务 transcript 分离，削弱最初产品心智。

## 方案 C：主输入框 + 被动 Hook

只在玩家发消息时运行 AI。实现最小、宿主兼容最好，但不能产生 B 未发言而 Kitty 主动开口的核心场景，不应作为 MVP 成功路径，只能作为降级模式。

## 技术尖峰门禁

方案 A 只有在目标 Codex Desktop 版本同时通过以下验证后，才能升格为 MVP 架构：

- 当前任务能渲染牌桌 MCP Apps 组件，并支持 `ui/message` 或等价 `sendFollowUpMessage`。
- 组件收到模拟远端事件后，无需玩家点击即可恰好启动一次当前任务 follow-up；不支持时能被能力检测发现。
- `UserPromptSubmit` 能区分玩家 TABLE_PUBLIC、显式 LOCAL_CONTROL 与内部 wake envelope；伪造或重放 wake id 不发布桌聊、不泄漏 secret。
- `Stop` continuation 可在有界等待中续跑，AI OFF、离桌、超时和用户停止后不再自我续跑。
- 玩家在 Hook 等待或模型运行时发送消息，Codex 的 steer/queue 行为不会丢消息、重复公开或把内部事件误认成玩家发言。
- 连续权威事件只形成同席一个 pending 回合；刷新、折叠、组件卸载、网络恢复和事件重放不会双重唤醒。
- 模型与推理强度确实沿用当前可见游戏任务设置；所有公开输出仍可绑定 hand/event/revision 并执行跨手丢弃。

任一关键项失败，则方案 A 不得靠轮询加速、无限 Stop 或第二模型线程掩盖；MVP 回退到方案 B，方案 C 只保留为显式降级。

## 建议

先做方案 A 的窄技术尖峰，因为它是唯一同时保留“Codex 主输入框就是牌桌公开交流入口”和“同一 AI 可主动发言”的路径；但把方案 B 预先定义为失败回退，避免把宿主未承诺行为写进主架构后再返工。

## 来源

- [OpenAI：Codex Hooks - UserPromptSubmit](https://learn.chatgpt.com/docs/hooks#userpromptsubmit)
- [OpenAI：Codex Hooks - Stop](https://learn.chatgpt.com/docs/hooks#stop)
- [OpenAI：Codex Hooks - background hooks](https://learn.chatgpt.com/docs/hooks#run-hooks-in-the-background)
- [OpenAI：Codex Hooks - config shape](https://learn.chatgpt.com/docs/hooks#config-shape)
- [OpenAI：Codex App Server API overview](https://learn.chatgpt.com/docs/app-server#api-overview)
- [OpenAI：Plugin UI shared bridge methods](https://developers.openai.com/plugins/build/chatgpt-ui#prefer-shared-fields-and-methods)
- [OpenAI：Plugin UI component bridge capabilities](https://developers.openai.com/plugins/reference#capabilities)
