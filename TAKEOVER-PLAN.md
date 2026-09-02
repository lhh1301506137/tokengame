# B8：每席 AI 连接与授权上下文

状态：本批已实现并通过最终本地门禁。基线 `bbdcf2b`；Primary 接手依据见 `UNDERSTANDING-AUDIT.md`。

## 项目位置与边界

本批属于已确认“游戏会话入口 → 私人牌桌 → 公开座位 AI”中的 L3/L4 实现修复。共享合同、B6 单一协调器和 B7 启动入口继续复用；第一处未证实的产品结果仍是“每位玩家的真实会话 AI 接到自己的座位并持续发言”。不关闭整个 L2，不声称真实宿主或 MVP 交付。

方案比较：只限一个浏览器会削弱现有多玩家原型；保留共享令牌、仅在说明里要求自觉不能隔离席位；按席位复制协调器/凭据会重建 B6 已消除的双路径。选择同一协调器/同一托管，授权范围另按真人绑定收窄。

## 冻结的接口与实现责任

1. `POST /api/model/bind` 只接受真人 Web `session_token`、`acknowledged: true`、高熵 `binding_request_id`（16–256字符）。会话必须仍有该席权限、未离桌。当前有效 request id 可安全重取同一文件；新的 request id 换发绑定，旧模型令牌及该绑定的 intent/turn 使用权即时失效，历史旧键不可复活。每个真人会话最多保留128个不同请求键，满额拒绝新键，当前有效键仍可重取；同世代尚未生效的传输失败可用同键重试。不同会话不能复用他人绑定。
2. 返回 `{ok:true, connection:{schema:"tokengame.model-connection.v1", table_origin, model_token}, binding:{binding_id,seat_id,state,last_seen_at}}`。这是仅供本人下载的模型连接文件，不含核心凭据、Web 会话令牌、底牌。连接文件中的令牌只准该席 AI 发言/读上下文；不可公开或提交 Git。
3. `POST /api/model/unbind` 需本人 Web 会话，立即吊销后续请求权限。离桌/席位释放同样吊销；浏览器刷新/短暂掉线不自动丢绑定。绑定记录只是协调器传输权限，不另造房间或 AI 业务状态。执行中确认的在途边界：已经送入权威处理的请求可能完成，不承诺回滚；撤销后返回的旧世代响应仍被扣下、不能带回私有上下文或重新登记 ID。未新增权威取消协议，旧评估回合仍受 120 秒租约约束。
4. `TableWebHost({modelBindingEnabled:true})` 开启逐席接入。保留旧 `modelCommandToken` 配置只用于可理解的迁移拒绝，**不能再驱动所有席位**。无绑定/错令牌失败关闭；默认普通 Web 实例不自动开启接入。`npm run beta` 显式开启，不再生成共用通行令牌。
5. 同一 `ModelCommandSurface.call(command, params, trustedScope)` 接收调用方注入的 `{seat_handle,binding_id}`，模型 JSON 不得指定该 scope。领取只遍历本席；start/resolve 还必须匹配 ID 的绑定世代。进程内受控脚本驱动仍复用它，不复制业务逻辑；不得抢已绑定外部模型席位的待办。
6. 成功的权威 `ai.start` 返回原 `started` 加 `model_context`：schema `tokengame.seat-ai-context.v1`、`seat_id`、`player_id`、`turn_id`、权威实际使用的 `source_event`、`room`、该席 `hand`、最近最多 50 条公共 `timeline` 及 `timeline_total`/`timeline_truncated`。在核心同次同步派发里生成；不写进公开事件；不从模型回传 context，不给模型增加 `view.hand`。`ai.start` 被拒绝时不得返回上下文。进程内驱动也使用该返回，避免旧 claim 快照与实际评估来源不同。
7. `/api/view` 加 `model_connection`（`disabled|unbound|awaiting_host|host_seen`、本席 binding id、last_seen_at、`proactive_wake_verified:false`），不含 token。`host_seen` 只代表收到过有效请求，不宣称持续在线、真实模型已验证或无点击唤醒。
8. 浏览器提供明确权限说明、下载“本席 AI 连接文件”和撤销按钮；文件经 Blob 下载，不写 DOM/URL/localStorage/诊断状态。MCP 支持 `TOKENGAME_MODEL_CONNECTION_FILE` 私有文件路径，严格校验本地 origin/shape，文件损坏失败关闭；未配置文件仍可读显式 `TOKENGAME_MODEL_TOKEN`（必须是逐席令牌）。不自动安装插件或改宿主配置。

## 验收谓词（不可由数量/源码替代）

- P1：同一协调器两名玩家各自绑定；A/B 各只领取本席 intent，不能 start/resolve 对方 ID；旧进程令牌不得成为全席后门。
- P2：两个真实权威身份在同一手牌的 `model_context.hand` 分别含本席两张底牌、对手未公开牌为 null；公共事件/时间线、对手模型结果与连接文件没有这份私有上下文。
- P3：start 使用最新权威来源/手/街快照而非旧领取副本；跨手旧 intent 被拒；真人 ready/动作/确认/亮牌仍不在模型面。
- P4：换发、撤销、离桌立即撤销旧 token 和已领 ID 的后续使用权，普通页面恢复仍回原席；一个席位撤销不影响另一席。已交权威的在途请求按第3项处理；界面不能承诺回滚历史/在途副作用。
- P5：真实 HTTP + MCP stdio 进程从各自文件读取权限并在对应座位发布不同文字；错误文件/未配置/错 token 可见失败，无凭据原文进入 MCP 错误或日志。
- P6：浏览器经正常控件建房、确认、下载、显示待连接→已收到请求、撤销；下载 token 不出现在 DOM、`render_game_to_text`、URL、storage、公共气泡；桌面/窄屏无新增遮挡或控制台错误。
- P7：现有单元/集成全量与变异门禁保持通过；四上下文多手验收重新执行，旧 CLI 桥回归保持。所有结论分开注明真实传输、模拟模型、真实宿主未跑。

## 工作划分与风险

遵循 Trellis 明示的 implement/check 流程：一个 implement 子任务负责核心/协调器/模型面的 B8 合同及对应测试；Primary 负责 UI、MCP、beta 入口、集成测试与文档，不交叉写同一文件。之后在未参与实现的新上下文做审查，Primary 复核实际证据。使用相同/未知模型身份不构成独立外部模型审查。

风险为本地 medium：这是收窄已有权限和补齐已确认的私有视图路径；无真实用户数据、无远端监听、无框架变更。若必须改产品公开范围或依赖全局安装/真实模型调用，停在该边界申请授权。回滚单位是本批明确文件的 diff；不回滚他人修改、不改历史。当前本地提交仍为 manual_closeout。

## 本批完成记录

唯一完成裁决位于 `REVIEW-LOG.md#b8-seat-model-binding`：925项测试、557条变异及两组35/209项浏览器验收通过，
本批闭合；交接仅引用该裁决。B8结束时真实宿主与主动唤醒均未验证；后续B9已完成当前Codex单席显式
接入探针，见 `REVIEW-LOG.md#b9-real-host-seat-probe`。再后B14已证明固定版本单席queue触发真实公开，见`REVIEW-LOG.md#b14-native-public-replies`；Gate9清理blocked，持续产品主动能力未交付，当前下一步边界见`RETURN-HANDOFF.md`。
项目主链继续保持 active，不归档整个 `.trellis/tasks/08-26-public-ai-table-talk`。
