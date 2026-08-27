# 公开座位 AI 交流证据、推导与反证条件（R1）

## 已核实事实

- 现行累计合同是 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D`，绑定摘要为 `sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54`。七条规则明确要求默认公开、单一事件循环、LIVELY_V1、单并发归并、迟到/OFF 与本地隐藏。
- 2026-08-27 本机实际执行 `npm test`，23 个测试全部通过。现有测试只覆盖旧显式 prompt/answer 桥、固定四席德扑、隐藏牌投影、HTTP/SSE 与旧 UI 基线。
- `src/authority/event-store.cjs` 固定 actor A，并以单个行动窗口承载一次 `AI_PROMPT_PUBLISHED` 和一次 `AI_ANSWER_PUBLISHED`；事件没有 hand、street、seat AI 状态、配额或来源因果。
- `src/authority/table-store.cjs` 独立维护标准德扑手牌和服务端序号；`src/authority/server.cjs` 只把旧 AI 状态并排附加为 `ai_channel`。两个存储没有统一权威时序。
- `plugins/tokengame/hooks/user_prompt_submit.cjs` 只解析显式公开前缀，普通输入零桥接；这与新合同中“已绑定专用游戏任务内合格自由文本默认公开”不同，但普通非游戏任务零流量仍是必须保留的隐私边界。
- `web/app.js` 已有四席玩家/AI 成组气泡外形，但只消费旧 prompt/answer 事件，没有多条时间线、配额、迟到、OFF、归并或本地隐藏状态。

## 宿主能力证据

- OpenAI Hook 文档明确：后台 Hook 在没有活动 turn 时等待下一用户 turn；Stop continuation 只发生在已有 turn 结束点。仅靠 Hook 不能实现空闲任务主动唤醒。
- Codex App Server 正式提供 thread 与 turn 启动及流式输出，足以驱动协调器拥有的唯一游戏线程；文档没有保证它可接管 Desktop 已加载的当前 live thread。
- MCP Apps `ui/message` 是 follow-up 候选，但具体宿主可以要求用户同意。Codex 当前可见任务与 Claude Cowork 都没有“网络事件到达后无需点击、无需新 prompt、恰好一次评估”的直接证据。
- Claude Desktop Chat 明确不运行插件 Hook；Claude Cowork 分别支持 Hook 与 interactive connector UI，但组合 Gate 5 未执行。Claude Code 的 `asyncRewake` 明确适用于 Code surface，不能外推为 Cowork 能力。
- 完整来源、证据强度和未找到项见 `.trellis/tasks/08-26-public-ai-table-talk/research/host-active-turn-capability-refresh-20260827.md`。

## 关键推导

### 公开交流必须进入牌桌权威域

玩家聊天和 AI 话术不是扑克动作，但它们依赖相同的 hand、street、seat、event sequence 与服务端时间。继续使用两个独立序号会使“基于哪个动作说话、是否跨街、是否跨手”无法可靠复盘。因此新内核应复用牌桌权威事实和顺序，而不是继续让 `EventStore` 与 `TableStore` 并列。

### 核心与宿主适配器必须解耦

核心只需要发布“某席有一次可领取评估”并校验唯一终态，不需要知道 Codex Hook、App Server、Claude Cowork 或 Code tab。这样可以用确定性假适配器覆盖所有产品规则，并让每个宿主用独立证据决定是否能领取任务。未知宿主能力不会变成核心中的隐式轮询或双 AI。

### 旧桥是历史证据，不是新内核

旧桥证明同步提示预公开、Stop 配对、普通内容零流量和故障补交等局部不变量。它没有证明事件驱动主动评估、多席隔离或当前合同配额。保留测试并提取安全模式是合理复用；把事件改名后宣称升级完成是不成立的。

## 当前开放未知

- `U-TG-CODEX-CURRENT-TASK-ACTIVE-WAKE`：Codex 当前可见游戏任务中的 MCP App 是否能因远端事件无需点击地恰好启动一次 follow-up，仍需固定版本实机 Gate 5。
- `U-TG-CLAUDE-COWORK-ACTIVE-WAKE`：Claude Cowork 的 Hook、MCP App、稳定会话绑定与无点击主动回合能否形成同 surface 闭环，仍需 Gate 1–9。
- 两项未知阻塞当前任务/宿主主动适配器和交付声明，不阻塞 `TG-L3-PUBLIC-AI-EXCHANGE-KERNEL`。

## 反证条件

出现以下任一情况，本理解必须刷新：

- 新内核无法在同一权威时间线绑定 seat、hand、street、source event 与唯一终态；
- LIVELY_V1 在重连、重放或换街/换手时可被绕过；
- AI 公开话术会触发新的 AI 互聊或能执行扑克动作；
- OFF 后迟到结果仍发布，或模型生成会暂停真人行动时钟；
- 本地隐藏改变服务端事件、其他玩家投影或回放；
- 对手底牌、凭据、其他宿主任务内容或隐藏推理进入公开事件或错误席位的模型输入；
- 宿主实机证据改变当前 Gate 5 结论，或现行语义合同被正式后继替代。

