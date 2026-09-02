# B21 牌局内新手早期 managed-wake 事实包（2026-09-01）

## 范围与停止条件

- 目标：使用新授权、新窗口和既有默认关闭/本人启停/单次上限机制，区分B20旧手失效假设与新手早期来源能否进入权威评估。
- 仅用既有专用任务`01a052c9-5259-7a61-b26f-35731734994e`；不创建新任务、不改宿主模型或推理强度。
- 窗口最多1次/120秒；不确定投递不重试。实际只发送一次queue，没有第二来源。
- 不改扑克30秒行动规则，不改源码，不重跑Node、变异或脚本浏览器测试。

## 执行事实

- 受控beta端口：55148；A/B为两个新隔离浏览器。
- 开启前A席AI为`ON/IDLE`，没有pending intent或active turn。
- 本人在两席Ready前开启窗口，随后才Ready；开启后不再添加玩家公开消息。
- 窗口最终尝试/接收/权威结清为`1/1/1`，按次数上限停止。
- 唯一原生turn：`01a05c9a-f1c6-79b0-9356-240100e19dad`，任务侧完成，用时28.810秒。
- 权威terminal为`silent/hand_advanced`；A/B两页均0条AI气泡。
- 本次没有`failure_code`。B20历史精确码仍为unknown，不能从B21结果倒推。

## 时序边界

| 事实 | 时间/间隔 | 可声称边界 |
| --- | ---: | --- |
| 第1手开始 | `1788260043331ms` | 权威手生命周期时间 |
| 评估开始 | `1788260067032ms` | 第1手开始后23.701秒 |
| 评估启动时距行动截止 | 约6.302秒 | 30秒行动窗内剩余量，不是模型耗时 |
| 第2手开始 | `1788260076709ms` | terminal出现前1.104秒 |
| terminal | `1788260077813ms` | start后10.781秒，`silent/hand_advanced` |

生命周期捕获不含action-window来源行。离线汇总器因此返回`partial/exit 2`并报告`missing: [source]`，
但仍确认1个评估开始和1个丢弃终态。故只能声称“第1手开始→评估开始23.701秒”，不能声称精确
“来源接收→评估开始23.701秒”。

## 证据与清理

- 去敏生命周期：`artifacts/b21-hand-active-managed-wake-20260901/authority-lifecycle.jsonl`（Git忽略）。
- 页面产物：`output/playwright/b21-hand-active-managed-wake-20260901/`（Git忽略）。
- 捕获完整，0 dropped；浏览器控制台0 error、0 warning。
- 服务端撤权、`connection:clear`、两页关闭、专用任务idle；55148、7802、51999、16608均无监听；活动槽不存在。
- 内部关停回执：`normal_close`、`write_acknowledged=true`、`close_succeeded=true`、`run_complete=true`。
- 直接PTY Ctrl+C后的外层命令exit 1；不能写成beta exit 0。
- 新增一份167字节已撤权下载文件，未删除。与B18/B19/B20三份历史文件合计四份，等待真人手工处理。

## 裁决与下一步

B21证明了第1手早期窗口的唯一queue可进入权威评估并得到唯一合法terminal；它没有证明牌局内公开或实时性，
`proactive_wake_verified`保持false。先在不改扑克30秒规则和模型设置的前提下优化原生通知fast-path
prompt并做有界对比；再根据数据决定传输优化或提出可配置时限，当前不直接宣布延长时限。
