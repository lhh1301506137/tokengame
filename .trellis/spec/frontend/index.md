# 前端开发规范

> 本目录记录 TokenGame 当前代码已经采用的约定，供后续 `trellis-implement` 与 `trellis-check` 使用。

## 当前技术边界

- 当前产品由宿主中立权威内核 + 协调器 + 浏览器牌桌组成，支持 2–4 席。B30 在既有本地回路上增加临时 HTTPS 入口与逐玩家出站 Connector，先验证两好友私人房；B33 补齐成熟现金桌规则反例和破产席手间固定补测试筹码闭环。真实异地双 AI 验收仍未完成。没有账号、公开大厅、可兑现筹码或生产部署，协调器仍只监听回环。
- 权威边界：`src/game/holdem.cjs` 决定扑克规则（两套栈共用），`src/authority/room-store.cjs` 决定房间与席位生命周期，`seat-ai-store.cjs` 决定 AI 公开发言的判定与配额，`table-orchestrator.cjs` 只做咬合、不新增语义。所有写入都经 `command-surface.cjs`。
- 宿主侧只允许做适配：`src/host/` 翻译传输与视图形状，浏览器只读视图模型并提交命令。**协调器不是权威**——它与内核同进程，因此「顺手判一下规则」几乎没有摩擦，但那会让同一条规则有两个实现。
- 浏览器拿不到、也不应该拿到权威原始事件与秘密。内核不设 CORS、不发静态文件、要求 `x-tokengame-authority-token`、拒绝非回环来源；这不是疏漏，是它必须经由宿主适配器才能被使用。
- 前端采用原生 HTML、CSS 和浏览器 JavaScript；没有 React、构建器、组件库或客户端状态库。
- Node.js 代码使用 CommonJS `.cjs`；产品 `table.js` 与旧探针 `web/app.js` 保持普通脚本，可选的纯通知控制器由动态 `import()` 加载为 `.mjs`。
- 旧探针栈（`event-store.cjs`、`table-store.cjs`、`server.cjs`、`web/app.js`）作为历史证据冻结保留，不再演进；新功能一律走上面的产品路径。规范里凡标【已替代】的段落都属于它。

## 规范索引

| 规范 | 内容 | 状态 |
|---|---|---|
| [目录结构](./directory-structure.md) | 模块边界、文件布局和命名 | 已基于现有代码填写 |
| [组件规范](./component-guidelines.md) | 原生 DOM 组件、渲染与样式约定 | 已基于现有代码填写 |
| [Hook 规范](./hook-guidelines.md) | Codex 插件 Hook 与浏览器事件约定 | 已基于现有代码填写 |
| [状态管理](./state-management.md) | 权威状态、浏览器投影与派生状态 | 已基于现有代码填写 |
| [质量规范](./quality-guidelines.md) | 测试、审查与禁止模式 | 已基于现有代码填写 |
| [类型安全](./type-safety.md) | JavaScript 边界校验与协议约定 | 已基于现有代码填写 |

## 使用原则

1. 先匹配现有代码，不把尚未采用的框架或理想架构写成事实。
2. 若新功能改变技术栈、权威边界或协议格式，先更新对应规范，再实施代码。
3. 新的产品目标仍受 `PROJECT-PLAN-TREE.md`、`STATUS.md` 和任务 `prd.md` 约束；本目录只描述工程约定。
