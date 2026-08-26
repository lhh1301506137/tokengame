# brainstorm：公开 AI 牌桌聊天与主动发言

## 目标

在不改写成熟无限注德州扑克规则的前提下，把 TokenGame 的产品差异集中到“四组玩家 + 各自 AI”的公开语言博弈：玩家和 AI 的桌内发言形成所有人可见、带上下文的座位聊天气泡；AI 可以回答玩家，也可以在明确的牌局事件触发下主动建议或挑衅；非当前行动者仍可聊天，但必须受长度、频率、总量和可见性控制。

## 已知事实

- 用户再次确认：牌局机制沿用成熟线上无限注德州扑克，不为 TokenGame 重新设计德扑动作、轮转或结算。
- 用户给出的核心场景包括：当前行动者询问自己的 AI 胜率；AI 在生成中后公开回答；玩家随后独立选择 raise/all-in 等标准动作。
- AI 发言不必只由玩家提问触发。例：B 没说话，但 B 的 Kitty 根据 A 的公开对话与牌局事件主动建议跟注。
- 非当前行动者也可以与自己的 AI 公开聊天或发表垃圾话；全桌都能看到各席上下文。
- 需要限制单条长度、单位时间频率、每手/每局总量和持续时间，并提供本地屏蔽或隐藏对方聊天内容的能力。
- 当前实现已具备四席 AI 身份、每席最近一组公开 prompt/answer 气泡、完整公开事件流、actor/request 配对与四视图同步。
- 当前真实 Codex 桥只端到端产生 A / `ai:a`；B/C/D 仅完成通用前端投影验证，尚未绑定四个真实 Codex 会话。
- 用户已接受 AI 紧邻所属玩家、玩家与 AI 以成组聊天气泡公开展示的现有视觉方向。
- 成熟平台虽普遍提供气泡、按玩家屏蔽、全局静音和反刷屏，但通常限制会影响当前手牌的多人策略讨论；TokenGame 必须将其定义为显式特殊桌规，而非普通聊天的默认行为。
- 用户确认产品方向：专用游戏任务在入桌后默认把玩家与 Codex 的自由文本公开到牌桌，私密咨询改为显式且稀缺的调用，暂提 10 次额度。
- 用户确认产品方向：AI 可进入托管模式，直接操作标准德扑动作并主动进行公开语言博弈。
- 用户确认产品方向：官方提供可正确安装和游玩的基础插件，玩家通过本地 AI 档案、历史记忆、计算工具和社区“进化模块”形成竞技差异；官方不主动提供高级竞技模块。
- 用户修正此前决定：开放能力桌继续允许任意兼容宿主；公平场除了玩家确认外，TokenGame 必须尽力检测模型/推理强度，用来筛掉一批想临时使用高级模型“炸鱼”的玩家，但明确不能保证检测绝对可靠。
- 用户确认公平场只在模型层按目标 model/effort 分档并尽力检测，不统一记忆、概率工具、社区模块、人格或托管配置；这些养成差异属于竞技内容。该桌型的目的，是让无法长期使用顶尖模型的玩家也能在约定的基础资源档位中竞技。
- 用户确认公平场同时提供两种入口：公共区按标准 model/effort 组合匹配，私人房间允许房主自定义目标模型/强度。
- 用户选择公平场“持续检测但不锁定”：专用游戏线程继续跟随玩家 Codex 配置；检测到赛中切换到牌桌不允许的更强模型/强度后，停止该席、踢出牌局并给予重信用处罚。
- 用户选择精确队列与单向兼容：高能力配置绝不能进入低上限场；低能力配置可在玩家预先允许的目标范围内进入更高上限场。玩家可设置接受范围，以及是否在等待超时后把匹配票据向上扩展。
- 用户选择赛中违规的当前手处理：确认 higher-than-ceiling 后立即关闭该席 AI 与聊天；若该席尚有合法行动机会，则在下一个合法行动点自动 fold，已投入筹码留在底池；若已经 all-in，则按正常扑克规则结算；HAND_SETTLED 后踢出并处罚。
- 用户选择公平场信用采用“可恢复的累进重罚”：首次确认违规即大幅降级并暂时限制公平场，滚动窗口内重复违规继续升级处罚；保留明确的恢复与申诉路径，不因一次检测事件自动永久封禁。
- 用户此前为后续公平/信用阶段选择了阶段边界：该阶段的首个原型只实现处罚事件、版本化策略快照和本地模拟执行；这不是当前公开 AI 牌桌 MVP 的交付范围。
- 用户选择两阶段自然恢复：确认违规后先经历不可进入公平场的 Restricted 冷却期；冷却结束转为 Caution 观察期，但仍不进入公平场，只能在自由场（OPEN_CAPABILITY）完成规定数量的合格牌局后恢复公平场申请资格。成功申诉纠错独立于该流程，可直接撤销错误处罚的有效后果。
- 用户选择信用公开粒度：其他玩家只看到 New / Established / Caution / Restricted 粗粒度徽章及当前公平场准入状态；精确内部值、strike 数量、证据、原因历史、剩余冷却、恢复进度和申诉详情仅本人/授权治理视图可见。
- 用户指定 Caution 自由场观察期按“实际操作次数累计”恢复，而不是按完成几手、连续牌局或在线时长。为避免改变正确扑克策略，合法 fold 与其他自愿动作等价计入；需要通过每下注街上限、权威接受和结算确认防止重复加注/重放刷次数。
- 用户选择只有玩家本人明确提交的 MANUAL 动作计入恢复；ADVISOR 可以生成建议，但只有玩家另行确认并提交后才成为 MANUAL，AUTOPILOT 自主动作即使合法也不增加 action credits。
- 用户选择只有官方公共匹配产生的自由场可以累计恢复 action credits；私人邀请房、好友/自建房、本地开发桌和其他非官方匹配来源即使牌局与动作合法也不计。
- 用户明确选择不限制公共匹配中重复对手贡献：不设同一对手/同一桌组的滚动上限、衰减或最低不同对手数。固定小团体可能通过排队重逢对刷是已接受风险，早期队列可用性优先。
- 用户此前选择后续信用原型只启用 LOCAL_SIMULATION 加速测试参数；正式冷却期、required_action_credits 和重复违规梯度保持未配置/禁用。该决定保留为路线图设计，不进入当前 MVP。
- 用户保留“热闹型”首轮试玩数值作为可调上限：玩家与 AI 单条均为 140 Unicode 字素；每席玩家每手 12 条、滚动 5 秒最多 3 条；每席 AI 每手最多公开 8 条；AI 评估暂用 5 秒最小启动间隔；气泡显示约 10 秒。玩家与 AI 发布计数分离。
- 用户最新澄清产品心智：不需要在公开发言前区分“普通聊天/询问 AI”，也不需要额外意图分类 AI。玩家消息通过确定性聊天校验后立即公开；该席同一个 Codex AI 持续读取实时公开消息、权威牌局状态和自己的私有牌面，自主决定沉默、是否发言以及说什么。
- 本次澄清取代此前 PLAYER_REACTIVE / PUBLIC_PROACTIVE 双管线、4 条主动子配额、额外 Codex 分类回合、5 秒分类 fallback、分类单 pending、reactive 发布预留与相关误判纠错探索；这些只保留为被取代的研究记录，不得进入 MVP 运行协议。
- 用户接受宿主网络与模型可用性直接决定 AI 体验：玩家网络/宿主差时，AI 可能延迟或离线；牌局与人工动作继续。产品应做好事件合并、取消、恢复和状态提示等基础优化，但不承诺掩盖宿主问题，也不静默切换外部模型。玩家可随时关闭 AI 后纯手动游玩。
- 简化后的迟到默认：同一 hand 内即使跨 street 也允许 AI 话术公开并醒目标注“延迟 · 基于前一街”；若已经进入下一 hand 则丢弃。两种情况都不影响动作与结算。
- 用户确认锁定上述单一 `SEAT_AI` 事件循环作为 MVP 架构，不再继续细分公开话术的“提问/普通聊天/主动回复”类别；后续只讨论影响交付范围的大边界。
- 用户选择首个可玩 MVP 的最小范围：标准德扑、四席公开聊天、每席单一 `SEAT_AI`、座位聊天气泡、玩家手动动作、AI OFF 与网络/模型降级状态。OWNER_PRIVATE、记忆、ADVISOR/AUTOPILOT、公平场、信用、市场等全部保留为后续路线，不得成为首版交付依赖。
- 用户选择 MVP-0 的真人联机形态为 2–4 人临时私人房：通过房间码/邀请加入，每名真人使用自己的 Codex 专用游戏任务与 AI；不建设公开大厅、自动匹配、正式账户、排名或长期房间持久化。
- 用户明确产品终局不是停留在自定义房间，而是公开大厅与自动匹配；临时私人房只是 MVP-0 的低成本真人验证入口。由此推导，MVP-0 直接采用可被未来匹配层复用的中立权威房间服务，玩家本机房主只保留为开发沙盒，不作为产品路径。
- 用户选择 MVP-0 只使用房间级临时身份：服务器身份和席位凭据随房间生命周期失效，不提前建设安装级匿名身份或正式账户。昵称、头像与 AI 人设可以作为本机偏好跨房间复用，但不构成服务端稳定身份或信用依据。
- 结合用户此前“在当前 Codex 会话安装、加入并游玩”的要求与最新官方插件能力，MVP-0 主入口确定为 Codex 任务优先：发送 `@tokengame join <invite>` 后绑定当前任务并优先在任务内渲染插件牌桌 UI；目标宿主不兼容 MCP Apps UI 时，才使用一次性外部页面作为兼容 fallback，Codex 任务仍承担该席聊天与 AI。
- 用户选择 MVP-0 的德扑动作只通过牌桌按钮与下注滑杆提交；不提供 `@tokengame action ...` 或自然语言出牌。任务中的“跟了”“加两百”“all in”等文本仍只是默认公开话术，永远没有动作效力。
- 用户选择严格的掉线方案：玩家断线不暂停牌局、不增加行动时间；原行动截止到达后可 check 则自动 check，否则自动 fold。当前手结算后掉线席 sit out，原席与恢复凭据保留 120 秒，随后释放；可参与者少于两人时只暂停下一手开始。
- 用户选择 Ready 开局：至少两名玩家 Ready 后进入 3 秒倒计时；未 Ready 的已入座玩家保持旁观，不阻塞开局。首手之后，仍处于 ACTIVE/READY 的玩家自动连续开下一手；中途加入或恢复者最早从下一手参加。
- 官方能力核查修正了此前过强判断：同步 `Stop` Hook 可用 continuation prompt 继续尚未完全结束的当前回合，MCP Apps UI 也定义了 `ui/message`/`sendFollowUpMessage`；但异步 Hook 明确不能唤醒已经空闲的任务，目标 Codex Desktop 是否支持组件因远端事件自动发 follow-up 仍需实测。
- 用户选择先执行同一可见任务技术尖峰：保留 Codex 主输入框作为目标 TABLE_PUBLIC 入口，验证 MCP Apps `ui/message` 与有界 `Stop` continuation 能否驱动同一个 `SEAT_AI` 上下文；关键门禁失败时明确回退到牌桌聊天框 + 协调器专用 App Server 线程。
- 用户选择双操作退出并串行换房：`Sit out after hand` 只在当前手结算后暂离、保留席位和任务公开绑定；`Leave table` 立即停止该任务后续公开路由和 AI，在下一个合法行动点处理 live hand、手后释放席位并吊销凭据。旧绑定达到 UNBOUND 前不得加入新房或新席。
- 用户选择一次安装后的 create/join 就地向导：安装与 Hook 信任只做宿主要求的一次显式流程；以后在新专用任务直接使用 `@tokengame create` 或 `@tokengame join <invite>`，首次资料、能力 preflight 和公开桌规确认在同一次就地向导中补齐，不增加强制 `setup` 命令。
- 用户选择 MVP-0 最终签字采用“自动化硬门禁 + 一次四人真人试玩”：机器层证明协议、隐私和故障归约，四名真人各用自己的 Codex 专用游戏任务完成至少 10 手，证明公开 AI 语言博弈真实发生并具有初步复玩价值。
- 用户提出举报和信用体系作为抑制虚假声明、作弊与不良行为的候选路线。

## 临时假设

- 所有桌内玩家/AI 发言先进入服务端权威公开聊天事件流，再由各客户端投影；本地“隐藏”只影响查看者渲染，不删除或篡改公开事实。
- AI 的“胜率”必须根据它实际可见的权威牌局投影计算或明确标注估算，不能读取对手未公开底牌，也不能把语言推测伪装成官方事实。
- AI 主动发言必须由可审计的牌局/聊天事件触发并受配额控制，不能让每个模型对每个事件无限自动回复。
- 首个实现切片继续使用测试筹码与本地四人桌，不进入真钱、生产内容治理或远程账号体系。
- 每席 AI 可收到全桌权威公开上下文和主人自己的真实底牌，但绝不收到对手未公开底牌；AI 最终输出属于可欺骗的参与者话术，不是系统事实。
- “思考中”只表示该席存在未完成模型请求，不公开模型隐藏推理，也不阻塞牌局动作时钟。

## 开放问题

- 无阻断 MVP-0 实施的未决产品问题；下一步进入最终需求确认和实施准备。

## 需求（演进中）

### MVP-0 权威范围（已锁定）

- 复用现有成熟无限注德扑权威状态机和测试筹码，交付四席公开语言博弈闭环。
- 每席只有一个 `SEAT_AI`；玩家自由文本校验后立即公开，AI 基于最新合法上下文自主返回 `silent` 或 `public_speech`。
- 牌桌显示玩家与所属 AI 的成组聊天气泡、基础身份和 ONLINE/THINKING/DEGRADED/OFFLINE/OFF 状态。
- 玩家只通过标准按钮/结构化动作手动出牌；公开话术没有动作效力。AI 可关闭，宿主故障不阻塞牌局。
- 当前交付不依赖 OWNER_PRIVATE、记忆库、ADVISOR/AUTOPILOT、社区模块市场、能力公平场、举报信用或生产账户系统。
- MVP-0 支持一张最多四席、至少两名真人即可开始的临时私人房；房间码/邀请只授予加入资格，牌桌服务为每席签发独立短期凭据并只投影该席有权看到的底牌和状态。
- 每名真人的模型调用仍发生在其自己的 Codex 专用游戏任务中；远端牌桌只交换权威牌局事件、该席私有投影、玩家公开文本和最终公开 AI 话术，不接收模型隐藏推理、普通项目上下文或宿主密钥。
- “每席一个专用游戏任务/线程”是上下文隔离与单一 `SEAT_AI` 的产品语义，不等于已经证明独立协调器能接管 Codex Desktop 当前可见任务。MVP 最终只能选择一个真实模型上下文，禁止同时运行可见任务 AI 与后台影子 AI。
- MVP 实现顺序锁定为 `SAME_VISIBLE_TASK_SPIKE_V1`：先在目标 Codex Desktop 版本和本地牌局 fixture 上验证当前任务内嵌 UI、组件 `ui/message`、同步 `Stop` continuation、玩家 steer/queue、事件合并、取消和 model/effort 跟随；尖峰通过前不得把同任务主动 AI 写成已交付功能。
- 尖峰通过后，当前可见游戏任务就是该席唯一 `SEAT_AI` 上下文：玩家普通输入经 `UserPromptSubmit` 校验后立即公开，内部 wake envelope 只触发同任务评估，`Stop` 只在牌局活跃期作有界等待并发布结构化 `silent | public_speech`。
- 尖峰关键门禁失败时，MVP 必须显式选择预定义回退：玩家桌聊移入牌桌组件，本地协调器通过 App Server 驱动唯一后台游戏线程；界面明确说明主 Codex 输入框不再默认公开。不得同时运行可见任务和后台线程、不得用无限 continuation、固定频率模型轮询或脚本台词掩盖失败。
- 房间在最后一名玩家离开或空置超时后销毁；MVP-0 不提供搜索、公开列表、自动匹配、排名、长期战绩或跨房间身份。
- MVP-0 使用中立的一房一权威实例；创建邀请的玩家不是网络房主，也不持有牌堆、对手底牌或服务端管理凭据，其断线不会立即终止其他玩家的牌局。
- 房间运行协议与发现入口解耦：MVP-0 由邀请码换取 room-scoped seat ticket，未来公开匹配只负责产生同类 room/seat ticket，不重写德扑状态机、私有投影或 `SEAT_AI` 发布合同。
- 公开大厅、自动匹配和正式账户是已确认的 post-MVP 产品目标，而不是被否决的方向；MVP-0 不实现其界面与运营系统，但不能把“邀请房创建者”硬编码成永恒房主角色。
- MVP-0 的服务端玩家身份由 `room_id + room_player_id` 定义，只在该房间有效；邀请兑换后签发短期 seat ticket 与单独的恢复凭据，显示昵称、头像或 AI 名称相同不能冒用席位。
- 昵称、头像、AI 名称和基础人设可由插件在玩家本机保存并在新房间重新提交，但权威服务不据此关联两个房间、累计战绩或形成信用记录。
- 在房间仍有效且未被移出时，玩家可用恢复凭据重连原席；房间销毁、席位被权威释放或恢复窗口到期后，旧 seat/recovery 凭据必须失效且不能迁移到新房间。
- MVP-0 的标准加入动线为当前专用任务输入 `@tokengame join <invite>`；可信 Hook/本地协调器使用当前 Codex `session_id` 兑换邀请并建立私有的 `session_id -> room_id/seat_id/credential` 映射。普通未绑定任务中的同类自然文本不能产生牌桌流量。
- seat/recovery credential 只保存在插件本机私有数据目录，不写入项目文件、模型提示、聊天气泡、公开事件、日志正文或可复制的长期 URL；模型只获得净化后的房间、席位和连接状态。
- 兼容 MCP Apps UI 的目标 Codex 桌面宿主在当前任务中渲染牌桌组件；组件通过受约束工具/本地协调器读取该席投影和提交结构化动作。UI 工具即使不可用，聊天/状态工具仍必须能报告明确降级原因。
- 若目标宿主未提供所需 UI bridge，插件生成短期单用 handoff URL 打开同一席位的外部本地牌桌；URL 只能兑换一次短期 UI session，不能包含或返回长期 seat/recovery credential。该 fallback 不得被验收材料冒充为内嵌 UI 已完成。
- Codex App Server 只在玩家本机通过 stdio/受控本地传输驱动专用游戏任务，不向公网房间服务暴露实验性 App Server WebSocket；远端服务永远不接收 Codex 登录凭据或 session_id。
- fold/check/call/bet/raise/all-in 只由牌桌 UI 的按钮和下注滑杆形成结构化 action submission；提交必须携带 room/seat UI capability、hand_id、expected_revision 与 idempotency_key，并由中立权威服务按最新 legal_actions 重验。
- 普通玩家文本即使完整匹配动作词或金额也只进入 TABLE_PUBLIC；`@tokengame join/leave`、AI ON/OFF 和查看状态属于显式 LOCAL_CONTROL，但 MVP-0 不定义任何文本扑克动作命令。
- 模型可调用工具与 UI 专用动作能力分离：`SEAT_AI`、Skill、Hook 和模型可见 MCP 工具均不能获得 submit-poker-action 权限；兼容宿主应把动作工具限制为 app/UI 可见，否则由本地 UI 协调器直接提交。
- UI 根据最新权威快照显示合法动作与金额范围；提交 pending 时防重复点击，收到接受/陈旧 revision/超时结果后以服务器快照归约，不在客户端乐观改写底池、筹码或行动者。
- 掉线策略版本 `DISCONNECT_STRICT_V1` 使用 `disconnect_action_extension_ms=0` 与 `seat_recovery_ttl_ms=120000`。`PLAYER_CONNECTION_LOST` 只记录连接事实，不直接执行扑克动作或修改原行动截止时间。
- 掉线玩家若在原 action deadline 前恢复且尚未产生超时动作，可继续当前手；deadline 到达后由权威状态机产生唯一 `ACTION_TIMED_OUT`，可 check 则 check，否则 fold，迟到的旧动作不能撤销或覆盖该结果。
- 已 all-in、已 fold 或当前无需行动的掉线席按标准规则继续当前手。HAND_SETTLED 后仍未恢复的席位进入 `DISCONNECTED_SIT_OUT`，不参加下一手、不发牌、不收盲注。
- 自服务端确认该席最后一个有效玩家连接消失起保留原席 120 秒；有效 recovery credential 恢复的是同一 room_player/seat/stack。TTL 到期产生唯一 `SEAT_RELEASED`、吊销 seat/recovery credential，并允许新玩家占座。
- 同一席的内嵌组件、一次性 fallback UI 或恢复连接可能短暂重叠；只有全部有效玩家连接均消失才进入 connection-lost。Codex AI 离线与玩家连接丢失是独立状态，不能互相冒充。
- 当前手永不因单席断线回滚或暂停；若 HAND_SETTLED 后可参与席位少于两名，房间停在等待状态，不开始下一手，直到至少两席重新可参与。
- 席位参与状态至少包括 WAITING、READY、ACTIVE、SIT_OUT/DISCONNECTED_SIT_OUT。房间不存在“创建者开始游戏”的特殊权力；邀请创建者与其他玩家遵守相同 Ready 规则。
- 首手在 `ready_count >= 2` 时启动 3 秒权威倒计时，只把倒计时终点仍为 READY 的席位纳入本手。已入座但未 Ready 的玩家保持旁观，不发牌、不收盲注，也不阻塞其他玩家。
- 倒计时期间某席取消 Ready/掉线时从候选集合移除；若仍有至少两席 READY，倒计时可继续，否则取消并回到 WAITING。新的未 Ready 玩家加入不重置已有倒计时。
- HAND_SETTLED 后，只要下一手候选 ACTIVE/READY 席位不少于两名，经过 3 秒手间展示期自动开始下一手，无需每手重复 Ready；玩家可在手间选择 sit out。
- 中途加入、从 sit out 恢复或掉线重连的玩家进入 WAITING_NEXT_HAND；其 Ready 只影响下一手候选集合，不能中途获得底牌、补盲或改变正在进行的手牌。
- 主动退出采用版本化 `VOLUNTARY_EXIT_V1`，包含 `SIT_OUT_AFTER_HAND` 与 `LEAVE_TABLE` 两个不同 LOCAL_CONTROL；关闭/折叠牌桌 UI、Codex 切换任务和网络断开均不能冒充主动退出。
- `SIT_OUT_AFTER_HAND` 在当前手仍正常允许玩家动作、TABLE_PUBLIC 与同席 AI；HAND_SETTLED 后进入 SIT_OUT，不参加新手、不发牌、不收盲注，但保留 room/seat binding 和凭据。玩家重新 Ready 后只从下一手进入。
- `LEAVE_TABLE` 被本机接收时先把 binding generation 置为隐私栅栏状态，禁止新的 TABLE_PUBLIC、AI wake、continuation 和扑克动作；权威接受后进入 LEAVE_PENDING。网络失败时保持私密/离桌中并幂等重试，绝不自动恢复公开。
- LEAVE_PENDING 席若仍有可弃的 live hand，只在自己的下一个合法行动点执行唯一 forced fold；此前投入留在底池。已 all-in 的席按标准主池/边池结算，已 fold 的席不重复动作；任何情况都不回滚已接受动作或越序改变当前行动者。
- 不在当前手中的 WAITING/SIT_OUT 席可在权威接受 leave 后立即释放；仍属于当前手的席最迟在 HAND_SETTLED 后产生唯一 `VOLUNTARY_SEAT_RELEASED`，吊销 seat/recovery/UI capability、删除本机 session-seat secret，并把任务切回普通私密 Codex 语义。
- 主动 leave 不进入 120 秒掉线恢复窗口；旧 recovery credential 在释放事件后不可恢复。一个 Codex session 同时最多一个非 UNBOUND binding，换房/换席必须完成旧席 leave → UNBOUND → 新 `join`，MVP 不提供原子 switch。
- 所有在途模型结果、组件 wake、排队 continuation 和动作提交都携带 binding_generation；leave 隐私栅栏后的旧 generation 结果一律丢弃，不发布气泡、不执行动作，也不能把任务重新置为公开。
- 首次运行采用版本化 `INSTALL_CREATE_JOIN_V1`。封测从固定 Git ref 的 TokenGame Marketplace 安装；公共产品目标是 universal plugin directory，但上架审核不是 MVP-0 交付依赖。两种来源必须保持同一 plugin id、协议版本和可审计升级路径。
- 插件安装/启用、Hook 审阅信任、preflight、每次入桌公开公告确认、invite 兑换、session-seat binding 与 Ready 是独立状态；前一状态不能暗中替代后一状态。Hook 不可信、协调器不可达、版本不兼容或主路径能力门禁失败时，create/join 停在 SETUP_REQUIRED/DEGRADED，不创建活跃公开席位。
- 新专用任务直接接受 `@tokengame create` 与 `@tokengame join <invite>`；不存在强制 `@tokengame setup`。第一次缺少本机偏好时，在同一就地向导收集玩家昵称/头像、AI 名称/头像/基础人设，并展示“绑定后普通任务输入默认公开”的 ruleset_hash 公告。
- 本机显示偏好可跨房间复用，但每次新 room binding 或 ruleset_hash 变化都必须重新确认公开公告；确认之前普通 prompt 保持私密且不产生房间流量。取消向导不创建房间、不占座、不留下 pending public binding。
- `@tokengame create` 经 preflight 和公告确认后向中立服务幂等创建一个临时房、绑定当前 session 为普通 WAITING 席，并渲染牌桌；创建者不获得开局、看牌、踢人或状态机管理特权。
- create 返回一个可点击/可复制的 room invite。MVP 默认同一邀请可由不同未绑定任务兑换空席，直到四席满、版本化 TTL 到期或房间销毁；每次成功兑换都签发独立 seat/recovery credential。invite 本身不含任何 seat secret、Codex session_id、底牌或创建者本机身份。
- `@tokengame join <invite>` 先验证 invite/房间/版本/空席和本机 UNBOUND，再完成公告确认并幂等兑换一个席位；成功后进入 WAITING，玩家只在牌桌 UI 点击 Ready。重复粘贴、刷新或超时重试不能重复占座。
- `@tokengame` 无参数只显示安装/preflight/binding/房间状态与可用 LOCAL_CONTROL，不自动 create/join。普通未绑定任务提到 poker、房间码或 TokenGame 时不会自动绑定或公开。
- MVP-0 最终签字采用版本化 `PLAYABILITY_GATE_V1`：日常 CI 的技术 smoke 只是回归层，不能替代自动化全门禁和一次四人真人试玩。
- 自动化层必须覆盖动态临时房、四个独立 session binding、create/join/Ready、至少 10 手连续牌局、聊天与主动 wake、AI silent/public/迟到/失败/dirty 合并、掉线恢复、sit-out/leave 和凭据失效；确定性 fake `SEAT_AI` 负责穷举分支，真实 Codex 宿主 smoke 负责验证至少一个完整模型闭环及 `SAME_VISIBLE_TASK_SPIKE_V1` 结论或既定回退。
- 状态一致、筹码守恒、隐藏信息/席位凭据不泄漏、动作与发布幂等、每席唯一 AI 上下文、气泡归属正确和无未解释控制台错误属于零容忍门禁；任何一项失败都不能由问卷或体验评分抵消。
- 首轮必须导出 install→Ready→首手漏斗，以及 AI eligible/start/coalesced/silent/public/late/dropped/cancelled/failed 计数；分段记录事件→评估、模型终态、公开事件和四视图渲染时延的 p50/p95/最大值。第一轮只建立基线，不预设脱离真实模型与网络条件的统一绝对时延 SLA。
- 真人层由四名真人分别使用自己的 Codex 专用游戏任务和独立席位，在最长 45 分钟内目标完成至少 10 手；因技术问题不能完成视为门禁失败，不以模拟席补齐后冒充通过。
- 真人试玩必须至少观察到一次非由主人当轮输入直接触发的合法 AI `public_speech`、一次 `silent` 和一次玩家与所属 AI 的公开往返；四名玩家均能正确说明气泡归属以及“绑定后任务普通输入默认公开”的语义。
- 真人签字要求结束时无未解决 P0/P1，至少 3/4 玩家愿意立即再玩一场，至少 2/4 玩家能指出 AI 话术对下注判断、诈唬解读或桌上互动造成的具体影响；该小样本只证明 MVP 形成性可玩，不冒充市场留存或统计显著性结论。

