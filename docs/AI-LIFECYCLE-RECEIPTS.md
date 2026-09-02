# 本地 AI 终态与时序记录

这是一项默认关闭的开发取证功能，不是聊天历史、玩家记忆库或正式对局审计账。它帮助区分“AI 发言了”“AI 明确选择沉默”“输出被权威丢弃”和“没有足够记录确认结果”。不会让 AI 自动启动，也不会缩短或延长玩家倒计时。

## 启动记录

在 `tokengame` 项目目录的 PowerShell 中使用新的文件名：

```powershell
$receiptDirectory = Join-Path (Get-Location) 'artifacts\ai-receipts'
New-Item -ItemType Directory -Force -Path $receiptDirectory | Out-Null
$receiptPath = Join-Path $receiptDirectory ((Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.jsonl')
$closeReceiptPath = $receiptPath + '.close.log'
$previousAiReceiptFile = $env:TOKENGAME_AI_RECEIPT_FILE
$env:TOKENGAME_AI_RECEIPT_FILE = $receiptPath
try {
    node src/run-beta.cjs 2> $closeReceiptPath
} finally {
    $env:TOKENGAME_AI_RECEIPT_FILE = $previousAiReceiptFile
}
```

不设置 `TOKENGAME_AI_RECEIPT_FILE` 时保持原有启动方式，不产生记录文件。启用时文件必须不存在；旧文件不会被覆盖。目录要先建立，文件名不要含凭据或私人文字。

仅支持 beta 自己持有的进程内权威。设置了 `TOKENGAME_COMMAND_ORIGIN` 的远程内核模式不能被这个本地观察器完整看到，因此同时启用记录会明确拒绝启动。没有自动退回空日志的“成功”模式。

普通交互终端可以请求 Ctrl+C 关闭，但必须核对实际收尾回执，不能假设所有终端都把信号送到了 Node。强制结束进程、磁盘故障或超过记录上限可能使捕获不完整或无法确认，必须保留该限制。启用记录时还会输出一份去敏收尾回执；要把它与文件一起保存。记录功能不能代替用户对真实模型调用、任务唤醒或宿主配置的授权。

上面的 `.close.log` 保存 stderr，包括告警和 `tokengame.ai-lifecycle-close.v1` 收尾行。不要只留终端截图：终端换行、重绘以及承载它的 shell 退出码，都不能替代原始 JSON 回执。没有收尾行时，进程侧写入和关闭结果应记 unknown。

