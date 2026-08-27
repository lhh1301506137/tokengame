# TokenGame 实现复核（Codex，2026-08-28）

## 复核边界

- 被复核提交：`e641312`（含 `7638770..e641312` 的 Claude 实现）
- 本轮直接验证：`npm test`，`208/208` 通过，`0` 失败
- 本轮未验证：真实 Codex/Claude Desktop 主动唤醒、MCP Apps UI、四真人试玩、远程部署
- 当前判断只针对仓库中可复核的代码与测试，不采信仓库外的完成声明

## 结论

Claude 已经建立了有价值的宿主中立权威内核：私人房、Ready/掉线/退出、标准牌局、公开座位 AI 规则、HTTP 命令面、MCP 薄客户端和权威到期驱动都有直接测试。它不是推倒重写对象。

但当前提交仍不能作为可玩纵向切片或宿主接入基线关闭。以下 F1–F3 会改变筹码、官方动作或公开隐私边界，必须先修；F4–F6 是信任与活性边界；F7–F8 是尚未交付的集成与治理事实。

## 阻塞 finding

### F1 — P0：每手重新发放起始筹码，跨手筹码与恢复语义失真

事实：`src/authority/table-orchestrator.cjs` 的 `startHand()` 每次都用 `this.startingStack` 构造所有参赛席位，没有从房间/席位账本继承上一手结算后的 stack。`RoomStore` 也没有持久化每席 stack。

直接复现结果：

```json
{
  "settled_stacks": { "p1": 202, "p2": 198 },
  "next_hand_after_blinds": {
    "p1": { "stack": 198, "committed": 2 },
    "p2": { "stack": 199, "committed": 1 }
  },
  "expected_if_preserved": {
    "p1": { "stack": 200, "committed": 2 },
    "p2": { "stack": 197, "committed": 1 }
  }
}
```

影响：赢输筹码在下一手消失；“恢复同一 seat/stack”也无法成立。自动连续开手虽然通过测试，但不是连续牌局。

要求：

1. 把 stack 作为房间席位的权威状态，而不是 `HoldemHand` 的一次性初始参数。
2. HAND_SETTLED 后把最终 stack 幂等回写席位账本，下一手从账本构造 roster。
3. 恢复、暂离和断线不得重置 stack；释放席位后的筹码处置另行显式定义。
4. 增加至少“下注后弃牌跨手”“all-in/边池跨手”“断线恢复同 stack”三个测试。

### F2 — P0：官方动作没有 hand/revision/idempotency 门禁，重试可跨街重复执行

事实：`HoldemHand.act()` 只接收 `playerId/type/amount`；`hand.act` 命令也不接收或校验 `hand_id`、`expected_revision`、`idempotency_key`。

直接复现：双人桌中，大盲在翻牌前 `check` 的首个请求完成后，牌局进入 flop，且仍由同一玩家先行动。相同网络请求重放会被当作 flop 的新 `check` 再接受一次：

```json
{
  "after_first": { "street": "flop", "actor": "p2", "revision": 3 },
  "duplicate_retry_was_accepted": true,
  "after_retry": { "street": "flop", "actor": "p1", "revision": 4 }
}
```

影响：丢响应后的正常重试可以替玩家执行下一街动作，破坏官方动作权威性。

要求：

1. `hand.act` 必须绑定 `hand_id + expected_revision + idempotency_key`。
2. 相同幂等键与相同 payload 返回原结果，不再次执行；相同键不同 payload 确定性拒绝。
3. 旧 hand 或旧 revision 确定性拒绝，不能在演员恰好再次相同时放行。
4. `hand.reveal` 和其他可重放写命令采用同一套幂等策略。

### F3 — P0：默认公开确认是整桌单例，且无需席位身份或显式 acknowledged

事实：

- `SeatAiStore.publicScopeConfirmation` 只有一个整桌值，不按 seat 记录。
- `room.confirm_public_scope` 不接收 `seat_id`，不需要 `recovery_credential`，并在编排层硬编码 `acknowledged: true`。
- 任意一个调用者确认后，另一名从未确认的玩家即可用自己的席位凭据发布 TABLE_PUBLIC。

直接复现结果：

```json
{
  "only_one_room_level_confirmation": true,
  "second_player_never_confirmed": true,
  "second_player_publication_succeeded": true
}
```

影响：一名玩家或适配器可以替其他玩家接受“本游戏任务自由文本默认公开”，与“参与者在发送前理解该边界”不一致。这是隐私同意边界，不是普通 UI 缺口。

要求：

1. 按 `(room_binding_id, table_rules_version, seat_id)` 保存确认。
2. `room.confirm_public_scope` 加入席位授权，且必须显式传 `acknowledged: true`。
3. `chat.say` 只检查发言席自己的有效确认；新加入、恢复到新绑定或桌规版本变化后必须重新确认。
4. 增加“两席只确认一席”“错误凭据代确认”“规则版本变化”“离桌/重新绑定”测试。

### F4 — P1：`seat.connect` 漏出席位授权集合，可伪造在线状态

事实：`seat.disconnect` 在 `SEAT_AUTHORIZED`，`seat.connect` 不在。只持有外层传输令牌、不持有席位凭据的调用者可以为任意 seat 添加连接，并清空 `retention_expires_at`。

直接复现结果：

```json
{ "seat_connect_without_credential_succeeded": true }
```

影响：攻击或串线的适配器可以阻止另一席进入掉线保留和释放流程。

要求：把 `seat.connect` 纳入席位授权，并补缺凭据、伪造凭据、他席凭据和释放后凭据四类测试。不要只用 `SEAT_AUTHORIZED` 自身枚举生成测试；还要有“所有席位状态写命令必须被覆盖”的独立期望清单，防止集合遗漏自证通过。

