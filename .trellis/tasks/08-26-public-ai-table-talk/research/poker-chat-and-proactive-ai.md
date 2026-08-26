# 公开 AI 牌桌聊天与主动发言调研

日期：2026-08-26

> **最新澄清（覆盖下文冲突段落）**：MVP 不再区分 PLAYER_REACTIVE / PUBLIC_PROACTIVE，也不运行公开意图分类器。玩家文本通过规则校验后立即公开；每席唯一 SEAT_AI 读取实时牌局与聊天事件，自主返回 silent 或 public_speech。下文涉及双管线、主动 4 条子配额、reactive 预留/60 秒生命周期和分类器的内容只保留为探索历史，不得作为实现依据。

## 结论摘要

1. 德州扑克动作、轮转、下注和结算可以继续沿用成熟无限注规则；但“在一手牌仍进行时，全桌公开讨论策略并由 AI 主动影响决策”不是主流线上扑克的普通聊天规则，而是 TokenGame 有意新增的特殊桌规。
2. 产品应把该模式明确命名为“公开 AI 话术桌（Open-AI Speech Play Table）”，入桌前告知：玩家与 AI 的话术会影响当前手牌，内容可能错误或故意欺骗，所有人处于同一公开规则下。
3. 成熟产品可直接借鉴的不是“允许当前手策略讨论”，而是聊天气泡、按玩家屏蔽、全局静音、反刷屏、审计记录与在特殊阶段收起聊天等交互惯例。
4. 现有 UserPromptSubmit / Stop Hook 只能响应 Codex 自身生命周期，无法被任意牌局事件唤醒。“B 没说话但 Kitty 主动开口”必须由 TokenGame 主动启动一个模型回合。
5. 目标产品最匹配的架构是：每个席位绑定一个专用、可恢复的 Codex 游戏线程，由本地协调器按牌局事件和配额触发；不要复用用户的普通编码任务作为实时游戏代理。

## 事实、推断与产品判断

### 可核实事实：成熟扑克聊天约束

- PokerStars 的公开规则禁止在多人牌局中发表会影响当前手牌进行的评论（单挑情形例外）。这说明 TokenGame 的“公开 AI 策略话术”必须作为显式差异化桌规，而不能声称只是普通扑克聊天。
  - https://www.pokerstars.com/help/articles/rule-22-warning/10677/?ooac=1
- PokerStars 的聊天规则禁止骚扰、恶意行为、广告和刷屏，并可能给予警告或禁言。
  - https://www.pokerstars.com/help/articles/chat-guidelines/
- PokerStars 提供按玩家屏蔽/恢复聊天的能力；这是 TokenGame 本地隐藏语义的成熟对标。
  - https://www.pokerstars.com/help/articles/chat-not-vsbl-help/
  - https://www.pokerstars.com/help/articles/stalking-not-identified/102046/
- PokerStars 在部分赛事或全下阶段可以关闭聊天，说明“聊天可见性与牌局阶段解耦、必要时收起”是成熟做法。
  - https://www.pokerstars.com/help/articles/chat-feature-instructions/44737/
- GGPoker 的桌面功能包含聊天气泡和用于关闭聊天的 Helmet Mode，并禁止刷屏、合谋和讨论当前手牌。TokenGame 可以借鉴表现层，但其公开策略讨论规则与该平台不同。
  - https://ggpoker.com/pt-br/blog/recursos-de-mesa-ggpoker/

上述网站未公开足以直接照搬的具体数字限额。因此，TokenGame 的单条长度、单位时间次数、每手总量和 AI 主动发言次数必须由自己的服务端协议确定，并通过试玩数据调整。

### 可核实事实：Codex 触发能力

- Codex Hooks 的触发点包括 UserPromptSubmit、PreToolUse、PostToolUse、Stop、SessionStart 等 Codex 生命周期事件；它们不是任意外部牌局事件的通用唤醒器。
  - https://learn.chatgpt.com/docs/hooks
- Codex App Server 提供 thread/start、thread/resume、turn/start、turn/steer 和流式事件等接口，适合由本地客户端维护专用线程并主动启动模型回合。
  - https://learn.chatgpt.com/docs/app-server#api-overview