### MVP-0 核心行为细化

- 保持现有服务端权威德扑状态机与标准动作不变；聊天事件不能直接执行 fold/call/raise/all-in。
- 新桌型明确标注“公开 AI 话术桌”：当前手策略讨论、垃圾话、错误信息与有意诈唬均被允许，所有入桌者看到同一规则说明。
- 每席拥有可命名的 AI 人格（如“贾维斯”“Kitty”），玩家与 AI 发言均标明席位、说话者、时间和上下文归属。
- 首轮试玩使用版本化 `LIVELY_V1`：玩家/AI 单条 `max_graphemes_per_message=140`；玩家每席每手最多 12 条、滚动 5 秒最多 3 条；AI 每席每手最多公开 8 条；AI 评估启动间隔暂为 5 秒；气泡显示约 10 秒但权威消息保留在时间线/回放。玩家与 AI 计数分离，不再设置 proactive/reactive 子配额。
- 已绑定牌桌的专用游戏任务中，未显式进入 OWNER_PRIVATE/LOCAL_CONTROL 的玩家自由文本通过字符、频率、每手额度、席位状态和幂等校验后立即写入 TABLE_PUBLIC；不等待模型、不预判玩家是否在提问，也不额外调用 Codex 做意图分类。普通 Codex 任务仍保持原隐私语义。
- 每席只有一个公开 `SEAT_AI` 事件循环。它读取按序的权威公开牌局/聊天事件、当前合法公开状态、所属玩家自己的私有手牌投影和受桌规裁剪的 AgentProfile；无论事件来自主人问题、垃圾话、对手发言、下注、街道推进还是行动窗口，都进入同一上下文边界。
- AI 模型回合只需返回统一结构化结果：`silent` 或 `public_speech(text)`；AI 自己根据上下文判断是否需要回应、回应谁以及说什么。服务端不维护 PLAYER_REACTIVE、PLAYER_PUBLIC_ONLY、PUBLIC_PROACTIVE 或“这句话是否问 AI”的权威分类，玩家问题也不获得保证答复或专用发布预留。
- `silent` 不创建气泡、不消耗 AI 8 条发布额度；合法 `public_speech` 成功公开时消耗 1 条统一 AI 额度。达到 8 条后本手停止新的公开话术模型回合，下一 HAND_STARTED 重置；刷新、重连或事件重放不能提前重置。
- AI 每席同时最多一个公开话术模型回合，启动间隔至少 5 秒。回合运行或冷却期间到达的新相关事件只更新一个持久化的 `dirty_since_event_seq/latest_context_revision`，不逐条建立 FIFO、不拒绝玩家消息，也不为每条消息额外调用模型；当前回合终结且仍 dirty 时，用最新权威快照再评估一次。
- 相关唤醒事件首版包括所属玩家公开消息、任一真人公开消息、标准下注动作、ACTION_REQUIRED、STREET_ADVANCED 与 HAND_SETTLED。事件重放以 event_id/event_seq 去重；失败不无界重试。AI 公开发言会进入后续上下文，但自身不能单独把其他 AI 唤醒，避免模型间无限对话。
- 所属玩家可以看到该席 AI 的 OFF / ONLINE / THINKING / DEGRADED / OFFLINE 状态及净化后的最近失败；对手只看到比赛必要的在线/思考/离线粗状态和最终公开气泡，不看到隐藏推理、调用成本或内部错误。
- 模型/网络慢、断线或限流不暂停行动倒计时、不阻止玩家聊天、不阻塞结构化扑克动作，也不触发外部 API/其他普通 Codex 任务的静默 fallback。牌局继续按权威规则运行，AI 恢复后只基于仍有效的最新上下文继续。
- 玩家可随时把自己的公开话术 AI 切换为 OFF；OFF 后不再启动公开话术回合，并尽力取消在途回合、丢弃其迟到输出，但不影响手动 fold/check/call/bet/raise/all-in。重新开启后等待下一个相关事件或一次明确的“立即评估”本地控制，不补跑关闭期间的逐条旧事件。
- 公开话术永远没有牌局动作效力；ADVISOR/AUTOPILOT 仍使用独立的结构化动作协议和权限校验，不能把自然语言气泡当作动作提交。AI 只能看到所属席私有牌面，不能读取对手底牌、普通编码任务、隐藏推理或未授权文件/工具。
- 每个 AI 回合保存 source_event_seq、context_revision、origin_hand_id/origin_street、started_at 与 request_id，用于去重、取消、恢复和判断迟到。同一 origin_hand_id 内的迟到 public_speech 仍可公开；若 street 已推进则醒目标注“延迟 · 基于前一街”且只有话术效力。current_hand_id 不同则丢弃，不占新手额度、不恢复旧行动窗口或执行动作。
- 服务端在接受前按规范化后的 Unicode 字素计数并验证短窗/每手余额；超长、短窗超限和本手耗尽均以稳定 reason_code 拒绝，不得先公开后撤回，也不得依赖客户端计数。具体拒绝后的 AI 调用/提示行为按后续裁决执行。
- 当前行动者的倒计时与公开聊天可以并行；模型回答不自动暂停或延长行动时钟。
- 非当前行动者可发言，但与当前行动者共享明确的反刷屏预算。
- 公开聊天支持本地隐藏指定玩家、指定 AI 或整席组合；隐藏不改变其他玩家看到的事件，也不影响回放/审计记录。
- 对话上下文只由本桌、本手或受控最近窗口中的权威公开事件组成，不读取其他 Codex 任务、私有文件或隐藏推理。
- 每席 AI 额外获得该席自己的权威私有手牌投影；AI 气泡中的概率、牌力和对手倾向均按“参与者话术”展示，不获得系统事实样式。
- 统一 SEAT_AI 回合携带来源事件序号、上下文版本、手牌/街道、开始时间与因果深度；不再按“主动/回复”命名不同请求。同手跨街输出标延迟后可发布，跨手输出丢弃。
- 首版禁止 AI 发言直接触发另一席 AI 无限响应；公开话术回合只由真人/牌局相关事件唤醒，并受每席单并发、5 秒启动间隔和每手 8 条统一发布上限限制。
- 默认公开只适用于已绑定、已入桌的专用 TokenGame 游戏任务；同一项目的普通 Codex 开发任务保持私密且不产生牌桌桥流量。

### 路线图设计存档（不属于 MVP-0 实现或验收）