B12在当时Codex工具的Windows PTY中发送Ctrl+C后，beta和端口消失，但捕获无尾行、stderr文件为空。该载体下不能把“已结束进程”称为记录正常关闭；信号是否送达Node处理器尚未确认。该次离线分析原生退出2、状态partial；PowerShell工具只返回外层退出1，两者应分开记录，见[B12取证](../REVIEW-LOG.md#b12-native-receipts-window)。B13新增下面的父子进程 IPC 方式；它不追认 B12 的缺失回执，也不证明 PTY 已修好。

每次捕获最多 10,000 条（包含首尾）和 8 MiB；待写队列最多 128 条、256 KiB。达到上限只停止本次捕获并标记不完整，不停止或改写牌局，也不自动新建另一份文件。文件写入成功仅指本进程收到写入回执，不承诺断电后的持久性。

## 自动化探针使用受控子进程

本地 Node 探针可调用 `test-support/beta-process.cjs` 的 `startBetaProcess()`。它启动新的随机回环端口 beta，默认不启用适配器或记录；不会接管已存在的服务，也不会调用宿主模型。

以下为探针脚本骨架；`capturePath`、`closePath` 必须事先选好未存在的文件路径并建立父目录。调用代码应放在异步函数中：

```js
const fs = require("node:fs");
const { startBetaProcess } = require("./test-support/beta-process.cjs");
const run = startBetaProcess({ env: { TOKENGAME_AI_RECEIPT_FILE: capturePath } });
try {
  const { origin } = await run.ready;
  // 仅在这里执行本次已经授权的本地探针；本骨架本身不包含 AI 调用。
} finally {
  try { await run.stop(); }
  finally { fs.writeFileSync(closePath, run.stderr(), { flag: "wx" }); }
}
```

`stop()` 通过仅父子进程可见的 IPC 发送固定关闭请求，复用 beta 的原关闭流程，并等待真实退出与 stdout/stderr 排空；重复调用复用同一个 Promise。成功结果含 `graceful:true`、`exit_observed:true`、`exit_code:0`、`forced:false`，但记录是否完整仍须独立检查下面的关闭回执和同一运行的 footer。

启动和关闭分别默认限时10秒、8秒，关闭超时后最多另等2秒确认自己子进程的强制退出。超时、I/O故障或非零退出会拒绝 `stop()`，不能吞掉错误后称验证成功；错误的 `result` 在可取得时记录实际退出状态。父通道意外断开按 `abnormal_close` 处理。`disconnect()` 和 `forceKill()` 只供负例或异常清理，不是正常收尾方式。

此方法不新增网络关停接口，不改变普通 `npm run beta` 的玩法，不授予重启 Codex、全局刷新 MCP 或追加真实模型输入的权限。实际结果与证据边界见 [B13 审查](../REVIEW-LOG.md#b13-host-readiness-shutdown)。

## 离线查看

```powershell
node test-support/summarize-ai-receipts.cjs $receiptPath
```

工具只读这个文件，输出结构化摘要，不读取宿主聊天，不访问网络，不发起模型调用。

| 退出码 | 含义 |
| --- | --- |
| `0` | 文件及记录到的因果链完整；不表示写入/关闭操作均成功，也不表示真实 AI 或宿主验证成功 |
| `2` | 捕获、来源或终态存在不完整/未知，必须查看摘要限制 |
| `1` | 输入不可用或格式错误，不能据此判定游戏结果 |

分别阅读“已观察到的终态”和“因果链完整性”。有公开/沉默/丢弃事件时可以确认这个事件发生过；缺少来源时刻时仍不能计算完整时延。只有开始记录而没有终态，表示未观察到终态，不等于模型仍在思考，也不等于合法沉默。

另外检查 beta 的运行收尾回执：写入成功确认和关闭成功确认是两件事。写入/关闭操作报错时，运行仍要按失败处理，不能用离线工具的 `0` 抹掉。文件能读不等于句柄已成功关闭；最后一次写入报错也不一定代表所有字节都未落盘。离线摘要不具备这些进程侧证据，会明确保留 unknown。

| 收尾字段 | 所证明的范围 |
| --- | --- |
| `capture_complete` | 捕获范围是否完整；尾行写入后报错时为 `null`，效果不确定 |
| `write_acknowledged` | 本进程是否收到包括尾记录在内的成功写入回执 |
| `close_succeeded` | 本次文件关闭操作是否返回成功 |
| `run_complete` | 上述三项均为 `true` 且收尾流程已结束；否则 beta 收尾非零退出 |

这些字段描述记录器，不等于整个进程最终成功。若 footer 已落盘后父通道断开或输出流出错，记录器的 `run_complete` 仍可为 `true`，但 beta 必须非零退出、控制器不得报 `graceful`。保留原文件和后续失败证据，不回写旧 footer；还应检查控制器的 `output_complete`，先前已有错误不能遮住后来的输出截断。

用两份文件的 `run_ref` 对应同一次运行。即使摘要为 `complete`，若 `counts.turns` 为 0，也只证明这段捕获文件完整，完全没有证明 AI 成功评估过。

B20正是这个边界的实例：文件完整记录多次`HAND_STARTED`和一条玩家公开发言，但没有
`SEAT_AI_EVALUATION_STARTED`、turn或终态。页面同时显示通知已尝试并被接收、随后
`wake_start_failed`。因此可确认宿主通知回合发生过，不能确认权威评估启动，更不能从完整footer或
宿主回合完成推断silent/公开。B20修补后，窗口可另带一个经过语法限制的稳定`failure_code`；该字段
属于本人诊断投影，不写进本地生命周期文件，也不补写历史样本的未知原因。

## 能确认与不能确认的事实

- 在来源和开始都存在时，可以计算来源→开始的权威事件时差。
- 在开始和终态都存在时，可以计算开始→终态的权威事件时差；它包括宿主、工具往返及调度等阶段，不是纯模型推理时间。
- 玩家公开发言和街道变化有可关联的本地来源事件。部分引擎/结算来源没有同一事件流中的时间，保持 unknown，不能拿意图排队时间顶替。
- OFF 或回答校验失败可能结束评估，却没有对应终态事件。这类记录不追认为成功；本批不改变权威判定来凑齐日志。
- 回收评估和迟到结果被丢弃是两条不同事实，不能统计为两次发言或一次合法沉默。
- 不记录聊天正文、AI 回答、手牌、模型上下文、玩家昵称或凭据。关联标识只在同一份捕获内有意义；它不是可公开检索的玩家身份。
- 不证明模型/提供商/推理强度、用户有没有点击、失败的 MCP 请求次数，也不自动裁决 Gate 5。文件本身可以被本机用户改写，不能用作防作弊凭证。

旧 B10 窗口没有这项记录，历史未知不能被新代码追认。真实宿主主动 AI 的后续验证应同时保留有限授权、宿主回合时间、本地终态记录和牌桌观察；仍须按原有门禁分别判断。
