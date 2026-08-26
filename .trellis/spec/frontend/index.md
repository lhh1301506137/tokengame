# 前端开发规范

> 本目录记录 TokenGame 当前代码已经采用的约定，供后续 `trellis-implement` 与 `trellis-check` 使用。

## 当前技术边界

- 当前产品包含本机 Codex Hook/MCP 桥接探针，以及一张可完成整手牌的本地四人牌桌垂直切片；仍不是生产牌室。
- 前端采用原生 HTML、CSS 和浏览器 JavaScript；没有 React、构建器、组件库或客户端状态库。
- 扑克牌局规则由 `src/game/holdem.cjs` 决定，身份/投影/事件由 `src/authority/table-store.cjs` 管理；`event-store.cjs` 只拥有公开 AI 窗口。`web/` 只读取权威投影并提交动作。
- Node.js 代码使用 CommonJS `.cjs`；浏览器代码使用普通 `.js`。

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