- 交流协议明确拆为 TABLE_PUBLIC、OWNER_PRIVATE 与 LOCAL_CONTROL；保存回放、静音、切换档案等确定性控制命令不消耗私密模型咨询额度。
- TokenGame “学习”首版指保存结构化回放、派生统计、私有复盘摘要并按需检索；不声称在线修改 Codex 模型权重，也不保存隐藏推理。
- 每名玩家每个私密额度周期拥有 10 次 OWNER_PRIVATE；同桌每完成 3 手权威结算后统一进入新周期并恢复到 10 次，未用额度不结转。
- 私密额度只由幂等的 HAND_SETTLED 推进；未结算/作废手牌、页面刷新、断线重连和同一身份重新入座均不得提前刷新额度。
- OWNER_PRIVATE 的提示与回答正文仅对所属玩家及其 AI 可见；全桌公开该席正在私聊的状态和准确剩余额度，例如“7/10”。
- 私聊使用状态与余额是不可被聊天隐藏/静音过滤的权威竞技资源；其他席 AI 只能获得这些元数据，不能获得私聊正文。
- 玩家仍在桌中时可在任意牌局时点发起 OWNER_PRIVATE，包括其他玩家回合、自己弃牌后及两手之间；每席同时最多一个私密请求生成中。
- 私密生成不暂停或延长行动倒计时。请求绑定创建时的 hand_id、street 与 state_revision；状态推进后到达的答复仅作带“基于旧状态”标识的私密信息，不能提交牌局动作。
- OWNER_PRIVATE 通过全部接受前校验后立即扣除 1 次并公开余额；接受前拒绝不扣除。
- 只有经服务端确认的基础设施故障且没有任何可交付回答时才自动返还。用户取消、内容策略拒绝、已生成但过期的回答均不返还。
- PRIVATE_QUOTA_REFUNDED 与原 request_id/quota_epoch 幂等绑定；旧周期退款不结转到新周期，已退款请求的迟到回答必须丢弃。
- 每个已入桌席位绑定一个单一、可恢复的 Codex 游戏上下文；`SAME_VISIBLE_TASK_SPIKE_V1` 通过时它就是当前可见专用游戏任务，否则是协调器拥有的 App Server 游戏线程。普通编码任务不得被绑定或作为上下文来源。
- 游戏线程只接收全桌权威公开状态、该席自己的私有牌局投影、该席 OWNER_PRIVATE 与已批准模块上下文；不得读取其他 Codex 任务或对手私有投影。
- 本地原型先执行同任务主动回合尖峰；仅在门禁失败后按已定义回退使用 Codex App Server stdio。无论承载方式，游戏上下文故障时公开标记该席 AI 离线并保持牌局继续，不静默切换到外部 OpenAI API、普通编码任务或第二 AI 上下文。
- 主动 AI 采用关键事件白名单：主人 ACTION_REQUIRED、任一玩家 bet/raise/all-in、街道推进、真人公开点名该席/AI、对手真人公开发言、HAND_SETTLED。普通 check/call/fold 不单独唤醒所有 AI。
- 触发事件只创建一次“是否发言”评估资格，不保证产生气泡；AI 可以结构化返回 silent。每席每个 source_event_id 最多评估一次，并继续受冷却与每手公开发言额度限制。
- AI 公开发言不能作为另一席 AI 的直接触发源；对手 AI 的内容可在下一次合法牌局/真人事件触发时作为上下文读取，防止模型互相无限唤醒。
- 玩家拥有可版本化的 AgentProfile，至少覆盖头像、昵称、人设、语气、主动程度、允许触发类型、记忆/统计/计算工具、社区模块及未来的 ADVISOR/AUTOPILOT 权限。
- 有效权限为官方安全上限、桌型规则、用户授权与模块声明的交集；用户不能通过人设或高级设置授予对手底牌、普通项目文件、任意网络、绕过聊天配额或直接跳过权威动作校验的能力。
- AI 昵称/头像不替代 seat_id/owner_id，界面始终显示席位归属并保留系统身份名称；头像使用经格式/尺寸/体积校验的本地导入资产，不直接热链远端 URL。
- AgentProfile 采用“版本化预设 + 高级设置”：默认提供安静、均衡、张扬、自定义；高级设置可在硬上限内覆盖触发子集、发言倾向、垃圾话强度、战略性说谎、记忆/统计/计算工具、模块及未来托管权限。
- 档案保存 preset_id、preset_version、overrides、schema_version 与 resolved_snapshot_hash；预设升级不静默改写既有档案，UI 同时显示期望配置与经桌规裁剪后的有效配置。
- 只允许有限长度的 persona_summary，不提供可覆盖系统/桌规的完整原始提示编辑器；人设自由文本始终按不可信输入处理。
- 模型策略按桌型分离：OPEN_CAPABILITY 保持宿主透明，不查询、锁定或验证模型/effort/provider；HONOR_MATCHED（UI：“公平场 · 检测不保证”）要求自律确认并叠加 TokenGame 结构化尽力检测。
- HONOR_MATCHED 入桌预检至少调用/采集实际游戏 App Server 的 model catalog、effective config 以及专用线程 start/resume 返回的 effective model、modelProvider、reasoningEffort；只使用结构化协议字段，不询问模型“你是什么模型”，也不以文风、延迟、胜率或挑战题推断身份。
- HONOR_MATCHED 为每次检测生成最小化 detection receipt，包含 target/detected 规范化值、检测状态、Codex/协议版本、目标目录版本、ruleset_hash、随机 nonce 与时间。配置文件、密钥、认证信息、中转端点和未净化 provider 设置不得上传或进入公开事件。
- 检测状态至少包含 MATCH、MISMATCH、UNAVAILABLE、STALE、TAMPER_SUSPECTED。新桌、线程恢复/重连、目标或 ruleset 变化以及结构化信号变化都使旧 receipt 失效；公平场不能只在入桌时检查一次而不处理赛中切换。
- TokenGame 必须拥有专用游戏线程的 `turn/start` 协调权并记录每回合请求的 model/effort。HONOR_MATCHED 不写入公平性 model/effort override，继续跟随玩家 Codex 宿主；协调器须在每次模型回合开始前、线程恢复/重连后及周期性检查点重新读取并比较结构化信号。任何绕过协调器的 AI 输出不得作为公平场合法助手输出。
- 公平场许可采用上限合同而非全序模型字符串比较：标准目录为可比较的 model/effort 组合维护版本化 capability_class/rank。仅当 detected_class 不高于 table_ceiling_class 时才有资格；高于上限必须拒绝，低于上限可由玩家自愿接受劣势后加入。
- 不同厂商、模型家族或自定义 provider 若没有平台明确维护的可比较关系，默认 INCOMPARABLE，只能进入其精确组合或私人房间，不能由名称、价格、发布时间或基准分数临时推断高低。
- 玩家匹配偏好至少包含 exact_only、allowed_ceiling_range 与 timeout_upshift_enabled。超时扩展只把该玩家票据加入预先允许的更高 ceiling 队列，不切换 Codex 模型、不把高模型下沉到低场，也不在未经确认时改变范围。
- 队列的“精确”等待表示每张桌始终保持自己的明确 ceiling/ruleset；允许弱模型进入高 ceiling 场是该玩家主动承担劣势，不是把不同目标偷偷混成一个未标注池。
- 入桌前 MISMATCH 只拒绝该队列，不自动扣信用。赛中从合规状态变为 confirmed higher-than-ceiling 时立即阻止新的 AI 回合并生成 INTEGRITY_VIOLATION；用户要求随后踢出该席并重扣信用。
- UNAVAILABLE、STALE、瞬时读取失败或单一矛盾信号只暂停该席 AI、公开“复检中”并进入有界重试/宽限，不等同于作弊，也不得触发重信用处罚。重罚只可绑定可审计的 confirmed higher-than-ceiling 事件。
- confirmed higher-than-ceiling 使席位原子进入 EJECT_PENDING：立即取消/隔离所有在途 AI 请求，拒绝新的 TABLE_PUBLIC、OWNER_PRIVATE、AI 发言与玩家牌局动作，并公开稳定的完整性违规状态；迟到模型输出不得发布、执行或触发退款。
- 若 EJECT_PENDING 席位仍在当前手且尚未 all-in，权威状态机在其下一个合法行动点自动提交 fold；不能通过越序 fold 改写其他玩家当前行动。该席此前投入的筹码继续留在主池/边池，不退款、不没收其他未投入筹码，也不回滚整手。
- 若 EJECT_PENDING 席位已经 all-in 或该手结束前不再获得合法行动点，当前手按既有底牌、主池/边池和标准结算规则完成；检测事件不重写牌面、胜负或筹码结算。HAND_SETTLED 后立即移除席位并执行一次幂等信用处罚。
- EJECT_PENDING、forced-fold-pending 与 penalty_event_id 必须随权威事件日志持久化；刷新、断线、重连、重复检测、事件重放和迟到回调都不能取消踢出、重复 fold 或重复扣信用。
- 违规席在被移除前只保留只读牌桌投影；其他玩家持续看到“完整性违规 · 待移出”，但不获得其原始 config、provider、模块或私有对话内容。
- confirmed higher-than-ceiling 的处罚只写入公平完整性/honor_history 维度，不自动改变 reliability、conduct 或 community_feedback；玩家举报数量也不能参与自动升级计算。
- 公平完整性处罚采用可恢复的累进策略：首次确认违规造成显著信用降级并进入临时 Restricted；同一滚动窗口内的后续确认违规按已发生次数单调升级降级幅度和限制期限。单次事件不得直接产生永久公平场封禁。
- 每次处罚必须绑定不可变的 policy_version、penalty_event_id、reason_code、证据摘要、滚动窗口内 strike 序号、处罚前后等级、限制条件以及申诉/恢复状态；策略升级不得追溯改写历史处罚。
- 恢复和申诉必须通过新的权威事件留下审计轨迹，不能删除原处罚记录；成功纠错可撤销其有效后果和 strike 影响，但重复提交、重连或事件重放不得重复恢复。具体恢复门槛、扣分量和期限在信用量表确定前保持版本化配置，不在需求阶段拍脑袋设定任意常数。
- 自然恢复采用两阶段状态机。`Restricted` 至少持有权威 `cooldown_not_before`：到期前拒绝新的 HONOR_MATCHED 排队/入桌，但不禁止 OPEN_CAPABILITY、本地设置或查看回放；Restricted 期间的自由场游戏不计恢复进度。到期后由幂等状态事件转为 `Caution`，不能直接恢复正常等级。
- `Caution` 仍不得进入 HONOR_MATCHED 普通池、私人公平房或任何公平场恢复池，只能在既有自由场（OPEN_CAPABILITY）推进观察期。自由场不设置模型上限，因此合格完成只能证明规定参与/完成行为，不能被描述为已经证明模型合规。
- Caution 自由场观察期采用累计 `qualifying_action_credits`，不要求动作来自同一牌桌或连续牌局。合格候选必须是该席在合法行动点提交并被权威状态机接受的 fold / check / call / bet / raise / all-in；合法 fold 必须计入，不能用恢复机制诱导玩家跟注烂牌。
- 强制盲注/前注、发牌、自动过牌/弃牌、超时默认动作、坐下/离桌、聊天、AI 话术、被拒绝或重复 action_id、旁观以及非 Caution 阶段动作均不计。每位玩家在每个 hand_id + betting_street 最多获得一个候选 credit，后续合法再加注仍可执行但不重复加恢复分，避免双方通过同街反复最小加注刷次数。
- 恢复 credit 只接受由权威动作入口判定为 `control_origin=MANUAL` 的玩家动作。直接按钮/结构化命令提交属于 MANUAL；ADVISOR 建议本身不计，玩家看过建议后通过独立确认提交的动作可计；`control_origin=AUTOPILOT` 的自主动作永不计入，但仍按正常扑克规则执行。
- `control_origin` 必须由协调器根据经过认证的用户输入链、动作提案与确认关系生成，不能信任客户端自由填写的 `manual=true`。切换 OFF/ADVISOR/AUTOPILOT 不追溯改变已记录动作来源，复制模型文本到聊天或由模型模拟点击也不能仅凭声明升级为 MANUAL。
- 只有由官方公共 OPEN_CAPABILITY 匹配服务创建且在不可变 ruleset/入桌凭证中标记 `match_origin=PUBLIC_OPEN_POOL`、`recovery_eligible=true` 的牌桌可产生恢复候选。私人邀请、好友房、自建/自托管房、直接 table_id 加入、开发/演示/机器人测试桌和离线桌一律 `recovery_eligible=false`。
- `recovery_eligible` 由未来可信匹配服务签发并随 table_id、ruleset_hash、match_id 和资格策略版本固化；房主、客户端、Codex 会话或桌内事件不能把 false 改成 true。牌桌来源/资格变化不得追溯改写已结算动作，资格冲突按不计分失败安全处理。
- 当前本地 MVP 没有可信公共匹配服务，只能用明确的 `LOCAL_SIMULATION` 测试凭证验证同一归约路径；该凭证和产生的 action credits 不能导出为未来正式信用，也不能在 UI 中显示为官方公共桌实绩。
- 信用策略加载必须显式区分 `LOCAL_SIMULATION` 与 `PRODUCTION`。本地 fixture 可采用加速值（默认示例：首个 strike 冷却 60 秒、Caution 需要 5 个 MANUAL action credits）并使用可注入时钟；这些值只用于演示/自动化测试，不构成产品处罚承诺。
- `PRODUCTION` 模式在没有签发且完整的 policy_version 时必须保持长期信用处罚/恢复归约禁用并报告 `POLICY_UNCONFIGURED`，不得回退读取 local fixture、开发环境变量或硬编码常数。当前手 EJECT_PENDING/强制弃牌/移出仍独立执行，不因长期策略未配置而回滚。
- 本地 fixture 与未来生产策略使用不同 namespace、签发者和持久化存储标记；LOCAL_SIMULATION 记录不能迁移、合并或导入生产。界面、日志、导出与测试快照均须携带 policy_mode，避免截图或回放把测试处罚误解为正式信用。
- 在 recovery_eligible 公共桌内，只要其他既定条件相同，重复匹配到同一 opponent_id/同一桌组的 MANUAL action credit 与首次匹配等值；策略不得基于重复对手设置上限、衰减、最低独立对手数或隐藏扣减。
- 系统仍应在私有审计事件中保存最小化 match_id 与对手主体引用，用于幂等、故障排查和未来评估，但当前归约器不能据此拒绝 credit 或自动推定合谋；未来若新增反刷规则，必须发布新的 policy_version，不能追溯扣回旧策略下已确认的恢复进度。
- 候选 credit 在动作发生时记录 action_id、hand_id、street、control_origin 与 policy_version，但只有该手到达 HAND_SETTLED 且没有导致该席 EJECT_PENDING/规则定义恶意中离时才通过幂等 `QUALIFYING_OPEN_ACTION_COMMITTED` 入账；异常作废牌局的候选不入账，事件重放不重复累计。
- 达到版本化 `required_action_credits` 后，系统通过一次幂等 RECOVERY_COMPLETED 事件恢复公平场“可申请”状态；历史 strike 和原始处罚记录仍保留用于滚动窗口判断，不被“洗白删除”。恢复只解除信用准入限制，不生成 MATCH receipt；玩家下一次加入 HONOR_MATCHED 仍须重新确认公告并通过当时的完整入桌检测。
- 若 Caution 期间产生新的、独立满足处罚合同的公平完整性事件，则立即中止观察进度并按新 strike 返回更重 Restricted；自由场使用任意高级模型本身合法，绝不能被当作 higher-than-ceiling 或新增 strike。
- 成功申诉属于纠错而非自然恢复：它通过独立的 PENALTY_REVERSED/STRIKE_VOIDED 事件撤销错误处罚、限制和对应 strike 影响，不要求等待 cooldown 或完成观察牌局，但必须保留原事件与纠错审计链。
- 冷却期限、观察期所需 action credits 和滚动窗口均属于 policy_version 快照；真实服务以权威服务端时间为准，本地模拟使用可注入测试时钟并继续明确标注非平台信用，不能依赖可任意修改的客户端墙钟来声称可信恢复。
- 对手/公共投影只包含版本化 `reputation_badge`（New / Established / Caution / Restricted）、`fair_access_state`（例如 ELIGIBLE / RECOVERY_ONLY / BLOCKED）及其“本地模拟/平台信用”来源标记；不得包含精确分值、strike_count、penalty_event_id、reason_code 历史、证据摘要、cooldown_not_before、required/earned action credits、申诉材料或内部风险信号。
- 所属玩家的 OWNER_PRIVATE/LOCAL_CONTROL 视图可以显示自己的当前处罚原因、剩余冷却、action credit 进度、适用 policy_version 和申诉/纠错状态；即使本人选择分享，这些字段也不能通过桌内公共事件或对手 API 自动广播。
- 当前手确认违规仍必须公开稳定的“完整性违规 · 待移出”比赛事实，用于解释 AI 停用、强制弃牌与移出；它不授权对手读取该玩家其他历史处罚或证据。牌局结束后的粗粒度徽章变化通过独立信用状态事件投影。
- 公共徽章不能作为聊天权限、下注权限或牌局动作规则的隐式输入；只有明确的 fair_access_state 控制排队/入桌，已开始牌局中的处理仍只依据当局权威事件，防止展示层状态误伤游戏状态机。
- 后续信用阶段的首个原型是本地协议模拟器：复用未来远程系统所需的事件结构、策略版本和状态归约逻辑，在本机持久化并允许开发测试重置；它不属于 MVP-0。
- 当前手 EJECT_PENDING、强制弃牌和移出仍由本桌权威状态机真实执行，不因长期信用仅为本地模拟而降级；只有 HAND_SETTLED 后的长期等级、Restricted 与恢复进度属于模拟数据。
- 本地模拟器不得要求登录、联网或远程数据库；未来远程账户服务应能接收同一版本化处罚事件重新归约，但不得把未经可信服务端签发的历史本机状态直接导入为正式处罚。
- 本机玩家可修改 TokenGame、App Server 或检测结果，自定义 provider/中转也可把模型名称映射到其他上游模型；因此 MATCH 只表示“通过 TokenGame 当前可见信号”，不是密码学证明。外部第二 AI 同样不可检测。
- TokenGame 只审计被授权的模型输入、最终可见输出、来源事件、检测 receipt 和牌局动作，不声称复现隐藏推理、再次生成相同文本或证明真实上游模型相同。
- 桌型至少包含 OPEN_CAPABILITY 与 HONOR_MATCHED。OPEN_CAPABILITY 不声称能力同级；HONOR_MATCHED 发布目标 model/effort 并进行尽力检测，但任何 API/UI 均不能描述为已验证真实模型。
- HONOR_MATCHED 约定并检测基础模型/推理强度不超过当前 table_ceiling；低于 ceiling 属于玩家自愿承担的劣势。各席可在桌规安全上限内使用不同的 AgentProfile、记忆、对手统计、概率工具、社区模块与托管配置，这些差异属于 AI 养成和竞技内容，不构成违反模型上限合同。
- HONOR_MATCHED 不向对手公开各席是否启用记忆、对手统计、概率工具、社区模块、ADVISOR/AUTOPILOT 或其他 AgentProfile 能力，也不展示能力徽章、模块名称、版本、数量或配置摘要。隐藏本身是桌规的一部分，用于保留 AI 养成方案与战术猜测空间。
- 所有玩家在入桌前仍必须被明确告知“各席 AI 养成能力可能不同且不会公开”；隐藏能力不能被 UI 暗示为未启用或能力一致。所属玩家可在 OWNER_PRIVATE/LOCAL_CONTROL 视图查看自己的期望配置和桌规裁剪后的有效配置，但不能读取对手配置。
- 服务端或本地协调器为权限执行、安全校验和私有审计而持有的 capability/module 元数据不得进入 TABLE_PUBLIC、公共快照、对手投影、公开回放或排行榜；模块内部日志、工具调用轨迹和具体失败原因也必须在跨席投影前净化。AI 在线/离线、思考中、公开发言、牌局动作以及已确认公开的私聊使用状态仍属于可观察的运行/比赛事实，不视为能力披露。
- HONOR_MATCHED 中所有席位适用相同的 TokenGame 权威牌局规则、行动时钟、模型触发预算与公开/私密聊天配额；TokenGame 不承诺统一 Codex 账户额度、宿主限速、上下文质量或 provider/中转稳定性，也不得把该桌型描述为“AI 能力相同”。
- HONOR_MATCHED 入桌前必须展示并确认版本化公告，明确“TokenGame 会检测但不能保证真实上游模型、AI 养成能力可不同”，并记录 player_id、ruleset_hash、公告版本与时间；桌内 HUD、回放和排行榜持续标注“公平场 · 检测不保证”及每席当前检测状态。
- HONOR_MATCHED 同时提供 PUBLIC_STANDARD_POOL 与 PRIVATE_CUSTOM_ROOM。公共入口使用 TokenGame 维护的版本化 capability_class/ceiling 目录及其他权威桌规键进行分池；玩家确认、达到检测要求且 detected_class 不高于目标 ceiling 后才可进入相应队列。
- PRIVATE_CUSTOM_ROOM 由房主填写目标 model/effort 展示文本并生成不公开列出的邀请入口；它不进入公共标准池，也不能使用“平台标准配置”标识。自定义文本按不可信内容处理，并受长度、字符和冒充系统名称校验。
- 标准目录规范匹配标签、可比较关系与 capability ceiling，结构化检测筛选普通错配；两者都不代表 TokenGame 拥有或证明对应上游模型。目录条目与排序关系必须版本化；重命名、重排、停用或新增条目不能静默改写正在等待、已经开始或回放中的桌型目标。
- 玩家可以在本地记住上次目标以减少重复设置，但每次进入 HONOR_MATCHED 新桌或 ruleset_hash/目标版本变化时必须重新确认并检测；自动检测不能代替风险公告确认。
- 举报只是待核实线索，不能自动处罚；但 TokenGame 自身在本局生成的 confirmed higher-than-ceiling 协议事件可按已确认桌规触发本局踢出与信用处罚。两者都不能被描述为真实上游模型的证明，可核实协议事件与人工判断类举报必须分开处理。

## 验收标准（演进中）

### MVP-0 权威验收