- Codex 的应用事件自动化目前面向受支持的 Gmail、Slack、GitHub 事件，而且不适用于 Codex Desktop/CLI 的任意本地游戏事件，因此不能替代牌桌协调器。
  - https://learn.chatgpt.com/docs/automations#trigger-tasks-from-app-events
- OpenAI Responses/Conversations API 也能维护持久会话状态，但属于独立 API 集成路径。
  - https://developers.openai.com/api/docs/guides/conversation-state

### 仓库事实

- 当前 src/authority/event-store.cjs 只有一次 action window 对应一次 prompt/answer 的模型，默认 actor 为 a / ai:a。
- 当前 plugins/tokengame Hooks 仅在用户显式提交 TokenGame public 指令后发布请求，并在本次 Codex 回答结束后发布答案。
- 当前四席 UI 和通用 actor/request 配对已经验证，但 B/C/D 尚未绑定独立的真实 Codex 游戏线程。
- 当前 AI 通道与真实扑克行动者没有建立同一套 seat、hand、street、source event 和因果链约束。

## 规则层建议

### 1. 明确桌型，而不是悄悄改变普通聊天规则

建议桌型声明：

- 标准无限注德州扑克规则不变。
- 当前手牌中的公开策略讨论、虚张声势、错误概率和 AI 建议均被允许。
- AI 气泡属于“参与者话术”，不是系统裁决；内容可以错误、过时或故意欺骗。
- 只有牌、筹码、底池、轮次、合法动作、倒计时和结算属于权威 UI 事实。
- 所有人进入牌桌时看到同一规则与同一公开事件；隐藏功能只是个人查看设置。

这能保留用户所说的核心乐趣：AI 可以知道主人的真实手牌，同时公开声称另一套牌或概率来诈唬。产品不能给这种话术加“官方胜率”视觉权威。若以后加入可信胜率计算器，应作为单独、可识别的功能。

### 2. 上下文边界

每席 AI 的输入应拆成三层：

- 权威公开上下文：公共牌、底池、筹码、动作历史、倒计时、最近公开聊天。
- 主人私有上下文：该席真实底牌和该席自己的受控设置。
- 明确禁止：对手底牌、其他 Codex 任务、本地文件、隐藏推理、私聊或未公开信息。

AI 输出一旦通过服务端校验并发布，就是全桌公开事件。模型内部推理不公开；只公开最终短答和可选的“思考中”状态。

### 3. 主动发言不能形成模型互喷死循环

每次 AI 主动发言请求必须记录：

- seat_id、hand_id、street、source_event_id、trigger_type；
- request_id、context_revision、created_at、expires_at；
- causal_depth 和 quota_snapshot。

建议默认禁止“AI 发言直接触发另一个 AI 发言”。牌局动作、回合切换、被玩家点名等事件可以触发；AI 对 AI 的连续反应需要 causal_depth 上限和冷却。否则四个模型可能互相触发，快速耗尽上下文、时钟和模型额度。

## 限流与显示语义

数字暂不锁定，但协议至少提供以下服务端配置：

- max_graphemes_per_message：按 Unicode 字素而不是字节计数，兼容中英文和 emoji；
- max_messages_per_window 与 window_ms：短周期防刷屏；
- max_messages_per_hand_player：每席玩家每手总量；
- max_proactive_ai_messages_per_hand：每席 AI 主动发言总量；
- ai_trigger_cooldown_ms：主动模型回合冷却；
- max_pending_ai_requests_per_seat：每席并发上限，首版应为 1；
- bubble_visible_ms：气泡显示时长，只控制 UI，不删除事件；
- max_visible_bubbles_per_seat：座位旁同时可见的气泡数；
- context_event_limit / context_grapheme_limit：送入模型的最近公开上下文上限。

用户已为首轮试玩选择热闹型 LIVELY_V1：玩家和 AI 单条均为 140 Unicode 字素；玩家每席每手 12 条、滚动 5 秒最多 3 条；AI 每席每手总计 8 条，其中主动发布最多 4 条，并暂用 5 秒触发冷却；玩家与 AI 计数器分离；气泡显示 10 秒但不删除时间线/回放事件。上述数值是 TokenGame 试玩参数，不是成熟扑克平台公开标准，必须随 quota_policy_version 保存并通过遥测/试玩调整。

