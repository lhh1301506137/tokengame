# 状态管理

## 核心原则

只有服务端领域/权威层拥有影响结果的状态：`HoldemHand` 决定扑克规则，`TableStore` 决定桌级身份、版本和投影，`EventStore` 决定 Codex 公开 AI 窗口。浏览器、桥和插件都只保存有限投影或传输状态。

## 状态分类

| 类别 | 当前位置 | 规则 |
|---|---|---|
| 权威扑克状态 | `HoldemHand` + `TableStore` | 牌堆、轮转、筹码、结算、身份、版本和桌级事件只在这里改变 |
| 权威 AI 状态 | `EventStore` | 窗口、公开请求、回答、幂等记录和 AI 事件序列只在这里改变 |
| 浏览器服务器投影 | `web/app.js` 的 `ui.state` | 由 `/api/table/state` 或个性化 SSE `SNAPSHOT` 整体替换 |
| 浏览器瞬时状态 | `ui.connected`、`ui.nowOffset`、`ui.eventSource` | 仅影响连接显示、测试时钟和连接生命周期 |
| 插件交接状态 | `PLUGIN_DATA/pending` 与 `terminal` | 只记录跨 Hook 的待发布回答，不代表权威接纳 |
| 派生显示状态 | 倒计时、阶段、按钮禁用、事件数量 | 每次渲染从当前投影计算，不持久化为第二份事实 |

## 浏览器模式

浏览器使用一个小型模块状态对象：

```js
const ui = {
  state: null,
  connected: false,
  nowOffset: 0,
  eventSource: null,
};
```

- 更新 `ui.state` 后调用统一 `render()`。
- `renderHeading()` 根据权威 `action_deadline_at` 和当前显示时钟计算剩余时间；客户端倒计时归零不等于客户端有权执行自动动作。
- `renderActions()` 只启用 `legal_actions` 明确列出的动作和金额范围，不在 UI 重算扑克规则。
- `renderAiPhases()` 从公开 AI 事件派生 Prompt/Model/Answer 阶段，不单独维护可漂移的 phase 状态。
- `seatAiConversations()` 只从权威公开 AI 事件派生逐座位最近对话；`renderAiPhases()` 必须复用这一合法投影，不能让孤立或未知来源的回答单独点亮全局阶段。
- `EventSource` 重连由浏览器处理；连接状态只用于 UI，不改变服务器行为。

## 场景：座位旁公开 AI 对话投影

### 1. 范围 / 触发

- 当页面新增或修改座位旁 AI、公开聊天气泡、全局 Prompt/Model/Answer 阶段或公开事件列表时，必须遵守本合同。
- 该投影不新增权威业务状态，也不读取普通 Codex 会话；它只解释服务器已经接纳的公开 AI 事件。

### 2. 签名

```js
AI_PROMPT_PUBLISHED {
  seq: number,
  type: "AI_PROMPT_PUBLISHED",
  payload: { request_id: string, actor: "a" | "b" | "c" | "d", prompt: string }
}

AI_ANSWER_PUBLISHED {
  seq: number,
  type: "AI_ANSWER_PUBLISHED",
  payload: { request_id: string, actor: "ai:a" | "ai:b" | "ai:c" | "ai:d", message: string }
}

seat_ai_companions[] = {
  seat_id: "a" | "b" | "c" | "d",
  companion: "Codex AI",
  latest_conversation: null | {
    request_id: string,
    status: "generating" | "answered",
    prompt: string,
    answer: null | string
  }
}
```

### 3. 合同

- prompt 只有在 `request_id` 非空、`actor` 是合法玩家席位且 `prompt` 非空时才能建立会话；同一席位与请求 ID 的首个合法 prompt 胜出。
- answer 只有在 `actor` 指向同一席位、`request_id` 匹配已建立 prompt 且 `message` 非空时才能完成该会话。
- 每席显示 `prompt_seq` 最新的一组；旧请求晚到的合法 answer 可以补全旧记录，但不得把桌边显示切回旧请求。
- 全局 Prompt/Model/Answer 阶段跟随全桌最新的合法座位会话：无合法会话为 `active/idle/idle`，等待回答为 `done/active/idle`，已回答为 `done/done/done`。
- 右侧事件流仍显示服务器投影中的全部公开桌级与 AI 事件；计数必须等于实际渲染条数。座位气泡的“最近一组”限制不能被误用为事件历史截断。
- 用户或模型文本只通过 `textContent` 写入。视觉截断只影响排版，DOM 与 `render_game_to_text()` 保留完整文本。