- [ ] 四个隔离玩家视图以同一顺序看到合法公开聊天事件，并能把发言归属到正确玩家或 AI。
- [ ] LIVELY_V1 下包含中英文、组合字符和 emoji 的消息在服务端按 Unicode 字素一致计数；第 140 个可接受，第 141 个被稳定拒绝，四个客户端不能通过不同字符串长度算法产生分歧。
- [ ] 同一席玩家在任意滚动 5 秒内前三条合法消息可发布，第四条被限流；每手前 12 条可发布，第 13 条被拒绝。刷新、重连、重复 request_id 和多客户端并发不会额外获得或重复消耗额度。
- [ ] 同一席 AI 每手最多公开 8 条，不区分主动/回复来源；前 8 条合法 public_speech 可发布，第 9 条被确定性拒绝。silent 不扣额度，任何 AI 发布不减少玩家 12 条额度。
- [ ] 玩家自然输入“贾维斯，我这手胜率多少”和普通垃圾话都在通过聊天校验后立即进入 TABLE_PUBLIC；两者均不等待或触发独立意图分类调用，四个视图先看到同一玩家气泡。
- [ ] 同一个 SEAT_AI 回合可读取主人问题、其他真人聊天和当前权威牌局投影，并分别返回 silent 或 public_speech；服务端不要求模型先声明 PLAYER_REACTIVE/PLAYER_PUBLIC_ONLY，也不保证每个问题必有回答。
- [ ] 同席 AI 回合运行时连续发生玩家聊天、raise、street 推进，只更新一个 dirty_since_event_seq/latest_context_revision；当前回合终结后至多启动一次基于最新快照的跟进评估，不逐条补跑三个旧回合，也不拒绝玩家消息。
- [ ] 重复 event_id、刷新、断线恢复和事件重放不会重复启动 AI 回合；同席同时最多一个公开话术回合，任意启动间隔不少于 5 秒，失败没有无界重试。
- [ ] AI 返回 silent 时四视图没有气泡且额度不变；返回合法 public_speech 时四视图按同一事件序号显示在所属玩家旁并扣 1 条 AI 额度。对手看不到 silent 次数、成本、隐藏推理或内部错误。
- [ ] AI 公开气泡进入以后模型可见的公开上下文，但该气泡本身不会唤醒任何 AI；在没有新的真人/牌局相关事件时不会形成 AI 对 AI 的无限响应。
- [ ] 模拟宿主高延迟、断线和限流时，行动时钟、玩家聊天、结构化下注和结算继续；HUD 显示净化后的 DEGRADED/OFFLINE，系统不静默调用外部 API 或普通编码任务。
- [ ] 玩家把 AI 切换为 OFF 后不再启动公开话术回合，在途输出即使迟到也不公开；手动扑克按钮继续工作。重新开启不会逐条补跑关闭期间事件，只在下一个相关事件或明确立即评估控制后恢复。
- [ ] 公开话术中的“fold/raise/all-in”文本不能执行牌局动作；ADVISOR/AUTOPILOT 仍须走独立结构化协议。AI 输入投影不包含对手底牌、普通编码任务金丝雀、隐藏推理或未授权文件/工具。
- [ ] 运行时事件 schema、API 和测试中不存在额外意图分类回合、intent_classifier_thread、PLAYER_REACTIVE/PLAYER_PUBLIC_ONLY 路由或 reactive 发布预留；被取代的探索记录不会被生成代码采用。
- [ ] AI 回合在 flop 启动、turn 才返回时，气泡可公开但四视图均标注“延迟 · 基于 flop”，且不能执行动作；若下一 hand 已开始才返回，则结果被幂等丢弃且不消耗新手 AI 额度。
- [ ] 已发布气泡在约 10 秒后从座位旁退出或折叠，但所有视图的聊天时间线、事件日志和回放仍保留原消息；隐藏/静音只影响本地渲染，不改变配额。
- [ ] 当前行动者问 AI 后事件进入同席统一上下文；AI 选择 public_speech 时公开显示，选择 silent 时不显示回答。玩家动作始终由玩家单独提交并由扑克权威层裁决。
- [ ] 至少一个未由玩家当轮输入直接触发的 AI 发言，能说明其触发事件且不越过隐藏信息边界。
- [ ] 非回合聊天可用；超过单条、频率、每手总量或持续时间限制时由服务器确定性拒绝，并给发送者明确原因。
- [ ] 任一查看者可本地隐藏指定玩家、AI 或整席聊天；其他查看者与权威事件历史不受影响。
- [ ] 垃圾话、AI 回复和牌局动作并发时，四视图牌局状态、倒计时和聊天序号不分叉。
- [ ] AI 的概率或牌力陈述即使错误或故意欺骗，也不会获得权威牌局事实的视觉标识；对手无法从协议字段读取该席真实底牌。
- [ ] 专用游戏任务入桌后，自由文本默认先登记为 TABLE_PUBLIC；同项目的其他 Codex 任务仍保持零牌桌流量。
- [ ] 两至四名分别运行自己 Codex 专用游戏任务的真人可凭同一临时邀请进入四席牌桌；未持有有效邀请/席位凭据的客户端不能读取房间、占座、提交动作或订阅事件。
- [ ] 每个客户端只能收到公共状态和自己的底牌投影；将 A 的席位凭据用于 B 的连接、动作或 AI 发布会被权威服务拒绝，房间码本身不能读取任一底牌。
- [ ] 房间服务不接收 Codex 密钥、隐藏推理或普通任务上下文；每席 AI 离线只影响该席气泡，其他玩家和牌局继续。
- [ ] 空房达到版本化 TTL 后被销毁且旧邀请失效；MVP-0 界面不存在公开房间目录、自动匹配、排行榜或账户战绩入口。
- [ ] 创建邀请的玩家断线后，只按普通席位断线规则处理；只要仍有其他玩家，权威房间不会因“房主离线”立即销毁或暴露全桌状态。
- [ ] 邀请码只是一种发现/授权来源；牌桌内部只依赖 room_id、seat_id、seat ticket 与 ruleset/version。用测试 match ticket 替代 invite ticket 时，无需改动德扑动作、事件投影和 AI 发布 schema。
- [ ] 同一本机偏好以相同昵称/头像加入两个房间时，服务端产生不可关联的不同 room_player_id；跨房间公共事件、导出和日志不包含稳定安装标识。
- [ ] 复制他人的昵称、头像或 AI 名称不能订阅其私有投影或提交动作；只有有效且绑定当前 room/seat 的 seat ticket 可操作。
- [ ] 网络中断后，在恢复窗口内使用 recovery credential 可回到同一席且不重复入座；房间销毁或凭据过期后重放会被稳定拒绝。
- [ ] 在一个全新 Codex 专用任务输入合法 `@tokengame join <invite>` 后，当前 `session_id` 恰好绑定一个 room/seat；在另一个未绑定任务发送普通文本不会读取或复用该席凭据。
- [ ] 目标 Codex 桌面版本支持 UI bridge 时，加入工具在当前任务内渲染可操作牌桌；刷新/折叠/重新打开组件不会重复占座或泄露 seat/recovery credential。
- [ ] `SAME_VISIBLE_TASK_SPIKE_V1` 在固定记录的 Codex Desktop/插件版本上证明：内嵌组件收到模拟远端权威事件后，无需玩家点击即可通过 `ui/message` 恰好启动一次当前任务 follow-up；缺少该能力时可被稳定检测，而不是等待到超时后冒充偶发网络故障。
- [ ] 玩家主输入在已绑定任务中恰好发布一次 TABLE_PUBLIC；组件生成的内部 wake envelope、重复 wake_id 和玩家手工仿造的控制文本均不发布桌聊、不读取 seat/recovery secret，也不会创建第二个模型上下文。
- [ ] 同步 `Stop` 只在活跃牌局中按版本化有限窗口等待；事件到达可产生一次 continuation，AI OFF、离桌、任务停止或等待到期后不再续跑。任何测试路径均不存在无界 Stop 循环或固定频率空转模型调用。
- [ ] 在模型运行或 `Stop` 等待期间提交玩家消息，目标 Codex 的 steer/queue 行为不会丢失、重复公开或重排权威 event_seq；连续远端事件仍只形成同席一个 pending，并按 dirty/latest-context 规则合并。
- [ ] 当前任务的模型与推理强度切换能被尖峰如实观察并继续跟随；AI 输出仍绑定 source_event/hand/street/revision，跨手迟到结果被丢弃，组件折叠/卸载时显示可解释的 DEGRADED/OFFLINE。
- [ ] 尖峰报告对每项门禁给出 PASS/FAIL、复现步骤与日志证据；全部关键项 PASS 才启用同任务主路径。任一关键项 FAIL 时验收自动切换到“牌桌聊天框 + 唯一 App Server 线程”，且不存在可见任务/后台任务双跑。
- [ ] 模拟 UI bridge 不可用时，插件明确标记兼容降级并签发一次性 handoff URL；首次兑换得到短期 UI session，第二次兑换或过期兑换被拒绝，URL/浏览器历史中不存在长期凭据。
- [ ] 远端房间请求、公共事件、模型输入和净化日志均不包含 Codex session_id、登录凭据、插件本地 secret 或普通项目金丝雀；App Server 没有公网监听依赖。
- [ ] 玩家在任务中发送“我 all in”“跟了”“raise 200k”只产生公开聊天事件，不改变 hand revision、筹码、底池或当前行动者；AI 复述同样文本也不能执行动作。
- [ ] 当前行动者可通过牌桌按钮完成 fold/check/call/bet/raise/all-in；非法按钮不显示或禁用，滑杆/金额越界、陈旧 revision、错席 capability 和重复 idempotency key 均由服务端确定性处理。
- [ ] 模型、Hook 或模型可见 MCP 工具尝试调用扑克动作端点时被权限边界拒绝；同一 UI action 即使双击、重试或网络迟到也最多执行一次。
- [ ] 客户端提交动作后断网或返回 409 时，以恢复后的权威快照为准；客户端不会先行扣筹码或推进街道而造成视觉状态分叉。
- [ ] 行动者在尚余时间时断线，权威 deadline 不延长；deadline 前恢复可正常行动，deadline 后面对下注恰好 auto-fold、无需跟注恰好 auto-check，迟到/重放动作均不能改写结果。
- [ ] 已 all-in 玩家断线不会被错误 fold 或退回筹码；当前手照常摊牌结算。当前手中的其他玩家不会因为该席断线而暂停、回滚或延长行动时钟。
- [ ] HAND_SETTLED 时掉线席进入 DISCONNECTED_SIT_OUT 且下一手不收盲/不发牌；120 秒内用正确 recovery credential 恢复同一席与筹码，错误 room/seat 凭据被拒绝。
- [ ] 120 秒到期只产生一次 SEAT_RELEASED 并吊销旧凭据；重连、刷新、重复定时器或旧 SSE/WebSocket 回调不能重新占座。可参与者不足两名时只阻止下一手开始。
- [ ] 同席两个有效 UI 连接中仅一个关闭不会触发 PLAYER_CONNECTION_LOST；AI OFFLINE 也不会改变玩家 connection state，反向同理。
- [ ] 首手只有一人 Ready 时保持 WAITING；第二人 Ready 后生成唯一 3 秒倒计时并开手。第三名已入座但未 Ready 的玩家不阻塞，也不收到牌或盲注。
- [ ] 倒计时内一名候选取消 Ready 导致不足两人时倒计时取消；仍有两人时只移除该席。重复 Ready、刷新和事件重放不会创建第二个倒计时或重复开手。
- [ ] HAND_SETTLED 后至少两名 ACTIVE/READY 玩家无需再次确认，在 3 秒展示期后开始下一手；少于两人则停在 WAITING，不自动构造单人手牌。
- [ ] 玩家在一手进行中加入、恢复或点击 Ready 时只能进入 WAITING_NEXT_HAND；当前手的牌堆、盲注、底池、行动顺序和底牌投影完全不变。
- [ ] ACTIVE 玩家选择 `SIT_OUT_AFTER_HAND` 后仍可正常完成当前手且任务文本继续按 TABLE_PUBLIC 处理；HAND_SETTLED 后恰好进入 SIT_OUT，下一手不发牌/不收盲，席位和有效恢复凭据仍属于该玩家。
- [ ] SIT_OUT 玩家重新 Ready 时只加入下一手候选；重复暂离、取消/恢复 Ready、刷新和事件重放不会创建两个状态转换或中途发牌。
- [ ] 非 all-in ACTIVE 玩家请求 `LEAVE_TABLE` 后，新的玩家 prompt、AI wake、迟到 assistant 输出和 UI 动作立即被 binding privacy fence 拒绝；权威状态机仅在该席下一个合法行动点 forced fold 一次，已投入筹码保留且其他玩家当前行动不被打断。
- [ ] all-in 玩家 leave 后当前手主池/边池与摊牌照常结算；已 fold 玩家不重复 fold。HAND_SETTLED 后两者都只产生一次 `VOLUNTARY_SEAT_RELEASED`，不会退款、回滚或泄露未公开底牌。
- [ ] WAITING/SIT_OUT 席 leave 可立即释放；所有释放路径都吊销 seat/recovery/UI capability、删除本机 session-seat secret 并恢复任务普通私密语义，旧凭据重放稳定失败且不会进入 120 秒恢复窗口。
- [ ] leave 请求遇到网络失败时，本机任务保持 `LEAVE_UNCONFIRMED_PRIVATE` 并幂等重试；期间任何普通输入都不会误发到牌桌。恢复后恰好归约到一个 LEAVE_PENDING/RELEASED 结果。
- [ ] 同一 session 在旧 binding 非 UNBOUND 时加入另一 room/seat 被本机稳定拒绝；旧席完全释放后可建立一个新 binding。不存在原子 switch、双席凭据、双 `SEAT_AI` 或旧 generation 迟到公开。
- [ ] 从固定 Git ref Marketplace 安装后，插件版本、来源、Hook/MCP/UI 清单和卸载入口可见；未审阅信任 Hook 时首次 create/join 明确停在 SETUP_REQUIRED，权威服务没有新房间/席位/公开事件。信任变更后必须重新 preflight，不能沿用失败缓存冒充已就绪。
- [ ] 全新专用任务发送 `@tokengame create` 时，第一次在同一向导完成本机资料和公开公告确认并恰好创建一个房间/WAITING 席；取消任一步骤后保持 UNBOUND。相同 create request_id 的刷新与重试返回同一结果，不产生第二个房间。
- [ ] 创建响应在任务内牌桌展示 `Copy invite`；复制内容只含短期 room invite。日志、模型输入、URL 和对手事件均不含 seat/recovery secret、Codex session_id 或底牌。
- [ ] 三个不同未绑定 Codex 专用任务可分别用同一有效 invite 加入余下三席，并各获不同 seat/recovery credential；房满后的下一次兑换稳定返回 ROOM_FULL。重复 join request_id 只恢复原席，不占第二席。
- [ ] invite 过期、房间销毁、版本不兼容、无空席或当前 session 已绑定时，join 在建立公开路由前失败并给出稳定原因；失败任务的后续普通输入仍保持私密。
- [ ] 已保存本机资料的玩家在下一房间不必重新填写资料，但必须重新确认新 binding 的公开公告；ruleset_hash 改变时旧确认不能复用。
- [ ] join 成功只进入 WAITING，不自动 Ready；两席分别点击 Ready 后才出现唯一 3 秒倒计时。创建者与加入者拥有相同 Ready、动作、聊天和离桌权限。
- [ ] `@tokengame` 无参数在 INSTALLED/SETUP_REQUIRED/UNBOUND/WAITING/ACTIVE/SIT_OUT/LEAVE_PENDING 等状态下只返回正确状态和合法控制，不创建副作用；普通自然语言不会误触 create/join。
- [ ] `PLAYABILITY_GATE_V1` 自动化从空服务创建动态房间，让四个独立 session 通过同一 invite 占据四个不同席位并连续完成至少 10 手；每手四视图公共状态摘要一致、总筹码守恒，错误/重复/陈旧请求均按稳定 reason_code 幂等归约。
- [ ] 自动化故障矩阵至少覆盖 AI silent、合法 public、同手跨街迟到、跨手丢弃、模型失败、dirty 合并、AI OFF、玩家断线恢复、恢复 TTL 到期、sit-out 与主动 leave；所有路径只保留每席一个 AI 上下文且没有重复发言、重复动作或旧 generation 回流。
- [ ] 隐私金丝雀测试证明任何对手未公开底牌、其他任务文本、seat/recovery/UI secret、Codex session_id 和隐藏推理都不会进入错误模型输入、公开事件、净化日志、URL 或对手视图；发现一次即整体验收失败。
- [ ] 真实目标 Codex Desktop 至少完成一次 prompt/权威事件→同席模型评估→`silent | public_speech`→四视图投影闭环，并对 `SAME_VISIBLE_TASK_SPIKE_V1` 形成可复现 PASS 能力矩阵；若关键门禁 FAIL，则只按既定单协调器回退重跑，不存在双 AI 上下文。
- [ ] 验收产物包含机器可读结果、净化事件日志、四视图状态 hash、关键截图、控制台报告和运行能力矩阵；浏览器/组件没有未解释错误，P0 定义为隐私/凭据泄漏、筹码或权威状态错误、越权动作，P1 定义为标准 create→join→Ready→连续牌局或公开 AI 核心闭环不可稳定完成。
- [ ] 运行报告导出 install→Hook trust→preflight→create/join→Ready→首手的耗时/失败原因，以及 AI eligible/start/coalesced/silent/public/late/dropped/cancelled/failed 计数；事件→启动、启动→终态、终态→公开、公开→四视图渲染分别给出 p50/p95/最大值，不用未经测量的固定 SLA 判定首轮失败。
- [ ] 一次四真人封闭试玩中，四人分别使用自己的 Codex 专用游戏任务和独立席位，在最长 45 分钟内完成至少 10 手；模拟事件或一人多窗口不能计入真人签字，技术原因未完成 10 手即记录为失败。
- [ ] 真人试玩至少出现一次非主人当轮输入直接触发的合法 AI public_speech、一次 silent 和一次玩家—所属 AI 公开往返；四名参与者均能识别真人/AI/系统三类信息及任务默认公开边界。
- [ ] 试玩结束没有未解决 P0/P1；匿名逐人记录中至少 3/4 表示愿意立即再玩一场，至少 2/4 能描述 AI 发言对下注判断、诈唬解读或桌上互动的具体影响。结果标注为形成性 MVP 证据，不外推为留存率或市场验证。

### 路线图验收草案（不属于 MVP-0）

- [ ] OWNER_PRIVATE 内容只投影给所属玩家与 AI；LOCAL_CONTROL 命令既不公开，也不扣除私密咨询额度。
- [ ] 第 1、2 手结算不刷新私密额度；第 3 手 HAND_SETTLED 后恰好刷新一次，事件重放或重连不会重复刷新。
- [ ] 额度耗尽后的第 11 次 OWNER_PRIVATE 由服务端确定性拒绝；下一 quota_epoch 恢复为 10，上一周期剩余额度不结转。
- [ ] 私密请求被权威服务接受时，四个玩家视图同步看到正确席位和扣减后的剩余额度，但只有所属玩家视图能读取提示与回答正文。
- [ ] 任一玩家隐藏某席聊天后，仍能看到该席的私密咨询状态和剩余次数；公开状态中不存在可反推出私聊正文的字段。
- [ ] 行动者和非行动者均能发起 OWNER_PRIVATE；同席已有私密请求生成中时，第二个请求被确定性拒绝且不影响行动时钟。
- [ ] 私密回复跨街或跨手到达时只向所属玩家显示，并明确标识所依据的旧 hand/street/revision，不自动执行或建议为当前合法动作。
- [ ] 接受前校验失败不扣额度；接受成功立即扣减并同步四视图。无可交付回答的模拟系统故障恰好退款一次，重试不会重复退款。
- [ ] 用户取消、策略拒绝和过期回答不退款；退款后迟到回答被丢弃。跨 quota_epoch 的旧请求故障不会把新周期余额增加到 10 以上。
- [ ] 四席分别绑定不同 game_thread_id；刷新/断线后同一玩家可恢复原绑定，不能恢复或读取其他席线程。
- [ ] 在普通编码任务中放入隐私金丝雀后，任一游戏线程输入、公开事件和私密投影均不包含该金丝雀。
- [ ] 模拟 App Server/线程故障时牌局状态机与倒计时继续推进，所有视图一致显示该席 AI 离线，且不存在外部 API 回退调用。
- [ ] 白名单中的 source event 对每席最多创建一次评估，模型返回 silent 时不产生空气泡；非白名单 check/call/fold 不唤醒无关席 AI。
- [ ] B 没有输入时，A 的真人公开话术或关键 raise 仍可使 Kitty 获得一次主动评估资格；Kitty 是否开口由档案和模型决定。
- [ ] AI 公开发言不会直接触发另一 AI 回合；重复/重放同一 source_event_id 不产生第二次评估。
- [ ] 修改 AgentProfile 的人设不能扩大结构化权限；尝试配置对手底牌、任意文件/网络或越过桌规的字段被拒绝并给出稳定原因码。
- [ ] 两个 AI 使用相同昵称或头像时，所有气泡和状态仍能通过席位标识无歧义归属；保留系统身份名称不能被注册。
- [ ] 选择安静/均衡/张扬预设后得到可重复的版本化配置；高级覆盖只能缩小或在桌规允许范围内开启能力，resolved_snapshot_hash 可用于回放复现。
- [ ] 更新预设定义不会改变已经保存的旧档案；schema 迁移失败时保留原文件并安全回退，不以默认值悄悄扩大权限。
- [ ] persona_summary 中尝试覆盖隐私、配额、工具或动作规则的文字无效，且不会进入对手投影或作为可执行指令。
- [ ] OPEN_CAPABILITY 与 HONOR_MATCHED 均不为公平性锁定而发送 model/effort/provider 覆盖；HONOR_MATCHED 在每次模型回合前、线程恢复/重连后和周期检查点读取稳定 App Server 结构化字段并生成检测状态，两种策略有明确且不可混淆的测试路径。
- [ ] 公共牌桌状态、事件和回放不把未经验证的模型/provider 名称呈现为事实；自定义 provider 协议失败时只把该席 AI 标为离线，牌局继续。
- [ ] 回放可以重现授权输入、最终输出和动作序列，但文档与 UI 不承诺重现模型隐藏推理或确定性再生成。
- [ ] OPEN_CAPABILITY 入桌与回放明确表示能力不受 TokenGame 检测；HONOR_MATCHED 未确认公告或未完成要求检测的玩家不能进入公平队列，确认后所有视图持续显示“检测不保证”。
- [ ] HONOR_MATCHED 使用 model/list、config/read、thread start/resume 返回值及协调器持有的 turn/start 请求生成最小化 detection receipt；目标、ruleset、线程或信号变化后旧 receipt 变为 STALE 并触发重新检测。
- [ ] detection receipt 与公共事件不含配置原文、密钥、认证信息或中转端点；对手只能看到 MATCH/MISMATCH/UNAVAILABLE/STALE/TAMPER_SUSPECTED 等状态和必要时间，不读取原始本机配置。
- [ ] 模型自述、输出风格、响应速度、牌局胜率或挑战题结果均不能把 MISMATCH/UNAVAILABLE 提升为 MATCH，也不能单独形成处罚证据。
- [ ] 即使检测为 MATCH，任何 API、HUD、公告、回放或排行榜也只描述为“通过 TokenGame 可见信号检测”，不得使用“真实模型已验证”或等价保证；ruleset_hash 改变后必须重新确认和检测。
- [ ] 入桌前错配只拒绝目标队列且不扣信用；赛中 confirmed higher-than-ceiling 在任何新 AI 回合发出前被拦截，产生唯一幂等的 INTEGRITY_VIOLATION、踢出意图与信用处罚事件。
- [ ] UNAVAILABLE、STALE、瞬时读取失败和单一矛盾信号只使 AI 进入“复检中”并按有界策略重试，不生成重信用处罚；恢复为合规状态后可按桌规继续。
- [ ] 赛中确认违规后席位恰好一次进入 EJECT_PENDING；在途公开/私密 AI 输出、玩家聊天和后续动作均被拒绝，四个视图一致显示“完整性违规 · 待移出”，且不泄露原始检测配置。
- [ ] 未 all-in 的违规席只能在其下一个合法行动点自动 fold；下注轮不会因越序 fold 分叉，已投入主池/边池筹码不退，整手不回滚。
- [ ] 已 all-in 或结算前不再获得行动点的违规席按标准牌面、主池和边池规则完成当前手；HAND_SETTLED 后才移除，正常胜负和筹码结果不会被检测事件重写。
- [ ] 刷新、断线、重连、重复检测、事件重放和迟到模型回调不会取消 EJECT_PENDING，也不会重复 fold、发布迟到输出、返还已耗私聊额度或重复执行同一 penalty_event_id。
- [ ] 首次 confirmed higher-than-ceiling 只降低公平完整性等级并产生临时 Restricted；同一策略版本与滚动窗口内的第二次确认违规产生严格更重的公平场限制，其他信用维度保持不变。
- [ ] 同一 penalty_event_id 被重复投递时只产生一次 strike 和一次等级/限制变更；处罚策略版本更新不追溯重算历史，纠错或申诉恢复通过独立幂等事件生效且保留原审计链。
- [ ] 单次 confirmed higher-than-ceiling、普通举报、UNAVAILABLE、STALE 或单一矛盾信号均不能自动产生永久封禁；所有处罚视图能解释 reason_code、当前等级、限制状态及尚待确定的恢复/申诉入口。
- [ ] Restricted 玩家在 cooldown_not_before 前不能加入 HONOR_MATCHED，但仍能进入 OPEN_CAPABILITY；其自由场牌局不计恢复进度。冷却到期只转为 Caution，不会因刷新、重启、客户端改钟或重复计时事件直接恢复正常。
- [ ] Caution 玩家仍被 HONOR_MATCHED 公共池和私人公平房拒绝；在普通 OPEN_CAPABILITY 中，每个 hand_id + betting_street 最多产生一个合格动作候选，fold/check/call/bet/raise/all-in 均可计，盲注、超时/自动动作、聊天、拒绝/重复请求和非 Caution 动作均不计。
- [ ] 同一合法牌局状态下，玩家按钮/结构化命令与“接受 ADVISOR 建议后另行确认”生成 MANUAL 候选；AUTOPILOT 自主提交只改变牌局状态而不增加恢复进度，客户端伪造 manual 标记会被拒绝或按权威来源归类。
- [ ] 模式切换、动作重放或后改元数据不会把已记录 AUTOPILOT 动作追溯转换为 MANUAL；对相同 action_id 的 MANUAL/AUTOPILOT 冲突投影不会产生两份候选或 credit。
- [ ] 相同 MANUAL 动作分别发生在官方 PUBLIC_OPEN_POOL、私人邀请房和开发桌时，只有带有效 recovery_eligible 凭证的公共桌候选可以在结算后入账；直接加入、房主改标或客户端伪造 true 均不能获得 credit。
- [ ] table/ruleset/match 凭证不一致、资格签名无效或恢复服务暂不可验证时按“不计恢复分”处理，不阻止合法自由场牌局继续，也不追溯撤销此前已由有效凭证结算的 credit。
- [ ] 本地 MVP 可用 LOCAL_SIMULATION fixture 覆盖 eligible/ineligible 两条路径，但所有状态和 UI 均明确不可迁移为正式平台信用。
- [ ] LOCAL_SIMULATION 可通过注入时钟和测试 fixture 快速演示 60 秒冷却、5 个 MANUAL credits、重复 strike 升级及恢复；测试无需真实等待，且 fixture 值不会出现在 production policy loader 的 fallback 链中。
- [ ] PRODUCTION 缺少有效 policy_version 时返回 POLICY_UNCONFIGURED，不创建正式长期等级/Restricted/恢复进度，也不读取本地模拟状态；同一场景下当前手 EJECT_PENDING、强制 fold 和移出仍正常完成。
- [ ] LOCAL_SIMULATION 与 PRODUCTION 的事件、存储键、UI 标识和导出字段可被测试明确区分；把本地事件提交给生产归约器会被拒绝，而不是转换为正式 strike 或 credit。
- [ ] 同一 Caution 玩家在两个有效公共 match 中遇到完全相同的对手组时，满足其他条件的 MANUAL action credits 按相同规则累计，不因重复对手被衰减或封顶；对手引用仅进入私有审计，不进入公开徽章或理由。
- [ ] 新 policy_version 将来即使引入重复对手限制，也不会重算、撤销或降低旧版本已提交的 credits；普通重复匹配本身不能自动生成合谋处罚或举报成立结论。
- [ ] 合格动作候选只在对应 HAND_SETTLED 后以 action_id 幂等入账；同街多次 raise、事件重放、跨端重复提交、异常作废和恶意中离不会增加第二份或未结算 credit，累计进度可以跨正常牌桌/会话保留。
- [ ] 达到 required_action_credits 后恰好一次触发 RECOVERY_COMPLETED 并解除信用准入限制，但不生成/复用 MATCH receipt；下一次公平场申请仍完整执行公告确认和入桌检测。
- [ ] 自由场使用高能力模型不会生成公平完整性 strike；Caution 期间若另有满足合同的确认事件则中止进度并升级 Restricted，成功申诉则通过独立幂等反向事件立即撤销错误限制和 strike 影响，同时保留完整历史。
- [ ] 四个玩家视图对同一席位看到一致的粗粒度 reputation_badge、fair_access_state 和来源标记；任何对手快照、事件、回放或导出均不含精确分数、strike 数、历史原因、证据、冷却截止时间、恢复进度或申诉内容。
- [ ] 所属玩家能看到自己的净化后处罚原因、冷却与恢复详情；把该 OWNER_PRIVATE 响应重放、断线恢复或切换到对手身份均不会把详情升级为 TABLE_PUBLIC。
- [ ] confirmed 违规当手只公开“完整性违规 · 待移出”及必要状态迁移，不附带历史信用详情；徽章/fair_access_state 的后续变化不直接执行 fold、call、raise 或修改下注状态。
- [ ] 在无账户、无网络条件下，本地模拟器能用同一策略版本演示首次与重复 confirmed 事件、应用启动后恢复模拟状态，并通过显式开发控制重置；重复事件仍保持幂等。
- [ ] 所有本地信用 UI、导出和日志均明确标记 LOCAL_SIMULATION/非平台信用；它不阻止玩家通过清除本机数据重置，也不会被后续远程服务无验证地接纳为正式处罚。
- [ ] 即使本地长期信用模拟器不可用，当前手的 EJECT_PENDING、下一个合法行动点强制 fold、HAND_SETTLED 后移出仍可独立完成；长期模拟写入失败产生可审计错误但不回滚牌局。
- [ ] 两名 detected_class 均不高于 table_ceiling、但基础档位和合法记忆/工具/社区模块配置不同的玩家都能在各自偏好允许时加入 HONOR_MATCHED；入桌公告明确弱模型可能主动上浮且养成能力不同，UI 不出现“AI 能力相同”的承诺。
- [ ] 两席使用不同合法能力配置时，其对手可见牌桌快照、公共事件、公开回放和排行榜均不包含 capability 开关、模块 ID/名称/版本/数量、记忆状态、工具清单或托管模式；差异只能通过玩家自行观察公开言行进行推测。
- [ ] 所属玩家能查看自己的期望配置与有效配置；任何对手 API/投影均不能读取这些字段。模块错误和工具调用结果跨席发布前不会通过错误码、日志文本或调试字段泄露具体能力。
- [ ] 入桌公告明确说明“能力可能不同且默认隐藏”；AI 在线/离线、思考中、公开输出、动作和私聊余额等既定公共比赛事实仍正常同步，不因能力隐藏而消失。
- [ ] HONOR_MATCHED 的各席获得相同 TokenGame 服务端行动时钟、触发预算和聊天配额；账户额度、宿主限速或中转故障只按该席运行状态呈现，不被宣传为已由 TokenGame 公平化。
- [ ] 公共入口使用同一版本 capability catalog：detected_class 等于或低于 table_ceiling 且位于玩家 allowed_ceiling_range 时可入桌；高于 ceiling 时始终拒绝。边界、相等和不可比较组合均有确定性测试。
- [ ] exact_only 玩家只等待当前精确 ceiling；启用 timeout_upshift 后，超时只把票据加入预先确认的更高 ceiling 队列，不改变玩家 Codex 配置，也不会让高模型进入低 ceiling 场。
- [ ] capability catalog 没有明确可比较关系的跨家族/自定义 provider 组合返回 INCOMPARABLE，不会根据字符串、价格或临时基准自动排序。
- [ ] 房主可创建带自定义 model/effort 文本的未公开私人房间并通过邀请加入；该房间不会出现在标准公共匹配池，也不会获得平台标准配置标识。
- [ ] 标准目录条目或 capability 排序更新不会改变既有队列快照、已开始牌桌、公告确认或历史回放；停用条目可以阻止新排队，但保留旧版本可解释性。
- [ ] 匹配和入桌流程存储目标标签、目录版本、确认记录与净化后的 detection receipt；记住上次选择不能绕过每桌重新确认/检测，原始 config/provider 凭据不得发送到牌桌服务。
- [ ] 一次玩家提交的“模型不一致”举报只创建 allegation 与证据包，不自动处罚；只有 TokenGame 自身满足复核合同的 confirmed higher-than-ceiling 事件能触发本局踢出/信用处罚，二者具有不同事件类型和审计路径。