“最多主动发布 4 条”仍不足以界定模型成本：AI 可以评估后返回 silent。用户选择不设置每手 proactive evaluation 数字上限，只限制最终发布；这保留了 AI 在长牌局中持续观察并选择沉默的能力，但调用成本会随白名单事件和牌局时长增长，属于明确接受的风险。

这里的“无每手上限”不能实现成无限循环：白名单、每 seat/source_event 最多一次、5 秒冷却、每席一个 pending、跨 hand/street 过期丢弃、AI 发言不直接触发 AI、失败不无界重试仍必须执行。silent 只记录净化后的评估结果类型，不产生气泡、不消耗发布额度，也不向对手泄露次数或隐藏推理。

用户选择主动发布满 4 条后立即关闭本手 PUBLIC_PROACTIVE gate。后续白名单事件继续进入权威上下文，但不再启动公开话术评估或生成隐藏策略摘要，也不跨手补调；玩家显式询问产生的 PLAYER_REACTIVE 仍可使用 AI 总量中的剩余回复容量，ADVISOR/AUTOPILOT 通过独立权限和动作协议继续。这避免“不能再说话却继续获得隐藏算力”的不透明优势。

pending 或 5 秒冷却期间的新主动事件采用单槽合并，不用 FIFO：每席只保留一个 deferred trigger，优先级依次为主人 ACTION_REQUIRED、all-in/raise/bet、真人直接点名、街道推进、对手真人话术、HAND_SETTLED；同级保留最新 event_seq。恢复可用后重新验证 hand/street/state_revision，并只针对仍有效槽位用最新快照评估一次。这样不会完全丢掉关键 all-in，也不会在状态推进后补跑一串过期模型回合。HAND_SETTLED/新手等终局状态可以直接使旧手触发失效。

玩家显式提问与主动评估冲突时，用户选择“等待而非抢占/并发”：当前 PUBLIC_PROACTIVE 先走到终态，随后尚未达到生命周期终态的 PLAYER_REACTIVE 优先于 deferred proactive 启动，不受主动冷却额外延迟。这样保留已花费的模型工作并维持专用线程顺序，但玩家可能因行动时钟继续推进而收到过期答复。玩家问题在公开接受时已消耗玩家消息额度；AI 发布额度只在答复真正发布时扣除。

用户选择即使跨 street、行动窗口或 hand，也始终按提问接受时的原始授权快照回答。请求需保存最小化 origin_hand/street/revision、公开状态及该席当时私有投影；迟到答复作为 STALE_PUBLIC_REACTIVE 醒目标注“基于旧状态”，只具有公开话术效力，不能进入当前动作协议或被接收方 AI 当成当前事实。完整私有 snapshot 不进入公共事件。

跨手发布不能偷用下一手额度：接受请求时应在 origin hand 预留一个 reactive publish slot，发布时消费原 reservation，失败/取消/超时则释放。这样仍满足“只有真正发布才计数”，同时防止等待请求被后续主动消息挤掉或在新手绕过每手总量。

用户选择 PLAYER_REACTIVE 从公开问题被权威接受起采用 60 秒端到端生命周期，等待当前主动评估和实际模型生成共享同一预算。accepted_at/expires_at 需要持久化，刷新、重连、跨街、跨手或协调器恢复都不能重置。到期以唯一 REACTIVE_EXPIRED 终态尽力取消模型、恰好一次释放 origin reservation，并公开不计聊天配额且不触发 AI 的中性超时提示；迟到回调按 request_id 丢弃，不自动重试。发布与超时使用同一终态 compare-and-set，只有在 now < expires_at 时才允许发布，避免边界竞态产生“双消息”。

用户进一步选择每席只允许一个非终态 PLAYER_REACTIVE。已有等待、运行、校验或发布中的请求时，第二次 AI 提问必须在公开玩家消息被接受前以 REACTIVE_BUSY 整体拒绝：不排队、不替换旧请求、不公开文本、不扣玩家额度、不保存 origin snapshot 或预留 AI 发布槽。并发提交由 seat 级唯一约束/CAS 决出唯一接受者，同一 submission_id 的重试重放原结果；若玩家仍想发言，需明确改为普通公开聊天并使用新的消息提交。该选择牺牲连续追问速度，但避免多个旧快照、跨手预留和迟到气泡形成“僵尸对话”。

服务端权威地接受或拒绝消息，并返回稳定原因码。动作倒计时不会因聊天、AI 生成或 UI 气泡而暂停。超时的 AI 回答应被标记过期，不能在错误手牌或错误轮次继续发布。

