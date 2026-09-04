# 状态管理

## 核心原则

只有服务端领域/权威层拥有影响结果的状态。当前产品路径上：`HoldemHand`（`src/game/holdem.cjs`，两套栈共用）决定单手扑克规则，`RoomStore` 决定房间、席位生命周期与跨手筹码，`SeatAiStore` 决定 AI 公开发言的判定与配额，`TableOrchestrator` 只做咬合、不新增语义。浏览器、宿主侧协调器、桥和插件都只保存有限投影或传输状态。

旧探针栈的 `TableStore` 与 `EventStore` 仍在仓库里，但已被替代，只作为历史证据保留；新功能不要往它们上面加。

## 状态分类

| 类别 | 当前位置 | 规则 |
|---|---|---|
| 权威单手扑克状态 | `HoldemHand`（`src/game/holdem.cjs`） | 牌堆、轮转、街道、本手投注与结算只在这里改变；它只对**一手**负责，筹码守恒断言也只守一手之内 |
| 跨手筹码账本 | `RoomStore` 的 `seat.stack` | 筹码跟着席位走，不跟着某一手走。恢复、暂离、断线都不重置它——「回到原席」包括筹码 |
| 权威房间与席位状态 | `RoomStore` | 房间、席位归属、Ready、掉线保留窗、暂离与离桌只在这里改变 |
| 权威 AI 状态 | `SeatAiStore` | 评估租约、意图 claim、配额、公开发言与降级只在这里改变 |
| 权威幂等与到期 | `ActionLedger` + `DueWork` | 幂等账绑定 `hand_id` 与 `expected_revision`；到期判定在每个读取点自行促进 |
| 协调器进程内状态 | `TableWebHost` 会话表 + `SeatCustody` | 会话令牌到席位的映射与席位凭据。凭据不出进程，不进入模型可见结果，不能在别的进程恢复席位 |
| 浏览器服务器投影 | `web/table/table.js` 的 `state.view` | 由 `/api/view` 返回的 `table-view.v1` 整体替换 |
| 浏览器瞬时状态 | `state.sessionToken`、`state.connectionId`、`state.disconnected`、`state.polling` | 仅影响连接显示与轮询生命周期；不写 `localStorage` |
| 本人通知控制状态 | `web/table/wake-controls.mjs` 的 `WakeControls` | 仅保存本页请求、授权及本席窗口投影；不能决定扑克结果、生成 AI 回复或启动第二个通知循环 |
| 浏览器本地隐藏 | 逐查看者的隐藏集合 | 只改变这一个查看者看到的画面，不改写公开时间线，且必须可逆 |
| 插件交接状态 | `PLUGIN_DATA/pending` 与 `terminal` | 只记录跨 Hook 的待发布回答，不代表权威接纳 |
| 派生显示状态 | 倒计时、街道、按钮禁用、气泡计数 | 每次渲染从当前投影计算，不持久化为第二份事实 |
| 【已替代】旧探针栈 | `TableStore`、`EventStore`、`web/app.js` 的 `ui.state` | 冻结，不再演进 |

## 场景：破产席手间补测试筹码

### 1. 范围 / 触发

本场景只服务好友现金桌 MVP 的不可兑现测试筹码。`HAND_SETTLED` 后，账本筹码为 0 的席位进入
`SIT_OUT`；玩家可在没有手牌进行时主动补回房间固定起始筹码，然后另行 Ready。它不是买入、充值、
加码、自动续桌或跨房账户，不能接受玩家给出的数额。

### 2. 接口与投影

- 领域入口：`RoomStore.refillTestChips({ seatId })`。
- 人类命令：`seat.refill_test_chips`，沿用本席 `seat_id` 与 `recovery_credential` 授权；模型命令面禁止该命令。
- 席位投影：`test_chip_refill_available: boolean`、`test_chip_refill_amount: number | null`。
- 房间投影：`starting_stack: number`。浏览器只按这三个权威字段显示按钮和文案，不自行猜测资格或金额。

### 3. 前置 / 后置合同

- 前置：席位未释放、未请求离桌、当前无进行中的手牌，且席位状态精确为 `SIT_OUT`、账本 `stack===0`。
- 后置：账本 `stack` 精确恢复为 `startingStack`，`all_in=false`，状态仍为 `SIT_OUT`；只记录一次
  `SEAT_TEST_CHIPS_REFILLED`。补筹本身绝不调用 `setReady`。
- `setReady({ ready: true })` 遇到 `stack===0` 必须先拒绝，防止异常零栈席进入开手名单。
- `recoverSeat` 对零筹码席必须保持 `SIT_OUT`；若统一改成 `SEATED`，它会同时不满足 Ready 与补筹前置，形成死状态。
- 手内界面显示 `HoldemHand` 的余额；手间界面显示 `RoomStore` 账本。已经结束的旧手不能覆盖补筹后的账本。

### 4. 错误矩阵