## 完成定义

- PRD 中 MVP-0 的范围、协议、失败行为与验收门禁全部锁定；新增行为均有协议版本、稳定 reason_code 和迁移/回退说明。
- 补充协议、配额、幂等、上下文裁剪、隐藏设置、故障注入和隐私金丝雀测试。
- `npm test`、四窗口浏览器 smoke、控制台检查、桌面/窄屏视觉检查及 `PLAYABILITY_GATE_V1` 自动化层全部通过。
- 文档明确区分官方牌局事实、概率估算、语言判断、玩家动作与本地隐藏。
- 若新增模型调用或真实四会话绑定，必须单独核算成本、延迟、会话身份与故障降级。
- `SAME_VISIBLE_TASK_SPIKE_V1` 必须先形成可复现的能力矩阵和 PASS/FAIL 结论；只有通过或执行已定义回退后，才进入多人 MVP 集成。
- 完成一次符合 `PLAYABILITY_GATE_V1` 的四真人试玩并留存净化报告；所有 P0/P1 已关闭，复玩与 AI 影响门槛达到约定值。

## 明确不在当前任务范围

- 重做德州扑克规则、下注结构、座位轮转或结算。
- OWNER_PRIVATE 私密咨询、长期记忆/复盘学习、AI 进化模块与社区市场。
- ADVISOR/AUTOPILOT 及任何 AI 自动替玩家提交牌局动作。
- 能力公平场、模型档位检测、举报、信用处罚、恢复和申诉体系；已有细化只作为路线图设计存档。
- 读取对手未公开底牌、隐藏推理、其他 Codex 会话或本地私有文件。
- 生产真钱、正式经济系统、真实全局账户处罚、远程身份/反多账号、申诉运营后台、全量内容审核和跨设备隐藏设置同步。
- MVP-0 暂不实现公开大厅、自动匹配、可搜索房间目录、正式账户、排行榜和长期房间/战绩存储；它们是已确认的后续产品阶段，而非永久排除项。
- universal plugin directory 的正式提交、审核、商业化上架与自动更新运营不属于 MVP-0；封测使用固定 Git ref Marketplace，但插件包和协议不得依赖只在开发仓库存在的秘密路径。
- 安装级稳定匿名身份、跨房间身份关联、正式登录、账号恢复、好友关系和任何可迁移信用；本机显示偏好不视为服务端身份。
- 自研 Codex 客户端、修改 Codex Desktop 本体、把实验性 App Server WebSocket 暴露到公网，或把独立浏览器牌桌冒充为已实现的任务内嵌 UI。
- 无限 `Stop` continuation、定时空转模型轮询、同时运行可见任务 AI 与后台影子 AI，或在尖峰失败后仍把同任务主动发言标为可用。
- `@tokengame action ...`、自然语言出牌、语音出牌或模型代替玩家调用扑克动作；这些不得作为 MVP-0 的隐藏捷径。

## 技术说明

- 既有 AI 窗口：`src/authority/event-store.cjs`。
- 既有四人牌桌与事件投影：`src/authority/table-store.cjs`、`src/authority/server.cjs`、`web/app.js`。
- 既有 Codex 桥与 Hooks：`src/bridge/`、`plugins/tokengame/`。
- 既有四窗口验收：`test-support/four-player-smoke.mjs`。
- 当前权威服务是 `127.0.0.1` 上的内存单固定桌，使用 HTTP/SSE、查询参数席位 token、宽松 CORS 和本地内部 token；它能复用德扑领域状态机，但不能直接暴露为公网私人房服务。
- 需要先研究成熟线上扑克聊天的屏蔽/反刷屏惯例，以及当前桥从“一席显式问答”扩展到“多席事件驱动公开对话”的最小安全边界。
- 当前 `plugins/tokengame/hooks/hook-lib.cjs::parsePublicPrompt()` 只识别三个显式公开前缀，普通 prompt 不进本地 IPC。要实现“专用游戏任务内自由文本默认公开”，需要由绑定状态感知的 Hook/App Server 协调层扩展捕获边界；不需要也不应增加一个意图分类模型，普通 Codex 任务必须继续零牌桌流量。
- 官方插件文档确认插件可在桌面端 Codex 使用并可包含带可选 UI 的 Connector；但 UI 快速入门明确以 ChatGPT iframe 为示例，没有在同一合同中保证所有 Codex/CLI 宿主同等渲染。因此 MVP-0 把目标 Codex 桌面版本的内嵌 UI smoke 作为硬验收，并保留一次性外部页面兼容路径。
- 官方 Hook 合同提供当前 `session_id`、`turn_id`、prompt 和最终 assistant message；当前仓库也已按 session/turn 写入 `PLUGIN_DATA` marker。席位映射应扩展该稳定字段，不读取不稳定 transcript 格式。
- 官方 Hook 合同还确认：同步 `Stop` 可返回 continuation 再开一个自动提示，而异步 Hook 在无活跃回合时只缓存输出到下一次用户回合，不能唤醒空闲任务。由此只能把 `Stop` 作为有界的牌局活跃期等待候选，不能把后台 Hook 当事件推送器。
- MCP Apps UI 的标准桥提供 `ui/message`，兼容别名为 `window.openai.sendFollowUpMessage`，但文档要求按能力检测；目标 Codex Desktop 对任务内 UI、无点击远端事件唤醒、折叠/卸载后的行为都必须做 smoke，不能从 ChatGPT iframe 示例直接外推。
- 当前 `TableStore.settleExpiredAction()` 已按服务端截止时间执行“可 check 则 check，否则 fold”；联机掉线不需要另造扑克动作，只需增加连接事实、手后 sit-out、恢复 TTL 和席位释放状态。
- 当前 `TableStore` 仍是构造即开手的固定 A/B/C/D 本地桌，没有成员加入、sit-out、主动 leave、seat release 或任务解绑状态；主动离桌必须新增独立状态机，不能把关闭 UI 或 120 秒掉线恢复当作实现。
- 当前仓库已有可安装插件 manifest、repo marketplace、Skill、Hooks 与 MCP server，且 0.145.0 真宿主探针验证了安装/卸载；但 Marketplace 仍以 host-probe 命名，运行依赖手工 `npm run table` 和独立 Web 页，没有消费者可用的 create/invite/join/Ready 首次运行向导。
- 官方插件合同要求用户单独审阅并信任捆绑 Hook；安装或启用插件不会自动授予 Hook 信任。首次运行必须把 `PLUGIN_INSTALLED`、`HOOK_TRUSTED`、公开桌规确认、session-seat binding 和 Ready 分成可观察状态，不能用一次安装授权替代全部确认。

## 研究结论与架构备选

### 临时私人房权威拓扑（已选择中立服务）

- **中立最小房间服务（已选择）**：一房一权威状态机，服务端持有牌堆并按席位投影；各玩家的 Codex 调用仍留在本机。MVP 邀请房与未来公开匹配复用同一房间运行合同，差别只在 seat ticket 的签发来源。需要最小 HTTPS/WSS 部署、房间生命周期和短期凭据，但没有参赛房主持有全桌底牌或断线即停桌的问题。
- **玩家本机房主**：最接近当前原型、部署成本最低，但房主可读取/修改完整牌局真相，房主断线会结束牌局，公网连接还需隧道/NAT 处理；只适合作为开发模式。
- **P2P/WebRTC**：仍需 signaling，复杂网络还需 STUN/TURN；秘密发牌和唯一权威问题没有消失，对四人低带宽回合制牌局收益不足，排除出 MVP-0 推荐路径。

### Codex 任务、插件 UI 与席位绑定（已选择任务优先）

- **任务优先（已选择）**：`@tokengame join <invite>` 绑定当前 Codex session；插件优先返回任务内 MCP Apps 牌桌组件，兼容性不足时才签发一次性外部页面。最符合“游戏在当前 Codex 任务中”的产品心智。
- **网页优先再配对**：先打开邀请页，再把一次性 code 贴回 Codex；兼容性高但步骤多、易绑错任务，只作为底层 fallback 机制。
- **独立 Web 主产品**：交付最容易，但不满足产品核心，不作为 MVP-0 成功定义。

### 玩家掉线与席位恢复（已选择严格方案）

- **时钟继续 + 120 秒席位保留（已选择）**：不增加行动时间；截止时自动 check/fold；手后 sit out，120 秒内可恢复原席，超时释放。与现有状态机和未来公开匹配最一致。
- **每手一次 30 秒保护 + 5 分钟保留**：移动网络更友好，但可被主动断网换取额外思考时间，并拖慢全桌。
- **整桌暂停最多 60 秒**：最照顾熟人局，但一个玩家即可冻结所有人，且与公开匹配终局不兼容。

### 每席单一 Codex 游戏上下文（已选择先做同任务技术尖峰）

- **A. 当前可见任务 + UI/Stop 唤醒（已选择先验证）**：玩家继续使用 Codex 主输入框；`UserPromptSubmit` 发布 TABLE_PUBLIC，内嵌组件以 `ui/message` 注入幂等内部 wake，模型结束时由 `Stop` 发布输出并可在有界窗口等待下一事件。它最符合原始体验，但依赖目标 Codex Desktop 未被文档保证的宿主行为；只有完整通过研究文档中的门禁才升格为 MVP 主路径。
- **B. 内嵌聊天框 + 协调器 App Server 线程（已指定失败回退）**：玩家桌聊从牌桌组件发布，本地协调器可靠驱动唯一专用线程。主动事件、取消和恢复最清晰，但主 Codex 输入框不再是默认桌聊入口。
- **C. 主输入框 + 被动 Hook（仅降级）**：只在玩家明确发消息后回答；改动小但不能满足 Kitty 无主人输入而主动开口，不是 MVP 成功路径。
- **D. 独立 Responses/Conversations API（排除 MVP）**：可服务化驱动多代理，但需要独立凭据和费用治理，违背“不单独配置、沿用玩家 Codex”的约束。
- 无论最终选择 A 或 B，每席只能有一个真实 `SEAT_AI` 上下文；不得同时运行“可见任务回答”和“后台主动 AI”再把两者拼接成一席。

### 主动离桌、暂离与换房（已选择双操作 + 串行换房）

- **A. 双操作 + 串行换房（已选择）**：`Sit out after hand` 在手后暂离并保留席位/任务绑定；`Leave table` 接受后立即停止该任务公开路由和 AI，live hand 在下一个合法行动点 forced fold、all-in 正常结算，手后释放席位并吊销凭据。新 `join` 必须等旧 binding UNBOUND。
- **B. 只允许本手后离桌**：离桌请求等 HAND_SETTLED 才生效，期间仍正常操作/公开；状态简单，但急退用户大概率直接关任务并退化成掉线占座。
- **C. 立即解绑并复用掉线恢复**：任务立刻私密，当前手按 deadline auto-check/fold，旧席再保留 120 秒；实现复用多，但主动离桌后仍占座和保留恢复权，会制造换房/旧席竞态。
- MVP 不提供原子 `switch room/seat`；任何换房/换席都应归约为旧席 leave 完成后再 join。未来公共匹配的 anti-ratholing、提前离桌处罚和选桌限制依赖稳定账户与持久筹码，不由临时身份假装执行。

### 安装、建房与邀请入口（已选择一次安装 + create/join 就地向导）

- **A. 一次安装，create/join 就地向导（已选择）**：开发期从固定 Git Marketplace 安装，正式目标从 universal directory 安装；用户单独审阅 Hook。新专用任务直接输入 `@tokengame create` 或 `@tokengame join <invite>`，首次缺失配置在同一响应的 preflight/向导卡补齐，Ready 仍在牌桌 UI 完成。
- **B. 先 `@tokengame setup`**：安装后必须完成显式 setup 才能 create/join；排障边界清楚，但增加一个用户步骤，直接点邀请时仍必须自动跳转 setup。
- **C. 插件首页 UI 优先**：从插件页面点击 Create/Join 并粘贴邀请；对新手直观，但最依赖 UI 宿主兼容，也不符合“一句 Codex 指令开局”的核心心智。
- 无论入口选择，插件安装、Hook 信任、公开桌规确认和邀请兑换都是独立状态；任何一项未满足都不能悄悄建立默认公开席位。普通开发任务永远不会因提到 poker 自动绑定。

### MVP-0 可玩性签字深度（已选择自动化硬门禁 + 一次四人真人试玩）

- **A. 自动化硬门禁 + 一次四人真人试玩（已选择）**：自动化覆盖动态房间、四 session、十手、AI silent/public/迟到/故障及退出恢复；再由四名真人各用自己的 Codex 任务完成至少十手，验证主动 AI、气泡归属和复玩意愿。性能首轮完整测量，不凭空设统一 SLA。
- **B. 只做技术 smoke**：两真人加模拟席完成三手即可；适合 CI，但不能证明四组真人/AI 语言博弈可玩。
- **C. 三轮四人试点**：至少三次四人十手 session 后再签字；证据更稳，但已超出最小闭环，显著延后 MVP。
- 无论选择哪一层，状态一致、筹码守恒、隐藏信息/凭据不泄漏、幂等、单一 AI 上下文和无未解释控制台错误都是零容忍门禁，不能用体验评分抵消。

## Research References

- `research/poker-chat-and-proactive-ai.md`：成熟扑克聊天惯例、规则差异、Codex 触发边界、三种架构与限流/隐藏建议。
- `research/private-memory-autoplay-modules.md`：默认公开/稀缺私聊三通道、记忆与微调边界、AI 托管、玩家档案及社区竞技模块安全模型。
- `research/honor-fair-report-reputation.md`：开放能力桌、公平场尽力检测、基础资源分档、入桌声明、举报证据层级、分维度信用与反滥用阶段边界。
- `research/codex-model-detection-boundaries.md`：Codex App Server 可用模型信号、入桌/运行中检测链、不可证明边界与三种执行强度。
- `research/natural-language-public-intent.md`：已被最新澄清取代的意图分类探索记录；仅用于解释为何 MVP 回归单一 SEAT_AI 事件循环，不作为实现规范。
- `research/private-room-authority-topology.md`：2–4 人临时私人房的中立权威、玩家本机房主和 P2P 三种拓扑；基于现有单写者牌桌结构推荐中立的一房一 actor 服务。
- `research/codex-plugin-ui-seat-binding.md`：官方插件 UI、Hook session、App Server 边界与现有桥接约束；选择 Codex 任务优先加入、内嵌 UI 主路径和一次性外部页面 fallback。
- `research/codex-visible-task-proactive-turn-boundary.md`：核查 `Stop` continuation、后台 Hook 空闲边界、MCP Apps `ui/message` 与 App Server；用户已选择先执行保留主输入框的技术尖峰，失败回退到内嵌聊天框 + 唯一 App Server 线程。
- `research/task-exit-rebind-policy.md`：现金桌 leave/sit-out 惯例、当前固定席代码缺口、Codex 公开路由收束和三种退出协议；用户已选择暂离/离桌分开并串行换房。
- `research/install-create-invite-flow.md`：官方插件分发/Hook 信任边界、当前 host-probe 安装事实与三种首次运行路径；用户已选择一次安装后由 create/join 就地完成首次配置。
- `research/mvp-playability-evidence.md`：区分现有四浏览器证据、零容忍机器门禁、AI 时延/沉默/迟到遥测与真人语言博弈证据；推荐自动化硬门禁后完成一次四人真人试玩。
- `research/disconnect-recovery-policy.md`：成熟牌室超时规则、现有 auto-check/fold 能力与三种掉线保护包；推荐时钟继续、手后 sit out、120 秒恢复窗口。
- PokerStars 当前手聊天规则：https://www.pokerstars.com/help/articles/rule-22-warning/10677/?ooac=1
- PokerStars 聊天与屏蔽规则：https://www.pokerstars.com/help/articles/chat-guidelines/ 、https://www.pokerstars.com/help/articles/chat-not-vsbl-help/
- GGPoker 桌面聊天功能：https://ggpoker.com/pt-br/blog/recursos-de-mesa-ggpoker/
- Codex Hooks：https://learn.chatgpt.com/docs/hooks
- Codex App Server：https://learn.chatgpt.com/docs/app-server#api-overview
- MCP Apps UI follow-up message：https://developers.openai.com/plugins/build/chatgpt-ui#prefer-shared-fields-and-methods
- OpenAI conversation state：https://developers.openai.com/api/docs/guides/conversation-state

## 已确认产品方向（实施阶段仍待逐项裁决）

### 1. 专用游戏任务中的默认公开

- 默认公开只适用于已经绑定并加入牌桌的专用 TokenGame 游戏任务；同项目中的其他 Codex 任务仍保持普通隐私语义。
- 协议确认拆为 TABLE_PUBLIC、OWNER_PRIVATE、LOCAL_CONTROL 三通道。
- 保存回放、切换频道、静音和查看配额等确定性控制不应消耗稀缺的私密模型咨询次数。
- 私密咨询上限确认为每席 10 次；每张桌累计完成 3 手结算后全桌统一刷新。使用状态和准确余额向全桌公开，正文私密；玩家在桌中时可随时使用，且不影响行动时钟。

### 1A. 主动 AI 触发与玩家档案

- 玩家公开文本在确定性校验后立即进入牌桌，不先区分“聊天/问 AI”，也不增加一个隐藏的 Codex 分类回合。
- 每席只有一个公开话术 AI 事件循环，持续读取真人公开消息、牌局动作/街道/行动窗口、最新权威状态和所属席私有牌面，自主返回 silent 或 public_speech；玩家问题不保证得到回答。
- 首轮 LIVELY_V1 保留玩家/AI 单条 140 字素、玩家每手 12 条且滚动 5 秒最多 3 条、AI 每手统一 8 条、AI 评估最小启动间隔 5 秒、气泡显示 10 秒；不再区分主动/响应子配额。
- 每席同时一个公开话术回合；忙碌/冷却期间的新相关事件合并为 latest dirty context，终态后至多基于最新快照跟进一次。AI 气泡进入上下文但不会单独唤醒其他 AI，失败不无界重试。
- 宿主模型/网络慢或离线只让该席 AI DEGRADED/OFFLINE，牌局、玩家聊天和手动动作继续；不静默切换外部模型。玩家可随时关闭 AI 纯手动游玩，重新开启不补跑关闭期间的逐条旧事件。
- 同手跨街迟到话术仍可公开并标注原街道，跨手迟到结果丢弃；网络质量影响 AI 表现，但永远不改变权威扑克动作。
- 上述单一 `SEAT_AI` 事件循环已锁定为 MVP 架构；意图分类和公开话术双管线不再作为候选方案。
- 用户可持久化配置 AI 的头像、昵称、人设、语气、主动程度、触发偏好、工具/记忆权限和未来托管权限。
- 表现偏好与系统权限分离；最终有效权限始终受官方安全上限和当前桌规约束。
- 配置交互采用安静/均衡/张扬/自定义预设加高级设置；预设和覆盖均版本化、可检查、可迁移，不开放能替代硬规则的完整原始提示编辑器。
- OPEN_CAPABILITY 与 HONOR_MATCHED 的模型、推理强度与 provider 都跟随专用 Codex 游戏任务宿主；HONOR_MATCHED 不锁定配置，但在每次模型回合前和关键生命周期点持续读取、比较 App Server 可见信号。第三方中转的真实上游映射始终无法由 TokenGame 保证。