查看者本地应能分别设置：隐藏某玩家、隐藏某 AI、隐藏整席、隐藏全部聊天。隐藏只影响该查看者的投影；服务端事件历史、其他玩家视图和回放不变。内容治理层仍应能读取已隐藏事件。

## 可行架构对比

### A. 每席专用 Codex 游戏线程 + 本地事件协调器（已选择）

- 每位玩家加入桌时创建或绑定一个只处理 TokenGame 的 Codex 线程。
- 协调器只投递授权上下文，并通过 App Server 主动发起 turn。
- 能实现“玩家未输入，但 AI 因 raise/轮转/点名主动开口”。
- 不污染玩家日常编码任务的上下文，也便于按席审计、取消、超时和恢复。
- TokenGame 不管理登录、模型或 provider；技术尖峰只验证省略模型覆盖后，专用线程能够采用其 Codex 宿主的实际配置并完成回合，不读取或认证该配置的身份。
- 工程成本高于当前 Hook：需要进程生命周期、线程映射、流式事件、取消、断线恢复和并发隔离。
- 用户已确认该方案作为 TokenGame 主动 AI 的正式运行边界。实现优先使用本地 app-server stdio；游戏线程不可用时公开标记该席 AI 离线，牌局继续，且不得静默切换到外部 API 或普通编码任务。

### B. 保留显式用户消息触发的 Hook

- 最接近现有实现，也最容易精确跟随当前 Codex 任务。
- 能实现玩家问、AI 答和公开气泡。
- 无法真实实现“B 没说话，Kitty 主动发言”。脚本化固定台词可以模拟视觉效果，但不能冒充模型生成。
- 适合降级模式，不适合作为用户描述的最终核心体验。

### C. 每席使用 OpenAI Responses/Conversations API

- 事件驱动、持久上下文和服务化部署最直接，未来多人远程桌也更自然。
- 需要独立 API 凭据、模型成本、速率限制和服务端密钥治理，与“不单独配置、直接用 Codex”这一原始目标冲突。
- 可作为未来托管版路径，不建议成为当前本地原型的默认方案。

## 建议实施顺序

1. 先扩展权威聊天内核：多说话者事件、seat/hand/street 归属、幂等、限流、过期、隐藏投影和四视图一致性。
2. 同时做一个受限技术尖峰，证明方案 A 能稳定创建/恢复四个专用游戏线程、按事件发起回合并取消超时生成。
3. 尖峰成功后接真实主动 AI；失败则保留方案 B 为显式问答，并重新裁决是否接受方案 C。
4. 最后再调试具体字数、频率、每手配额和气泡时长；这些应是服务端配置而不是散落在 UI 中的常量。

## 已完成的核心裁决

采用“每席专用 Codex 游戏线程”作为主动 AI 的运行边界；主动事件使用关键白名单，模型/provider 采用宿主透明策略。后续仍需确定线程跨牌桌生命周期和更细的故障降级。

### 宿主透明的模型策略（已裁决）

- TokenGame 不检测、不选择、不锁定、不展示或验证模型名称、推理强度、服务商和中转来源。
- App Server 的 thread/resume 与 turn/start 请求不传 model / reasoning override；专用游戏线程实际采用其 Codex 宿主当前生效的配置，变化时机也由宿主决定。
- Codex 官方配置支持用户级 custom model_provider、base_url 和 Responses wire protocol；项目级 .codex/config.toml 不能覆盖这些机器级 provider 配置。因此 TokenGame 插件不应改写或探测用户 provider。
  - https://learn.chatgpt.com/docs/config-file/config-reference#configtoml
- App Server 允许 turn/start 的可选字段覆盖模型等设置；TokenGame 通过省略这些覆盖保持宿主透明。
  - https://learn.chatgpt.com/docs/app-server#api-overview
- 若用户配置的 Kimi 或其他中转能作为兼容 Codex 会话正常完成线程/回合事件，TokenGame 可透明使用；这不是对该 provider 的官方适配或认证。协议不兼容时该席 AI 离线，牌局继续。
- 该决定意味着 TokenGame 只能回放实际输入、最终输出和动作，不能承诺复现模型内部推理或同一输入再次得到相同输出，也不能声称不同席位使用了公平、同等级模型。
