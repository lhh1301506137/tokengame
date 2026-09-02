# B27 绝对 `cwd` 重启后固定目标验收事实包（2026-09-01）

## 范围与前提

- 用户已按 `DEC-20260901-002` 手动重启 Codex；本批只验证重启后的项目 MCP 就绪、一次回环固定目标通知和资源收尾。
- 沿用 `DEC-20260831-002` 的同范围长期测试授权与 `DEC-20260831-003` 的本席 AI 权限。通知窗口精确限制为最多 1 次、60 秒；不补发、不改模型或推理强度，不创建新任务、不部署、不监听公网。
- 本批使用当前正在执行开发工作的 Codex 任务作为固定目标。它不是一个空闲的独立游戏任务，这一点是解释结果的必要载体条件。

## 重启后宿主就绪

- 当前任务实际加载了且只加载了一个 TokenGame 工具：`mcp__tokengame_project__tokengame_table`。
- 激活席位连接前，直接调用只读 `view.projection` 返回 `model_connection_unavailable`。这证明绝对 `cwd` 配置已在重启后加载项目 MCP，同时默认仍按缺连接失败关闭。
- 随后从仓库根运行 `npm run codex:play -- "H:\\tokengold"`，配置稳定，成功启动 `http://127.0.0.1:7802` 的进程内 beta；启动横幅继续报告无额外模型适配器、managed wake 可用且 `proactive_wake_verified=false`。

## 唯一通知样本

- 两个隔离 headed Chromium 会话完成 A 建房、B 加入和双方公开范围确认；没有 Ready、开手或下注，牌桌保持第 0 手等待区。
- A 明确确认本席 AI 可读取自己的底牌与公开牌局/聊天并公开发言、不能替真人下注/准备/亮牌；下载并激活一份新连接文件后，原生 `view.projection` 成功，页面显示已收到本席宿主请求。
- A 为发送器固定的当前游戏任务开启最多 1 次、60 秒窗口；B 只发送一条合成公开来源。窗口最终为 `attempted_count=1`、`queued_count=1`、`resolved_count=0`，在 60.003 秒时以 `max_duration` 停止；`cleanup_ok=true`、`failure_code=null`、`native_turn_state=unknown`。
- 同期只读任务状态显示目标任务仍处于本次开发回合的 `inProgress` 状态；观察窗口内没有出现可重入的新模型回合、权威 `ai.start/ai.resolve` 或 AI 气泡。由现有记录只能确认“运行中的任务收到一次通知但未在窗口内结清”；Codex 对同一活动任务的精确排队与延后执行规则仍是 `unknown`。
- 按不确定投递计数与停止规则，本次 1 次通知额度已经消耗；没有补发，也没有手工领取待办来伪造端到端成功。该样本不能写成模型回答失败、主动唤醒通过或公开回复通过。

## 页面检查、清理与成本

- A/B 最终页面状态一致：都只显示真人来源，A 显示 1 次尝试、1 次接收、0 次权威结清；两个页面控制台均为 0 error、0 warning。最终截图与 `render_game_to_text` 已由 Primary 直接检查。
- 收尾按服务端撤销本席连接、`npm run connection:clear`、撤销后原生 `view.projection` 返回 `model_connection_unavailable`、关闭两个浏览器、SIGINT 停止 beta 执行。beta 报告端口与定时器已清；外层 PTY exit 1 只对应 Ctrl+C。最终活动槽不存在，7802 无监听。
- 已被宿主接收的通知不能撤回；撤销与清槽使其若在本回合结束后迟到执行，也无法取得有效席位连接并公开发言。
- 本批新增一份已撤权、未读、未删的下载文件。仓库内按精确文件名模式只读计数现为 7 份、合计 1165 字节；内容未读取，继续由真人决定删除。
- 本批没有修改产品源码，也没有补跑 Node、变异或脚本浏览器套件。实际消费为 1 次通知/queue 接收、0 个完成的新原生模型回合、0 次权威评估、0 条 AI 公开；唯一精确时长是 60.003 秒通知窗口，beta 总驻留时长为 `unknown`。

## 裁决与恢复点

B27 裁决：`absolute_cwd_host_tool_recovered_fixed_target_notification_accepted_self_target_busy_unresolved`。

`DEC-20260901-002` 已完整执行：绝对 `cwd` 配置、真人重启和重启后工具直接就绪均有证据，不需要再次迁移配置或重启。B27 关闭的是宿主加载缺口，不关闭 `TG-EU-PROACTIVE-WAKE-SPIKE` 或 `TG-EU-PLAYABILITY-GATE`。后续不得在正在运行的开发回合上重复同类通知；真实朋友组合验收应由各玩家的空闲游戏任务承接通知，并继续以权威 `start` 与唯一终态判断，而不是以 queue 接收判断成功。