### 2. TokenGame 记忆库

- 候选数据包括不可变牌局回放、合法公开数据派生统计、玩家私有复盘摘要与 AI 档案配置。
- “学习”首版定义为保存、统计、摘要和按需检索，不承诺修改 Codex 模型权重，也不保存模型隐藏推理。
- 对其他玩家的长期建模必须只使用合法可见数据，并在入桌规则中说明留存；市场发布前需要去标识化与数据许可。

### 3. AI 托管

- 候选档位为 OFF、ADVISOR、AUTOPILOT。
- 模型行动必须通过独立结构化协议提交，由权威牌局服务按最新 hand/revision/legal-actions 重新校验；公开气泡不能直接执行动作。
- 需要以后单独确定生成超时、非法输出、断线、过期回答和人工收回控制时的确定性行为。
- 主动语言施压是独立开关，受聊天配额、屏蔽与行为规范约束。

### 4. 基础运行时、玩家 AI 档案与社区竞技模块

- 官方基础运行时负责安装、入桌、牌局规则、交流路由、权限、回放和协议验证，确保原生 Codex 可以合法游玩。
- 玩家 AI 档案拥有独立人格、风险偏好、记忆索引、托管设置和模块清单。
- 社区模块候选能力包括声明式策略、对手建模、检索配置、概率计算器和未来的受限执行工具。
- 第一版市场不应直接运行陌生作者的任意 Skill/脚本；应先限定为有 manifest、版本、能力声明、哈希/签名、数据策略和统一评测的受约束策略包。
- 官方可以不提供高级竞技策略，但仍必须提供一个可测试的基线策略、模块验证器、安全边界与评测基准。

### 5. 可能的能力桌型

- OPEN_CAPABILITY：允许任意兼容 Codex 宿主和桌规允许的模块/工具，不声称模型或能力公平。
- HONOR_MATCHED（UI：公平场 · 检测不保证）：公布版本化 capability ceiling，玩家确认并通过 TokenGame 当时可见的结构化信号筛选；记忆、工具、社区模块、人格和托管配置允许不同，作为受模型能力上限约束的 AI 养成竞争。
- HONOR_MATCHED 具有双入口：公共标准池按版本化 capability ceiling 分组，并允许玩家选择 exact_only 或在指定范围内向更高 ceiling 单向兼容；私人自定义房间通过邀请加入，房主目标文本不进入标准池，也不获得平台标准标识。
- 弱模型可自愿进入高 ceiling 场，高模型不能进入低 ceiling 场；等待超时只能按预设向上扩展票据，不能静默混池或切换玩家模型。不可比较的模型组合默认不参与单向兼容。
- 赛中 confirmed higher-than-ceiling 立即关闭该席 AI/聊天并进入 EJECT_PENDING；在下一个合法行动点自动 fold，已 all-in 时正常结算，统一在 HAND_SETTLED 后移出，不回滚或改写当前手。
- 各席能力配置属于竞技秘密：对手看不到能力徽章、模块清单、记忆/工具/托管开关或配置摘要，只能根据公开发言与动作自行判断；入桌公告必须提前说明能力可能不同且隐藏。
- HONOR_MATCHED 持续显示“公平场 · 检测不保证”和检测状态，并明确“检测只覆盖 TokenGame 可见信号，不代表真实模型或 AI 能力相同”，不能只靠一次性弹窗营造虚假保证。
- HONOR_MATCHED 只统一 TokenGame 可权威执行的桌规和每席配额，不统一外部 Codex 账户额度、宿主限速或 provider 稳定性。

### 6. 举报与信用（路线图候选）

- 举报包自动附带 table_id、hand_ids、event seq、ruleset_hash、时间与相关公开聊天；举报人只选择类别并补充说明。
- 可核实行为、需人工判断行为和当前无法证明的模型配置怀疑必须分层；未经复核的报告不直接处罚。
- 信用建议拆为 reliability、conduct、honor_history、community_feedback，而不是把所有报告累加成一个分数。
- confirmed higher-than-ceiling 只作用于 honor_history/公平完整性维度，并采用首次重降级加临时 Restricted、滚动窗口内重复违规逐级加重、可恢复可申诉的策略；不因一次尽力检测事件永久封禁。
- 处罚记录保存 policy_version、唯一事件 ID、证据摘要、strike 序号、前后等级、限制条件和恢复/申诉状态；具体扣分与期限要在信用量表和遥测基础上版本化配置。
- 自然恢复采用 Restricted 冷却期 → Caution 自由场观察期 → 累计 qualifying action credits 后恢复公平场申请资格的两阶段路径。合格动作须由权威状态机接受，每手每下注街最多一份，并在 HAND_SETTLED 后入账；自由场动作不证明模型合规，重新申请公平场仍须完整检测。中途出现新的有效公平完整性事件会重新升级 Restricted，成功申诉作为纠错可直接撤销错误后果。
- 只有 MANUAL 玩家动作可产生恢复 credit；ADVISOR 建议需玩家独立确认提交，AUTOPILOT 动作不计。动作来源由权威输入链确定，客户端声明不能改变。
- 只有官方 PUBLIC_OPEN_POOL 且 recovery_eligible 的自由场动作可恢复；私人/好友/自建/开发/离线桌不计。后续信用原型只用不可冒充正式信用的 LOCAL_SIMULATION fixture 验证合同。
- 公共匹配中的重复对手不触发 action-credit 上限、衰减或不同对手门槛；这是为早期队列流动性接受的对刷风险，对手关系只做私有审计留痕，不自动处罚。
- 后续信用原型只运行 LOCAL_SIMULATION 加速 fixture（示例默认 60 秒冷却、5 个 MANUAL credits）；生产策略保持 POLICY_UNCONFIGURED，不允许测试值回退或迁移为正式处罚。
- 对外只展示 New / Established / Caution / Restricted 粗粒度徽章、公平场准入状态与信用来源；处罚证据、strike、精确数值、冷却/恢复进度和申诉记录仅本人或授权治理视图可见。
- 当前本地原型实现 report envelope、处罚事件、版本化策略归约与可重置的本地模拟，但不实现依赖远程账户、反多账号、人工复核和申诉的真实全局信用处罚；任何界面必须明确本地模拟不可信、可被重置。

## 待讨论顺序

- 无；需求发现阶段已收敛，等待最终确认后进入实施准备。

## 已确认决策（ADR-lite，2026-08-26）

**Context**：用户提出牌局内默认公开、稀缺私聊、长期记忆、AI 托管和社区竞技模块。它们跨越聊天协议、模型运行、数据留存、权威动作与供应链安全，需要先建立共同边界。

**Decision**：

- 当前交付范围锁定为 MVP-0：标准德扑、四席公开聊天、每席单一 `SEAT_AI`、座位聊天气泡、手动动作、AI OFF 和宿主降级状态。OWNER_PRIVATE、记忆、ADVISOR/AUTOPILOT、市场、公平场与信用均为后续路线，不能作为 MVP-0 依赖或验收项。
- MVP-0 的真人验证采用 2–4 人临时私人房；各玩家使用自己的 Codex 专用游戏任务与本地 AI，通过短期邀请和席位凭据连接同一权威牌桌。公开大厅、自动匹配、账户、排名和长期房间持久化明确延后。
- 公开大厅与自动匹配是已确认的正式产品目标，私人房仅是 MVP-0 验证入口。MVP-0 因此直接采用中立权威房间服务，并把发现/配对与房间运行解耦：当前由邀请签发 seat ticket，未来由匹配器签发同类 ticket。
- MVP-0 服务端身份仅在单个房间内有效；本机可保留昵称、头像与 AI 人设偏好，但这些不产生跨房间玩家 ID、账户、战绩或信用。房间销毁或恢复窗口结束后，seat/recovery 凭据失效。
- 加入采用 Codex 任务优先路径：`@tokengame join <invite>` 绑定当前 session，插件优先在任务内返回牌桌 UI；宿主 UI 不兼容时才使用一次性 handoff 页面。席位 secret 留在本机协调器，远端房间服务不接收 Codex session_id，App Server 不暴露到公网。
- MVP-0 只允许牌桌 UI 提交结构化扑克动作；所有任务自由文本和 AI 话术均无动作效力，且模型可见工具没有扑克动作权限。LOCAL_CONTROL 只承担加入、退出、AI 开关和状态查看。
- 玩家掉线采用 `DISCONNECT_STRICT_V1`：行动时钟继续且无额外保护，截止后 auto-check/fold；手后 sit out，120 秒恢复 TTL 后释放席位。AI 网络状态与玩家连接状态严格分离，可参与席不足两人只暂停下一手。
- 房间采用 Ready 开局：至少两席 Ready 后权威倒计时 3 秒；未 Ready 席旁观且不阻塞。HAND_SETTLED 后 ACTIVE/READY 席不少于两名则自动连续开手，中途加入/恢复者只从下一手进入。
- 只有专用 TokenGame 游戏任务在入桌后默认公开；不改变同项目其他 Codex 任务的隐私语义。
- 采用 TABLE_PUBLIC / OWNER_PRIVATE / LOCAL_CONTROL 三通道，确定性本地控制不占用私密模型额度。
- 每席 OWNER_PRIVATE 每个周期 10 次；同桌每完成 3 手权威结算后统一切换 quota_epoch，未用额度不结转，重连或重放不重复刷新。
- OWNER_PRIVATE 使用状态与准确剩余次数是全桌一致且不可静音的权威资源；提示和回答正文仅进入所属玩家的私密投影。
- OWNER_PRIVATE 可在玩家仍入桌的任意时点发起，每席最多一个 pending；牌局照常推进，晚到答复携带旧状态标识且无动作效力。
- OWNER_PRIVATE 在权威接受时先扣额度；仅无可交付回答的系统故障幂等退款。用户取消、内容拒绝和过期答复不退款，退款不能跨 quota_epoch 结转。
- 记忆采用本地回放、统计、摘要和检索，不把它描述为 Codex 权重微调。
- AI 托管按 OFF / ADVISOR / AUTOPILOT 分层；动作提案与公开话术分离，权威服务始终重验动作。
- 官方提供基础运行时、基线策略、验证器、安全边界和统一评测；玩家档案与社区竞技模块承载差异化能力。
- 社区市场首版只接受受约束、可声明能力的策略包，不直接信任陌生作者的任意 Skill 或脚本。
- 每席使用单一、可恢复的 Codex 游戏上下文和本地事件协调器；游戏上下文与普通编码任务隔离，故障时不静默切换运行来源。当前可见任务还是协调器 App Server 线程作为实际承载，须由同任务主动回合技术尖峰决定；绝不双跑两个 AI 上下文。
- 先执行 `SAME_VISIBLE_TASK_SPIKE_V1`，验证主输入框 + MCP Apps `ui/message` + 有界 `Stop` continuation；全部关键门禁通过才采用当前可见任务主路径。失败则切换到牌桌聊天框 + 协调器唯一 App Server 线程，并明确改变后的公开输入语义。
- 主动退出采用 `VOLUNTARY_EXIT_V1`：本手后暂离保留席位与公开任务绑定；立即离桌先建立本机隐私栅栏，再在权威合法行动点 fold/等待 all-in 结算，手后吊销全部席位凭据并恢复任务私密。换房/换席只能在旧 binding UNBOUND 后重新 join。
- 首次运行采用 `INSTALL_CREATE_JOIN_V1`：封测固定 Git Marketplace、正式目标 universal directory；安装和 Hook 信任独立确认。新游戏任务直接 `@tokengame create`/`join`，首次资料与公开公告就地补齐，邀请兑换独立席位，最终 Ready 只能由 UI 明确提交。
- MVP-0 最终签字采用 `PLAYABILITY_GATE_V1`：零容忍自动化门禁全部通过后，再完成一次四真人、四 Codex 专用任务、至少 10 手的封闭试玩；无未解决 P0/P1，至少 3/4 愿意立即复玩且至少 2/4 能指出 AI 话术的具体影响。首轮完整采集性能分位与迟到/丢弃数据，但不凭空承诺统一绝对时延 SLA。
- 主动 AI 使用关键事件白名单且允许 silent；玩家拥有结构化、版本化 AgentProfile，外观/人设不能突破桌规、隐私和工具权限上限。
- AgentProfile 采用预设加高级设置并保存可复现的有效快照；预设升级或迁移失败不得静默扩大能力。
- 模型层按桌型分离：OPEN_CAPABILITY 保持宿主透明；HONOR_MATCHED 不锁定宿主配置，但在每次 AI 回合前和关键生命周期点读取 App Server 结构化信号、生成最小化 detection receipt 并持续复核，不把本机可伪造信号描述为真实上游模型证明。
- 产品路线图提供 OPEN_CAPABILITY 与 HONOR_MATCHED；后者是针对基础模型/推理强度上限的版本化确认加尽力持续检测，而非成品 AI 能力对齐或可信执行证明。HONOR_MATCHED 同时提供 capability ceiling 公共池和邀请制私人自定义房间；低能力玩家可在自选范围内向上匹配，高能力玩家不得向下进入低 ceiling 场，超时扩池也只能按预设向上发生。赛中 confirmed higher-than-ceiling 会阻止后续 AI/聊天并进入 EJECT_PENDING：未 all-in 者在下一个合法行动点自动 fold，已 all-in 者正常结算，HAND_SETTLED 后幂等移出并执行信用处罚；暂时不可检测不视为作弊。该处罚只作用于公平完整性维度，采用首次重降级与临时 Restricted、滚动窗口内重复升级、可恢复可申诉的策略，单次事件不永久封禁。自然恢复为 Restricted 冷却后进入 Caution，再仅在官方公共匹配自由场按“每手每下注街最多一次、结算后入账”的 MANUAL 合法动作累计完成观察期；ADVISOR 必须由玩家确认，AUTOPILOT、私人/好友/自建/开发桌不计，重复公共对手不衰减或封顶。这不证明模型合规，只恢复公平场申请资格，下一次仍须完整检测。成功申诉可独立纠错。对手只看到粗粒度信用徽章和准入状态，本人/授权治理视图才可读取处罚与恢复详情。后续信用原型只以未来兼容的版本化事件和 LOCAL_SIMULATION 可重置 fixture 验证长期信用状态机，不将本机结果冒充全局信用；正式策略保持 POLICY_UNCONFIGURED，真实执行延后到远程身份、匹配凭证、证据与申诉基础齐备后。玩家档案、记忆、工具、社区模块和托管配置可以不同，并作为不向对手披露的竞技秘密。举报不等于定罪，信用体系分维度并延后到具备账户与复核基础后实现。公开聊天首轮采用 LIVELY_V1 热闹型配额，所有计数由权威服务执行并可按策略版本调整。
- 玩家公开文本不经过意图分类，校验后立即进入 TABLE_PUBLIC；同席唯一 SEAT_AI 读取实时事件与牌局上下文，自主选择 silent 或 public_speech。MVP 不实现 PLAYER_REACTIVE / PLAYER_PUBLIC_ONLY / PUBLIC_PROACTIVE 分流、额外分类 Codex 回合或 reactive 配额预留。
- AI 每手统一最多公开 8 条，评估最小启动间隔 5 秒且每席单 pending；运行/冷却期间事件只合并为最新 dirty context，终态后至多跟进一次。AI 气泡不单独唤醒其他 AI，公开话术与结构化动作协议继续分离。
- 宿主网络/模型异常直接表现为该席 AI 延迟、DEGRADED 或 OFFLINE，不暂停牌局、不阻止人工操作、不静默换模型。玩家可以关闭 AI 后纯手动游玩；基础优化限于合并、取消、恢复、幂等和清晰状态提示。
- 同一手内跨街迟到的 public_speech 标注“延迟 · 基于原街道”后发布，跨手输出幂等丢弃且不占新手额度。
- 用户已确认锁定单一 `SEAT_AI` 架构；以后如要重新引入意图分类或双管线，必须新增 ADR 和证据，不得直接从已被取代的探索记录恢复。

**Consequences**：MVP-0 只需证明“标准德扑 + 四组公开玩家/AI 对话”可玩，不需要先建设私密投影、记忆数据层、托管协议、能力市场或信用系统。路线图决定继续保留，但必须由后续独立任务重新激活和验收，不能从本文件的历史草案自动膨胀回首版。

<a id="semantic-change-20260827"></a>

## 语义变更与分阶段确认状态（2026-08-27）

本 PRD 中与已验证合同冲突或超出其范围的“已确认”“已锁定”表述，只代表需求发现会话中的候选共识，不具有 `user_confirmed` 合同权威。宿主中立 L0、共享宿主入口 L1 与首个 L2“游戏会话与宿主入口”已分别由 `PROJECT-DECISION-LOG.md#DEC-20260827-017`、`PROJECT-DECISION-LOG.md#DEC-20260827-018`、`PROJECT-DECISION-LOG.md#DEC-20260827-019` 单独确认并校验；另外两个 L2 与规则仍须分阶段取得各自权威，受影响实现继续暂停。

确认顺序固定为：L0 宿主中立化（已完成）→ L1 共享宿主入口（已完成）→ `TG-L2-SESSION-LAUNCH`（已完成）→ `TG-L2-PLAYABLE-TABLE`（当前）→ `TG-L2-PUBLIC-AI-EXCHANGE` → 对应受保护产品规则与 supersede 链。后续阶段不得在前一阶段确认前向用户展开成一个总规则包。

U7 候选按最终复核拆为三项，尚未取得用户权威：

1. 各宿主输入形态可以在功能不降级的前提下适配。
2. 默认公开范围、隐藏信息边界以及公开话术无扑克动作效力必须跨宿主一致。
3. 事件驱动主动发言在 Codex 与 Claude 两侧均未验证；任一侧 Gate 5 失败时，被动回答只能作为重新确认的降级候选，不能由实现层静默替代。