| 条件 | 稳定错误码 | 结果 |
|---|---|---|
| 席位已释放 | `seat_released` | 不改筹码或状态 |
| 已请求离桌 | `seat_leaving` | 不改筹码或状态 |
| 当前手仍进行中 | `test_chip_refill_during_hand` | 不改筹码或本手 |
| 席位不是 `SIT_OUT` 或已有筹码 | `test_chip_refill_not_available` | 不叠加、不重置 |
| 零筹码席直接 Ready | `test_chip_refill_required` | 保持 `SIT_OUT` |

### 5. Good / Base / Bad

- Good：玩家输光后看到“补充至 200 测试筹码”，点击后筹码为 200、按钮消失，仍需自己点击 Ready。
- Base：正常有筹码玩家看不到补筹按钮，连续多手沿用真实结算后的账本。
- Bad：手内补筹、重复补筹、浏览器自带金额、模型调用补筹、旧完成手覆盖新账本，均被拒绝或测试杀掉。

### 6. 必须验证

- 领域测试覆盖可用、不可用、手内、离桌/释放、幂等和“补筹不 Ready”。
- HTTP 产品路径覆盖浏览器会话授权，模型命令隔离覆盖模型无权补筹。
- 两个隔离 Chromium 上下文完成真实 UI 的 all-in/call 破产→补筹→单独 Ready，并检查控制台与截图。
- 变异测试必须杀掉金额写死错误、错误资格、手内放行、自动 Ready、重复叠加和旧手账本覆盖。

### 7. 错误与正确写法

```js
// Bad：客户端决定数额，且补筹顺手替玩家 Ready。
seat.stack += Number(input.amount);
seat.state = "READY";

// Good：领域层只接受席位，固定恢复房间起始值，仍保持 SIT_OUT。
refillTestChips({ seatId }) {
  const seat = this.requireSeat(seatId);
  // ...检查释放、离桌、手间、SIT_OUT 与 stack===0...
  seat.stack = this.startingStack;
  seat.state = "SIT_OUT";
}
```

## 浏览器模式

新栈的浏览器使用一个小型模块状态对象：

```js
const state = {
  sessionToken: null,     // 浏览器手里唯一的凭证；席位凭据不在这里，也不经浏览器往返
  connectionId: null,     // 由建会话响应明确给出，不靠「恰好等于会话令牌」的巧合
  seatId: null,
  view: null,             // /api/view 返回的 table-view.v1，整体替换
  polling: null,          // 轮询句柄
  disconnected: false,
  lastMessageCount: 0,    // 纯显示用：决定要不要把时间线滚到底
};
```

不写 `localStorage`。当前实现把会话令牌保存在内存和本标签页的 `sessionStorage`，以便刷新后调用协调器的 `/api/session/resume`；存储被禁止时退回内存，不承诺刷新恢复。会话令牌不能进 URL、模型上下文或公开日志。权威席位凭据仍只在协调器中；两类凭据不能混称。未确认落座的暂存输入只在内存。

- 更新 `state.view` 后调用统一 `render()`。
- 倒计时根据权威给的剩余毫秒与截止时刻计算；客户端倒计时归零不等于客户端有权执行自动动作。
- 行动按钮只启用权威 `legal_actions` 明确列出的动作与金额范围，不在 UI 重算扑克规则。下注金额是目标总额，不是增量。
- 遇到终态会话码（`web_session_unknown`、`seat_credential_revoked`、`seat_not_found`）必须停止轮询并回到入口。继续轮询会变成每拍一条 403，而玩家停在一份永不更新的旧牌桌上，会以为自己还在桌上。
- 用 `hidden` 属性切换显隐时，必须确认它真的不渲染。浏览器的 `[hidden]` 只是一条特异性最低的 UA 样式，任何写在类选择器上的 `display` 都会盖掉它；被盖掉的全屏固定层会变成看不见的遮罩，吃掉之后每一次点击，而画面上完全看不出原因。
- 本地隐藏先记录再渲染，且必须可逆；被隐藏的条目降级显示而不是从时间线删除——整条删掉等于改写公开时间线。

### 本人有界通知控件（B16）

- 复用既有 `/api/view` 轮询，服务投影 `model_wake` 的实际上限与当前本席窗口；不读取其他席位窗口或发送器目标配置。缺失/非法投影失败关闭通知功能，不阻断打牌、聊天和撤权。
- 一次逻辑开启固定 UUID 和参数。双击只发一次；传输未知时保留原请求，只有本人点击才核对/重试。一旦表达停止意图，后续重试不能重新 start。每次新窗口重新确认，参数改变即取消勾选。
- 用会话/绑定世代和操作版本隔离迟到响应，启停前的旧 poll 不能覆盖新回执。内部历史窗口可用于安全判断，但若其请求键不是本次待确认请求，不能显示为本次的停止原因、计数、时长或清理结果；机器采样同样遵守这条展示归属。
- 可选通知模块的加载与已有会话恢复并行；模块挂起或失败不能拖住真人牌桌。尚未完成的 OFF/换绑/撤销等本页授权操作必须跨过模块初始化继续阻断通知控件；多项交叠不能由先完成的一项提前解除，旧会话的迟到 ticket 也不能解除新会话的屏障。
- `queued_count` 只证明接收；`resolved_count` 含公开、silent 或合法丢弃。权威 resolve、发送资源清理和原生模型整轮结束是不同事实。停止后续通知不等于撤回已接收的原生消息，禁止迟到公开仍依赖 AI OFF/撤权。
- 状态逻辑独立于 DOM，可用延迟响应与旧投影做确定性测试；页面仍要实查表单、桌面/窄屏和聊天/行动未受阻。必测旧窗口停止后新请求未知、换绑途中旧返回、双击和停止未知后的重试；不能只靠最终绿色截图。

