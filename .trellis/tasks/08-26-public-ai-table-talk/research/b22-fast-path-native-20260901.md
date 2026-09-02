# B22 managed fast-path 与单次原生对照事实包（2026-09-01）

## 范围

- 实现只优化`noticeKind=managed`的固定本地控制通知；不改扑克30秒规则、模型设置、权限、传输或生命周期。
- 原生对照只使用既有专用任务`01a052c9-5259-7a61-b26f-35731734994e`、新连接、新窗口和唯一一次queue。
- 不创建任务、不使用第二模型、不重试不确定投递，不扩展到Claude、远端、内嵌UI或部署。
- B20/B21历史事实保持原样；B22不能反推B20历史业务码。

## A. fast-path 实现

managed通知在两个已校验编号之后立即固定要求：

1. 除宿主强制的一句极短进度外，不先分析、计划或复述通知。
2. 不先读取文件、查找任务、读取牌桌投影或调用其他工具。
3. 第一项工具调用必须立即是已配置`tokengame_table`的`ai.start`，并使用通知中的`intent_id`。
4. `ai.start`拒绝即停止且不重试。
5. 成功后只使用返回的本席`model_context`决定一次`silent`或`public_speech`，再以返回的`turn_id`调用一次`ai.resolve`。

通知不包含玩家正文、秘密、模型/推理强度/权限覆盖，也不授权下注。未设置`noticeKind`的旧B10路径仍由
完整字符串断言保护，文本逐字不变。

### 实现验证账本

| 批次 | 结果 | 已知耗时 | 边界 |
| --- | ---: | ---: | --- |
| 新fast-path红测 | 37/38，唯一新测试失败 | 518.9436ms | 证明旧实现缺少新约束 |
| 最小实现后聚焦测试 | 38/38 | 531.6411ms | 覆盖发送器合同，含旧B10完整字符串断言 |
| 旧B10 probe | 117/117 | 1950.1622ms | 相邻旧probe行为仍绿；不能单独充当历史字节基线 |
| 发送器变异 | 5/5杀掉 | 未单列 | 无存活/未评估 |
| 共享probe变异 | 8/8杀掉 | 未单列 | 无存活/未评估 |
| 两文件合并 | 155/155 | 2529.7011ms | 聚焦Node范围 |
| 独立复核 | 155/155 | 1922.194ms（wall 2.271s） | 独立复跑同一聚焦范围 |

该实现批没有浏览器或原生模型运行。测试证明控制文本和兼容性，不证明宿主实际遵循首项工具顺序。

## B. 唯一原生对照

### 前置与载体失误

- 随机回环端口：53952；A/B为两份隔离headed浏览器，同桌且分别确认公开范围。
- A激活新席连接；开窗前A席AI为`ON/IDLE`，无pending intent或active turn，专用任务为idle。
- 本人在两席Ready前开启最多1次/120秒窗口，再让两席Ready；窗口开启后没有添加玩家公开消息。
- 第一次beta启动因B22证据目录尚未创建而返回`ai_receipt_open_failed`、外层exit 1。
- 该失败发生在监听、浏览器、queue和模型输入之前，只存在于启动命令回执，不存在于随后成功样本产物；不计真实样本，也没有增加通知次数。

### 唯一投递与结果

- 唯一原生turn：`01a05cc2-4fda-7df3-8cbd-0e9fc9fe49ff`。
- 任务接口：`startedAt=1788262633s`，完成用时24.340秒；毫秒部分unknown。
- queue精确投递时刻：unknown。
- 最终窗口：尝试/接收/权威结清`1/1/1`，`failure_code=null`、`cleanup_ok=true`，按`max_notifications`停止。
- 权威决策：`silent`、`reason=null`；两页AI气泡均为0，没有公开回复。

### 时序

| 事实 | 时刻 | 与前一关键点的关系 |
| --- | ---: | ---: |
| HAND1 | `1788262631524ms` | 早期窗口代理；精确source行缺失 |
| task开始 | `1788262633s` | HAND1后名义约1.476秒；仅秒级 |
| `ai.start` | `1788262645233ms` | task后名义约12.233秒；HAND1后精确13.709秒 |
| `silent` terminal | `1788262655050ms` | start后精确9.817秒 |
| 行动截止 | `1788262661526ms` | terminal早6.476秒 |
| HAND2 | `1788262664728ms` | terminal早9.678秒 |

B21同口径名义值为HAND→task约9.7秒、task→start约14.0秒、HAND→start 23.701秒、start→terminal
10.781秒；B22分别约1.5秒、约12.2秒、13.709秒、9.817秒。HAND→start名义缩短9.992秒。

限制：任务开始只有秒级；生命周期捕获没有action-window source行；最新turn的`items=[]`。因此精确
source→start、第一项可见工具是否为`ai.start`、有无前置其他工具均unknown。单样本不能把改善全部归因
fast-path，也不能外推SLA或据此判定传输无需优化。

### 页面与控制台证据

- A截图：`output/playwright/b22-fast-path-native-20260901/.playwright-cli/page-2026-09-01T11-41-09-242Z.png`。
- B截图：`output/playwright/b22-fast-path-native-20260901/.playwright-cli/page-2026-09-01T11-41-17-233Z.png`。
- 两张截图只证明最终观察时第8手、0条可见AI气泡。
- 同次浏览器会话的只读console查询返回两页各0 error、0 warning；没有独立console日志，截图本身不证明该计数。
- 成功批去敏生命周期：`artifacts/b22-fast-path-native-20260901/authority-lifecycle.jsonl`；前置启动失败不在该文件中。

## 清理

- 已按服务端撤权→`connection:clear`→关闭双浏览器→停止beta执行。
- 活动槽不存在；53952、7802、51999、55148、16608均无监听；专用任务回到idle。
- beta内部回执：`normal_close`、`write_acknowledged=true`、`close_succeeded=true`、`run_complete=true`。
- 外层PTY因Ctrl+C退出1；不冒充beta exit0。
- B22新增一份已撤权、未读、未删的167字节下载文件。连同B18/B19各166字节和B20/B21各167字节，当前五份等待真人处理。

## 裁决与恢复点

保留managed fast-path；当前不延长扑克30秒时限，也不立即重写传输。B22只证明一次牌局内通知在同手
截止前得到合法`silent`终态，不证明公开回复，不翻`proactive_wake_verified`，不关闭完整主动AI或
`TG-EU-PLAYABILITY-GATE`。

下一叶从反复性能探针转向可玩MVP组合缺口：在不强迫模型固定公开的前提下，梳理并实现“朋友建房→
连接各自会话AI→牌局内玩家/AI气泡”的最小可复现验收。第二真实AI席、牌局内公开往返、Claude、异地和
四真人45分钟UAT继续开放。canonical裁决见`REVIEW-LOG.md#b22-fast-path-native`。
