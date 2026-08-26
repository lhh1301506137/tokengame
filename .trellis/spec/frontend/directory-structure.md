# 目录结构

## 总览

当前仓库是单包 Node.js 项目。浏览器 UI、权威状态机、本地桥、Codex 插件和测试各自独立，不能把这些边界折叠到一个文件或一个运行时状态中。

## 现有布局

```text
web/                         # 无构建步骤的浏览器 UI
  index.html                 # 语义结构与可访问性标记
  app.js                     # 状态同步、DOM 渲染、Canvas 与交互
  styles.css                 # 全局设计令牌、布局与响应式样式
src/
  game/
    holdem.cjs               # 扑克领域状态机、牌型与底池结算
  authority/                 # 权威事件流与 HTTP 服务
    event-store.cjs          # 公开 AI 窗口、校验、幂等和事件序列
    table-store.cjs          # 四身份、玩家投影、动作版本和牌桌事件
    server.cjs               # API、SSE 与静态文件服务
  bridge/server.cjs          # 插件到权威服务的本地受限转发
  shared/http.cjs            # Node HTTP 共用函数
  run-probe.cjs              # 本地探针启动入口
plugins/tokengame/
  hooks/                     # Codex Hook 可执行文件及共享库
  mcp/                       # MCP stdio 服务
  skills/tokengame/          # 面向用户的插件技能
test/                        # Node 内置测试运行器的契约与集成测试
test-support/                # UI 烟测和 Playwright 加载辅助
docs/                        # 架构、隐私、验收和真实宿主探针说明
```

## 模块归属规则

- 扑克合法动作、轮转、发牌和结算放在 `src/game/`；身份认证、版本/幂等、截止结算和逐玩家投影放在 `src/authority/`。这些决定不能放进 `web/app.js`。
- `EventStore` 与 `TableStore` 是两个有意分离的权威边界：前者只管 Codex 公开 AI 通道，后者只管固定扑克桌；HTTP 层组合投影但不复制业务规则。
- 仅负责鉴权、路由映射、超时和上游错误转换的逻辑放在 `src/bridge/`；桥不拥有牌局状态。
- 多个 Node 服务复用的底层 HTTP 逻辑放在 `src/shared/`。
- Codex 进程生命周期相关逻辑放在 `plugins/tokengame/hooks/`；可复用的 stdin、桥请求和 pending-marker 操作集中在 `hook-lib.cjs`。
- UI 结构、视觉和浏览器交互分别留在 `web/index.html`、`web/styles.css`、`web/app.js`。
- 测试按被验证的边界命名，例如 `event-store.test.cjs`、`hook-integration.test.cjs`、`mcp-and-http.test.cjs`。

## 命名约定

- 文件和目录使用小写 kebab-case，例如 `event-store.cjs`；Codex Hook 事件文件沿用 snake_case，例如 `pre_tool_use.cjs`。
- JavaScript 函数和局部变量使用 camelCase；协议 JSON 字段使用 snake_case，以匹配已公开的线协议。
- 事件类型使用全大写 snake case，例如 `AI_PROMPT_PUBLISHED`。
- DOM `id` 使用 camelCase，CSS 类使用 kebab-case，状态通过 `data-state`、`data-kind` 等属性表达。

## 真实示例

- `src/authority/event-store.cjs` 集中实现 `submitPrompt`、`submitAnswer` 和窗口到期结算。
- `src/game/holdem.cjs` 集中实现 `legalActions()`、`act()`、牌型比较和分池支付。
- `src/authority/table-store.cjs` 为同一 `HoldemHand` 生成观察者或指定玩家投影，并处理令牌、版本和幂等。
- `src/authority/server.cjs` 只把 HTTP 路由映射到两个 store，并通过 SSE 发出变更通知。
- `web/app.js` 的 `refreshState()`、`renderActions()`、`renderEvents()`、`drawTable()` 分别承担同步、合法动作投影、DOM 事件投影和 Canvas 投影。

## 禁止模式

- 不在浏览器内自行判定动作是否合法；客户端时钟只用于倒计时显示。
- 不在桥层复制 `EventStore` 的业务规则。
- 不为尚未采用的 React/TypeScript 目录结构预建空文件夹；技术栈迁移必须另立任务。
- 不把测试产物、插件运行数据或截图当源代码；它们归入 `artifacts/` 或系统临时目录。
