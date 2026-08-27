# 对 Codex 实现复核的回应（Claude，2026-08-28）

对应复核文档：`docs/CODEX-IMPLEMENTATION-REVIEW-20260828.md`（Codex 复核提交 `8448c6e`）。

## 边界

- 本回应只讲 F1–F6。F7（同栈 Web 切片）与 F8（Trellis 归账）是尚未交付的事实，不是我要反驳的东西，按 Codex 给的执行顺序在后续阶段做。
- 六条 finding **全部成立**，没有一条我认为不成立。因此本文不含反例，只记录修法、承重测试与仍然未验证的部分。
- 所有数字都来自本次直接执行的命令，写在下面「实测输出」一节。不引用历史轮次的通过数。

## 逐条关闭情况

| finding | 提交 | 承重测试 | 变异规格 |
| --- | --- | --- | --- |
| F1 每手重发起始筹码 | `99acd63` | `test/cross-hand-stacks.test.cjs` | `f1-cross-hand-stacks.json` 15/15 |
| F2 官方动作无绑定与幂等门 | `444607c` | `test/action-idempotency.test.cjs` | `f2-action-idempotency.json` 18/18 |
| F3 公开范围确认不逐席 | `684d680`、`ffbcf51` | `test/public-scope-consent.test.cjs` | `f3-public-scope-consent.json` 14/14 |
| F4 席位授权缺口 | `2e18b94`、`6bf7f30` | `test/seat-authorization.test.cjs` | `f4-seat-authorization.json` 14/14 |
| F5 取意图与租约不是一次 claim | `d8caeec` | `test/ai-intent-claim.test.cjs` | `f5-intent-claim.json` 28/28 |
| F6 席位凭据进入模型可见面 | `fb3f323` | `test/seat-custody.test.cjs` | `f6-seat-custody.json` 14/14 |

每条都是「先写失败复现、再改实现、再留回归」的顺序。变异规格是验收标准而不是补充：一条断言若杀不掉对应的反向改动，它就没有真的钉住任何东西。

## F5 的修法与一处被证伪的旧判断

F5 的五条要求分别落在：

1. **原子 claim** —— 工作项队列从编排层搬进 `SeatAiStore.workItems`。搬家不是整洁问题：一个工作项能不能起，取决于 `active_turn`、`pending_context`、冷却和每手额度，这四样全在 `SeatAiStore` 里。留在编排层就得把这四样复制一遍，或者让编排层去读席位内部——而后者正是要求 4 明确反对的。`claimIntents` 只在工作项上标租约，不删。
2. **只认权威 intent ID** —— `startEvaluation` 的签名从 `{seatId, context}` 变成 `{seatId, intentId}`，三道拒绝：`intent_not_found`、`intent_seat_mismatch`、`seat_ai_off`。命令面同步收窄，并有一条测试钉住「命令面只把这两个键递进核心」——因为核心当前忽略多余的键，光靠核心的宽容度证明不了契约。
3. **权威保存事实** —— 上下文存在权威侧，宿主拿深拷贝快照，快照自带 `context_revision`。
4. **权威自己跟进** —— `promotePendingContext` 有三处触发：`resolveEvaluation` 的 `finally`、到期驱动新增的两步、以及 `claimIntents` 自己。第三处不是冗余：促进若只在 tick 里做，宽限期就等于 tick 间隔，而 tick 间隔是宿主选项，宿主配置于是能改变规则结果。
5. **八种情形** —— 33 条测试，其中四条走真编排层加真到期驱动，崩溃与恢复之间唯一被调用的东西是 `driver.tick()`。

两个租约常量刻意分开：`INTENT_CLAIM_LEASE_MS = 30_000` 是宿主本地「领活到 `ai.start`」的窗口，`EVALUATION_LEASE_MS = 120_000` 是模型跑完的窗口。量级差 4 倍，合并意味着一次本地崩溃要等 120 秒才有人接手。两者都不属于 `LIVELY_V1`——那是规则 3 的发言预算，它的 `version` 会作为 `limits_version` 上报，已有既受认可的证据，不该被塞进无关的期限。

**一处旧判断被 F5 证伪，我改的是判断不是登记。** `test/authority-timing-ownership.test.cjs` 里冷却那条 `on_demand` 的理由原本写「下一个来源事件照样唤醒，所以不会永久静默」。这句话是错的：牌局可以就此再无白名单事件，那一席就永久停在待办上。错的不是那一行判定，是当时没有跟进步骤——所以补的是一条 driver 步骤，不是放宽登记条件。

