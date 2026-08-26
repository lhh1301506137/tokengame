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

- 牌桌初始状态通过带玩家凭据的 `GET /api/table/state` 获取，后续通过同身份的 `EventSource('/api/table/events/stream')` 接收快照或事件通知；旧 `/api/state` 与 `/api/events/stream` 继续服务 Codex 桥接探针。
- 收到 `SNAPSHOT` 可直接替换 `ui.state`；收到 `EVENT` 后重新读取权威状态，避免在客户端重放不完整业务规则。
- 玩家操作统一经 `postPlayer()` 处理禁用、凭据附着、请求、刷新、成功/错误提示和恢复；按钮只使用当前 `legal_actions`。
- `resize`、键盘和定时器回调只触发显示层更新；不得改变权威牌局状态。
- 所有异步事件处理必须捕获错误并落到可见状态，连接错误要更新 `ui.connected`。

## 命名约定

- Codex Hook 文件按宿主事件使用 snake_case：`user_prompt_submit.cjs`、`pre_tool_use.cjs`、`stop.cjs`。
- 浏览器回调按动作命名：`connectEvents`、`postControl`、`setControlsDisabled`。
- 协议入口与本地辅助函数分开导出；Hook 入口文件不作为通用库导入。

## 常见错误

- 在普通 Prompt/Stop 路径发起“状态查询”，这仍会泄露会话存在并违反零桥接约束。
- 向 stdout 打日志，使 Codex 无法解析 Hook 返回值。
- 在 SSE 事件到达时直接猜测完整状态，而不是刷新权威快照。
- 忽略 Stop 的再次调用，导致重复发布或覆盖 pending marker。
