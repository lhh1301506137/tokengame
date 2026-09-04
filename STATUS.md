# TokenGame 项目状态

更新日期：2026-09-05

## 当前工作：B33 共享候选与四作业 CI 已通过，待两好友真人验收

用户已确认先做“两好友、各自 Codex、十手私人房”的 MVP，再考虑购买服务器和公开大厅。
B30–B32 已把显式 HTTPS 入口、本机出站 Connector、外部 Web 工作区和 Node 22/24 四平台 CI 候选推到
远端；B33 在真人开测前对标成熟实现，补齐基础规则反例与“破产→手间固定补测试筹码→另按 Ready”闭环。
该批实现已形成提交 `610a8a175ec7938a894227bd7853f6259ab91659`，首轮完整门禁的失败及后续修补均如实保留；最终串行完整门禁已
Node 1491/1491、变异718/718、exit 0；其中包含破产席掉线恢复后仍可补筹的死状态反例。
用户已按 `DEC-20260905-002` 授权并完成非强制推送：远端候选为 `97b4c946b2e572e5460babddbb8857abdbb0bbdb`，对应
[GitHub Actions run 33909572989](https://github.com/lhh1301506137/tokengame/actions/runs/33909572989) 的 Node 22/24 × Windows/Ubuntu 四作业全部成功；Windows 各1491/1491、Ubuntu各1483/1483，失败、取消、跳过和todo均0。真实隧道、两台设备、第二席原生 AI 与十手
真人签字仍尚未执行。入口见 [远程内测指南](docs/REMOTE-FRIEND-MVP.md)，规则范围见
[德扑 MVP 覆盖说明](docs/POKER-MVP-COVERAGE.md)，本批事实见
[B33 记录](REVIEW-LOG.md#b33-poker-maturity-and-refill)。
B30 提交前的历史证据为身份约束的 Node `1456/1456`、变异 `693/693`、双席浏览器 `18/18` 与四页长程
`215/215`；第一次完整门禁自身 exit 1、随后仅重跑全部受影响集合的过程也保留在记录中，不能写成
第二次完整门禁 exit 0。B31 的 Node 22 和受影响变异结果另记在
[B31 验证记录](REVIEW-LOG.md#b31-node22-ci-verification)：冻结代码的 Windows Node 22 为 `1475/1475`、
Linux/WSL 为 `1467/1467`，相关变异各 `25/25`。用户已按 `DEC-20260903-001` 授权并完成代码提交
`360db26` 的推送，远端已核对一致；[该提交的 GitHub CI](https://github.com/lhh1301506137/tokengame/actions/runs/33690705812)
两平台均成功，实际 Node `22.23.2` 的 Windows `1475/1475`、Ubuntu `1467/1467`，没有失败或取消。
发布回执见 `.trellis/tasks/08-26-public-ai-table-talk/research/b31-publication-20260903.json`；
后续仅文档提交不改变上述已检代码，也不把候选 CI 冒充真人结果。B32 当前同字节本地结果为：
Node 22.23.2 与 Node 24.13.1 各 `1475/1475`；Node 24 完整门禁 `693/693` 变异全杀且 exit 0；
双席脚本浏览器 `18/18`、清理 `7/7`。这些都不是双真人或公网证据，完整事实见
`.trellis/tasks/08-26-public-ai-table-talk/research/b32-friend-readiness-20260903.json`；发布事实另见
`.trellis/tasks/08-26-public-ai-table-talk/research/b32-publication-20260903.json`。

下方 B8–B28 是当批历史快照，不把旧“未做远程传输”的描述当成本轮代码状态，也不把旧四页脚本成绩
当成两好友真实验收。原四真人完整 UAT 保留为后续扩展，本轮签字按活动 PRD 的 MVP-0.1 最新节。

## 初始化状态

- 初始化分类：`fresh_init`
- 框架就绪度：`continue_ready`
- 当前阶段：`prototype`
- 当前目标：先交付两好友远程私人房内测候选——同一牌桌、各自真实 Codex AI、至少十手正常无限注德州与公开气泡；以现有 2–4 席权威实现为基础，不为两席重写扑克。外部 Web 负责游戏与配置，Codex 专用任务承载本席 AI，两者属于同一局、同一席位、同一份权威状态。
- 已完成的地基：当前 MVP 的 L0-L2 章程、可玩牌桌四条体验规则和公开座位 AI 七条交流规则均已确认并完成唯一绑定；宿主中立权威内核已按这些合同实现并闭合 Codex 复核 F1–F6；新牌桌 UI 已与该内核形成单栈产品闭环，四个隔离浏览器上下文的多人回路已闭合。共享 HostAdapter 合同的底座、模型面适配器（`SeatModelAdapter`）与真人面适配器（`HostCommandAdapter`，2026-08-29 `0542c1c`）都已实现并过一致性套件，自动化验收已打到第 13 手。
- B8已完成：逐席AI授权/换发/撤销、权威本席上下文、私有连接文件与MCP接入、浏览器连接界面；925项测试、557条变异、35项连接UI及209项四人13手验收均通过。该批唯一裁决为 `REVIEW-LOG.md#b8-seat-model-binding`，仅限本地自动化链路。
- B9已完成：当前Codex Desktop单席显式消息触发的真实生成→同桌两页AI气泡→撤销后旧权限被拒。一个游戏任务、五轮输入、九次游戏MCP调用；两次生成，一次发布、一次跨手丢弃。附带邀请码窄屏修补，51项连接UI及20项定向Node检查通过。该探针唯一裁决为 `REVIEW-LOG.md#b9-real-host-seat-probe`。
- B10本地准备：默认关闭、最多一次通知的同任务queue候选探针已实现并独立复核；117项定向测试、89项相邻回归及8条变异通过，见 `REVIEW-LOG.md#b10-queue-wake-probe-preparation`。这些不是本次实机窗口重跑的成绩。
- B10实机：用户“同意验证”后复用原任务，实际3次任务输入，其中queue通知1次。消息自动唤醒同一原生任务，无需A再次点击或发提示；桌面观察到一次THINKING，随后跨手回到IDLE，没有AI公开发言。因宿主读取接口未返回回合工具明细，合法终态和精确调用次数unknown，Codex Gate5为blocked，Claude为not_run。证据见 `REVIEW-LOG.md#b10-native-queue-wake-probe`；窗口已结束并清理，不能再沿用该授权发模型请求。
- B11本地取证已完成：默认关闭的去敏有界事件记录、分项收尾回执及离线时序汇总，见 `REVIEW-LOG.md#b11-ai-lifecycle-receipts`。最终1110项全量回归通过（过滤默认端口1项，另跑7项补验）、37条定向/相邻变异全部杀掉、51项连接UI通过。无新真实模型或queue样本；不追认B10未知终态、不改善或承诺模型时延。下一窗口需重新授权。
- B12本次授权验证受阻：原任务两次只读准备均未发现新MCP，共23.364秒；未发queue、未开手、未启动真实AI评估。独立stdio读取同一连接文件成功；因此不能把这次失败归为扑克或推理错误。已关闭追加输入，下一步先排查原任务工具加载，详见 `REVIEW-LOG.md#b12-native-receipts-window`。
- B12另获历史直接证据：原任务可见工具输出确认B10的一次ai.start和一次ai.resolve，后者返回hand_advanced、1→2手，回答被丢弃而非silent。B10原始记录不变；这纠正当前“终态原因unknown”，但仍无成功公开或silent，Codex Gate5保持blocked，Claude保持not_run。
- B12清理并未全部完成：撤销后旧权限HTTP403，临时配置、浏览器、本轮beta及64300端口已关闭，旧beta16608未动。工具策略拒绝删除已撤销的私有文件，宿主管理的匹配MCP进程仍可见；捕获只有首行，无footer和关闭回执，write/close为unknown。
- B13本地关停切片已完成：真实父子IPC、分项输出完整性和实际退出判定已实现；独立检查发现的三类交叠失败已修复。最终46项定向/相邻测试、9条实际变异、主线程非空捕获整合26项均通过，见 `REVIEW-LOG.md#b13-host-readiness-shutdown`。591条变异只静态核对，未跑全量或浏览器；没有新增原游戏任务输入、queue或真实模型调用。原任务MCP实际就绪仍未验证，不追认B12的PTY收尾成功。
- B14第一批曾停在具体AI权限门：0原生输入/queue/评估，服务已关闭；历史事实保留在 `REVIEW-LOG.md#b14-native-readiness-permission-boundary`。后续用户“允许”已由DEC-20260831-003解除这项授权阻塞，不再等待同一确认。
- B14授权后实测：原任务一次只读MCP准备成功，随后3个不同公开来源各经一次queue触发一次真实start/resolve和一次成功公开，A无需再次点击或补提示；共4次原任务输入、7次原任务游戏MCP调用。两例在等待区、一例在进行中的第1手，不是三手真人测试。源事件到公开分别43.857/46.785/43.660秒，不是纯推理时间或实时性通过。Codex Gate5仅此固定版本单席探针为pass，Claude仍not_run，完整主动产品仍未交付。唯一裁决见 `REVIEW-LOG.md#b14-native-public-replies`。
- B14修复：实机跨街回复的权威延迟字段未显示，现只修视图映射；真实producer回归先5项失败、修复后20/20，相邻45/45、恢复旧映射的1条变异被杀，隔离上下文复核无新增finding。主线程修复后脚本双页UI14/14，窄屏not_run；不倒算为原生样本当时显示正确，不合计重复覆盖或声称全量重跑。
- B14收尾仅部分完成：权限已撤销且旧连接明确被拒，临时配置已移除，beta/控制器正常退出，捕获18条事件与footer/关闭回执对应，52231无监听；但本批失效私有文件和宿主管理MCP进程的清理命令被工具策略拒绝，未绕过，Gate9为blocked。本地修复回归的独立服务另已关闭。最小可Git复核事实包在 `evidence/probes/b14-codex-queue-native-20260831/`，未提交，也不是accepted产品证据。
- B15本地接线已验证：已有协调器新增默认关闭、有界启停的通知窗口；固定一个游戏任务，只有实际匹配的resolve才允许下一次通知。独立检查修复跨绑定旧未决/清理围栏和发送前到期的计数问题，主线程补齐queue回执已返回后的取消竞态测试。最终全量Node1239/1239（69362.1688ms），31条定向变异全部杀掉、0存活/未评估；发送器首轮1存活记录保留。两真人HTTP→两逐席MCP→两脚本queue进程的公开/沉默链已实跑，唯一当批记录见 `REVIEW-LOG.md#b15-managed-wake-session`。真实模型/原生queue均0，启停UI和连续原生验证仍缺；B14清理阻塞原样保留。
- B16本人启停控件已完成本地验证：原牌桌加入每窗确认、实际上限、启停/同键核对与分项状态；截图发现的新旧窗口回执混用已修，独立复核发现的可选模块阻塞刷新、迟到模块丢失未决授权屏障两项P2已修并有红绿回归。最终全量Node1314/1314（69844.1736ms），补充浏览器35/35（9360.2016ms），原纯状态模块10条定向变异全部杀掉。实际Browser与脚本证据见 `REVIEW-LOG.md#b16-managed-wake-controls`，原生模型/queue均0；不能将B15结束时“缺UI”继续当作当前事实。真实连续运行、第二真实席和B14清理阻塞仍缺，不关闭父节点。
- B17真实连续批次未闭合：独立检查先修复“权威resolve早于queue ACK、随后撤权会丢失已结清回执”的真实竞态；42/42定向、19/19控制测试、1条实际变异及最终全量Node1315/1315（69343.9369ms）通过。随后三批共消耗4次原任务输入、其中1次queue：第一批readiness实际调用一次游戏MCP，但B17专用外壳在90秒空闲上限退出，queue回合未调用MCP，页面以1次尝试/1次接收/0次resolve自动停止；修正外壳后，第二、三批readiness回合完成但MCP进程均未再启动。全程0次`ai.start`、0次`ai.resolve`、0条AI公开，不能证明连续产品路径。三批权限、临时配置/私有文件、页面、beta、端口及本批进程均已清理；B12/B14历史资源未动。唯一裁决见 `REVIEW-LOG.md#b17-native-managed-wake-carrier-boundary`。
- B18稳定项目接入已完成本地实现与重启后原生复验：项目MCP只加载一次，固定读取Git忽略的`.tokengame-private/active-model-connection.json`；真人用`connection:activate`原子发布或换发逐席文件、用`connection:clear`只清本地槽位，服务端撤权仍是独立动作。Codex专有配置器位于插件适配层，只管理真人明确指定项目的受管块，不改用户级配置；通用`src/`继续通过宿主中立扫描。B18基线为Node1328/1328（66843.1965ms）、总门禁638/638、连接浏览器51/51和Skill有效；原生复验发现并修复缺省favicon 404后，当前最终全量为1329/1329（68569.4652ms），干净浏览器0 error/0 warning。父项目`H:/tokengold`受管块写入并由真人重启后，当前任务只发现`tokengame_table`；缺槽失败关闭，激活后原生只读成功，撤权后旧令牌被拒，同路径换发激活后不重启即恢复。第二个独立浏览器发一条公开消息后，当前Codex会话完成1次`take_intents/start/resolve`，A/B两页均显示同文座位AI气泡。最终服务端撤权、本地槽清除、两页关闭、beta端口释放；工具策略拒绝删除本轮166字节失效下载文件，未绕过，需真人手工删除。该批0 queue，未验证持续主动唤醒、第二真实AI席或牌局内时延。唯一裁决见 `REVIEW-LOG.md#b18-stable-project-mcp-activation`。
- B19稳定入口连续通知在限定等待区通过：复用闲置专用游戏任务`TokenGame 临时单席接入验证`，先以一次手工只读就绪回合确认该旧任务在重启后确实命中新`tokengame_project`；宿主任务接口未返回items，但牌桌权威显示“已收到本席宿主请求”。随后本人显式开启最多2次/180秒窗口，B两条不同公开消息严格串行：第一条权威结清后才发送第二条。两个queue回合分别28.977秒、24.405秒完成，最终页面为尝试2/接收2/权威结清2、因次数上限停止；A/B两页均显示两条真实AI气泡，玩家没有再次点击或给专用任务补提示。窗口116.911秒含浏览器观察与等待，不是模型耗时和SLA。该批没有Ready或开手，`proactive_wake_verified`暂不翻转；第二真实AI席、牌局内连续通知和时延分段仍未验证。服务端撤权、活动槽、浏览器、beta和7802已清；B18/B19两份166字节失效下载仍因删除策略边界等待真人手工处理。唯一裁决见 `REVIEW-LOG.md#b19-stable-managed-wake-native`。
- B20牌局内有界样本未通过：两席Ready并进入第1手行动期后，本人开启最多1次/120秒窗口；A无点击或新提示，专用任务自动开始并在17.426秒完成，但页面20.342秒时以`wake_start_failed`、尝试1/接收1/结清0停止，两页无AI气泡。生命周期回执记录第1～4手和第3手一条B公开消息，却没有评估开始、turn或终态；任务启动早于该B消息，因此具体更早扑克来源为unknown。按停止条件没有重试。已补仅保留稳定业务码的受限诊断，不保留details/自由文本；最终Node1332/1332（68593.6824ms）、相关变异34/34、脚本浏览器35/35。它们不改写原生失败，也不翻`proactive_wake_verified`。权限、活动槽、浏览器、beta及51999/7802已清；B18/B19两份166字节和B20一份167字节失效下载等待真人手工删除。唯一裁决见 `REVIEW-LOG.md#b20-hand-active-managed-wake-diagnostic`。
- B21新手早期牌局样本已取得权威开始与终态：窗口在Ready前开启，进入第1手后仅发送一次原生queue，最终尝试/接收/权威结清为1/1/1；第1手开始到评估开始23.701秒，评估直到30秒行动截止前约6.302秒才启动，10.781秒后因已进入第2手以`silent/hand_advanced`合法丢弃，A/B两页均为0条AI气泡。该样本没有`failure_code`，不能反推B20历史码，后者仍为unknown；`proactive_wake_verified`保持false。没有源码变更或测试重跑。服务端撤权、活动槽、两页、beta及55148/7802/51999/16608均已清；直接PTY停止返回1，不能冒充beta exit0；新增一份167字节失效下载与前三份一并等待真人手工删除。唯一裁决见 `REVIEW-LOG.md#b21-hand-active-managed-wake`。
- B22已保留最小managed fast-path并完成一次原生对照：managed通知在两个已校验编号后立即要求首项工具调用为`tokengame_table.ai.start`，禁止前置分析/计划/复述/读文件、任务、投影或其他工具；未设置`noticeKind`的旧B10文本逐字不变。新测试先红37/38再绿38/38，旧probe 117/117，发送器与共享probe变异5/5+8/8，合并与独立复核均155/155；没有浏览器或原生归因。唯一原生queue为1/1/1、`failure_code=null`，HAND1→start 13.709秒、start→`silent` 9.817秒，终态在行动截止前6.476秒且距HAND2 9.678秒；相对B21的HAND→start名义缩短9.992秒，但source精确时刻unknown、任务时刻仅秒级且turn `items=[]`，首项工具顺序unknown，不能把改善全归因prompt或外推SLA。两页0气泡，无公开回复；`proactive_wake_verified`仍false。唯一裁决见 `REVIEW-LOG.md#b22-fast-path-native`。
- B23完成固定任务去敏与Codex当前任务一键入口：固定sender允许服务端选择唯一预配置任务，页面固定模式不再填写、看见或提交任务UUID；旧自定义queue手填兼容不变。实现聚焦184/184、初始变异14/14，独立复核184/184并修错误响应防回显与失效锚点，限定变异11/11；脚本浏览器旧夹具在累计7 checks时按预期失败，修正后44/44、约11.40秒、0 console/page error，固定4次start均无`thread_id`、旧手填1次含测试UUID、45个可见响应零已知ID。新增`npm run codex:play -- "<当前 Codex 项目根绝对路径>"`，只用`CODEX_THREAD_ID`，先只读验证项目/thread/executable再原子配置；受管MCP使用相对项目根`cwd`，配置变化先要求重启，未变化才同进程启动本地beta。首轮红0/1后9/9、既有5/5、变异9/9；独立审查修复启动失败exit 0、绝对cwd和畸形Windows路径，最终新叶9/9、beta/config/lifecycle 88/88、变异15/15。一键入口子叶0监听/模型/浏览器/原生任务；固定目标脚本浏览器单列且0原生模型/queue，真实`H:/tokengold/.codex`未改。唯一裁决见 `REVIEW-LOG.md#b23-fixed-target-codex-play`。
- B24已在当前任务执行一键入口首次运行：父项目托管块从绝对仓库`cwd`迁为`cwd = "tokengame"`，命令exit 0并在启动beta前只提示重启；托管块外哈希一致，配置无任务UUID、绝对仓库路径或绝对可执行路径，7802无监听。该事实只证明配置迁移，不证明当前宿主已重载。
- B25已完成B24授权的一次真人重启并直接否定相对`cwd`运行时假设：配置写入后出现新的Codex/ChatGPT进程，`codex mcp list --json`能列出相对`cwd = "tokengame"`的服务器，但当前任务没有`tokengame_table`；同一任务在旧canonical绝对仓库`cwd`下曾实际调用该工具。两隔离浏览器仍验证固定目标不显示UUID、上限1次/60秒，但工具未就绪，所以0通知、0模型、0queue且未Ready/开手；服务端撤权、本地槽、浏览器、beta和7802已清。本地生成器已恢复canonical绝对仓库`cwd`并补相对块迁移/去敏回归；截至B25，真实父项目配置与第二次重启尚未获授权。唯一裁决见`REVIEW-LOG.md#b25-relative-cwd-host-failure`。
- B26已按新授权把真实父项目TokenGame唯一托管块恢复为`cwd = "H:/tokengold/tokengame"`：入口exit 0并在beta前停止；托管块外SHA-256前后均为`01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`，唯一标记1/1，旧相对值消失，配置无任务UUID或绝对Codex可执行路径，7802无监听。本批0通知、0模型、0queue、0浏览器；第二次真人手动重启尚未执行。唯一裁决见`REVIEW-LOG.md#b26-absolute-cwd-real-config-migration`。
- B27已直接确认第二次手动重启与绝对`cwd`宿主加载成功：当前任务只出现项目`tokengame_table`，缺活动槽时原生只读按`model_connection_unavailable`失败关闭，激活后同一工具成功。两隔离headed页面完成等待区组合；固定当前正在运行的开发任务只投递一条通知，最终尝试1/接收1/权威结清0并在60.003秒到限，0个完成的新模型回合、0次`ai.start/resolve`、0条AI气泡。目标任务同期为`inProgress`，精确排队规则unknown；没有补发或手工抢待办。两页0 error/0 warning，撤权、活动槽、浏览器、beta及7802均已清。本批新增一份已撤权下载，仓库精确模式累计7份、1165字节，均未读未删。唯一裁决见`REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target`。
- B28已把B27暴露的空闲任务前提写成可执行入口合同：managed启动横幅、固定目标页面说明与每窗本人确认、项目Skill、根/插件README和操作文档都要求目标游戏任务先结束当前回复并保持空闲，并明确queue已接收不等于模型开始或权威结清。聚焦Node首轮18/19因同义措辞不满足精确合同，修正后19/19（1833.6463ms）；脚本浏览器46/46（20729.272ms）、0 browser error、6项清理通过，桌面和320px已目检；完整Node1356/1356（79933.5359ms）。Skill普通校验因GBK载体失败，同一校验器加`python -X utf8`后有效。本批0通知/queue/原生模型/权威评估，活动槽不存在且7802无监听。唯一裁决见`REVIEW-LOG.md#b28-idle-game-task-handoff`。
- 仍未验证，不得写成已通过：空闲游戏任务上的固定目标端到端组合、主动AI完整闭环与实时性、第二真实AI席位、牌局内真实公开往返、完整游戏自由输入自动公开、内嵌UI、Claude Desktop / Cowork接入、异地联机与四真人45分钟UAT。Claude当前安装状态unknown。B28只关闭本地入口/说明缺口，页面本人确认不是宿主空闲遥测；`proactive_wake_verified=false`且`TG-EU-PLAYABILITY-GATE`继续blocked。
- 本轮不做：公开大厅、自动匹配、公平场、信用体系、市场、AI 进化模块、顾问模式、AI 托管。
- 当前路径：`SC-TG-L0-ROOT-20260827-B`、`SC-TG-L1-HOST-ENTRY-20260827-A`、`SC-TG-L2-SESSION-LAUNCH-20260827-B`、`SC-TG-L2-PLAYABLE-TABLE-20260827-D` 与 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D` 是现行已验证语义主链；语义完成不等于相关产品能力已经实现。
- 裸指令 `继续`：在本次显式语义流程回交后，只授权恢复同一已确认路线的专业刷新与开发；不会扩大产品范围，也不会授权发布、部署或付费服务。

```yaml
user_facing_language_resolution:
  contract: dual-ai.user-facing-language-resolution.v1
  status: resolved
  normalized_tag: zh-CN
  source: adapter_default
  adapter: private_dual
  canonical_carrier: STATUS.md
  canonical_before: absent
  project_local_instruction: absent
  persisted: yes
  conflict: none
  evidence:
    - private_dual adapter default

runtime_profile_selection:
  requested: missing
  source: adapter_default
  persistence: product_default
  user_selected: false
  inherited_across_framework_update: not_applicable
  previous_display_name: none
  legacy_machine_preference: absent
  effective: adaptive
  display_name: v2.01-A
  trellis_dispatch_mode: sub-agent_default
  recommendation: none
  recommendation_pointer: none
  unresolved_reason: none
project_adoption_profile: standard

trellis:
  mode: active
  version: 0.5.8
  initialized_at: 2026-08-26
  developer_identity: lhh1301506137
  codex_integration: generated
  codex_hooks_feature: enabled
  hook_review_status: not_verified_in_this_session
  bootstrap_task: archived/2026-08/00-bootstrap-guidelines
  active_task: .trellis/tasks/08-26-public-ai-table-talk
  active_task_status: in_progress
  active_task_scope: fullstack
  active_task_context_curated: yes
  active_task_research: .trellis/tasks/08-26-public-ai-table-talk/research/semantic-candidate-rules-public-ai-exchange-20260827.json
  recommendation: begin_two_friend_acceptance_on_B33_candidate
  reason: B33本地完整门禁、双浏览器破产闭环、远端同一候选四作业CI均已通过；剩余阻塞是两台设备、两真人与双原生Codex的实际体验证据。

continuous_risk_authorization:
  status: active
  max_continuous_risk: medium
  authorization_basis: default_medium
  selection_source: default
  recommendation: none
  recommendation_authorizes_selection: no
  authorized_by_user_phrase: none
  scope: framework_initialization_and_future_in_scope_local_development
  project_stage: prototype
  local_only_confirmed: yes
  data_scope: synthetic_own_seat_cards_and_public_chat_under_DEC_20260831_003
  public_release_or_remote_upload: no
  expires: current_project
  excluded_critical_risk:
    - canonical_critical_never_unattended_stop_list
  posture_notice:
    status: not_needed
    trigger_fingerprint: none
    shown_at: none

local_closeout_authorization:
  status: disabled
  mode: manual_closeout
  authorization_basis: disabled_by_policy
  scope: current_project
  allowed_actions:
    - durable_status_review_log_updates
  excluded_actions:
    - push_deploy_release_publish
    - force_push_or_history_rewrite
    - secrets_or_private_data
    - destructive_or_irreversible_real_data
    - scope_expansion_or_user_acceptance

delegated_mission:
  user_goal: 持续推进朋友私人房原型的本地与真实宿主测试，减少逐次许可等待。
  agreed_product_shape: 正常德扑加本席真实AI公开交流；不扩大当前MVP。
  authorization_ref: PROJECT-DECISION-LOG.md#DEC-20260831-002
  current_batch_goal: 对标成熟德扑实现，补齐会阻断好友十手闭环的基础规则与破产恢复；跑完本地门禁后形成同一候选，不扩账户经济、赛事、公开大厅或Claude适配。
  current_batch_state: B33_remote_candidate_and_CI_green_real_friend_acceptance_not_run
  in_scope: [local_regression, loopback_synthetic_tables, remote_connector_implementation_without_public_exposure, two_friend_workspace_UI, temporary_seat_connections, bounded_queue_tests, evidence_and_owned_resource_cleanup]
  out_of_scope: [global_MCP_reload, automated_or_additional_host_restart, model_override, second_model_API, new_task_creation, public_or_remote_listen, real_private_data, paid_service_activation, commits_or_deploy]
  allowed_autonomous_decisions: [test_order, finite_batch_size, evidence_capture, in_scope_reversible_repair]
  must_ask_user: [canonical_critical_boundary, affected_L0_L2_change, global_refresh_or_uncovered_restart, unexplained_integrity_failure]
  max_risk: medium
  continuous_risk_authorization_ref: STATUS.md#continuous_risk_authorization
  latest_review_ref: REVIEW-LOG.md#b33-poker-maturity-and-refill
  mission_specific_stop_conditions: [explicit_tool_permission_boundary, user_stop, readiness_failure_without_new_evidence, ambiguous_queue_delivery_no_repeat, bounded_batch_limit, unrecoverable_cleanup_or_integrity_failure]
  verification_floor: 原生任务UUID留在本机，远程只有不透明目标别名；逐席鉴权、本人每窗确认、跨窗口单槽、权威resolve、取消与清理分项；脚本、本地入口、真实隧道和两个真实宿主证据分开。
  preflight_baseline:
    status: B28_idle_game_task_handoff_guidance_local_verification_complete_real_combination_open
    commands_or_checks: [B23_fixed_target_focused_184_of_184, B23_fixed_target_initial_mutations_14_of_14, B23_independent_fixed_target_184_of_184_and_limited_mutations_11_of_11, B23_browser_old_fixture_failed_at_cumulative_7_checks_then_44_of_44, B23_codex_play_red_0_of_1_then_9_of_9, B23_existing_config_5_of_5, B23_initial_play_mutations_9_of_9, B23_independent_entry_9_of_9_beta_config_lifecycle_88_of_88_mutations_15_of_15, B24_real_project_config_migration_exit_0_outside_hash_unchanged_no_listener, B25_restart_process_times_after_config_write, B25_server_listed_but_table_tool_absent, B25_fixed_target_real_page_observed_zero_notification, B25_cleanup_complete, B25_absolute_cwd_red_20_of_23_then_green_34_of_34_mutation_1_of_1, B26_real_absolute_cwd_migration_exit_0_outside_hash_unchanged_no_listener, B27_exactly_one_project_tool_unbound_fail_closed_then_bound_read_pass, B27_two_headed_pages_console_clean, B27_notification_1_1_0_max_duration_60.003s, B27_cleanup_slot_absent_port_7802_free, B28_syntax_pass, B28_skill_default_GBK_carrier_fail_then_python_X_utf8_valid, B28_focused_initial_18_of_19_then_19_of_19_1833.6463ms, B28_browser_46_of_46_20729.272ms_zero_error_cleanup_6_of_6, B28_full_node_1356_of_1356_79933.5359ms, B28_slot_absent_port_7802_free]
    known_failures: [B25_relative_cwd_runtime_tool_load_failed_historical, B27_same_inProgress_target_notification_unresolved_exact_queue_scheduling_unknown, B28_UI_acknowledgement_is_not_host_idle_telemetry, B14_Gate9_cleanup_policy_blocked, B20_exact_historical_failure_code_unknown, B22_source_exact_time_unknown, B22_first_tool_order_unknown_items_empty, B22_zero_public_bubbles, seven_revoked_downloads_manual_delete_pending, real_idle_game_task_combination_not_run, second_real_AI_not_run, Claude_not_run, four_human_UAT_not_run]
  effort_budget:
    per_attempt_max_native_inputs: 3
    per_attempt_max_queue_inputs: 2
    B17_total_actual_native_inputs: 4
    B17_total_actual_queue_inputs: 1
    B20_total_actual_native_task_turns: 1
    B20_total_actual_queue_inputs: 1
    B21_total_actual_native_task_turns: 1
    B21_total_actual_queue_inputs: 1
    B22_total_actual_native_task_turns: 1
    B22_total_actual_queue_inputs: 1
    B23_total_actual_native_task_turns: 0
    B23_total_actual_queue_inputs: 0
    B24_total_actual_native_task_turns: 0
    B24_total_actual_queue_inputs: 0
    B25_total_actual_native_task_turns: 0
    B25_total_actual_queue_inputs: 0
    B25_total_actual_notifications: 0
    B26_total_actual_native_task_turns: 0
    B26_total_actual_queue_inputs: 0
    B26_total_actual_notifications: 0
    B27_total_completed_native_task_turns: 0
    B27_total_actual_queue_inputs: 1
    B27_total_actual_notifications: 1
    B27_total_authority_resolves: 0
    B28_total_completed_native_task_turns: 0
    B28_total_actual_queue_inputs: 0
    B28_total_actual_notifications: 0
    B28_total_authority_resolves: 0
    B30_total_completed_native_task_turns: 0
    B30_total_actual_native_queue_inputs: 0
    B30_total_public_tunnel_calls: 0
    B30_scripted_authority_evidence_ref: REVIEW-LOG.md#b30-two-friend-remote-candidate
    uncertain_sends_count_toward_limit: true
    checkpoint_reporting: 每批汇总实际次数和结果，不把预算当必须消耗的目标。
  scheduling: no_automation_or_goal_created
  specific_permission_gate: DEC-20260831-003已由用户“允许”确认；仅原任务测试席自身合成底牌和公共聊天、以本席AI身份公开发言及本机连接凭据，不含下注权限，每批结束撤销。
  done_gate_trigger: 只按实际验证判定，不把长期授权或脚本通过当用户验收。

semantic_alignment:
  mode: semantic_change
  alignment_stage: truth_persistence
  edit_authorization: align_truth_after_confirmation
  semantic_baseline_status: confirmed
  confirmed_nodes:
    - TG-L0-PRODUCT
    - TG-L1-HOST-ENTRY
    - TG-L1-LIVE-TABLE
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-SESSION-LAUNCH
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  pending_or_missing: []
  binding_index: H:/tokengold/tokengame/PROJECT-PLAN-TREE.md#semantic_baseline
  current_root_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
  current_entry_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
  current_session_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
  current_table_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022
  current_public_ai_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
  candidate_confirmation_ref: none
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  next_action: implement_confirmed_semantics_no_further_semantic_change_pending

project_intelligence:
  contract: dual-ai.project-intelligence.v1
  purpose: reconstruct_for_responsibility
  scope: full_current_project
  trigger_reasons: [user_confirmed_primary_takeover, current_route_reconciliation, B14_native_public_replies_and_late_marker_repair]
  refreshed_at: 2026-08-31
  vcs_anchor: bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b
  understanding_audit_ref: UNDERSTANDING-AUDIT.md
  model_role_decision:
    status: new_primary_confirmed
    change_type: primary_replacement
    confirmation: 现在分析项目现状，由你接手开发
    primary: {carrier: codex_desktop, provider: unknown, model_id: unknown, configuration: unknown, role: primary_developer}
    identity_limit: carrier_and_user_assignment_known_exact_model_not_independently_verified
  understanding_depth: takeover_ready
  basis:
    value_semantic_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260827-017
      - PROJECT-DECISION-LOG.md#DEC-20260827-018
      - PROJECT-DECISION-LOG.md#DEC-20260827-019
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - PROJECT-DECISION-LOG.md#DEC-20260827-023
    route_design_refs: [PROJECT-PLAN-TREE.md, TAKEOVER-PLAN.md]
    necessary_reality_refs:
      - src/run-beta.cjs
      - test-support/beta-process.cjs
      - src/host/ai-lifecycle-receipts.cjs
      - test-support/summarize-ai-receipts.cjs
      - src/host/table-web-host.cjs
      - src/host/model-command-surface.cjs
      - src/authority/command-surface.cjs
      - plugins/tokengame/mcp/server.cjs
    fresh_verification: B14_3_native_queue_public_samples_45_adjacent_tests_1_mutation_14_script_UI_checks
    verification_ref: REVIEW-LOG.md#b14-native-public-replies
    context_provider: rg_fallback_no_index_created
  project_thesis:
    summary: 标准德扑加玩家与本席真实会话 AI 的公开语言博弈；近期交付朋友私人房原型，长期再进入大厅与匹配。
    hard_constraints: [one_neutral_authority, one_AI_per_seat, own_private_hand_only, human_structured_poker_actions, no_second_model_API]
    current_stage: local_prototype
  planes:
    value_and_product:
      scope: 2到4人邀请私人房、连续德扑、公开玩家和AI座位气泡。
      deferred: [lobby, matchmaking, credit, fairness, marketplace, memory, advisor, autopilot]
    design_and_architecture:
      selected_views: [seat_ownership, public_private_data_flow, model_human_command_split, authority_timing_and_recovery]
      preserved_invariants: 权威状态和时序唯一；模型只能发言；核心凭据留在唯一托管中；不读取普通宿主历史。
      challenge: 每机一人不是入口强制条件；共享协调器令牌不能被当作逐席授权。
      plan_ref: TAKEOVER-PLAN.md
    current_reality:
      implemented_basis: 远端B33候选97b4c946b2e572e5460babddbb8857abdbb0bbdb包含既有权威栈、逐席授权、本地Codex入口、显式HTTPS入口、出站Connector、双人优先Web工作区，以及成熟规则反例与破产席手间固定补测试筹码；对应Actions 33909572989四作业全部成功。
      first_gap: 由两个设备上的真人、各自已结束启动回复并保持空闲的Codex游戏任务，验证同桌十手、双方AI公开往返、断线恢复、破产补筹及撤权。Claude、大厅和服务器采购不阻塞这个阶段。
      evidence_limit: B33最终字节的串行完整gate实际exit0，Node1491/1491、718/718变异全杀；双隔离Chromium破产闭环11/11、6033ms、0控制台错误；远端同一候选的Windows Node22/24各1491/1491、Ubuntu各1483/1483。首轮gate的712杀掉/3存活/2未评估、一次并发变异误编排及第二次1490/717中间绿灯均保留，不被最终绿色抹除。真实隧道、第二真实AI和两机十手仍未跑；B14和B19有单席原生公开样本，最近已结清的牌局内原生样本仍为B22的silent/0气泡。queue接收不等于模型开始或权威终态；自动化不能替代两真人验收。
    candidates_unknowns_history:
      selected: 复用单协调器与托管，真人逐席绑定，权威启动评估时返回同席快照。
      rejected: 为每席复制权威/托管，或只写说明却保留共用通行令牌。
      historical_probe: 旧CLI前缀/Hook/补交证据冻结，不提升为新私人房或Desktop能力。
  important_unknowns:
    - {unknown_id: U-TG-REAL-HOST-B8, owner: evidence_unknown, status: open, blocking_boundary: capability_claim, blocked_scope_refs: [full_real_host_delivery], proven_slice_ref: REVIEW-LOG.md#b9-real-host-seat-probe}
    - {unknown_id: U-TG-CODEX-UI-SUPPORT, owner: evidence_unknown, status: open, blocking_boundary: capability_claim, blocked_scope_refs: [embedded_UI_claim]}
    - {unknown_id: U-TG-PROACTIVE-WAKE, owner: evidence_unknown, status: open, blocking_boundary: semantic_completion, blocked_scope_refs: [MVP_delivery]}
    - {unknown_id: U-TG-LOCAL-BRIDGE-AUTH, owner: professional_design_unknown, status: open, blocking_boundary: release, blocked_scope_refs: [remote_release]}
    - {unknown_id: U-TG-TWO-FRIEND-UAT, owner: evidence_unknown, status: open, blocking_boundary: user_acceptance, blocked_scope_refs: [MVP_0_1_two_device_two_Codex_ten_hand_signoff]}
    - {unknown_id: U-TG-FOUR-HUMAN-UAT, owner: evidence_unknown, status: deferred_after_MVP_0_1, blocking_boundary: user_acceptance, blocked_scope_refs: [four_human_playability_signoff]}
  readiness: B33_remote_candidate_and_four_job_CI_green_real_two_friend_acceptance_not_run
  freshness: current
  execution_closure_ref: REVIEW-LOG.md#b33-poker-maturity-and-refill
  latest_probe_evidence_ref: REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target
  latest_local_evidence_ref: REVIEW-LOG.md#b33-poker-maturity-and-refill
  protected_semantic_delta: DEC-20260905-001_confirmed_friend_cash_refill_rule
  material_projection_generation: completed_for_refill_command_and_projection
  route_permission:
    decision: granted
    requested_route_ref: TG-EU-PLAYABILITY-GATE
    granted_scope: confirmed_route_local_work_and_bounded_native_tests_under_DEC_20260831_002_plus_completed_relative_migration_and_first_restart_under_DEC_20260901_001_plus_completed_absolute_cwd_write_manual_restart_and_direct_tool_readiness_under_DEC_20260901_002
    authority_source: confirmed_takeover_route_and_continuous_risk_authorization
    active_testing_authorization_ref: PROJECT-DECISION-LOG.md#DEC-20260831-002
    specific_permission_ref: PROJECT-DECISION-LOG.md#DEC-20260831-003
    migration_and_restart_permission_ref: PROJECT-DECISION-LOG.md#DEC-20260901-002
    publication_permission_ref: PROJECT-DECISION-LOG.md#DEC-20260905-002
    completed_native_window_ref: PROJECT-DECISION-LOG.md#DEC-20260831-003
    completed_native_window_status: stopped_4_of_12_inputs_3_of_4_queues_3_public_permission_revoked_cleanup_policy_blocked
    excluded_from_grant: [global_install, global_MCP_reload, automated_or_additional_host_restart, model_or_reasoning_override, second_model_API, remote_listen, push, deploy, uncapped_model_calls, human_acceptance]
  next_owner: user_and_friend_two_device_acceptance_with_codex_primary_support

# 历史理解记录，不再控制当前恢复路线；旧CLI收据只证明其原有范围。
historical_project_intelligence_20260828:
  contract: dual-ai.project-intelligence.v1
  purpose: refresh_affected_model
  scope: affected_l1_domain
  trigger_reasons:
    - formal_high_effort_same_session_self_review
    - foundational_architecture_correction
    - failed_understanding_projection_gate_recovery
    - codex_real_host_probe_closure
  basis:
    value_semantic_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260825-005
      - PROJECT-DECISION-LOG.md#DEC-20260825-009
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
      - PROJECT-DECISION-LOG.md#DEC-20260827-021
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - PROJECT-DECISION-LOG.md#DEC-20260827-023
    route_design_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260825-011
      - PROJECT-PLAN-TREE.md#当前恢复点
    necessary_reality_refs:
      - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md
    change_boundary_ref: implementation-file-set:173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
  project_thesis:
    why_worthwhile: 把 AI 工作宿主中的真人与当前会话 AI 协作本身变成公开、可欺骗、可判断的牌桌信息，而不是再做一个外挂胜率计算器。
    target_user_and_usage: 已在受支持 AI 工作宿主中的玩家，通过 TokenGame 明确进入一张外部权威牌桌，并由该游戏会话的唯一座位 AI 参与公开语言博弈。
    promised_experience: 普通宿主内容保持私密；规定游戏范围内的玩家与 AI 表达以座位气泡公开，AI 可沉默、回答或由可审计事件主动发言，真人仍通过结构化牌桌控件提交官方动作。
    what_good_means:
      - 当前会话模型实际生成回答，不要求第二套模型 API
      - 公开边界可解释且默认失败关闭
      - 牌桌状态由服务端权威维护，语言声明不能覆盖官方事实
    anti_goals:
      - 不镜像整个 Codex 会话
      - 不把真实 Token 额度或金钱引入 MVP
      - 不以未公开稳定的 Codex 自定义 UI 能力作为首版依赖
    stage_constraints:
      - prototype
      - local_first
      - host_probe_completed_and_uninstalled
      - single_stack_browser_loop_closed
      - host_adapter_contract_next
    professional_challenges:
      - 首次安装后同一旧会话立即获得新插件能力并非当前文档保证；完整能力可靠可用通常需要新会话
      - 自定义斜杠命令不是公开插件扩展面；入口改为显式 Skill 或插件提及
      - Codex 自定义 MCP UI 支持边界仍需实机探针，不能作为 MVP 阻塞依赖
      - MCP 主机管理的 OAuth 不能推导为独立 Hook 命令自动获得同一认证；需要捆绑本地桥接进程承接认证和远端连接
      - 本地过滤能阻止普通提示外发，却不能单独阻止当前模型在公开回答中复述私密历史；专用游戏任务和最小上下文是必要边界
      - 用户可修改本地插件，远端无法仅凭 Hook 事件加密证明内容确由 Codex 生成
      - Hook 的 PLUGIN_DATA 在本机不会自动传给旧式捆绑 MCP，补交后的本地 pending 归档需统一状态所有权
      - Codex exec 插件刷新可能留下 MCP 子进程；产品化必须有正常退出、健康检查和精确回收
    unresolved_user_only_information: []
  planes:
    value_and_product:
      current_summary_ref: PROJECT-DECISION-LOG.md#DEC-20260825-005
      unknowns: []
    design_and_architecture:
      selected_views:
        - interfaces_and_invariants
        - ownership_and_persistence
        - failure_and_privacy
      evolution_pressures:
        - 将牌桌视图从独立浏览器逐步升级为支持该标准的内嵌 MCP UI
      observable_evidence_obligations:
        - 同步 UserPromptSubmit Hook 在模型生成前让服务端原子接受一次请求额度并写入公开提示事件
        - 非 TokenGame 提示与回复不产生本地桥接或网络事件
        - Stop 只提交与同一服务端请求、回合和行动窗口匹配的最终回答；迟到或重复回答被服务端拒绝
        - 事件可携带本地观察到的当前模型标识，但不读取不稳定 transcript，也不把该标识宣传为不可伪造证明
        - 桥接不可用时只失败关闭当前 TokenGame 公共请求，不影响普通 Codex 提示
      adversarial_challenge: 上传后过滤会直接泄露隐私；仅在 Hook 内过滤仍会遗漏模型从旧会话复述敏感上下文的风险。必须同时采用精确显式入口、专用游戏任务、结构化最小牌局上下文、本地桥接隔离和服务端原子裁决。
    current_reality:
      implementation_data_integration_verification_runtime_experience:
        - 已建立无第三方运行依赖的 Node.js 本地探针、仓库内 Codex 插件、同步 Hook、stdio MCP、回环桥、伪权威事件服务和独立 Web 观察页
        - npm test 共 11 项通过，覆盖普通 Prompt/Stop 零桥流量、提示预公开、回答配对、幂等、截止时间、失败关闭、PreToolUse、Stop 重入、MCP stdio、显式补交与 HTTP/UI 合同
        - Playwright 已真实点击关闭与重开窗口，并运行公开 Prompt Hook 与 Stop Hook；最终权威事件序号为 prompt 5、answer 6，完整页面控制台错误为 0
        - 浏览器验收发现只读状态未结算过期窗口的分叉，现已修复并增加回归测试
        - 已通过仓库本地 marketplace 把插件安装进 Codex 0.145.0 真宿主，并直接验证公开、普通、重复、关窗、PreToolUse、MCP 状态、桥故障补交和卸载路径
        - 真宿主要求清单显式声明 hooks；补充后宿主运行通过，但当前 plugin-creator 校验器误报 hooks 字段，属于已知假阴性，不能继续声称当前校验器通过
        - 安装的 Hook 默认不自动受信任；专用任务一次性明确信任后运行，普通未信任路径保持零桥流量
        - Stop 重入曾覆盖桥故障时保留的原回答；已用 stop_hook_active 保护修复，并由自动化和真宿主复测
        - 故障回答可由真宿主 publish_ai_answer 补交为唯一权威事件；旧式 MCP 不继承 Hook PLUGIN_DATA，pending 即时归档仍待统一状态所有权
        - 探针结束后插件、测试 marketplace、专用信任配置、缓存、插件数据、端口与本次 MCP 子进程残留均清理为零
        - 本机 Codex CLI 0.145.0 已提供稳定 plugins、hooks、skills 与 MCP 管理能力
        - Hook 文档提供当前模型、用户提示、回合标识和最终助手消息；同步 Hook 可在继续生成前等待，异步 Hook 可能乱序且会在会话结束时取消
        - 插件可捆绑本地 stdio MCP 服务；Hook 可通过 PLUGIN_DATA 持久化私有状态，但本次旧式 MCP 进程没有获得同一变量
        - 远程 MCP 的 OAuth 令牌由宿主附着到 MCP 调用；没有证据表明任意 Hook 网络请求自动继承该令牌
        - 当前 CLI 没有临时 plugin-dir 参数；插件需先加入 marketplace 再安装，会修改 Codex 本地配置和缓存
        - 本机 enable_mcp_apps 为未启用的开发中能力，不能据此承诺 Codex 内嵌牌桌
        - 已新增项目内无限注德州扑克领域状态机与四身份表级权威层，覆盖四轮下注、短额 all-in、主池/多层边池、平池奇数筹码、标准摊牌、超时与自愿亮牌
        - "已按 D 版合同实现宿主中立权威内核：`room-store.cjs`（房间/席位生命周期）、`seat-ai-store.cjs`（公开 AI 七条规则）、`table-orchestrator.cjs`（咬合三内核、不新增语义）、`action-ledger.cjs`（官方动作幂等账）、`due-work.cjs`（到期驱动）、`command-surface.cjs`/`command-server.cjs`/`host-surface.cjs`（唯一命令词表与进程外传输）、`host/seat-custody.cjs`（凭据本机托管）、`run-table-core.cjs`（进程入口 `npm run core`）"
        - "`npm test` 2026-08-28 实测 351/351 通过、fail 0，工作树与全新克隆两处各跑一次；旧探针栈的 11 项 Codex 桥接回归仍在其中。不再引用历史 23/23 或本轮之前的 336/336"
        - "Codex 实现复核 F1–F6 已逐条闭合，每条都有失败复现、修复与回归测试：F1 `99acd63`、F2 `444607c`、F3 `684d680`+`ffbcf51`、F4 `2e18b94`+`6bf7f30`、F5 `d8caeec`、F6 `fb3f323`；回应文档 `3081d01`"
        - "八个变异规格在修好的驱动下全部重跑：f1 15/15、f2 18/18、f3 14/14、f4 14/14、f5 28/28、f6 14/14、web-host-boundary 16/16、vacuous-empty-collections 3/3，合计 122 个变异 122 杀掉 0 存活 0 未评估。此前 F3/F4 的 14/14 是假绿，原因是判定用 `grep -E \"^not ok\"` 而 Node 默认 reporter 不输出 TAP，已在 `675a7d3` 修好并在 `docs/CLAUDE-REVIEW-RESPONSE-20260828.md` 更正"
        - "`vacuous-empty-collections.json` 是自查产物，问的是另一个问题：把被断言的集合替换成空数组，整个测试是否仍然通过。判定刻意不是「某条断言是否空过」而是「集合空了是否产生假绿」——三条变异全部 KILLED，说明 holdem / mcp / 协调器三条路径上的 `every()` 都有别的断言兜住"
        - "`test/two-process-table.test.cjs` 已用两个独立 Node 进程在同一份权威状态上打完一手牌，实证 L0 宿主中立性；错凭据进程失败且权威状态不变"
        - "最新 `npm run table` 已验证旧探针栈的权威服务、本地桥、四席观察者零底牌及 Ctrl+C 无监听残留；该栈现已被替代，作为历史证据冻结保留"
        - "新牌桌 UI 已与宿主中立内核形成单栈闭环：`host/table-web-host.cjs`（会话、连接、动作转发、出口泄漏扫描）、`host/table-view-model.cjs`（权威投影 → `tokengame.table-view.v1`）、`run-table-web.cjs`（进程入口 `npm run web`）、`web/table/`（原生 HTML/CSS/JS 牌桌）。浏览器拿不到权威原始事件与秘密，也拿不到席位凭据——凭据留在协调器进程内"
        - "`test-support/table-web-acceptance.mjs` 用四个隔离浏览器上下文跑通完整回路：建房/邀请码加入 → 逐席公开范围确认 → Ready 与倒计时 → 连续三手无限注德州（跨手筹码延续）→ 玩家公开聊天 → 座位 AI 公开发言与沉默（THINKING/DEGRADED/OFFLINE/OFF 与迟到标注）→ 掉线与 120 秒保留窗恢复 → 暂离 → 离桌 → 逐查看者本地隐藏。2026-08-28 实测 80 条断言全过、控制台错误 0、exit 0；工作树四次、全新克隆三次"
        - "座位 AI 用 `test-support/scripted-model-adapter.cjs` 这个确定性 fake 宿主适配器驱动，覆盖公开/沉默/降级/离线各分支；它证明的是内核与 UI 的咬合，不能据此声称真实宿主模型能力已验证"
        - "【2026-08-28 复开勘误】上面那条「80 条断言全过」与当时的证据一致，但它掩盖了五处「有代码、有按钮、有权威支持，而功能从未成立」的缺口——共同点是它们都不会红：没有失败的测试，没有报错，画面上也看不出异常。80 条断言之所以全过，是因为没有一条走到那些路径上。逐条见 `PROJECT-PLAN-TREE.md#TG-EU-SINGLE-STACK-WEB-TABLE` 的 `errata`：连接租约不存在（真实关页面/刷新/拔网线之后席位永远显示在线）、自愿亮牌恒假（`can_reveal` 查了一个权威侧不存在的 `settlement.payouts`，按钮一次都没出现过，因此客户端缺参数的缺陷也从未被触发）、同意门在绑定之后而非之前、换绑或改桌规之后同意门再也不出现（`public_scope_confirmed` 算的是「存在过一份确认」）、畸形上游投影让 `/api/view` 回 500 而页面停在上一帧"
        - "【2026-08-28 复开后实测】`npm test` 498/498 通过、fail 0；`npm run gate` MUTATION_TOTAL=226 KILLED=226 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 `artifacts/acc-item7-redact` 150 条断言全过、控制台错误 0、四个隔离上下文、打到第 4 手、24 张截图（artifacts/ 被忽略，路径只在本机存在）。新增六个变异规格：connection-lease 16/16、voluntary-reveal 6/6、entry-consent-idempotency 11/11、scope-reconfirmation 12/12、view-model-degradation 7/7、acceptance-result 15/15。不再引用本轮之前的 351/351、122 个变异或 80 条断言作为当前实测"
        - "【2026-08-28 复开后工具修正】变异驱动此前对非 JS 文件一律判 INVALID（`node --check` 认扩展名），于是 HTML 结构与 CSS 规则这两类产品真的依赖的不变量永远不会被评估——报出来是「未评估」而不是「防线有洞」。已按扩展名分流，`web/table/index.html` 与 `table.css` 上的变异现在可判定"
        - "【2026-08-28 适配器合同与多手验收实测】提交范围 `46d5b5d..0e80395`。`npm test` 644/644 通过、fail 0、skipped 0；`npm run gate` MUTATION_TOTAL=315 KILLED=315 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 201 条断言全过、控制台错误 0、四个隔离上下文、**打到第 12 手**、27 张截图，连续三轮干净运行。新增三个变异规格：adapter-contract 34/34、seat-model-adapter 14/14、multi-hand-verdict 41/41。验收新增三节：8c 连续打到第 11 手并逐手查筹码守恒、8d 五种畸形投影的有界降级、9d 有人跟的全下摊牌（浏览器层首次验到「筹码归零的席位不带着 0 筹码进下一手」这条 F1）。不再引用本轮之前的 498/498、226 个变异或 150 条断言作为当前实测"
        - "【2026-08-28 宿主中立底座】`src/contract/adapter-contract.cjs` 是两份合同的共享底座：三个信封、7 类错误映射（覆盖源码 65 个码）、三层身份（`player_id`/`seat_handle`/`authority_id`，`seat_credential` 刻意不在其中）、生命周期迁移、能力协商。`src/host/seat-model-adapter.cjs` 是真实的模型面适配器，过一致性套件。内核里不出现 Claude/Codex 专有判断，由 `test/adapter-contract.test.cjs` 扫源码盯着；唯一命中是 `src/authority/table-store.cjs` 里一个用户可见的牌桌显示名，文件带 `SUPERSEDED_BY_` 冻结标记，未擅自改，列为待裁决项。HostCommandAdapter 未实现：它要动已闭合的 `table-web-host.cjs`，且两份合同的拆分该由 Codex 先裁"
        - "【2026-08-28 判定式可测性】8c/8d/9d 的判定原本写在 `.mjs` 里，而 `.mjs` 的逻辑单元测试装不进来——装不进来的判定式等于没有测试（上一轮「中止却判通过」正是这么漏过去的）。`chipConservation`/`degradationVerdict`/`handCoverage` 抽进 `test-support/acceptance-result.cjs`，`test/multi-hand-verdict.test.cjs` 39 条盯着，含盯调用点的静态断言"
        - "【2026-08-28 证据完整性修正】第 7 轮运行死在路由回调的未处理拒绝上，它绕过 `main` 的 `catch`，`finally` 不跑、`result.json` 写不出来，于是目录里留下的是上一轮那份——上一轮恰好通过的话，崩掉的运行看起来和通过一模一样（与 negctl6 同类，载体换成陈旧文件）。三处修：路由回调包 try 且吞下的错误由第 13 节结账、开跑前先删 `result.json`、加 `unhandledRejection` 处理器。负控实测：退出码 1、判定文件不留下、stderr 写明原因"
        - "【2026-08-28 如实记为缺口】边池分层在浏览器层不可观测：投影只给 `pot_total`（`src/host/table-view-model.cjs:456`），引擎算出的 `pots` 没进 `tokengame.table-view.v1`。没有写读 `undefined` 的断言（那种断言永远为真），由 `test/holdem-engine.test.cjs` 与 `test/cross-hand-stacks.test.cjs` 在单元层覆盖。是否投影出去列为待裁决项"
        - "【2026-08-29 模型可见凭据边界】提交 `287f083`。三个模型可见出口（成功 result、核心错误 details、本地拒绝 details）此前各自净化，成功路径回显 `recovery_credential`，且 `adapter.surface.custody` 可从公开属性取到句柄与凭据映射。改为唯一托管净化 + `assertNoLeak`，命中秘密时**失败关闭**（返 `credential_leak`），不是打码后继续；`#custody`/`#dispatch`/`#surface`/`#issued` 改成真正的 JS 私有字段，不靠 `inspectableState`「选择不展示」。顺序是载荷：先扫后洗，反过来 `sanitizeResult` 会先把 `recovery_credential` 剥掉，扫描什么都找不到，于是上游缺陷被静默修好。字段名扫描收窄到键位（`\"field\":` 形式）——不收窄的话 `seat_identity_not_model_supplied` 这个成功拦截的 `details.field` **值**恰好是 `\"recovery_credential\"`，会被误判成泄漏，而把一次成功拦截读成泄漏会引人去删那份报告。本轮实测：`test/model-visible-credential-boundary.test.cjs` 26 项全过（只用合成秘密）；`credential-boundary` 变异 19/19 杀掉；`npm test` 670/670；`npm run gate` 334/334 GATE=PASS。55 节点对象图搜索：通向 custody 的路径无，对照组仍可取出。本地拒绝出口没有可构造的行为负例（`ModelSurfaceError.details` 只有三种形状、字段全是字面量、命令名在到达 `#surface.call` 之前已被拦），只有静态门禁存在性断言，限制写进测试与 `excluded`"
        - "【2026-08-29 浏览器门禁根因修复】提交 `5235bf5`。B.1 三类证据都带 player/阶段/method/URL/status，新增「窗口外非 2xx/3xx 必须为 0」——补的是结构性盲区：浏览器不为 4xx 打控制台日志（fetch 拿到 403 是「成功收到响应」），只查控制台的脚本永远不会因为「请求发出去了但被拒」而红。豁免按语义不按文本。B.2 偶发 403 有三个来源：测试窗口竞态（证据按响应到达时刻归类，改为按发出时刻，用 WeakMap 记发出时的阶段与窗口状态）、离桌竞态（await 期间的轮询带着即将作废的凭据）、掉线竞态（更坏：`touchConnection` 对被摘掉的连接 id 会重新建连，那一跳轮询把刚刚的掉线撤销，保留窗根本没走；响应围栏挡不住，请求已经到了服务端）。两条产品竞态由「先 stopPolling 再发请求」修好；`refresh` 里刻意不中止上一次，重叠由 await 之后的围栏处理。双向验证：旧客户端 1 条 403 + 1 条控制台错误，新客户端 0 条。B.3 加确定性发牌（sfc32 + 拒绝采样，入口三道约束：只自带内核、只回环、启动报指纹不报原文）**还不够**——第一版种子正好让全下方赢，破产分支被稳定地跳过，而报告写着「确定性发牌，两次名单一致」；稳定缺失比随机缺失更坏。§9d 改成重复「短码全下、大码跟、其余弃」直到真有一席归零，预算用尽就红，失败收集到循环外一次性判定。本轮实测：`npm test` 698/698 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=358 KILLED=358 SURVIVED=0 SKIPPED=0 GATE=PASS；新增两个变异规格 deterministic-deck 9/9、poll-lifecycle-race 10/10，multi-hand-verdict 扩到 46/46；浏览器验收 **工作树连跑 3 次 + 全新无硬链接克隆连跑 3 次，六次全 EXIT=0、各 209 项全过、到第 13 手、名单完全一致**，破产分支六次都走到（第 2 轮归零 bob）。不再引用本轮之前的 644/644、315 个变异或 201 条断言作为当前实测"
        - "【2026-08-29 顺带修掉两处永不会红的断言】六面骰那条均匀性检查查不出「拒绝采样退化成取模」：2^32 对 6 的偏差约 1.4e-9，比 5% 容差小九个数量级，也就是说删掉拒绝采样在那条下面永远绿。补一条上界取 3*2^30 的——拒绝采样下最低段占 1/3，取模下占 1/2，实测 33.3% 对 50.0%。另一处：四条 `xxxFailures` 断言原先只查串在文件里出现过，而每条 check 的 detail 里也有同一个三元，于是把条件位换成 `true` 仍然满足；改为断言 check 的**条件位**。两处都是变异存活指出来的，不是审读发现的"
        - "【2026-08-29 记为已知代价】`deterministic-deck` 里两条变异杀不掉，且是实测而非推断：去掉 sfc32 的 12 次预热丢弃、把四个 FNV 起点改成同一个，相邻种子 1–64 各洗第一副牌的三项指标与基线无法区分（互不相同 64/64、前八张同位同牌 1.85%/1.81%/1.97%（随机期望 1.92%）、第一张用到的牌面 39–40/52）。原因是 `seedToState` 那轮额外搅拌已承担实际去相关，两者是第二道防线。留着代码但不为它们编阈值——那样的断言只会在改动无关代码时红。`poll-lifecycle-race` 十条中多数只由源码断言杀：`web/table/table.js` 是 classic script，没有测试能 require 它，行为侧兜底只有验收那条「窗口外非 2xx/3xx 为 0」。两处代价都写进各自 `excluded`"
        - "【2026-08-29 措辞勘误·不改写上条】上面 2026-08-28 那条里的「两份合同」是当时的说法，保留原文不改。措辞已于本日更正为「一套 HostAdapter 协议、`host_command` 与 `seat_model` 两个权限剖面」：除 `commands` 之外信封、错误映射、身份层、生命周期、能力协商全部共享，说成两份合同会让人以为要各自验证一遍，而一致性套件是同一批检查跑两个剖面。**关闭的是说法与结构不符，不是改了结构**——`ADAPTER_ROLES` 本来就按对象身份引 `HUMAN_COMMANDS`/`MODEL_COMMANDS`，没有拷贝。真正必须分开的只有命令清单：合成一张表意味着权限差别只能靠运行期检查表达，漏一条就是模型拿到了下注权限"
        - "【2026-08-29 请求信封落到真实路径】提交 `e6397c3`。`requestEnvelope` 此前**零个非测试调用方**——「每次请求都有信封」只在纯函数测试里成立，而合同文档把它写成了协议。二选一里选接线不选删除：响应带版本、请求不带，服务端因此无法察觉一个跑在别的合同上的客户端，而这正是版本号存在要回答的那句「你认得我说的话吗」。两个传输（`HttpCoreClient`、MCP `coreRequest`）都改为经 helper 构造；服务端在**令牌之后、派发之前**校验——放在令牌前会把合同版本泄给未授权者，放在派发后跨版本客户端拿到的是「未知命令」，它会去查命令表而那张表在它那一版里是对的。缺版本也拒：放行等于让这条检查对任何从不带版本的客户端永远不会红。版本号移到 `src/shared/contract-version.cjs`——让权威层 require 合同层会把依赖方向倒过来，抄一份则会漂移（与禁止复制命令表同一条理由）"
        - "【2026-08-29 单一来源要行为测试才钉得住】`request-envelope` 变异首轮 12 条里 4 条存活，全是同一类：抄一份数字、或传输自己拼 `contract_version: 1` 字面量。这类写法**此刻什么都不坏**——两个数相等、形状也对、既有断言全绿；坏的是下一次改版本号时只有一侧跟着改。源码断言（查 require 那行在不在）是弱答案，钉的是文本。改为行为测试：`test/contract-version-single-source.test.cjs` 把那唯一的来源改掉，再看合同层请求信封、响应信封、`HttpCoreClient` 线上 body、MCP 线上 body、服务端版本闸门五处是否都跟着变，测的是「值从哪儿来」。MCP 那侧 `coreRequest` 没有导出也不收注入的 fetch，用 `TOKENGAME_COMMAND_ORIGIN` 指向一个记账用的假核心取到落地字节，没有为可测性给产品开测试专用出口。fake 版本号由真值加偏移算出，不写死——写死的数字有一天会撞上真版本，那时这些测试会在「fake 等于真值」的情况下继续全绿。逐条验过归因：四条变异各自被对应那条断言杀掉，不是被别的测试连带杀掉"
        - "【2026-08-29 记为已知代价】`withVersion` 里的 `await body()` 杀不掉，实测而非推断：改成 `return body()` 后五条测试仍然 pass 5 fail 0。原因是 `const { CONTRACT_VERSION } = require(...)` 在模块加载那一刻取值，每次读版本都落在 body 的同步前缀里，早于任何 await 也早于 finally；外层 `await` 又因 promise 同化仍会等到 body 结束。留着它是给将来「在 await 之后才读版本」的测试用的。此刻硬要杀它只能专门造一条依赖还原时机的测试——那是为了杀变异而写测试，方向反了。写进 `excluded`"
        - "【2026-08-29 浏览器验收覆盖不到这条改动】验收跑的是 `core_transport=in_process`，而 `InProcessCoreClient` 直接调 `surface.dispatch`、根本不构造信封，所以 209 项全过**不构成** HTTP 传输已验证的证据。远端那条路另探：起真内核 + Web 牌桌设 `TOKENGAME_COMMAND_ORIGIN`，确认 `core_transport=http` 且过 HTTP 建房 200；双向验证——把版本从客户端摘掉会红成 `contract_version_missing`。探针在 `artifacts/`（已 gitignore），不入库、不计入门禁。远端模式跑不了整套 209 项：`run-table-core.cjs` 不接受牌堆种子，确定性发牌那几条断言只对自带内核成立，没有为了让它通过去弱化那些断言"
        - "【2026-08-29 一致性报告的四态与恰好一次】提交 `31537dc`。每项检查有稳定 `check_id` 与 `pass|fail|not_run|unverifiable`；必需项按角色登记在 `CHECKS` 表里，跑完逐条对账，漏记/重记/记了不属于本角色的都是硬失败**并一并进 `failures`**——只留在 `report_integrity` 里的话，只看 `failures` 的调用方会把一份缺十条的报告读成通过。要 `check_id` 的直接理由是名字里带插值：越界那条在两个角色下是两个字符串，跨报告对不上。提前返回不再交短报告：工厂缺失、构造失败时其余全部显式记 `not_run` 并写明理由，旧版那两条路径返回的两条报告在调用方看来和完整报告没有区别。`passed` 拆成 `conformance_passed`（无 fail 且结构完整）与 `fully_verified`（另外要求无 unverifiable、无 not_run），**不再导出叫 `passed` 的字段**——调用方必须说出要哪一个。`proactive_wake_actually_works` 恒定登记且刻意没有 pass 分支：声明了记 unverifiable，没声明记 not_run，套件永远不产出一条读起来像「主动唤醒验过了」的记录。两个角色的 `fully_verified` 当前都是 false。本轮实测：`npm test` 734/734 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=385 KILLED=385 SURVIVED=0 SKIPPED=0 GATE=PASS；新增 `conformance-report` 变异 15/15（首轮 5 杀 10 存活）；`adapter-contract` 34/34 与 `seat-model-adapter` 14/14 各修了指向被重写行的查找串；浏览器验收 209 项全过、控制台错误 0、到第 13 手"
        - "【2026-08-29 变体测试改成按 check_id 归因】每个 BROKEN 变体声明 `expect`，断言红的是**该红的那一条**，不再只断言 `failures` 非空。这不是收紧措辞：`out_of_face_passthrough` 当初就是被「释放后不能再发命令」抓住的，越界那一条其实一次都没红过，而报告读起来是「套件抓住了」。新增两个变体补上此前无人看守的一段：改写交给传输的命令、交一份过不了 JSON 往返的参数。新增 15 条变异专打报告聚合、跳过、提前返回与错误归因；其中四条（漏记、重记、结构问题不进 `failures`、未登记 id 被容忍）**没有任何适配器实现能触发**，是套件自己的缺陷形状，由新增 `test/conformance-report-integrity.test.cjs` 对着记账器直接构造，为此导出 `createLedger`——该文件整体是测试机械而非产品面，为自测导出内部件不构成产品让步"
        - "【2026-08-29 自己写的检查里又找出两处不会红】请求载荷那条原先比序列化后的字符串，而 `JSON.stringify` 在**两侧**都会丢掉函数属性，于是 `{a:1,f(){}}` 与它的往返结果序列化出来一模一样，断言恒成立；改为比键的数目。紧接着补的那条逐个比成员的断言随即成了永远不会红的一条——JSON 往返只丢键、不新增也不改名，所以等长子集就是同一集合，数目那条已先拦下；删掉而不是留着配 `excluded`。两处都是变异存活指出来的"
        - "【2026-08-29 请求信封在适配器层的落点】C.2 遗留项落在 `dispatch_payload_envelope_ready`。适配器只交 `(command, params)`，信封由传输构造，所以适配器层能验的是「交下去的载荷构不构得出合规信封」：命令非空且在本角色命令面里、参数是可序列化的普通对象、真的拿 `requestEnvelope` 构一遍且三个字段对得上。需要调用方提供 `observeDispatch` 才查得了，缺了记 `not_run` 并写明原因——**没有为可测性给适配器加导出或后门**。此前计划里写的「在 D 里把请求信封检查加进一致性套件」按实际结构落成了这个形状：`dispatch(command, params)` 两个位置参数里没有信封，硬要在适配器层查信封只能要求实现暴露它不拥有的东西"
        - "【2026-08-29 实质性改变由 policy epoch 表达，且权威侧强制】提交 `4456a4c`。此前 limits 那一维**只在界面上成立**：`limits_version` 写进了确认记录却从不被 `requireConfirmedScope` 检查，绕过界面直接打命令的调用方在额度实质放宽之后仍握着旧同意继续发言。新增 `src/authority/policy-epoch.cjs` 把六个公开范围字段加绑房、桌规合成一个串，gate 与投影同一处推导，比较点只有一处，将来加一维不会再出现「加了但某处没比」。「实质」的边界是显式的而不是「任意配置变化」：`version` 与 `bubbleDisplayMs` 列在排除清单并各自写了理由——把 `version` 算进去会让任何版本号变动都让既有确认失效，同意门被刷成噪音；`playerRollingWindowMs` 反过来算实质，窗时长与条数合起来才是速率。裁决方向与上一轮 `scope-reconfirmation` 的断言相反，这是有意裁决：该文件开头本就把「权威侧要不要按版本串强制」记成待裁决项并写明按版本串强制的坏处。三字段旧路径保留为退路（权威不报 epoch 时），并单独用一条站在那个条件上的测试钉住——否则退路里的取值错误没有可观察后果，变异会从「代码不可达」里活着出去，本轮 `host-reports-lifecycle-version` 正是这样先存活的。本轮实测：`test/policy-epoch.test.cjs` 18/18（旧代码 3 条红）；`test/scope-reconfirmation.test.cjs` 14/14（旧编排 2 条红）；`policy-epoch` 变异 16/16；`f3-public-scope-consent` 14/14（3 条陈旧查找串按新代码重写）；`npm test` 756/756 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=410 KILLED=410 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 209 项全过、控制台错误 0、到第 13 手"
        - "【2026-08-29 投影报的 epoch 曾恒为空壳】同一轮里修掉的连带缺陷：`projection()` 读 `roomState()` **顶层**的 `room_binding_id`，而那些字段收在 `.room` 里，于是投影报的 epoch 恒为 `binding:-|rules:-`。表现是界面每次渲染都要求重新确认、理由永远是 `new_room_binding`，而权威侧照常放行，日志里没有任何错误——一个点了也不消失的同意门，比不弹更糟。单元测试查不出它：`policy-epoch` 那组直接拿真值调权威，两侧都对。查出它的是把 epoch 接进视图层之后 `scope-reconfirmation` 的既有断言变红。新增一条「投影报的 epoch 与权威 gate 用的 epoch 同值」并断言两段都不是空壳，因为一个三段全缺的 epoch 也是合法字符串"
        - "【2026-08-29 入口文案把裁决者说反了】`plugin.json` 的 `interface.longDescription` 此前写着「牌局行动仍由独立四人 Web 牌桌裁决」。裁决在宿主中立的权威内核，Web 牌桌只是真人操作它的界面之一。说反的后果不是措辞难看：读者据此会以为换一个界面就换了一个裁决者，于是「两个宿主是不是同一场牌局」这个问题的答案在装机页上是错的，而那正是 L2 章程点名要防的「不同房间命名空间或独立玩家身份」。装机前唯一的说明此前没有任何检查看着它。新增 `test/plugin-entry-copy.test.cjs`（5/5，旧文案 3 条红）：禁那个具体说法、要求正向表述、要求点名四条真人专属命令、禁任何主动唤醒声明。测试自身也补过一次——`/真人的决定|由真人/` 的松散选项被「通常由真人操作」满足，把一道硬边界读成了一个习惯做法，变异 `soften-human-decision` 从这个缺口活着出去；现在另外要求「发不出」并禁掉限定词。`plugin-entry-copy` 变异 9/9"
        - "【2026-08-29 host_command 参考适配器】提交 `0542c1c`、`b93b3d5`。此前那一侧只有模拟器实现，而模拟器过了只说明套件自洽——一份只有模拟器实现的剖面整个就是本轮反复撞到的「一段永远走不到的检查」。`src/host/host-command-adapter.cjs` 只做合同要求的几件事，不起服务、不开定时器、不碰网络，也不碰 `TableWebHost` 一行。三条判断：**哪些命令要凭据不在本层判断**（第一版抄了一份 `CREDENTIAL_COMMANDS`，而托管层 `inject` 自己就按那份清单分流，抄一份漏一条表现为某操作偶尔不管用、多一条表现为建房第一步就失败）；**不猜句柄，哪怕只记着一张**（单席上永远对，多席宿主上是替错的人行动，而单席测试永远发现不了）；**真人面不净化 details、模型面必须净化**（两侧收件人不同，这一侧的收件人就是持有该席凭据的真人，净化会把 `seat_handle_missing` 这类诊断摘掉）。特征测试拿四条命令的注入结果与 `host.injected` 逐字段对账，并另加一条钉住「对账通过不等于两边都什么也没做」。新增错误码 `command_not_host_facing` 归入 identity 类，刻意不与模型侧那条合成一个——合成之后日志里读不出是哪一面越界，而两个方向的严重性差得很远。变异首轮 19 条 17 杀 2 存活，两条都是我自己测试的真实缺口（没断言本地拒绝**不**推进 degraded；没测 `rememberHandle` 拒空串）。本轮实测：`test/host-command-adapter.test.cjs` 20/20；`host-command-adapter` 变异 20/20；`npm test` 778/778 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=430 KILLED=430 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 209 项全过、控制台错误 0、到第 13 手。**运行路径上零个构造点**这句话已由 `test/adapter-integration-truth.test.cjs` 一正一反两条对账钉住（反面：七个运行路径文件里零个 `new HostCommandAdapter`；正面：`TableWebHost` 仍自己持 `SeatCustody` 并自己调 `inject`），所以它是「合同可实现」的证据，不是「产品已改用它」"
        - "【2026-08-29 未验证的能力声明即被拒】提交 `509417d`。Claude 侧适配器的可验证部分从这里入手：那一侧的能力**本来就不确定**（本环境没有 Desktop / Cowork），而不确定时唯一诚实的做法是不声明。「不声明」此前只写在每个适配器自己的 `DECLARED_CAPABILITIES` 里，合同从不检查——与 policy epoch 同形，规则只在记得它的地方成立，而两份参考适配器都恰好做对了，于是没有任何测试要求过。后果不是多一条声明：`negotiate` 返回的 `degradations` 是宿主决定要不要轮询的**唯一依据**，声明了 `proactive_wake` 则 `polling` 不在清单里，宿主不轮询而那个能力并不存在——牌局停在某一席上，谁都不知道是在等模型还是已经死了，这正是 `CAPABILITIES` 那张表自己写着的后果。现按 `verified_on_any_host` 拒收，码 `capability_not_verified` 归 invalid_request；按字段走不写死名字（写死的实现在下一个未验证能力加进来时不会红）。**这道检查会自己退休**：判据是「至今没有任何宿主验证过」而非「你这个宿主做不到」，实机 Gate 5 通过后翻标志即合法，所以它不与旧设计那条顾虑冲突（「判成失败会逼人少声明一项」）。换掉三条既有断言，都是有意的：旧版靠声明该能力去到达「合规但被标注」那一格，而标注在报告里、轮询决定在宿主里，一份被标注的报告挡不住宿主不轮询。套件那一侧的防线保留并单独钉住——套件不要求适配器走 `contract.negotiate()`，自己拼 negotiation 的适配器能绕过拒收，那时套件里那条 unverifiable 是最后一道；用手写 rogue 适配器站在那个条件上，否则该分支在拒收之后没有到达路径（变异 `conformance-wake-unverifiable-not-recorded` 正是这样先存活的）。本轮实测：`test/capability-honesty.test.cjs` 8/8（旧代码 5 条红）；`capability-honesty` 变异 8/8；`seat-model-adapter` 14/14；`npm test` 789/789 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=438 KILLED=438 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 209 项全过、控制台错误 0、到第 13 手。**这不是 Claude 宿主适配器本体，也没有让 Gate 5 前进一步**：它只让「能力不确定时诚实降级」由合同强制"
        - "【2026-08-28 仍未验证】真实宿主 Gate 5（事件驱动主动唤醒）未通过，四真人 UAT 未做。本轮全部证据来自自动化，不能代替实机门禁；主动唤醒不得写成已验证"
      claim_limits:
        - 尚未证明当前 Codex 桌面会渲染插件 MCP UI
        - 安装后的新能力应在新聊天或新 CLI 会话使用；旧会话热激活不作为产品承诺
        - 已证明 UserPromptSubmit 原始入口、同步预公开、Stop 最终回答与重入保护的真宿主最小路径；尚未覆盖所有取消、并发、hosted tool 与跨平台组合
        - 本地跨进程 IPC、幂等、失败关闭和 MCP 补交已经在真宿主受控探针中执行；尚未证明生产 OAuth、真实断线重放或多人并发安全
        - 当前本地事件不能作为远端可验证的 Codex 来源证明
        - 当前可以声称 Codex 插件宿主聚焦探针通过，不能声称完整产品集成、Codex 桌面原生牌桌 UI 或生产就绪
        - 当前可以声称本地四人牌桌垂直切片已实现并通过 AI 验收，不能据此声称用户已经接受、四个真实 Codex 会话已经绑定或完整 MVP 已完成
        - 当前可以声称宿主中立权威内核已实现、新牌桌 UI 与之形成单栈闭环、四个隔离浏览器上下文的多人回路已闭合且自动化测试与变异测试通过；不能声称任一真实宿主已接入——桌面侧走的是确定性 fake 适配器，`SEAT_AI` 背后没有真实模型
        - 浏览器验收的稳定性结论以全新克隆为准。工作树连续三次全绿之后，全新克隆第一次仍暴露出读页竞态与五条空断言；只在工作树跑通不能声称稳定
        - "`SAME_VISIBLE_TASK_SPIKE_V1` 未执行。无点击主动唤醒在两个宿主上都未验证，不得由自动化测试或源码推断代替"
        - Codex 与 Claude 的真实宿主 Gate 5 均未通过；本会话在终端 Claude Code 中，没有 Claude Desktop / Cowork 界面，跑不了实机门禁
        - "`PLAYABILITY_GATE_V1` 的自动化层与四真人试玩层均未执行；确定性 fake SEAT_AI 的分支覆盖不能冒充真实模型闭环"
        - 尚无共享 HostAdapter 合同；Claude 侧适配器未开始，不能声称双宿主已接同一内核
    candidates_unknowns_history:
      candidates:
        - selected: Codex 插件 Skill + 同步显式范围 Hook + 捆绑本地 stdio MCP 桥 + 远程权威事件/牌局服务 + 独立 Web 牌桌
        - fallback: 若 Stop Hook 实机不可靠，使用显式 publish_ai_answer MCP 工具提交并回显规范化最终回答
        - deferred: Codex MCP 内嵌 UI，待宿主支持探针通过后作为增强
        - rejected: 独立 OpenAI API 助手，违背无需第二套模型配置与当前会话 AI 的核心价值
        - rejected: Hook 直接调用远端服务，鉴权归属、重连和幂等边界不成立
      superseded_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260825-010
      unknowns:
        - U-TG-CODEX-UI-SUPPORT
        - U-TG-HOOK-RUNTIME-BEHAVIOR
        - U-TG-LOCAL-BRIDGE-AUTH
        - U-TG-CONTEXT-LEAKAGE-GUARD
        - U-TG-CODEX-PROVENANCE-ATTESTATION
      impact_if_resolved:
        - 内嵌 UI 可用时减少窗口切换，但不改变服务端权威与隐私桥接架构
        - 原始入口与 Stop 自动路径已经通过，显式工具回退也已验证；产品期仍需取消、并发与进程生命周期压力测试
        - 本地桥接鉴权与隐私金丝雀通过后才允许连接真实远端环境
  important_unknowns:
    - unknown_id: U-TG-CODEX-UI-SUPPORT
      owner: evidence_unknown
      status: open
      blocking_boundary: evidence_claim
      blocked_scope_refs: []
    - unknown_id: U-TG-HOOK-RUNTIME-BEHAVIOR
      owner: evidence_unknown
      status: resolved
      blocking_boundary: none
      blocked_scope_refs: []
      resolution_ref: docs/HOST-PROBE-CHECKLIST.md#已执行验收
    - unknown_id: U-TG-LOCAL-BRIDGE-AUTH
      owner: professional_design_unknown
      status: open
      blocking_boundary: release
      blocked_scope_refs: []
    - unknown_id: U-TG-CONTEXT-LEAKAGE-GUARD
      owner: professional_design_unknown
      status: open
      blocking_boundary: evidence_claim
      blocked_scope_refs: []
    - unknown_id: U-TG-CODEX-PROVENANCE-ATTESTATION
      owner: professional_design_unknown
      status: resolved
      resolution_ref: PROJECT-DECISION-LOG.md#DEC-20260825-011
  artifact_validation:
    revision_id: PI-TG-CODEX-BRIDGE-R4
    status: pass
    receipt_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE-RECEIPT.json
    generation_context_ref: .dual/CODEX-BRIDGE-GENERATION-CONTEXT.json
    generation_context_sha256: 40026d4f3fbab75bf70996686c375ab1419d1474d527082d230bfd7429c1dca5
    repair_attempts: 1
    validated_checks:
      - actual_hashes
      - human_orientation
      - human_project_position
      - projection_binding
      - owner_reads
      - project_route_reads
      - navigation_context
      - route_permission
      - unknown_integrity
      - impact_isolation
      - scope_isolation
      - operation_policy
      - required_authority_findings
  freshness: current
  refreshed_at: 2026-08-28
  refresh_basis:
    - docs/CODEX-IMPLEMENTATION-REVIEW-20260828.md
    - docs/CLAUDE-REVIEW-RESPONSE-20260828.md
    - docs/ACCEPTANCE-EVIDENCE.md#四上下文浏览器验收
    - npm_test:351_pass_0_fail_measured_2026-08-28
    - npm_test:498_pass_0_fail_measured_2026-08-28_after_reopen
    - mutation_gate:226_killed_0_survived_0_skipped_measured_2026-08-28_after_reopen
    - fresh_clone_rerun_at_2549474:498_pass_226_killed_150_browser_assertions_GATE_PASS
    - browser_acceptance:150_pass_0_fail_measured_2026-08-28_after_reopen
    - mutation_specs:f1_15,f2_18,f3_14,f4_14,f5_28,f6_14,web_host_16,vacuous_3,total_122,survivors_0
    - browser_acceptance:80_assertions_0_console_errors_exit_0_clean_clone_x3
    - npm_test:644_pass_0_fail_measured_2026-08-28_adapter_contract
    - mutation_gate:315_killed_0_survived_0_skipped_measured_2026-08-28_adapter_contract
    - browser_acceptance:201_pass_0_fail_0_console_errors_27_screenshots_hand_12_x3_runs
    - mutation_specs_added:adapter_contract_34,seat_model_adapter_14,multi_hand_verdict_41
    - docs/HOST-ADAPTER-CONTRACT.md
    - commit_range:46d5b5d..0e80395
  protected_semantic_delta: none
  semantic_reconciliation: all_current_mvp_charters_and_protected_rules_aligned
  collaboration_state: implementation_in_progress_on_confirmed_route
  execution_closure_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#public-ai-rules-truth-persistence-result
  dependent_implementation_acceptance: kernel_revalidated_product_loop_and_host_gates_still_unverified
  route_permission:
    requested_route_ref: TG-L2-PUBLIC-AI-EXCHANGE@DEC-20260827-023
    decision: granted
    granted_scope: local_implementation_of_confirmed_l0_l2_semantics
    excluded_from_grant:
      - real_host_gate_5_pass_claims
      - click_free_proactive_wake_claims
      - user_experience_acceptance_claims
      - release_deploy_or_production_security_claims
    basis_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260827-017
      - PROJECT-DECISION-LOG.md#DEC-20260827-018
      - PROJECT-DECISION-LOG.md#DEC-20260827-019
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
      - PROJECT-DECISION-LOG.md#DEC-20260827-021
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - PROJECT-DECISION-LOG.md#DEC-20260827-023
      - CLAUDE-SEMANTIC-REVIEW-20260826.md#claude-round-2-final
      - PROJECT-PLAN-TREE.md#semantic_baseline
  next_owner: primary_ai_shared_host_adapter_contract_then_claude_side_adapter

capability_inventory:
  contract: dual-ai.capability-inventory.v1
  status: initialized
  carrier: STATUS.md
  last_reconcile:
    mode: material_scope_incremental
    completed_at: 2026-08-30
    vcs_anchor: bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b
    anchor_relation: baseline_plus_uncommitted_B8_and_B9_CSS
    relevant_surface_digest: sha256:bb7c107606884f88b64e101d1caef6618cf934b7e274eac9017599fb26687e6b
    working_evidence_digest: sha256:fdf3cc423576ab81ec8f2f1d5efa3f76675b87d7eddc1619124a2d04691c60ac
    digest_basis_ref: REVIEW-LOG.md#b9-real-host-seat-probe
    reliability: baseline_plus_explicit_runtime_and_evidence_file_sets
    checkpoint_receipt: REVIEW-LOG.md#b9-real-host-seat-probe
  historical_reconcile_20260828:
    mode: material_scope_incremental
    completed_at: 2026-08-28
    vcs_anchor: ab29e34
    anchor_relation: head_at_reconcile
    relevant_surface_digest: superseded_see_note
    working_evidence_digest: superseded_see_note
    superseded_digest: 173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
    superseded_digest_scope: package.json + src/** + web/** + plugins/tokengame/**
    superseded_digest_note: >-
      该摘要在 2026-08-25 生成，覆盖面自那以后已被 a8763c4..ab29e34 大幅改写（先是
      room-store / seat-ai-store / table-orchestrator / action-ledger / due-work /
      command-surface / command-server / host-surface / seat-custody / run-table-core，
      本轮又新增 host/table-web-host / host/table-view-model / run-table-web / web/table/**）。
      仓库内没有生成该摘要的脚本，算法不可复现，因此不自行编造新值冒充同一算法的结果。
      本轮继续改用 Git 提交范围作为可独立复核的锚点。
    reliability: anchored_by_git_range
    git_range: a8763c4..ab29e34
    checkpoint_receipt: STATUS.md#capability_inventory
  active_count: 2
  active_capability_refs:
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  implemented_kernel_units:
    - TG-EU-ROOM-LIFECYCLE
    - TG-EU-SEAT-AI-EXCHANGE
    - TG-EU-HOLDEM-ADJUDICATION
    - TG-EU-ORCHESTRATION
    - TG-EU-HOST-NEUTRAL-SURFACE
    - TG-EU-SEAT-CUSTODY
    - TG-EU-REVIEW-CLOSURE-F1-F6
  implemented_product_units:
    - TG-EU-SINGLE-STACK-WEB-TABLE
    - TG-EU-SEAT-MODEL-BINDING
  verified_bounded_probe_units:
    - TG-EU-REAL-HOST-SEAT-PROBE
  partially_implemented_units:
    - TG-EU-HOST-ADAPTER-CONTRACT
  unverified_units:
    - TG-EU-CLAUDE-HOST-ADAPTER
    - TG-EU-PROACTIVE-WAKE-SPIKE
    - TG-EU-PLAYABILITY-GATE
  unit_index: PROJECT-PLAN-TREE.md#plan_tree
```

## 连续性边界

宿主中立 L0、共享宿主入口 L1、三个当前 MVP L2、可玩牌桌的 Ready/掉线/退出/亮牌规则，以及公开座位 AI 的默认公开、主动评估、反刷屏、并发归并、迟到、关闭降级与本地隐藏规则，均已分别由用户确认并通过内容寻址校验；旧 Codex 专属 L0/L1/会话、公开测试桌、被动问答章程及其规则转为已替代历史。当前 L0-L2 语义基线为 `confirmed`，不再存在待确认的当前 MVP 产品规则门禁。

2026-08-28的历史检查点为351项测试、122条变异、80项浏览器断言；后续历史验收已到第13手/209项。
这些不是本轮B9数字。接手基线是 `bbdcf2b` 的875项实测；B8实际过程与裁决见
`REVIEW-LOG.md#b8-seat-model-binding`，当前B9真实单席与增量UI验证见 `REVIEW-LOG.md#b9-real-host-seat-probe`。
不把历史23/23、四人脚本验收或旧CLI实机结果搬作新宿主证明。
旧探针栈（`EventStore` / `TableStore` / `server.cjs` / `web/app.js`）保留为已替代历史；
其自动化桥接回归仍在全量测试中，B9没有重跑旧栈的Playwright或真实CLI安装探针。

历史浏览器验收曾查出全新克隆下的读页竞态和五条空数据假绿，见
`PROJECT-PLAN-TREE.md#TG-EU-SINGLE-STACK-WEB-TABLE` 与 `docs/ACCEPTANCE-EVIDENCE.md`。
B8又查出伪造Host未真正送达、故障屏障不释放、清理失败伪成功及旧隐私文案断言；失败与修复分开记录，
不把“没有执行到检查”或“测试被人工结束”算作通过。

公开范围同意的实质性判据自 2026-08-29 起由 `policy epoch` 表达并**由权威侧强制**（提交 `4456a4c`）：此前发言限制那一维只在 `src/host/table-view-model.cjs` 里生效，绕过界面的调用方在额度实质放宽后仍握旧同意继续发言。「实质」是显式清单而非任意配置变化——`version` 与 `bubbleDisplayMs` 明确排除并各写了理由。这一改动**反转**了 `test/scope-reconfirmation.test.cjs` 中「版本串变化即要求重新确认」的断言方向，属该文件开头记录的待裁决项的裁决结果，不是回归。三字段旧路径保留为权威不报 epoch 时的退路。已确认 L0–L2 语义、七条公开交流规则与德扑规则未变。

共享HostAdapter合同和两份参考实现已存在并通过一致性检查，但不等于产品已迁移到参考适配器，
也不等于任何桌面宿主通过完整验收。`SAME_VISIBLE_TASK_SPIKE_V1` / Gate 5在Codex侧已有B10一次候选实测，
同任务无点击唤醒已观察；B12补读原始工具输出确认旧B10回答跨手丢弃。B14随后在原任务完成三个不同来源各一次评估与成功公开，Codex Gate5仅此固定版本单席探针为pass；Gate9清理blocked，不能据此确认架构/产品完成或翻转默认能力标志。Claude仍not_run；B12原窗口未发queue的历史不改写。
`PLAYABILITY_GATE_V1` 不能笼统写“两层未跑”：脚本模型自动化已到第13手，
四真人45分钟层未执行。远端认证/持久化/并发、隐私完备性、用户接受与发布同样不在现有证据内；
`U-TG-LOCAL-BRIDGE-AUTH` 仍阻塞发布。
