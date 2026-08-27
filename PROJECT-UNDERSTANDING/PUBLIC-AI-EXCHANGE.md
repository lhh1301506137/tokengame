# TokenGame 公开座位 AI 交流实现理解（R1）

## 这次在理解什么

- **主题：** TokenGame 宿主中立的权威公开交流内核、座位 AI 评估边界与宿主主动唤醒门禁

- **项目位置：** 当前路线为 TG-L0-PRODUCT → TG-L1-PUBLIC-AI-PLAY → TG-L2-PUBLIC-AI-EXCHANGE；首个未验证点是 TG-L2-PUBLIC-AI-EXCHANGE@SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D-implementation-and-evidence-revalidation，状态为未验证；下一开发叶尚未选择；TG-L3-PUBLIC-AI-EXCHANGE-KERNEL 是当前路线的下游后继，本轮 Project Intelligence 允许把它写入 Plan Tree 并实施。

- **承接的理解：** 当前合同已经确认一席一 AI、绑定游戏任务内合格自由文本先公开、白名单事件可触发 AI 选择沉默或发言、LIVELY_V1 限额、单并发与最新上下文归并、跨街迟到标记、跨手丢弃、AI OFF/降级以及仅影响本地渲染的隐藏。公开话术永远不是扑克动作。

- **负责与下游输出：** 本轮把新合同映射到现有代码，确定最小可独立开发边界，并把仍需实机证明的 Codex/Claude 主动唤醒留给独立宿主适配器门禁。

- **本轮包含：** 权威 TABLE_PUBLIC 与 SEAT_AI 事件内核、按席配额、来源去重、单并发租约、事件归并、沉默或公开终态、迟到/OFF 规则、可审计状态、四视图投影以及确定性假适配器接口。

- **本轮不包含：** 当前 Codex 可见任务或 Claude Cowork 的无点击主动唤醒通过声明、生产房间与鉴权、OWNER_PRIVATE、AI 托管、记忆、能力市场、公平场、信用系统、部署或用户产品验收。

## 结论

现有 `EventStore` 仍是固定 A 席、每行动窗口一次的显式 prompt/answer 探针；`TableStore` 独立维护真实德扑手牌与事件。服务端只是把两个状态并排返回，序号、hand/street、seat、配额和因果关系都没有统一。这意味着旧桥不能通过改事件名称升级成当前公开 AI 能力。

最小正确后继是新增宿主中立的权威公开交流内核，并让它与 `TableStore` 共用牌桌事件事实和可复盘顺序。玩家公开消息、AI 评估请求、归并、终态和公开发言都由内核裁决；宿主适配器只领取一次评估、接收最小化的该席上下文并提交 `silent | public_speech`，不得拥有扑克动作权限。

`TG-L3-PUBLIC-AI-EXCHANGE-KERNEL` 可以开始实施。`TG-L3-CODEX-BRIDGE-SPIKE` 与新的 `TG-L4-HOST-ACTIVE-TURN-PROBE` 继续受阻：Codex 当前可见任务和 Claude Cowork 的无点击主动唤醒都没有实机证据。该阻塞不应扩散到可用确定性假适配器完整验证的核心。

## 推荐实现切片

1. 建立独立的公开交流领域对象，但把其公开事件写入牌桌权威时间线；不继续扩张旧 `EventStore` 的行动窗口模型。
2. 玩家提交只接受已认证席位、当前手、幂等键和 LIVELY_V1 校验；成功时先写 TABLE_PUBLIC，再使该消息成为后续评估上下文。
3. 每席只允许一个非终态评估；冷却或运行期间的新白名单事件合并成一个最新批次。AI 发言本身不产生新的 AI 唤醒。
4. 适配器提交必须绑定 seat、hand、street、source event、context revision 和 evaluation id；跨街标记延迟，跨手或 OFF 后结果丢弃。
5. UI 从统一投影显示玩家/AI 成组气泡与 THINKING、DEGRADED、OFFLINE、OFF 状态。本地隐藏保留在查看端，不删除权威事件。

## 关键边界

- `npm test` 本轮实跑 23/23，只是旧基线通过，不是新规则验收。
- Codex Hook 的后台完成不会唤醒空闲任务；同步 Stop 只续接已有 turn。App Server 能可靠驱动协调器拥有的线程，但不能据此声称接管当前 Desktop 可见任务。
- Claude Desktop Chat 支持 MCP Apps UI，但插件 Hook 不运行；Cowork 分别支持 Hook 与 UI，组合后的无点击主动唤醒仍未验证。Claude Code `asyncRewake` 只直接适用于 Code surface。
- 至少一个宿主通过 Gate 5 前，可以验证核心与假适配器，不能声称事件驱动座位 AI 已完成交付。

## 下一步

先把本理解写入 Plan Tree 与活动 Trellis 任务，建立实现前验收义务，再实现权威公开交流内核和确定性假适配器。完成本地、相邻与累计回归后，单独执行固定版本宿主探针；探针失败必须保持降级候选状态，不能静默改写已确认的主动 AI 语义。