### 4. 校验与错误矩阵

| 输入 | 结果 |
| --- | --- |
| prompt 缺少请求 ID、文本或合法玩家 actor | 忽略，不建立气泡 |
| answer 没有对应 prompt | 忽略，不改变座位与全局阶段 |
| answer 的 AI actor 与 prompt 席位不同 | 忽略，不完成任一座位会话 |
| 重复的同席位、同请求 ID prompt | 保留首个合法 prompt |
| 旧请求的 answer 晚于新 prompt 到达 | 补全旧记录，但最新气泡保持新请求 |
| 普通或未知事件类型 | 可留在公开事件流，但不得成为座位会话 |
| 文本含 HTML 标记或事件处理属性 | 按原始文本显示，不创建元素或执行脚本 |

### 5. Good / Base / Bad

- Good：A 的合法 prompt 先显示“生成中”，`ai:a` 的同请求回答到达后完成 A 的气泡；B 的会话独立更新 B。
- Base：没有合法公开会话时四席 AI 仍可见且均为“就绪”，全局 Prompt 阶段保持待开始。
- Bad：看到任意 `AI_ANSWER_PUBLISHED` 就把 Answer 标为完成，或只按 `request_id` 配对而忽略 actor，会把孤立/错席回答伪装成合法对话。

### 6. 必需测试

- 四个隔离浏览器视图断言同一合法 prompt 的 `generating` 状态、匹配 answer 的 `answered` 状态及相同完整文本。
- 覆盖未知 actor、孤立 answer、错席 answer、重复请求、旧回答晚到和普通事件；断言它们不改变合法座位投影或全局阶段。
- 至少验证两个不同席位的独立配对，并验证 `render_game_to_text().seat_ai_companions`。
- 用 HTML/事件属性字符串验证 `textContent` 边界；收集 `console.error` 与 `pageerror`。
- 桌面和窄视口验证气泡不遮挡公共牌、玩家状态或行动区；事件数超过历史截断阈值后，断言计数等于实际列表长度。

### 7. Wrong vs Correct

```js
// Wrong：孤立、未知或错席 answer 也会点亮全局 Answer。
const hasAnswer = aiEvents().some((event) => event.type === "AI_ANSWER_PUBLISHED");

// Correct：全局阶段只跟随已通过 actor + request_id 校验的最新座位会话。
const latest = seatAiConversations()
  .map((seat) => seat.latest_conversation)
  .filter(Boolean)
  .sort((left, right) => (left.prompt_seq ?? -1) - (right.prompt_seq ?? -1))
  .at(-1) || null;
const hasAnswer = latest?.status === "answered";
```

## 何时新增全局状态

当前不使用 Redux、Zustand 或其他状态库。只有当多个独立页面共享复杂的非权威 UI 状态、且单一 `ui` 对象已无法清晰维护时，才另立迁移任务评估状态库。新增真实牌局字段应先进入权威状态模型和协议，再进入 UI 投影。

## 服务器同步

- 首屏调用 `refreshState()` 读取逐玩家投影。
- 个性化 SSE 打开时服务端先发 `SNAPSHOT`；后续 `EVENT` 只作为“状态已改变”的通知，浏览器再刷新同一身份的权威投影。
- 控制请求成功后再次 `refreshState()`，不以本地乐观写入代替服务器响应。
- 对服务端错误显示明确提示并保留上一份可见投影；不得伪造成功状态。

## 常见错误

- 在 DOM `dataset` 中保存业务真相，然后反推服务器动作。
- 将插件 pending marker 当作“回答已公开”；只有权威服务接纳后才成立。
- 同时维护 `phase`、`hasPrompt`、`hasAnswer` 三份重复状态。
- 在 UI 中根据本机时间执行超时或判定动作有效；服务端必须再次结算截止时间并校验版本。