### F5 — P1：AI 意图在 `take` 与 `start` 之间存在无租约丢失窗口，来源上下文还可由适配器改写

事实：

- `takeIntents()` 取走即从权威队列删除。
- 30 秒评估租约只在随后 `ai.start` 时建立。
- 适配器若在两步之间崩溃，权威侧 pending 为 0、active turn 为 0、可回收项为 0，本次事件永久丢失。
- `ai.start` 接收适配器回传的任意 `context`，没有用权威 intent/evaluation ID 绑定原始 source event。
- 思考中或 5 秒冷却内的新事件只写入 `seat.pending_context`；当前回合完成或冷却到期后，权威不会重新产生 intent，`due-work` 也不推进它。现有测试是由测试代码手动再次调用 `startEvaluation()`，真实适配器若不额外轮询 `view.seat`，这个最新上下文会一直搁置；即使轮询，也把受保护的跟进时序重新交给了宿主。

直接复现结果：

```json
{
  "created_intent_count": 1,
  "first_take_count": 1,
  "authority_pending_after_take": 0,
  "reclaimable_after_take": 0
}
```

影响：玩家问题或关键牌局事件可能无回答且无失败状态；适配器还能伪造公开话术的 `source_event_id`，削弱“来源可审计”。

要求：

1. 把“取意图 + 建立回合租约”做成一次权威原子 claim，或为 intent 自身建立 claim/ack 租约。
2. `ai.start`/claim 只接受权威生成的 intent ID，不接受适配器自带来源上下文。
3. 权威保存 source event、hand、street、context revision；适配器只拿只读快照并回填模型结果。
4. 由权威在回合结束或冷却到期后把唯一 dirty context 变成可 claim 工作；不要求宿主轮询席位内部状态来恢复活性。
5. 覆盖 claim 前崩溃、claim 后崩溃、冷却到期自动跟进、回合结束自动跟进、迟到回填、重复 claim、错误 intent ID 和跨席 claim。

### F6 — P1：席位秘密进入模型工具结果并要求模型逐次回传

事实：通用 MCP 工具 `tokengame_table` 把 `room.create`/`room.join` 返回整体作为文本交给模型，其中包含 `recovery_credential`；后续每个席位命令又要求模型在 `params` 中回传该凭据。

影响：席位 secret 没有“留在本机协调器”，而是进入宿主模型上下文。对手文本、提示注入、日志或错误回显都扩大了泄漏面；Skill 中一句“不要公开凭据”不能替代秘密托管。

要求：

1. 核心 HTTP 可继续校验 seat credential，但宿主本机协调器必须托管它。
2. 面向模型的高层工具只接收已绑定的本地 seat/session 句柄，不暴露原始 credential。
3. create/join 的 MCP 结果净化 secret；诊断日志、错误、投影与录制同样做负向扫描。
4. 增加“工具返回与模型可见 transcript 不含 credential”的测试。

## 尚未交付但不应伪装成内核缺陷

### F7 — P1：新权威核心尚未连接玩家可见 UI 或真实宿主

- `web/app.js` 仍消费旧探针 `/api/table/*` 与 `AI_PROMPT_PUBLISHED/AI_ANSWER_PUBLISHED`。
- `npm run core` 的新命令服务只有 `/command`，没有供当前 Web 页面使用的同栈投影/SSE/动作路由。
- 现有气泡因此不展示新 `PLAYER_PUBLIC_SPEECH/AI_PUBLIC_SPEECH` 时间线，也不覆盖邀请、Ready、恢复、本地隐藏和主动 AI 状态。
- TokenGame Skill 已正确声明：真实 Codex UI、Claude 适配器和无点击主动唤醒均未验证。

结论：208/208 证明内核测试，不证明用户已能从 Codex/Claude 进入并玩到这套规则。

### F8 — P2：Trellis 与主导航未同步实际实现

- `.trellis/tasks/08-26-public-ai-table-talk/task.json` 仍为 `planning`。
- `implement.jsonl` 与 `check.jsonl` 仍只有 `_example`。
- `PROJECT-PLAN-TREE.md` 和 `STATUS.md` 仍把实现停在 PI 刷新/重验门禁。

影响：代码已跨越 kernel、房间、命令传输和宿主面多个执行单元，但没有可审计的 unit/closure 对应关系。后续若直接叠加 UI，会更难判断哪些合同已满足、哪些只是测试存在。

## 推荐执行顺序

1. **内核完整性修复（独立提交）**：F1 + F2，各自加入失败复现测试，再修实现。
2. **隐私与授权修复（独立提交）**：F3 + F4 + F6；凭据托管若依赖宿主适配器，可先冻结接口与负向测试。
3. **AI 工作租约修复（独立提交）**：F5，统一 intent claim、evaluation lease 和权威来源绑定。
4. **Trellis 归账**：把已完成代码映射为明确执行单元，更新任务状态、implement/check context、Plan Tree 与 STATUS；不得把宿主 Gate 5 标成通过。
5. **同栈 Web 纵向切片**：只连接新核心，不再扩展旧探针栈；完成邀请、确认、Ready、牌局动作、公开时间线、座位气泡、本地隐藏和恢复。
6. **宿主适配器**：先取得一个宿主的真实主动唤醒闭环证据，再做第二宿主；两侧分别记录 Gate 5 与“是否需要用户点击”。

每一步应保留独立提交和直接测试证据。F1–F6 未关闭前，不建议把当前核心交给 UI 当稳定协议。
