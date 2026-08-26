# Codex 模型/推理强度尽力检测边界

日期：2026-08-26

## 结论

TokenGame 可以对公平场执行结构化的“尽力检测”，足以拦截未修改客户端下的普通错配和一部分想临时切换高级模型“炸鱼”的玩家；但它无法证明真正的上游模型身份，也不能承诺公平。

正确产品表述应是“已通过 TokenGame 本机检测 · 不保证”，而不是“已验证同模型”。

## 当前 Codex 能提供的结构化信号

Codex App Server 官方文档提供以下相关接口与行为：

- `model/list` 返回模型目录、默认推理强度和支持的推理强度列表；
- `config/read` 返回经过配置层合并后的有效磁盘配置；
- `thread/start` / `thread/resume` 用于创建或恢复专用游戏线程；
- `turn/start` 可以逐回合覆盖 `model` 和 `effort`，且覆盖值会成为同线程后续回合的默认值。

来源：

- Codex App Server：https://learn.chatgpt.com/docs/app-server
- Codex Configuration Reference：https://learn.chatgpt.com/docs/config-file/config-reference#configtoml

本机 `codex-cli 0.145.0` 生成的稳定 v2 JSON Schema 进一步确认：

- `ThreadStartResponse` 和 `ThreadResumeResponse` 必须返回 `model`、`modelProvider`，并可返回 `reasoningEffort`；
- `TurnStartParams` 支持 `model` 与 `effort`；
- `ConfigReadResponse.config` 包含 `model`、`model_provider` 与 `model_reasoning_effort`；
- `ModelListResponse` 提供模型 ID 与支持的推理强度。

这些字段是比模型自述、文风猜测或截图更合适的工程信号。

## 建议的检测链

### 入桌预检

1. 由 TokenGame 本地协调器连接它实际用于游戏线程的 App Server；
2. 调用 `model/list`，确认目标 model/effort 是该宿主声明支持的组合；
3. 调用 `config/read`，读取并立即净化有效 model/provider/effort 信号；
4. 创建或恢复专用游戏线程，从返回的 effective model、modelProvider、reasoningEffort 再次比对；
5. 生成只含规范化结果、Codex 版本、目标版本、时间、随机 nonce 与状态的 detection receipt，不上传配置文件、密钥、端点或认证信息。

### 运行中复核

- TokenGame 必须拥有游戏线程所有 `turn/start` 请求的协调权，记录每回合实际请求的 model/effort；
- 重连、恢复线程、目标/ruleset 变化以及检测信号变化都使旧 receipt 失效；
- 只做一次入桌检测很容易被入桌后切换绕过，因此不应作为正式公平场方案；
- 更强的方案是在公平场每个游戏回合显式传入目标 model/effort，相当于“检测 + 名义锁定”，但仍不能证明自定义 provider 最终调用了什么上游模型。

## 无法证明的部分

- 玩家控制本机、TokenGame 文件、协调器进程和 App Server，可修改或伪造返回值；
- 自定义 provider/中转可以把一个模型名称映射到另一个上游模型，也可以重写请求；
- 玩家仍可能在 TokenGame 之外使用第二个 AI、计算器或人工协助；
- 模型输出风格、延迟、胜率和所谓“挑战题”都不能可靠识别模型，会制造误杀；
- App Server 的可选上游 attestation 是不透明令牌，当前公开文档没有承诺它绑定具体 model/effort，不能擅自当作模型证明。

所以 detection receipt 只能说明“这套未被 TokenGame 观察到篡改的本机协议，在这些时点报告并请求了目标配置”，不能说明上游实际执行者必然相同。

## 执行强度决策

### A. 检测 + 每回合名义锁定（未选择）

- 入桌预检通过后，TokenGame 在每个公平场 `turn/start` 中显式请求目标 model/effort；
- 任一结构化信号错配、缺失或恢复后未复检时停止该席公平场 AI；
- 能拦截普通切换和误配置，最符合“筛掉炸鱼者”的目标；
- 代价是公平场不再完全跟随用户临时切换的 Codex 设置，并且兼容性要求更高。

### B. 持续检测但不覆盖（已选择）

- 读取宿主有效配置和线程返回值，TokenGame 不传 model/effort override；
- 在每次 AI `turn/start` 之前、线程恢复/重连后及周期性检查点复核；
- 发现 confirmed higher-than-table-ceiling 后，在新 AI 回合发出前拦截，生成完整性违规事件并进入踢出/信用处罚流程；
- `UNAVAILABLE`、`STALE`、瞬时失败和单一矛盾信号只暂停 AI 并复检，不能直接作为作弊或重罚依据；
- 更尊重“沿用当前会话配置”，但仍存在本机篡改和检查时点之间的不可消除间隙。

### C. 仅入桌检测

- 实现最简单，但入桌后即可切换，主要只防误操作，无法认真承担公平筛选。

## 单向能力上限匹配

用户进一步确定：高能力配置不能进入低能力场，低能力配置可以自愿进入高能力场，并可设置允许的目标范围和是否在等待超时后向上扩展。

模型强弱不是可从名称、价格或发布时间自动推导的全序。公共标准池需要一个版本化 capability catalog，把明确可比较的 model/effort 组合映射成 capability_class/rank：

- 玩家检测等级 `<=` 牌桌 capability ceiling 才可进入；
- 玩家可以选择 `exact_only`，也可以设置 `allowed_ceiling_range`；
- `timeout_upshift_enabled` 只把其匹配票据加入预先确认的更高 ceiling 队列，不改变 Codex 模型；
- 高等级票据永远不能向下进入低 ceiling 场；
- 没有明确平台排序关系的跨厂商、跨家族或自定义 provider 组合为 `INCOMPARABLE`，默认只能精确匹配或进入私人自定义房间。

这样，“始终精确等待”指每个队列和牌桌上限不被静默改写；弱模型主动进入高上限场是明确的自愿劣势，而不是后台悄悄混池。

## 赛中违规收尾决策

confirmed higher-than-ceiling 后采用“下一个合法行动点强制弃牌”：

- 席位立即进入 EJECT_PENDING，取消/隔离在途 AI 请求并关闭公开聊天、私聊与玩家动作；
- 未 all-in 时，权威状态机只在该席下一个合法行动点自动 fold，不越序改写下注轮；
- 已投入主池/边池的筹码不退，整手不回滚；
- 已经 all-in 或结算前没有下一行动点时正常摊牌和分池；
- HAND_SETTLED 后移出席位并用唯一 penalty_event_id 执行信用处罚；
- 状态跨重连和重放持久化，迟到 AI 输出丢弃且不退款。

该策略不能消除违规者在已经 all-in 后获得的本手收益，但比“整手作废”更不易被输家主动触发来逃避损失，也不会引入非标准筹码没收与边池重算。

## 产品边界

- OPEN_CAPABILITY 保持宿主透明，不做模型公平检测；
- HONOR_MATCHED 改为 BEST_EFFORT_SCREENED：自律声明仍保留，但必须叠加结构化检测；
- 检测状态属于公共竞技元数据，玩家能力模块仍按既定决策隐藏；
- UI、回放、举报和排行榜必须保留“不保证”限定；
- 检测失败可以形成确定性的本局协议事件，但不能据此宣称发现了真实上游模型或自动施加永久信用处罚。