## 旧探针栈的浏览器模式（已替代，保留参考）

旧栈用 `ui = { state, connected, nowOffset, eventSource }`，由 `/api/table/state` 或个性化 SSE `SNAPSHOT` 整体替换，`renderAiPhases()` / `seatAiConversations()` 从公开 AI 事件派生逐座位对话。这套约定连同下面那一节的座位气泡合同一起冻结：它们描述的是旧栈的行为，新栈不复用其函数名与数据流。

## 场景：座位旁公开 AI 对话投影（旧探针栈合同，已替代）

### 1. 范围 / 触发

- 本节描述旧探针栈 `web/app.js` 的座位气泡投影，随该栈一并冻结。新栈的等价行为由 `src/host/table-view-model.cjs` 与 `web/table/table.js` 承担，其中「AI 发言默认公开、挂在某一席名下、带文字 AI 标记、与玩家气泡至少三条冗余通道可区分」由浏览器验收断言。
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

当前不使用 Redux、Zustand 或其他状态库。只有当多个独立页面共享复杂的非权威 UI 状态、且单一模块级 `state` 对象已无法清晰维护时，才另立迁移任务评估状态库。新增真实牌局字段应先进入权威状态模型和协议，再进入视图模型，最后才到 UI。顺序反了就会出现「UI 有这个字段、权威没有」的假状态。

## 服务器同步

当前产品路径（`web/table/` ↔ `src/host/table-web-host.cjs`）：

- 建会话后按固定间隔轮询 `/api/view`，每次用返回的 `table-view.v1` 整体替换 `state.view` 再渲染。整体替换比字段级合并更可靠：合并会让上一拍的残留字段活过它该消失的时刻。
- 提交动作后立即再拉一次视图，不用本地乐观写入代替权威响应。
- 非终态错误（如 `not_your_turn`、`stale_revision`）显示提示并保留上一份可见投影；终态会话码停止轮询并回到入口。
- 协调器只翻译 HTTP 与视图形状，规则判定一律转发给权威命令面；它不缓存第二份牌桌状态。

轮询而不是推送是一个明确取舍：内核只暴露 `POST /command`，没有事件订阅接口，协调器要做推送就得自己维护一份变更判定——那正是第二份事实的入口。

### 旧探针栈的同步方式（已替代，保留参考）

旧栈首屏 `refreshState()`，个性化 SSE 先发 `SNAPSHOT`、后续 `EVENT` 只作为「状态已改变」的通知再回拉投影。该机制随旧栈冻结。

### B30 出站连接器

- 远程 broker 只维护本席注册租约、当前通知、ACK 和取消状态，不持有另一份牌局状态，也不领取第二套 AI 意图。
- `ModelWakeSessions` 仍是唯一有限通知窗口；真人在 Web 开窗，真实权威终态才允许下一次通知。Connector 注册成功不会自动开窗。
- 通知 ID / ACK 是有界恢复游标。已交付但未收到 ACK 的取消不能宣称已清理，须保留未知结果围栏；ACK 重复返回原结果，不再次 queue。
- 活动连接的 origin/token 变化时停止旧 Connector，不能把一个运行中的连接器悄悄改成另一席。原生任务 ID 留在本机，远端只存目标别名。
- 配置/游戏工作面只改变本地可见性；网络同步、席位、AI 权限、在途操作围栏不因切页重置。

## 常见错误

- 在 DOM `dataset` 中保存业务真相，然后反推服务器动作。
- 将插件 pending marker 当作“回答已公开”；只有权威服务接纳后才成立。
- 同时维护 `phase`、`hasPrompt`、`hasAnswer` 三份重复状态。
- 在 UI 中根据本机时间执行超时或判定动作有效；服务端必须再次结算截止时间并校验版本。
- 在协调器里「顺手」判一下合法动作或底池归属。协调器与权威同在一个进程，这样做几乎没有摩擦，但同一条规则就有了两个实现。
- 断言写在可能为空的集合上。`[].every(...)` 恒为真、`new Set([]).size === [].length` 恒为真——投影没渲染出来时这类断言会把缺口报成绿色。先断言数量，再断言内容。
