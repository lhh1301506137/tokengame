# 类型与边界安全

## 当前事实

项目使用 JavaScript，没有 TypeScript、JSDoc 类型层或运行时 schema 库。当前安全性来自严格的协议边界校验、稳定字段命名、结构化错误和测试，而不是静态类型。不能在验收中声称已通过 type-check。

## 代码与模块格式

- Node.js 服务、测试和插件入口使用 CommonJS `.cjs`、`require()`、`module.exports` 与 `"use strict"`。
- 浏览器 UI 使用普通脚本加 `"use strict"`：产品路径是 `web/table/table.js`，旧探针栈是 `web/app.js`。两者都不是 ESM 模块。
- B16 的纯通知控制器 `web/table/wake-controls.mjs` 是独立 ESM，由普通 `table.js` 动态 `import()`；这不把主脚本改成 ESM。加载失败只禁用通知控件，不能阻断牌桌、聊天和撤权；服务端只对该精确静态路径开放 JavaScript 响应。
- Playwright 验收脚本与浏览器侧辅助加载器使用 ESM `.mjs`。
- 不在同一模块内混用 CommonJS 和 ESM。

## 运行时校验

- 所有外部 JSON 先经过 `readJson()` 的大小限制和解析错误处理。
- 必填文本在每个权威边界通过本地 `requiredString(value, field, maxLength)` 校验类型、空值和长度：`command-surface.cjs`（256）、`room-store.cjs`（256）、`seat-ai-store.cjs`（4096），旧栈的 `event-store.cjs`（4096）与 `table-store.cjs`（512）同理。上限按各自语义取值，不要统一成一个常量再到处 import——那会让「席位名」和「公开发言」共享同一个上限。
- 面向玩家的长度上限按**字素**判定，用 `Intl.Segmenter`。`String.length` 会把家庭 emoji 算成 8，用它做 140 上限等于把上限交给对方选字符。浏览器与权威两侧都要判，浏览器那侧只是提前反馈，不能当作已经校验。
- 筹码、版本和下注目标显式使用 `Number()`，随后以 `Number.isSafeInteger()` 和领域允许范围校验；时间长度可使用 `Number.isFinite()` 后检查范围。
- HTTP/桥响应先读取文本，再在 `try/catch` 中解析 JSON；无效响应转换为稳定错误码。
- 浏览器读取可能缺失的投影字段时使用可选链和默认值，不假定首次请求一定成功。

现有边界模式：

```js
const duration = Number(duration_ms);
if (!Number.isFinite(duration) || duration < 1 || duration > 10 * 60_000) {
  throw new ProbeError("invalid_duration_ms", 400);
}
```

## 协议字段

### B8 本地逐席模型连接

- 协调器、MCP、浏览器的精确形状与失败边界以 `TAKEOVER-PLAN.md` 为本批工作合同。
- `model_token` 是本人显式授权的、只能驱动本席 AI 的传输能力，不是 `recovery_credential`。只经本人认证的下载响应交给私有连接文件，不进入模型文本、DOM、URL、storage、公共投影或日志；核心席位凭据仍仅在托管进程内存中。
- `model_context` 只能来自已授权的权威 `ai.start`，是私有工具返回，不得写入公共事件。模型命令白名单不增加 `view.hand`，席位与绑定世代不接受模型输入。
- 旧进程级令牌只能给迁移拒绝，不能静默保留跨席访问。测试须同时证明正常逐席调用和错席/旧绑定失败。

- 线协议 JSON 使用 snake_case：`session_id`、`turn_id`、`deadline_at`、`idempotency_key`。
- JavaScript 内部变量使用 camelCase：`sessionId`、`turnId`、`actionWindow`。
- 事件结构必须包含单调递增 `seq`、`type`、`server_time` 与 `payload`。
- 业务错误使用 `ProbeError(code, status, details)`；客户端依赖稳定 `code`，不能依赖英文堆栈文本。
- 扑克规则错误使用 `HoldemRuleError(code, status, details)`；HTTP 层以相同结构映射，不暴露内部对象、牌堆或未授权底牌。
- 对外返回深拷贝的公共状态，防止调用方意外修改 store 内部对象。

## 禁止模式

### B30 远程输入

- 连接文件允许 HTTP 回环或 HTTPS 根 origin；显式公共入口只允许 HTTPS。校验原始 URL 形状，不让 URL 规范化吞掉非根路径后误放行；令牌请求使用 `redirect: "error"`。
- Connector 发往服务器的 `target_id` 是本机派生的不透明别名，不能发送原生 `thread_id`。原生任务 ID 只传本机可信发送器，公开投影仍不返回任何目标 ID。
- poll/ACK 使用精确字段白名单与本席授权世代。响应大小有上限，正文中途断线按网络失败处理；只有明确正向就绪回执才可报告连接成功。
- 每次实际 queue 前再次检查取消和活动连接快照；轮询开始时通过检查不代表异步返回后仍有权限。ACK 网络重试只能复用同一回执，不能重试模型通知。

### 通用禁止项

- 不把 `JSON.parse()` 直接暴露在无捕获的网络边界。
- 不用宽松真假值判断替代协议必填字段校验。
- 不把服务器异常堆栈、系统路径或内部 token 返回给 UI/插件。
- 不通过类型断言式注释掩盖未校验输入；若引入 TypeScript，应作为独立迁移并配套 `typecheck` 脚本。
