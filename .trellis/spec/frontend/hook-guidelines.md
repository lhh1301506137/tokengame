# Hook 与事件处理规范

## 名词边界

当前代码没有 React Hook。仓库中的 Hook 主要指 `plugins/tokengame/hooks/` 下由 Codex 宿主调用的进程；浏览器侧只有原生 DOM、SSE 和定时器回调。不要创建 `useSomething` 文件来模拟不存在的 React 约定。

## Codex 插件 Hook

- 每个入口使用 CommonJS、`"use strict"` 和单一 `main()`；共享能力放进 `hook-lib.cjs`。
- 从 stdin 完整读取一个 JSON 对象，并只在 stdout 输出宿主协议 JSON。诊断只能写 stderr，否则会破坏 Hook 协议。
- 普通会话必须零桥接：`user_prompt_submit.cjs` 未匹配公开前缀时直接返回；`stop.cjs` 没有 pending marker 时只输出 `{}`。
- 公开提示必须在模型生成前由桥接受；桥不可达、窗口关闭或缺少幂等身份时失败关闭。
- `Stop` 发布失败时保留原回答以便补交；`stop_hook_active` 重入必须短路，不能用宿主生成的阻断说明覆盖原回答。
- 所有桥请求使用超时、插件 token 和 JSON 错误降级；幂等键由 `session_id + turn_id` 稳定生成。

现有隐私短路：

```js
const parsed = parsePublicPrompt(input.prompt);
if (!parsed.matched) return;
```

现有 Stop 重入保护：

```js
if (input.stop_hook_active) {
  emit({});
  return;
}
```

## 浏览器事件与数据获取

当前产品路径（`web/table/` ↔ `src/host/table-web-host.cjs`）：

- 建会话拿到会话令牌后按固定间隔轮询 `GET /api/view`，每次用返回的 `table-view.v1` 整体替换 `state.view` 再渲染。没有 SSE：内核只暴露 `POST /command`，协调器若自己做推送就得维护一份变更判定，那正是第二份事实的入口。
- 玩家操作统一经 `post()` 处理禁用、请求、刷新、成功/错误提示和恢复；按钮只使用当前视图的 `legal_actions`，金额是目标总额而非增量。
- 会话令牌只在内存里，请求头带的是会话令牌而不是席位凭据；凭据留在协调器进程内。
- 终态会话码（`web_session_unknown`、`seat_credential_revoked`、`seat_not_found`）必须停止轮询并回到入口，非终态错误保留上一份可见投影。
- 键盘和定时器回调只触发显示层更新；不得改变权威牌局状态。
- 所有异步处理必须捕获错误并落到可见状态，连接失败要更新连接显示。

### 旧探针栈（已替代，保留参考）

旧栈用带玩家凭据的 `GET /api/table/state` 加同身份 `EventSource('/api/table/events/stream')`：`SNAPSHOT` 直接替换 `ui.state`，`EVENT` 只作为「状态已改变」通知再回拉权威状态。该机制随旧栈冻结。

## 命名约定

- Codex Hook 文件按宿主事件使用 snake_case：`user_prompt_submit.cjs`、`pre_tool_use.cjs`、`stop.cjs`。
- 浏览器回调按动作命名：`startPolling`、`submitAction`、`wireControl`、`returnToEntry`。
- 协议入口与本地辅助函数分开导出；Hook 入口文件不作为通用库导入。

## 常见错误

- 在普通 Prompt/Stop 路径发起“状态查询”，这仍会泄露会话存在并违反零桥接约束。
- 向 stdout 打日志，使 Codex 无法解析 Hook 返回值。
- 在 SSE 事件到达时直接猜测完整状态，而不是刷新权威快照。
- 忽略 Stop 的再次调用，导致重复发布或覆盖 pending marker。