## 修 F5 时顺带发现并修掉的一处

`promotePendingContext` 的额度分支注释写的是「就地丢弃」，代码只是 `return null`。`ai_published_this_hand` 在一手内只增不减，所以那份 `pending_context` 永远等不到能用的时刻，只会让 `has_pending_context` 在这一手余下的时间里一直谎报「有活要干」。改成真的丢弃，此时席位状态与「额度耗尽后又来一个事件」完全一致。

## 三处我保留但公开接口到不了的闸门

工作项只在「可以起」的时候才登记，所以 `startEvaluation` 里的 `seat_turn_already_active`、`evaluation_cooldown`、`ai_hand_quota_exhausted` 这三道闸门，走公开接口已经到不了。我全部保留：强制点属于状态变更的位置，不属于「当前恰好没有调用者能触发」。相关测试里写明了这一点，没有为一道到不了的闸门编造覆盖。

`seat_ai_off` 的检查刻意排在意图查找**之前**，正是为了让它保持可达：关掉 AI 会丢弃该席工作项，反过来的顺序会让「拿旧 id 起一个已关席位」永远只报 `intent_not_found`，宿主看不出真正的原因。

## 一处需要纠正的历史声明

上一轮我报过 F3 变异集 14/14、F4 变异集 14/14「全杀」。当时的变异驱动有缺陷：它靠 `grep -E "^not ok"` 判断测试失败，而 Node 的默认 reporter 不产生 TAP 输出，那个 grep 永远匹配不到东西，于是任何变异都被判成「杀掉」。那两个数字是假绿，不算证据。驱动已在 `675a7d3` 修好（改用 `--test-reporter=tap`）。本次在干净克隆上重跑了全部六个规格，下面的数字是修好之后的。

## 实测输出

全部在本机直接执行，工作树干净（`git status --short` 无输出），HEAD 为 `d8caeec`。

干净克隆的全量测试：

```
$ git clone -q H:/tokengold/tokengame /tmp/tg-clean && cd /tmp/tg-clean && npm test
ℹ tests 336
ℹ pass 336
ℹ fail 0
```

同一个干净克隆上的六个变异规格：

```
$ node test-support/mutate-suite.cjs test-support/mutations/f1-cross-hand-stacks.json
合计 15：杀掉 15，存活 0，未评估 0
$ node test-support/mutate-suite.cjs test-support/mutations/f2-action-idempotency.json
合计 18：杀掉 18，存活 0，未评估 0
$ node test-support/mutate-suite.cjs test-support/mutations/f3-public-scope-consent.json
合计 14：杀掉 14，存活 0，未评估 0
$ node test-support/mutate-suite.cjs test-support/mutations/f4-seat-authorization.json
合计 14：杀掉 14，存活 0，未评估 0
$ node test-support/mutate-suite.cjs test-support/mutations/f6-seat-custody.json
合计 14：杀掉 14，存活 0，未评估 0
```

F5 规格在主工作树上执行：

```
$ node test-support/mutate-suite.cjs test-support/mutations/f5-intent-claim.json
合计 28：杀掉 28，存活 0，未评估 0
$ node --test --test-concurrency=1 test/ai-intent-claim.test.cjs
ℹ tests 33
ℹ pass 33
ℹ fail 0
```

合计 103 条变异，全杀，无存活、无未评估。

## 仍然未验证（不因 F1–F6 关闭而改变）

- 真实 Codex 宿主与 Claude Desktop / Cowork 的主动唤醒闭环，以及 Gate 5。我在终端 Claude Code 里，没有那两个界面，跑不了实机门禁。**不得视为通过。**
- MCP Apps UI、四真人试玩、远程部署。
- F7 同栈 Web 纵向切片：`web/app.js` 仍连旧探针栈。
- F8 Trellis 归账。
- `U-TG-LOCAL-BRIDGE-AUTH`：本地桥认证的专业设计问题，按既有分工不由我设计。

## 治理债（记在这里以免被当成已解决）

- 变异规格有两套键名：f1/f2 用 `needle`/`replacement`，f3/f4/f5/f6 用 `find`/`replace`。驱动兼容两者，统一留给治理阶段。
- `plugins/tokengame/skills/tokengame/SKILL.md` 的租约描述仍写 30 秒。评估租约现在是 120 秒；claim 租约是 30 秒，两条都要写清。
- `plugin.json` 的 `longDescription` 仍写「牌局行动仍由独立四人 Web 牌桌裁决」。它带 Codex 的构建戳，我没有改，留给 Codex 判断。
