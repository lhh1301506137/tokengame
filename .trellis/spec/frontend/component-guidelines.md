# 组件规范

## 当前组件模型

项目没有 React 组件。页面由 `web/index.html` 的语义区域、`web/app.js` 的小型渲染函数和 `web/styles.css` 的类选择器共同组成。新增 UI 应延续该模型，除非有独立决策批准框架迁移。

## 结构约定

- `index.html` 保存稳定的页面层级、控件、可访问性属性和脚本入口。
- `app.js` 顶部的 `elements` 对象集中缓存 DOM 引用；不要在每次渲染中重复散落查询。
- 一个渲染函数负责一个可识别区域，例如 `renderConnection()`、`renderIdentity()`、`renderActions()`、`renderEvents()`、`renderAiPhases()`。
- 座位旁 AI 使用 `index.html` 中固定的 A/B/C/D 语义骨架；`renderSeatAiConversations()` 只更新 `data-state`、`hidden`、`aria-busy` 和文本，不在每次状态刷新时重建四个可访问区域。
- `render()` 只编排子渲染函数；交互副作用由事件处理器或 `postPlayer()` 承担。
- Canvas 绘制拆为 `drawTable()`、`drawBoardSlot()`、`drawCard()`、`drawSeat()` 等按视觉职责命名的函数。

现有模式：

```js
function render() {
  renderConnection();
  renderIdentity();
  renderHeading();
  renderActions();
  renderAiPhases();
  renderEvents();
  drawTable();
}
```

## 数据输入约定

- 渲染函数从模块级 `ui` 状态或显式参数读取数据，不自行发起网络请求。
- 缺失的服务器字段使用可选链和保守默认值，例如 `ui.state?.events || []`。
- 列表更新先构造 `DocumentFragment`，再用 `replaceChildren()` 一次提交。
- 来自玩家、模型或服务端的文字必须通过 `textContent` 写入；不得用 `innerHTML` 拼接不可信内容。

## 样式约定

- 颜色、半径等共享值定义为 `:root` CSS 自定义属性。
- 类名描述角色而不是具体外观，例如 `.event-item`、`.connection`、`.window-pill`。
- 状态外观通过数据属性选择器表达，例如 `.connection[data-state="online"]`，不要由 JavaScript 直接写内联颜色。
- 桌面宽度下 `.seat-ai-layer` 可以覆盖在 Canvas 上方，但 AI 身份与展开气泡不得和公共牌、四个玩家状态或行动区相交；窄视口下改为牌桌后的独立网格区域，不以缩小到不可读的方式强塞回 Canvas。
- 保持当前浅色 Codex 协议牌桌的设计令牌、留白和高对比行动提示；生产品牌系统属于后续产品任务。

## 可访问性

- 页面语言保持 `zh-CN`，交互使用原生 `<button type="button">`。
- 主要区域使用 `aria-labelledby` 或 `aria-label`；动态事件列表使用 `aria-live="polite"`。
- 座位会话容器使用礼貌播报并同步 `aria-busy`；等待回答必须同时有可读的“生成中”文字，不能只靠颜色或动画表达。
- 纯装饰元素使用 `aria-hidden="true"`；Canvas 必须保留可读标签。
- 状态不能只靠颜色表达，文本应同步显示 OPEN/CLOSED、连接状态或错误说明。

## 常见错误

- 在 `drawTable()` 中写业务规则，导致 Canvas 与服务器事实分叉。
- 直接拼接 HTML 展示公开提示或 AI 回答，形成注入风险。
- 根据任意 AI answer 事件直接更新座位或全局阶段，绕过合法 actor 与 `request_id` 配对。
- 事件计数显示完整数量，但 DOM 私自截断列表，造成“完整历史”名不副实。
- 新增元素却不加入 `elements` 集中表，或新增状态却遗漏对应 `render*()` 调用。
- `postPlayer()` 失败后未刷新权威快照，或未在 `finally` 恢复控件，造成陈旧按钮或永久禁用。
