# 组件规范

## 当前组件模型

项目没有 React 组件。产品页面由 `web/table/index.html` 的语义区域、`web/table/table.js` 的小型渲染函数和 `web/table/table.css` 的类选择器共同组成。新增 UI 应延续该模型，除非有独立决策批准框架迁移。

旧探针栈的 `web/index.html` / `app.js` / `styles.css` 已被替代，作为历史证据冻结；本文件凡提到 Canvas 与 `ui.state` 的段落都属于它。

## 结构约定

- `index.html` 保存稳定的页面层级、控件、可访问性属性和脚本入口。整页骨架先存在，渲染只改文本与状态属性，不重建可访问区域。
- 用 `el(id)` 按需取 DOM 引用；节点由 HTML 骨架拥有，渲染函数不假设自己是创建者。
- 一个渲染函数负责一个可识别区域：`renderScopeGate()`、`renderRoom()`、`renderBoard()`、`renderSeats()`、`renderActions()`、`renderSeatControls()`、`renderTimeline()`。
- `render(view)` 只编排子渲染函数并显式接收视图；交互副作用由事件处理器或 `post()` 承担。渲染函数不发起网络请求。
- 重复结构用返回节点的小工厂表达：`cardNode()`、`seatNode()`、`aiRow()`、`hideRow()`、`bubbleNode()`、`tag()`、`labeled()`。它们只接收数据、只返回节点。

现有模式：

```js
function render(view) {
  renderScopeGate(view);
  renderRoom(view);
  renderBoard(view);
  renderSeats(view);
  renderActions(view);
  renderSeatControls(view);
  renderTimeline(view);
}
```

## 数据输入约定

- 渲染函数只读 `table-view.v1`，不读权威原始事件，也不读任何秘密。视图里没有的东西，UI 不许自己推。
- 缺失字段用可选链加保守默认值，例如 `view.hand?.board ?? []`。
- 三态字段要区分「否」与「还不知道」。`public_scope_confirmed` 为 `null` 时不能当作未确认——那会让范围确认对话框在视图刚建立的一瞬间闪一下。
- 列表整体替换：`replaceChildren(...nodes)` 一次提交，不做增量 diff。
- 面朝下的牌必须渲染成占位的暗牌节点，而不是空列表。别人的两张牌永远是两个节点，只是不显示牌面——这样「看不见牌面」和「没渲染出来」在 DOM 上可区分。
- 来自玩家、模型或服务端的文字必须通过 `textContent` 写入；不得用 `innerHTML` 拼接不可信内容。
- 字素计数用 `Intl.Segmenter`，不要用 `String.length`。家庭 emoji 的 UTF-16 长度是 8 但只算 1 个字素，用 `length` 会让 140 上限被轻易绕过。

## 样式约定

- 颜色、半径等共享值定义为 `:root` CSS 自定义属性。
- 类名描述角色而不是具体外观，例如 `.event-item`、`.conn`、`.seat-hole`。
- 状态外观通过数据属性选择器表达，例如 `.conn[data-state="offline"]`，不要由 JavaScript 直接写内联颜色。
- 样式表必须保留 `[hidden] { display: none !important; }`。`[hidden]` 只是一条特异性最低的 UA 样式，任何写在类选择器上的 `display` 都会盖掉它；被盖掉的全屏固定层会变成看不见的遮罩，吃掉之后每一次点击，而画面上完全看不出原因。这条 `!important` 的范围只限 `[hidden]`，不影响其它元素。
- 桌面宽度下 `.seat-ai-layer` 可以覆盖在 Canvas 上方，但 AI 身份与展开气泡不得和公共牌、四个玩家状态或行动区相交；窄视口下改为牌桌后的独立网格区域，不以缩小到不可读的方式强塞回 Canvas。
- 保持当前浅色 Codex 协议牌桌的设计令牌、留白和高对比行动提示；生产品牌系统属于后续产品任务。

## 可访问性

- 页面语言保持 `zh-CN`，交互使用原生 `<button type="button">`。
- 主要区域使用 `aria-labelledby` 或 `aria-label`；动态时间线使用 `aria-live="polite"`。
- 等待模型回答必须同时有可读的“思考中”文字，不能只靠颜色或动画表达。
- 纯装饰元素使用 `aria-hidden="true"`；旧栈的 Canvas 必须保留可读标签。
- 状态不能只靠颜色表达：连接状态、AI 降级/离线/关闭、迟到发言、暂离与掉线保留窗都要有同步的文字说明。
- AI 发言与玩家发言必须有至少三条互相冗余的可区分通道（文字 AI 标记、结构位置、样式），不能只靠一种。只靠颜色区分等于对色觉障碍用户不可区分；只靠位置区分则在窄视口重排后失效。

## 常见错误

- 在渲染函数里重算扑克规则（谁能加注、加注上下限、底池归属），导致 UI 与权威事实分叉。合法动作与金额范围只能来自视图里的 `legal_actions`。
- 把下注金额当增量提交。`hand.act` 的 `amount` 是目标总额。
- 直接拼接 HTML 展示公开发言或 AI 回答，形成注入风险。
- 用 `hidden` 切换显隐却没确认它真的不渲染，留下一个吃掉所有点击的隐形遮罩。
- 本地隐藏时把条目从时间线删掉。隐藏是逐查看者的降级显示且必须可逆；删除等于改写公开时间线。
- 计数显示完整数量，但 DOM 私自截断列表，造成“完整历史”名不副实。
- 新增状态却遗漏对应 `render*()` 调用，或让某个区域只在首次进桌时更新一次。
- `post()` 失败后未刷新权威视图，或未在 `finally` 恢复控件，造成陈旧按钮或永久禁用。
- 收到终态会话码（`web_session_unknown`、`seat_credential_revoked`、`seat_not_found`）仍继续轮询。那会变成每拍一条 403，而玩家停在一份永不更新的旧牌桌上，会以为自己还在桌上。