```yaml
semantic_reconciliation:
  depth: deep_intent
  scope: current_mvp
  triggers:
    - external_advisor_review
    - verified_contract_vs_active_prd_conflict
    - dual_host_product_direction
  baseline_status_before: conflict
  status: drift_needs_user_decision
  original_or_latest_user_intent_checked:
    - PROJECT-DECISION-LOG.md#DEC-20260827-017
    - PROJECT-DECISION-LOG.md#DEC-20260827-018
    - PROJECT-DECISION-LOG.md#DEC-20260827-019
    - current_user_instruction:2026-08-27
  historical_ai_inference_checked:
    - CLAUDE-SEMANTIC-REVIEW-20260826.md
  current_documents_checked:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
    - .trellis/tasks/08-26-public-ai-table-talk/prd.md
  confirmed_path_checked:
    - PROJECT-DECISION-LOG.md#DEC-20260827-017
    - PROJECT-DECISION-LOG.md#DEC-20260827-018
    - PROJECT-DECISION-LOG.md#DEC-20260827-019
    - PROJECT-DECISION-LOG.md#DEC-20260825-008
    - PROJECT-DECISION-LOG.md#DEC-20260825-009
  current_implementation_or_product_surface_checked:
    - existing_records_only_no_tests_rerun
  material_deltas:
    - classification: docs_and_implementation_drift
      summary: L0 宿主中立化、共享 L1 入口以及临时私人房与座位恢复 L2 已经确认；临时私人牌桌、事件驱动公开 AI 和规则后继仍与旧 Codex 路线存在待确认差异。
      affected_levels:
        - L0
        - L1
        - L2
  scope_escalation_recommended: yes
  user_decision_needed: yes
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  next_action: user_confirm_stage_4_l2_playable_table_charter

route_rebase:
  status: pending_user_confirmation
  transformation: supersede
  trigger:
    reason: 已验证的 Codex 专属 L0/L1 与双宿主、临时私人房和事件驱动公开 AI 候选发生受保护语义冲突。
    evidence:
      - CLAUDE-SEMANTIC-REVIEW-20260826.md#claude-round-2-final
      - docs/SEMANTIC-CONFIRMATION-20260827.md
      - docs/SEMANTIC-CONFIRMATION-L1-20260827.md
      - docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md
  semantic_impact: remaining_l2_and_rules_confirmation_required
  authority:
    user: pending_user_confirmation
    primary_ai: propose_stage_4_l2_and_wait
    decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-020
  previous_active_path:
    - TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B
    - TG-L1-HOST-ENTRY@SC-TG-L1-HOST-ENTRY-20260827-A
    - TG-L2-SESSION-LAUNCH@SC-TG-L2-SESSION-LAUNCH-20260827-B
  candidate_active_path:
    - TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B
    - TG-L1-LIVE-TABLE@SC-TG-L1-LIVE-TABLE-20260825-A
    - TG-L2-PLAYABLE-TABLE@SC-TG-L2-PLAYABLE-TABLE-20260827-C-pending
  resulting_active_path:
    - TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B
    - TG-L1-LIVE-TABLE@SC-TG-L1-LIVE-TABLE-20260825-A
  affected_scope:
    plan_nodes:
      - TG-L0-PRODUCT
      - TG-L1-HOST-ENTRY
      - TG-L1-CODEX-ENTRY
      - TG-L1-LIVE-TABLE
      - TG-L1-PUBLIC-AI-PLAY
      - TG-L2-SESSION-LAUNCH
      - TG-L2-PLAYABLE-TABLE
      - TG-L2-PUBLIC-AI-EXCHANGE
    code: []
    data: []
    api_or_interfaces:
      - host_entry_boundary
      - authoritative_room_and_seat_protocol
      - seat_ai_publication_contract
    active_entrypoints:
      - current_codex_plugin_path
      - proposed_claude_host_path
    tests:
      - SAME_VISIBLE_TASK_SPIKE_V1_not_run
      - CLAUDE_HOST_PROBE_GATE_1_TO_9_not_run
    documents:
      - PROJECT-DECISION-LOG.md
      - PROJECT-PLAN-TREE.md
      - STATUS.md
      - .trellis/tasks/08-26-public-ai-table-talk/prd.md
      - docs/SEMANTIC-CONFIRMATION-20260827.md
      - docs/SEMANTIC-CONFIRMATION-L1-20260827.md
      - docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md
      - docs/SEMANTIC-CONFIRMATION-L2-PLAYABLE-TABLE-20260827.md
    status_and_navigation:
      - active_path_held_at_protected_confirmation
    completion_evidence:
      - existing_codex_probe_evidence_scope_limited
  reliable_resume_boundary:
    earliest_trustworthy_node_or_checkpoint: TG-L1-LIVE-TABLE@SC-TG-L1-LIVE-TABLE-20260825-A-current_verified
    first_invalid_or_unverified_node: TG-L2-PLAYABLE-TABLE@SC-TG-L2-PLAYABLE-TABLE-20260827-C-pending_user_confirmation
    basis:
      - PROJECT-DECISION-LOG.md#DEC-20260827-017
      - PROJECT-DECISION-LOG.md#DEC-20260827-018
      - PROJECT-DECISION-LOG.md#DEC-20260827-019
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
  impact_dispositions:
    - subject: SC-TG-L0-ROOT-20260825-A
      kind: document
      disposition: superseded
      reason: 宿主中立后继已经由用户确认并完成唯一合同校验；旧 Codex 专属 L0 只保留为可审计历史。
      required_action: retain_as_historical_evidence_only
      evidence_or_owner: PROJECT-DECISION-LOG.md#DEC-20260825-001
    - subject: active_product_implementation_route
      kind: status_or_navigation
      disposition: revalidation_required
      reason: L0-L2 候选会改变宿主入口、MVP 桌型和公开 AI 责任。
      required_action: hold_until_sequential_confirmation_and_truth_write
      evidence_or_owner: PROJECT-PLAN-TREE.md
    - subject: SC-TG-L1-CODEX-ENTRY-20260825-A
      kind: document
      disposition: superseded
      reason: 共享宿主入口后继已经由用户确认并完成唯一合同校验；旧 Codex 专属 L1 只保留为可审计历史。
      required_action: retain_as_historical_evidence_only
      evidence_or_owner: PROJECT-DECISION-LOG.md#DEC-20260825-002
    - subject: SC-TG-L2-SESSION-LAUNCH-20260825-A
      kind: document
      disposition: superseded
      reason: 宿主中立游戏会话与座位恢复后继已经由用户确认并完成唯一合同校验；旧 Codex 专属会话章程只保留为可审计历史。
      required_action: retain_as_historical_evidence_only
      evidence_or_owner: PROJECT-DECISION-LOG.md#DEC-20260825-005
    - subject: existing_codex_host_probe_results
      kind: completion_evidence
      disposition: reusable
      reason: 只证明旧 Codex 聚焦范围，不能外推为双宿主或主动唤醒已完成。
      required_action: retain_with_scope_limit_then_revalidate_affected_claims
      evidence_or_owner: docs/HOST-PROBE-CHECKLIST.md
  unresolved_blockers:
    - user_confirmation_stage_4_l2_playable_table_charter
  durable_carrier: active_trellis_or_prd
  history_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
```

<a id="l2-session-launch-truth-persistence-result"></a>

### L2 游戏会话与宿主入口语义写入结果

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-L2-SESSION-LAUNCH-20260827-B
  detail_level: material_node_closure
  scope:
    scope_id: TG-L2-SESSION-LAUNCH@SC-TG-L2-SESSION-LAUNCH-20260827-B
    exact_outcome: 将用户确认的宿主中立游戏会话与座位恢复 L2 原样写入唯一决策合同，替代旧 Codex 专属会话章程，并把活动导航停在尚未确认的 TG-L2-PLAYABLE-TABLE 后继章程
    owner_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
  trigger: semantic_write_changes_navigation_state
  basis:
    semantic_contract_refs:
      - node_id: TG-L0-PRODUCT
        contract_id: SC-TG-L0-ROOT-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
        expected_digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
        binding_status: verified
      - node_id: TG-L1-HOST-ENTRY
        contract_id: SC-TG-L1-HOST-ENTRY-20260827-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
        expected_digest: sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160
        binding_status: verified
      - node_id: TG-L2-SESSION-LAUNCH
        contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
        expected_digest: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
        binding_status: verified
    understanding_view_ref: PROJECT-PLAN-TREE.md#TG-L2-SESSION-LAUNCH
    route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
    implementation_identity:
      kind: not_required
      scope: semantic_truth_persistence_only
      identity: not_required
      status: not_required
      not_required_reason: 本结果只判断用户确认、合同替代与导航写入，不声明游戏会话、私人房、座位恢复或宿主适配器已经实现。
    verification_identities:
      - evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l2-session-launch-verification-20260827.json
        identity: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
        status: current
    freshness: current
  acceptance:
    derivation_timing: legacy_or_existing_state_reconstructed
    obligations:
      - obligation_id: L2-SESSION-PERSIST-USER-ANSWER
        claim_or_predicate: 用户回复只确认此前完整展示的 TG-L2-SESSION-LAUNCH 宿主中立后继章程。
        required: yes
        real_condition: 决策记录不得把该回复扩展为席位凭据、U7、公开 AI、验收、实现或宿主能力确认。
      - obligation_id: L2-SESSION-PERSIST-BINDING
        claim_or_predicate: 预构建 L2 payload 在 DEC-20260827-019 中恰好出现一次且摘要匹配。
        required: yes
        real_condition: 使用语义合同工具直接校验决策日志当前字节。
      - obligation_id: L2-SESSION-PERSIST-SUPERSEDE
        claim_or_predicate: 旧 Codex 专属会话章程保留为已替代历史，当前会话合同指针指向宿主中立后继。
        required: yes
        real_condition: 决策日志、Plan Tree、STATUS 与活动 PRD 的当前指针一致。
      - obligation_id: L2-SESSION-PERSIST-NON-INHERITANCE
        claim_or_predicate: 本次确认不向产品规则或其他 L2 继承，下一步是独立确认 TG-L2-PLAYABLE-TABLE。
        required: yes
        real_condition: 牌桌候选及旧亮牌规则没有被标记为随本次回复获得当前权威。
    selected_surfaces:
      - inspection
    observations:
      - obligation_id: L2-SESSION-PERSIST-USER-ANSWER
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-019
        result: pass
        caveat: 只证明用户语义决定已持久化，不证明运行能力。
      - obligation_id: L2-SESSION-PERSIST-BINDING
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l2-session-launch-verification-20260827.json
        result: pass
        caveat: payload_count 为一且摘要与预构建候选一致。
      - obligation_id: L2-SESSION-PERSIST-SUPERSEDE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-PLAN-TREE.md#semantic_baseline
        result: pass
        caveat: 旧 Codex 证据仍可按原范围引用，但不会升级为宿主中立能力证据。
      - obligation_id: L2-SESSION-PERSIST-NON-INHERITANCE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: docs/SEMANTIC-CONFIRMATION-L2-PLAYABLE-TABLE-20260827.md#l2-playable-table-charter
        result: pass
        caveat: 第二个 L2 仍是待用户确认候选，亮牌等规则只保留历史权威证据。
    skipped:
      - check: npm_test_and_playwright
        reason: 本次只写入语义合同；产品测试不能证明或替代用户确认，也不得把既有 23/23 记录冒充本轮实测。
      - check: codex_and_claude_host_probes
        reason: 双宿主、私人房恢复和主动唤醒能力属于后续证据门禁，本结果不声明其通过。
    result: pass
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-L2-SESSION-LAUNCH@SC-TG-L2-SESSION-LAUNCH-20260827-B
        claim: 宿主中立游戏会话与座位恢复 L2 的用户确认、唯一合同绑定、旧合同替代和当前语义指针已经持久化。
        exact_scope: 仅限 L2 语义真相与导航写入，不包括任何私人房、座位恢复、双宿主适配或运行产品已经实现。
        result: supported
        dimensions:
          semantic:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-019
            user_readable_meaning: 用户选择的宿主中立会话 L2 与当前合同完全一致。
            caveat: 不向规则、其他 L2 或实现继承。
          implementation:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断会话启动或恢复代码。
            caveat: 受影响产品实现仍暂停。
            not_applicable_reason: 精确声明仅为语义持久化。
          data:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断房间、座位或恢复数据能力。
            caveat: 席位凭据与恢复时限尚未进入规则确认。
            not_applicable_reason: 精确声明不涉及运行数据。
          integration:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断 Codex、Claude 或牌桌集成。
            caveat: 双宿主互通与主动唤醒未验证。
            not_applicable_reason: 精确声明不涉及运行集成。
          verification:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l2-session-launch-verification-20260827.json
            user_readable_meaning: 决策日志中的唯一 L2 payload 与预期摘要匹配。
            caveat: 这是静态合同校验，不是产品测试。
          operational:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断部署或生产可用性。
            caveat: 未发布、未部署。
            not_applicable_reason: 精确声明不涉及运行就绪。
        safe_wording: 可以声称宿主中立游戏会话与座位恢复 L2 已确认并完成语义持久化；不能声称私人房、座位恢复、双宿主、主动 AI 或完整牌桌已经实现。
        gaps:
          - TG-L2-PLAYABLE-TABLE 后继仍待用户确认。
          - TG-L2-PUBLIC-AI-EXCHANGE 后继和产品规则仍待后续分阶段确认。
  route_boundaries:
    local:
      result: supported
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-019
        - .trellis/tasks/08-26-public-ai-table-talk/research/l2-session-launch-verification-20260827.json
    adjacent:
      result: partial
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-020
    cumulative:
      result: partial
      evidence_refs:
        - PROJECT-PLAN-TREE.md#semantic_baseline
  semantic_delta: l0_l2_confirmation_required
  state: blocked
  claim_limits:
    - L2 会话语义写入不证明任何宿主适配器、私人房、座位恢复、牌桌或主动 AI 已交付。
    - 席位凭据、U7、亮牌等产品规则和其他 L2 不继承本次用户确认。
    - 旧 TG-L1-LIVE-TABLE 中“从 Codex 入口接收”的关系只作为仍成立的 Codex 适配路径理解，不得被解释为排除共享宿主入口；若后续要求其具有排他性，必须重新打开 L1 语义门禁。
  remaining_non_blocking: []
  advance_allowed: no
  next_owner: PROJECT-DECISION-LOG.md#DEC-20260827-020

  formal_self_review:
    status: ai_generated
    performed_after_semantic_write: yes
    verdict: APPROVE_WITH_NOTES
    reviewed_scope: 用户回复 1 对宿主中立游戏会话 L2 的精确持久化、旧会话章程替代、当前导航和第二个 L2 独立确认包
    review_checks:
      correctness: pass
      regression_and_scope: pass_with_limits
      missing_verification: documented
      direction_risk: held_at_playable_table_user_confirmation
      sentinel_signal: none_for_exact_semantic_persistence_claim
    evidence_directly_inspected:
      - 当前用户回复与此前完整展示的 TG-L2-SESSION-LAUNCH 方案 1 边界
      - PROJECT-DECISION-LOG.md 中唯一嵌入 payload、摘要、状态与 supersede 链
      - PROJECT-PLAN-TREE.md、STATUS.md、活动 PRD 和两个 L2 确认页的当前指针
      - 预构建牌桌 L2 候选、内容寻址校验与受保护字段展示完整性
    direction_challenge:
      - challenge: 是否把私人房、座位凭据、恢复时限或具体宿主 UI 一起冒充为本次已确认产品规则。
        conclusion: 新合同只冻结授权、当前会话 AI、房间与座位归属、状态和普通中断恢复的用户结果；字段、存储、接口、时限和页面形态继续留在规则或实现层。
      - challenge: 第二个 L2 是否在重新设计德州扑克，而不是复用成熟标准机制。
        conclusion: 候选明确采用标准无限注德州扑克、真人结构化官方动作、主池与必要边池；只新增宿主中立牌桌权威、私人房和语言无动作效力边界，具体参数留到后续规则或专业实现。
      - challenge: 用户提出私人房 MVP 后，是否未经独立判断就把邀请创建者变成网络房主。
        conclusion: 候选把创建邀请与牌局权威分离，由中立权威维护牌堆、隐藏信息和结算，并为未来公开大厅与匹配保留兼容房间接口。
      - challenge: 旧 TG-L1-LIVE-TABLE 的 Codex 入口关系是否与宿主中立路线形成未处理硬冲突。
        conclusion: 该关系仍可作为非排他的 Codex 适配路径成立；共享 TG-L1-HOST-ENTRY 增加宿主入口但未删除 Codex。当前不能把旧表述解释成排他约束，若产品需要排他语义则本结论失效并重开 L1。
    findings:
      - severity: note
        finding: 当前精确语义写入已闭合，但整个 Route Rebase 仍被牌桌 L2、公开 AI L2 与规则的独立确认阻塞。
        disposition: 保持 advance_allowed 为 no，并把下一 owner 固定为 DEC-20260827-020。
      - severity: note
        finding: 旧亮牌规则已有用户确认历史，但新牌桌章程尚未取得权威，不能自动继承、删除或修改该规则。
        disposition: 保留历史证据；三个 L2 均确认后再逐项展示规则及 supersede 链。
      - severity: note
        finding: 旧 Codex 运行与产品测试证据没有随新会话 L2 自动升级为跨宿主私人房、座位恢复或双宿主证据。
        disposition: Project Intelligence 保持 refresh_required，受影响实现与验收保持 revalidation_required。
    counterfactual_review:
      evidence_that_would_change_verdict:
        - DEC-20260827-019 中 payload 不唯一或摘要校验失败。
        - 任一当前会话合同或导航指针仍以旧 Codex 专属章程为现行合同，或提前把牌桌候选或规则标记为已确认。
        - 用户说明本次回复 1 并非确认此前完整展示的 TG-L2-SESSION-LAUNCH 方案 1。
        - 第二个 L2 确认页遗漏、增加或改写候选合同的任一受保护字段，却仍声称回复 1 会确认原候选。
      not_verified:
        - 未运行 npm test 或 Playwright，因其不能证明用户语义确认。
        - 未执行 Codex 或 Claude 宿主探针，也未验证新私人房牌桌、跨宿主座位恢复或事件驱动主动唤醒。
        - 未确认 TG-L2-PLAYABLE-TABLE、TG-L2-PUBLIC-AI-EXCHANGE、U7、席位凭据、亮牌、验收或实现规则。
      claims_relying_on_primary_report_instead_of_direct_evidence:
        - 历史 Codex 宿主探针与产品测试结果仅沿用既有记录，未用于本次 L2 语义持久化通过结论。
    review_independence:
      level: same_session_self
      primary_identity_verified: no
      reviewer_identity_verified: no
      independently_derived_scope: yes
      evidence_directly_inspected: yes
      limitations:
        - 这是同一会话 AI 的正式自查，不是外部独立复核、用户验收或产品测试。

truth_navigation_impact:
  - surface: PROJECT-DECISION-LOG.md#DEC-20260825-005
    classification: supersede
    reason: 已验证宿主中立会话后继取代旧 Codex 专属会话章程；旧 payload 与摘要保持历史可审计。
    affected_pointer_or_meaning: TG-L2-SESSION-LAUNCH previous current contract
  - surface: PROJECT-DECISION-LOG.md#DEC-20260827-019
    classification: update
    reason: 写入用户精确答案、原样 payload、唯一摘要校验和 supersede 关系。
    affected_pointer_or_meaning: TG-L2-SESSION-LAUNCH current contract
  - surface: PROJECT-DECISION-LOG.md#DEC-20260827-020
    classification: create
    reason: 登记下一阶段牌桌 L2 候选，不赋予候选用户权威。
    affected_pointer_or_meaning: TG-L2-PLAYABLE-TABLE pending successor
  - surface: PROJECT-PLAN-TREE.md
    classification: update
    reason: 会话 L2 转为当前合同，活动路线切到可信实时牌局域，恢复边界移动到牌桌 L2 候选。
    affected_pointer_or_meaning: active_path, dependencies, reliable_boundary, semantic_baseline
  - surface: STATUS.md
    classification: update
    reason: 当前目标、语义阶段、下一 owner 和候选引用改为牌桌 L2 章程确认。
    affected_pointer_or_meaning: current, active, next, semantic_alignment, project_intelligence
  - surface: docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md
    classification: update
    reason: 将此前完整展示的候选标为用户已确认并引用唯一绑定结果。
    affected_pointer_or_meaning: stage_3_l2_session_launch_user_confirmed
  - surface: docs/SEMANTIC-CONFIRMATION-L2-PLAYABLE-TABLE-20260827.md
    classification: create
    reason: 建立下一阶段独立牌桌 L2 章程确认入口，不继承旧亮牌规则或赋予候选用户权威。
    affected_pointer_or_meaning: stage_4_l2_playable_table_pending_user_confirmation
  - surface: .trellis/tasks/08-26-public-ai-table-talk/prd.md#l1-truth-persistence-result
    classification: historical_only
    reason: 第二阶段 L1 静态记录保持原字节语义，但不再控制当前 active 或 next 指针。
    affected_pointer_or_meaning: prior-stage evidence only

post_write_pointer_closure:
  status: closed
  repaired_or_historicalized:
    - 旧 Codex 专属会话决策和合同明确标记 superseded，原 payload 保持历史可审计。
    - 活动路径、当前会话合同、依赖、恢复边界和下一 owner 全部指向会话 L2 已确认、牌桌 L2 待确认状态。
    - 第一份 L2 确认页明确禁止向规则或其他 L2 继承，前两阶段执行结果明确标为历史记录。
  blockers: []

understanding_revision_receipt:
  current_before_ref: SC-TG-L2-SESSION-LAUNCH-20260825-A
  candidate_successor_ref: SC-TG-L2-SESSION-LAUNCH-20260827-B
  current_after_ref: SC-TG-L2-SESSION-LAUNCH-20260827-B
  affected_node_refs:
    - TG-L1-HOST-ENTRY
    - TG-L1-LIVE-TABLE
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-SESSION-LAUNCH
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  invalidated_completion_or_evidence_refs:
    - STATUS.md#project_intelligence@refresh_required
    - REVIEW-LOG.md#2026-08-26座位旁-ai-公开气泡复核@revalidation_required
  reliable_resume_boundary_ref: PROJECT-PLAN-TREE.md#当前恢复点
  plan_tree_understanding_view_refs:
    - PROJECT-PLAN-TREE.md#TG-L2-SESSION-LAUNCH
    - PROJECT-PLAN-TREE.md#TG-L2-PLAYABLE-TABLE
```

<a id="l0-truth-persistence-result"></a>

### L0 语义写入结果（第一阶段历史记录）

以下记录保留第一阶段当时的静态持久化证据，不再控制当前 `active`、`next` 或 Route Rebase；当前结果见 `#l2-session-launch-truth-persistence-result`。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-L0-HOST-NEUTRAL-20260827-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B
    exact_outcome: 将用户已确认的宿主中立 L0 原样写入唯一决策合同，替代旧 Codex 专属 L0，并把活动导航停在尚未选择的 L1 入口结构
    owner_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
  trigger: semantic_write_changes_navigation_state
  basis:
    semantic_contract_refs:
      - node_id: TG-L0-PRODUCT
        contract_id: SC-TG-L0-ROOT-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
        expected_digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
        binding_status: verified
    route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
    implementation_identity:
      kind: not_required
      scope: semantic_truth_persistence_only
      identity: not_required
      status: not_required
      not_required_reason: 本结果只判断用户确认与语义导航写入，不声明产品实现状态。
    verification_identities:
      - evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l0-contract-verification-20260827.json
        identity: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
        status: current
    freshness: current
  acceptance:
    derivation_timing: legacy_or_existing_state_reconstructed
    obligations:
      - obligation_id: L0-PERSIST-USER-ANSWER
        claim_or_predicate: 用户回复只确认此前完整展示的 L0 宿主中立包。
        required: yes
        real_condition: 决策记录不得把该回复扩展为 L1、L2、U7、规则或实现确认。
      - obligation_id: L0-PERSIST-BINDING
        claim_or_predicate: 预构建 L0 payload 在 DEC-20260827-017 中恰好出现一次且摘要匹配。
        required: yes
        real_condition: 使用语义合同工具直接校验决策日志当前字节。
      - obligation_id: L0-PERSIST-SUPERSEDE
        claim_or_predicate: 旧 L0 保留为已替代历史，当前根指针指向新合同。
        required: yes
        real_condition: 决策日志、Plan Tree 与 STATUS 的活动指针一致。
      - obligation_id: L0-PERSIST-NON-INHERITANCE
        claim_or_predicate: 活动路线停在 L0，下一步仍是独立 L1 用户选择。
        required: yes
        real_condition: 没有任何未展示的 L1/L2 候选被标记为当前已确认。
    selected_surfaces:
      - inspection
    observations:
      - obligation_id: L0-PERSIST-USER-ANSWER
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-017
        result: pass
        caveat: 只证明用户价值决定已持久化，不证明技术能力。
      - obligation_id: L0-PERSIST-BINDING
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l0-contract-verification-20260827.json
        result: pass
        caveat: payload_count 为一且 digest verified。
      - obligation_id: L0-PERSIST-SUPERSEDE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-PLAN-TREE.md#semantic_baseline
        result: pass
        caveat: 产品实现与旧证据仍需后续重验。
      - obligation_id: L0-PERSIST-NON-INHERITANCE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: docs/SEMANTIC-CONFIRMATION-L1-20260827.md
        result: pass
        caveat: L1 当前仍为候选。
    skipped:
      - check: npm_test_and_playwright
        reason: 本次只写入语义合同；运行产品测试不能证明或替代用户确认。
      - check: codex_and_claude_host_probes
        reason: 双宿主与主动唤醒能力属于后续证据门禁，本结果不声明其通过。
    result: pass
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B
        claim: 宿主中立 L0 的用户确认、唯一合同绑定与当前语义指针已经持久化。
        exact_scope: 仅限语义真相与导航写入，不包括任何产品功能、双宿主能力或实现完成。
        result: supported
        dimensions:
          semantic:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-017
            user_readable_meaning: 用户确认的 L0 与当前合同完全一致。
            caveat: 不向下确认 L1 或 L2。
          implementation:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断代码实现。
            caveat: 产品实现仍暂停。
            not_applicable_reason: 精确声明仅为语义持久化。
          data:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断运行数据。
            caveat: 无。
            not_applicable_reason: 精确声明不涉及数据能力。
          integration:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断宿主或服务集成。
            caveat: 双宿主能力未验证。
            not_applicable_reason: 精确声明不涉及运行集成。
          verification:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l0-contract-verification-20260827.json
            user_readable_meaning: 决策日志中的唯一 payload 与预期摘要匹配。
            caveat: 这是静态合同校验，不是产品测试。
          operational:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断部署或生产可用性。
            caveat: 未发布、未部署。
            not_applicable_reason: 精确声明不涉及运行就绪。
        safe_wording: 可以声称宿主中立 L0 已确认并完成语义持久化；不能声称 L1/L2 已确认或双宿主产品已实现。
        gaps:
          - L1 宿主入口结构仍待用户选择。
          - 三个 L2 后继和产品规则仍待后续分阶段确认。
  route_boundaries:
    local:
      result: supported
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-017
        - .trellis/tasks/08-26-public-ai-table-talk/research/l0-contract-verification-20260827.json
    adjacent:
      result: partial
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-018
    cumulative:
      result: partial
      evidence_refs:
        - PROJECT-PLAN-TREE.md#semantic_baseline
  semantic_delta: l0_l2_confirmation_required
  state: blocked
  claim_limits:
    - L0 语义写入不证明任何宿主适配器、牌桌或主动 AI 已交付。
    - L1、L2 与产品规则不继承本次用户确认。
  remaining_non_blocking: []
  advance_allowed: no
  next_owner: PROJECT-DECISION-LOG.md#DEC-20260827-018

  formal_self_review:
    status: ai_generated
    performed_after_semantic_write: yes
    verdict: APPROVE_WITH_NOTES
    reviewed_scope: 用户回复 1 对宿主中立 L0 的精确持久化、旧 L0 替代关系、当前导航和下一阶段 L1 二选一包
    review_checks:
      correctness: pass
      regression_and_scope: pass_with_limits
      missing_verification: documented
      direction_risk: held_at_l1_user_choice
      sentinel_signal: none_for_exact_semantic_persistence_claim
    evidence_directly_inspected:
      - 当前用户回复与此前完整展示的 L0 选择边界
      - PROJECT-DECISION-LOG.md 中唯一嵌入 payload、摘要、状态与 supersede 链
      - PROJECT-PLAN-TREE.md、STATUS.md、活动 PRD 和两阶段确认页的当前指针
      - 两个预构建 L1 候选、内容寻址校验与受保护字段展示完整性
    findings:
      - severity: note
        finding: L0 语义持久化已闭合，但整个 Route Rebase 仍被 L1、三个 L2 与规则的独立确认阻塞。
        disposition: 保持 advance_allowed 为 no，并把下一 owner 固定为 DEC-20260827-018。
      - severity: note
        finding: 旧 Codex 运行与产品测试证据没有随新 L0 自动升级为双宿主证据。
        disposition: Project Intelligence 标记 refresh_required，受影响实现与验收标记 revalidation_required。
    counterfactual_review:
      evidence_that_would_change_verdict:
        - DEC-20260827-017 中 payload 不唯一或摘要校验失败。
        - 任一当前根指针仍指向旧 L0，或活动路径提前包含尚未确认的 L1/L2。
        - 用户说明本次回复 1 并非确认此前完整展示的 L0 方案。
      not_verified:
        - 未运行 npm test 或 Playwright，因其不能证明用户语义确认。
        - 未验证 Codex 或 Claude 的主动唤醒、同一 surface、双宿主互通或产品交付。
        - 未确认任何 L1、L2、U7 或受保护产品规则。
      claims_relying_on_primary_report_instead_of_direct_evidence:
        - 历史 Codex 宿主探针与产品测试结果仅沿用既有记录，未用于本次 L0 通过结论。
    review_independence:
      level: same_session_self
      primary_identity_verified: no
      reviewer_identity_verified: no
      independently_derived_scope: yes
      evidence_directly_inspected: yes
      limitations:
        - 这是同一会话 AI 的正式自查，不是外部独立复核、用户验收或产品测试。

truth_navigation_impact:
  - surface: PROJECT-DECISION-LOG.md#DEC-20260825-001
    classification: supersede
    reason: 已验证宿主中立后继取代旧 Codex 专属根目标；旧 payload 与摘要保持历史可审计。
    affected_pointer_or_meaning: TG-L0-PRODUCT previous current contract
  - surface: PROJECT-DECISION-LOG.md#DEC-20260827-017
    classification: update
    reason: 写入用户精确答案、原样 payload、唯一摘要校验和 supersede 关系。
    affected_pointer_or_meaning: TG-L0-PRODUCT current contract
  - surface: PROJECT-PLAN-TREE.md
    classification: update
    reason: 当前根指针提升到新 L0，活动路径缩到 L0，恢复边界移动到待确认 L1。
    affected_pointer_or_meaning: root_goal_ref, active_path, reliable_boundary, semantic_baseline
  - surface: STATUS.md
    classification: update
    reason: 当前目标、语义阶段、Project Intelligence freshness 和下一 owner 改为 L1 选择状态。
    affected_pointer_or_meaning: current, active, next, semantic_alignment, project_intelligence
  - surface: docs/SEMANTIC-CONFIRMATION-20260827.md
    classification: update
    reason: 保留原展示内容，并把候选状态改为已确认和已验证。
    affected_pointer_or_meaning: stage_1_l0_user_confirmed
  - surface: CLAUDE-SEMANTIC-REVIEW-20260826.md
    classification: historical_only
    reason: 两轮顾问复核保持原文，不作为用户确认或当前合同载体。
    affected_pointer_or_meaning: advisor evidence only

post_write_pointer_closure:
  status: closed
  repaired_or_historicalized:
    - 旧 L0 决策与合同明确标记 superseded。
    - 根目标、当前合同、活动路径、恢复边界和下一 owner 全部指向 L0 已确认、L1 待选择状态。
    - 第一阶段确认页明确禁止向 L1/L2/规则继承。
  blockers: []

understanding_revision_receipt:
  current_before_ref: SC-TG-L0-ROOT-20260825-A
  candidate_successor_ref: SC-TG-L0-ROOT-20260827-B
  current_after_ref: SC-TG-L0-ROOT-20260827-B
  affected_node_refs:
    - TG-L0-PRODUCT
    - TG-L1-CODEX-ENTRY
    - TG-L1-LIVE-TABLE
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-SESSION-LAUNCH
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  invalidated_completion_or_evidence_refs:
    - STATUS.md#project_intelligence@refresh_required
    - REVIEW-LOG.md#2026-08-26座位旁-ai-公开气泡复核@revalidation_required
  reliable_resume_boundary_ref: PROJECT-PLAN-TREE.md#当前恢复点
  plan_tree_understanding_view_refs:
    - PROJECT-PLAN-TREE.md#TG-L0-PRODUCT
    - PROJECT-PLAN-TREE.md#TG-L1-CODEX-ENTRY
```

<a id="l1-truth-persistence-result"></a>

### L1 共享宿主入口语义写入结果（第二阶段历史记录）

以下记录保留第二阶段当时的静态持久化证据，不再控制当前 `active`、`next` 或 Route Rebase；当前结果见 `#l2-session-launch-truth-persistence-result`。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-L1-HOST-ENTRY-20260827-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-L1-HOST-ENTRY@SC-TG-L1-HOST-ENTRY-20260827-A
    exact_outcome: 将用户选择的共享宿主中立入口 L1 原样写入唯一决策合同，替代旧 Codex 专属入口 L1，并把活动导航停在尚未确认的 TG-L2-SESSION-LAUNCH 后继章程
    owner_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
  trigger: semantic_write_changes_navigation_state
  basis:
    semantic_contract_refs:
      - node_id: TG-L0-PRODUCT
        contract_id: SC-TG-L0-ROOT-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
        expected_digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
        binding_status: verified
      - node_id: TG-L1-HOST-ENTRY
        contract_id: SC-TG-L1-HOST-ENTRY-20260827-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
        expected_digest: sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160
        binding_status: verified
    route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
    implementation_identity:
      kind: not_required
      scope: semantic_truth_persistence_only
      identity: not_required
      status: not_required
      not_required_reason: 本结果只判断用户确认与语义导航写入，不声明宿主入口产品已经实现。
    verification_identities:
      - evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l1-host-entry-verification-20260827.json
        identity: sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160
        status: current
    freshness: current
  acceptance:
    derivation_timing: legacy_or_existing_state_reconstructed
    obligations:
      - obligation_id: L1-PERSIST-USER-ANSWER
        claim_or_predicate: 用户回复只确认此前完整展示的 L1 方案 1“共享宿主中立入口”。
        required: yes
        real_condition: 决策记录不得把该回复扩展为 L2、U7、规则、宿主能力或实现确认。
      - obligation_id: L1-PERSIST-BINDING
        claim_or_predicate: 预构建 L1 payload 在 DEC-20260827-018 中恰好出现一次且摘要匹配。
        required: yes
        real_condition: 使用语义合同工具直接校验决策日志当前字节。
      - obligation_id: L1-PERSIST-SUPERSEDE
        claim_or_predicate: 旧 Codex 专属 L1 保留为已替代历史，当前入口指针指向共享宿主 L1。
        required: yes
        real_condition: 决策日志、Plan Tree 与 STATUS 的活动指针一致。
      - obligation_id: L1-PERSIST-NON-INHERITANCE
        claim_or_predicate: 活动路线只推进到 L1，下一步仍是独立的 TG-L2-SESSION-LAUNCH 用户确认。
        required: yes
        real_condition: 候选 L2 及其规则没有被标记为当前已确认。
    selected_surfaces:
      - inspection
    observations:
      - obligation_id: L1-PERSIST-USER-ANSWER
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-018
        result: pass
        caveat: 只证明用户价值决定已持久化，不证明技术能力。
      - obligation_id: L1-PERSIST-BINDING
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l1-host-entry-verification-20260827.json
        result: pass
        caveat: payload_count 为一且 digest verified。
      - obligation_id: L1-PERSIST-SUPERSEDE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: PROJECT-PLAN-TREE.md#semantic_baseline
        result: pass
        caveat: 旧 Codex 证据仍可按原范围复用，但不能代表共享入口或双宿主能力已交付。
      - obligation_id: L1-PERSIST-NON-INHERITANCE
        evidence_type: inspection
        correspondence: direct
        evidence_pointer: docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md
        result: pass
        caveat: L2 当前仍是候选。
    skipped:
      - check: npm_test_and_playwright
        reason: 本次只写入语义合同；运行产品测试不能证明或替代用户确认。
      - check: codex_and_claude_host_probes
        reason: 双宿主、私人房恢复和主动唤醒能力属于后续证据门禁，本结果不声明其通过。
    result: pass
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-L1-HOST-ENTRY@SC-TG-L1-HOST-ENTRY-20260827-A
        claim: 共享宿主中立入口 L1 的用户确认、唯一合同绑定与当前语义指针已经持久化。
        exact_scope: 仅限 L1 语义真相与导航写入，不包括任何宿主适配器、私人房、恢复或双宿主功能已经实现。
        result: supported
        dimensions:
          semantic:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: PROJECT-DECISION-LOG.md#DEC-20260827-018
            user_readable_meaning: 用户选择的共享入口 L1 与当前合同完全一致。
            caveat: 不向下确认任何 L2 或规则。
          implementation:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断入口代码实现。
            caveat: 受影响产品实现仍暂停。
            not_applicable_reason: 精确声明仅为语义持久化。
          data:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断身份、房间或恢复数据能力。
            caveat: 无。
            not_applicable_reason: 精确声明不涉及运行数据。
          integration:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断 Codex、Claude 或牌桌集成。
            caveat: 双宿主互通未验证。
            not_applicable_reason: 精确声明不涉及运行集成。
          verification:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/l1-host-entry-verification-20260827.json
            user_readable_meaning: 决策日志中的唯一 L1 payload 与预期摘要匹配。
            caveat: 这是静态合同校验，不是产品测试。
          operational:
            required: no
            status: not_applicable
            evidence_type: not_run
            evidence_pointer: not_required
            user_readable_meaning: 本结果不判断部署或生产可用性。
            caveat: 未发布、未部署。
            not_applicable_reason: 精确声明不涉及运行就绪。
        safe_wording: 可以声称共享宿主中立入口 L1 已确认并完成语义持久化；不能声称 L2、私人房恢复、双宿主或主动 AI 已实现。
        gaps:
          - TG-L2-SESSION-LAUNCH 宿主中立后继仍待用户确认。
          - 其余两个 L2 和产品规则仍待后续分阶段确认。
  route_boundaries:
    local:
      result: supported
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-018
        - .trellis/tasks/08-26-public-ai-table-talk/research/l1-host-entry-verification-20260827.json
    adjacent:
      result: partial
      evidence_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260827-019
    cumulative:
      result: partial
      evidence_refs:
        - PROJECT-PLAN-TREE.md#semantic_baseline
  semantic_delta: l0_l2_confirmation_required
  state: blocked
  claim_limits:
    - L1 语义写入不证明任何宿主适配器、私人房、座位恢复、牌桌或主动 AI 已交付。
    - L2、U7 与产品规则不继承本次用户确认。
  remaining_non_blocking: []
  advance_allowed: no
  next_owner: PROJECT-DECISION-LOG.md#DEC-20260827-019

  formal_self_review:
    status: ai_generated
    performed_after_semantic_write: yes
    verdict: APPROVE_WITH_NOTES
    reviewed_scope: 用户回复 1 对共享宿主中立入口 L1 的精确持久化、旧 Codex 专属 L1 替代关系、当前导航和首个 L2 独立确认包
    review_checks:
      correctness: pass
      regression_and_scope: pass_with_limits
      missing_verification: documented
      direction_risk: held_at_l2_user_confirmation
      sentinel_signal: none_for_exact_semantic_persistence_claim
    evidence_directly_inspected:
      - 当前用户回复与此前完整展示的 L1 方案 1 边界
      - PROJECT-DECISION-LOG.md 中唯一嵌入 payload、摘要、状态与 supersede 链
      - PROJECT-PLAN-TREE.md、STATUS.md、活动 PRD 和两阶段确认页的当前指针
      - 预构建 L2 候选、内容寻址校验与受保护字段展示完整性
    direction_challenge:
      - challenge: 共享宿主 L1 是否只是抽象得更漂亮，却掩盖 Codex 与 Claude 的真实交互差异。
        conclusion: L1 只统一玩家身份、房间与恢复含义，并明确允许宿主适配器分阶段、使用不同可靠入口；本阶段没有声称两个宿主已经等价实现。
      - challenge: 首个 L2 是否把某种主输入框、MCP、URL、凭据字段或页面布局提前升级为产品硬约束。
        conclusion: 候选只冻结用户可见的授权、私人房、座位归属、状态与普通中断恢复结果；具体输入面、接口、存储和凭据形状仍留待规则分类与实现证据。
      - challenge: 方案 1 是否只因被推荐而未经独立比较就写入。
        conclusion: 用户回复前已分别完整展示共享入口与并列入口的责任、结果、错误形态和摘要；本次仅持久化用户明确选择的原方案 1 payload。
    findings:
      - severity: note
        finding: L1 语义持久化已经闭合，但整个 Route Rebase 仍被首个 L2、其余两个 L2 与规则的独立确认阻塞。
        disposition: 保持 advance_allowed 为 no，并把下一 owner 固定为 DEC-20260827-019。
      - severity: note
        finding: 首个 L2 候选定义了私人房与座位恢复的用户结果，但席位凭据、一性交接和恢复时限仍是未分类规则。
        disposition: 在用户确认章程前不展示为既定规则；章程确认后再逐项判定产品规则、验收规则或实现规则。
      - severity: note
        finding: 旧 Codex 运行与产品测试证据没有随新 L1 自动升级为双宿主、跨宿主私人房或座位恢复证据。
        disposition: Project Intelligence 保持 refresh_required，受影响实现与验收保持 revalidation_required。
    counterfactual_review:
      evidence_that_would_change_verdict:
        - DEC-20260827-018 中 payload 不唯一或摘要校验失败。
        - 任一当前入口或活动路径指针仍以旧 Codex 专属 L1 为现行合同，或活动路径提前包含尚未确认的 L2。
        - 用户说明本次回复 1 并非确认此前完整展示的 L1 方案 1，而是意指方案 2 或其他动作。
        - L2 确认页遗漏、增加或改写候选合同的任一受保护字段，却仍声称回复 1 会确认原候选。
      not_verified:
        - 未运行 npm test 或 Playwright，因其不能证明用户语义确认。
        - 未执行 Codex 或 Claude 宿主探针，也未验证跨宿主私人房、座位恢复或事件驱动主动唤醒。
        - 未确认任何 L2、U7、席位凭据、公开 AI、验收或实现规则。
      claims_relying_on_primary_report_instead_of_direct_evidence:
        - 历史 Codex 宿主探针与产品测试结果仅沿用既有记录，未用于本次 L1 通过结论。
    review_independence:
      level: same_session_self
      primary_identity_verified: no
      reviewer_identity_verified: no
      independently_derived_scope: yes
      evidence_directly_inspected: yes
      limitations:
        - 这是同一会话 AI 的正式自查，不是外部独立复核、用户验收或产品测试。

truth_navigation_impact:
  - surface: PROJECT-DECISION-LOG.md#DEC-20260825-002
    classification: supersede
    reason: 已验证共享宿主入口后继取代旧 Codex 专属入口；旧 payload 与摘要保持历史可审计。
    affected_pointer_or_meaning: TG-L1-CODEX-ENTRY previous current contract
  - surface: PROJECT-DECISION-LOG.md#DEC-20260827-018
    classification: update
    reason: 写入用户精确答案、原样 payload、唯一摘要校验和 supersede 关系。
    affected_pointer_or_meaning: TG-L1-HOST-ENTRY current contract
  - surface: PROJECT-PLAN-TREE.md
    classification: update
    reason: 新共享 L1 进入活动路径，旧 Codex L1 转为 superseded，恢复边界移动到待确认会话启动 L2。
    affected_pointer_or_meaning: active_path, dependencies, reliable_boundary, semantic_baseline
  - surface: STATUS.md
    classification: update
    reason: 当前目标、语义阶段、下一 owner 和候选引用改为首个 L2 章程确认。
    affected_pointer_or_meaning: current, active, next, semantic_alignment, project_intelligence
  - surface: docs/SEMANTIC-CONFIRMATION-L1-20260827.md
    classification: update
    reason: 保留两个方案的原展示内容，并把方案 1 标为已确认和已验证、方案 2 标为未选择。
    affected_pointer_or_meaning: stage_2_l1_user_confirmed
  - surface: docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md
    classification: update
    reason: 建立下一阶段独立 L2 章程确认入口，不赋予候选用户权威。
    affected_pointer_or_meaning: stage_3_l2_session_launch_pending_user_confirmation
  - surface: .trellis/tasks/08-26-public-ai-table-talk/prd.md#l0-truth-persistence-result
    classification: historical_only
    reason: 第一阶段 L0 静态记录保持原字节语义，但不再控制当前 active 或 next 指针。
    affected_pointer_or_meaning: prior-stage evidence only

post_write_pointer_closure:
  status: closed
  repaired_or_historicalized:
    - 旧 Codex 专属 L1 决策、合同和 Plan Tree 节点明确标记 superseded。
    - 活动路径、当前入口、依赖、恢复边界和下一 owner 全部指向 L1 已确认、首个 L2 待确认状态。
    - 第二阶段确认页明确禁止向 L2、U7 或规则继承，第一阶段执行结果明确标为历史记录。
  blockers: []

understanding_revision_receipt:
  current_before_ref: SC-TG-L1-CODEX-ENTRY-20260825-A
  candidate_successor_ref: SC-TG-L1-HOST-ENTRY-20260827-A
  current_after_ref: SC-TG-L1-HOST-ENTRY-20260827-A
  affected_node_refs:
    - TG-L1-CODEX-ENTRY
    - TG-L1-HOST-ENTRY
    - TG-L1-LIVE-TABLE
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-SESSION-LAUNCH
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  invalidated_completion_or_evidence_refs:
    - STATUS.md#project_intelligence@refresh_required
    - REVIEW-LOG.md#2026-08-26座位旁-ai-公开气泡复核@revalidation_required
  reliable_resume_boundary_ref: PROJECT-PLAN-TREE.md#当前恢复点
  plan_tree_understanding_view_refs:
    - PROJECT-PLAN-TREE.md#TG-L1-HOST-ENTRY
    - PROJECT-PLAN-TREE.md#TG-L2-SESSION-LAUNCH
```
