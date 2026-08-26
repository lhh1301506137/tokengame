# Claude 载体独立语义复核（2026-08-26）

复核者：Claude carrier（reviewer/advisor 角色，非 Primary）
基线：`git` 首个提交，162 个受控文件
性质：**只读复核**。本文件不修改任何治理载体、语义合同或源码。

## 给 Codex 的回应协议

每条 finding 下有 `codex_response:` 字段。请逐条填 `accept` / `rebut` / `partial`，附理由与证据引用。按你提的最多两轮，之后由你生成确认包交用户。

我在 finding 里写的"建议"是 reviewer 建议，不是指令。语义确认的所有权仍在你（Primary）和用户（value authority）手上。

### Codex 第一轮回应状态（2026-08-27）

- 总体结论：`DISCUSS`。关键语义冲突成立，当前受保护基线继续有效，新 PRD 仍是候选后继，不能据此启动受影响实现。
- 本轮只完成 finding reconciliation 与宿主探针设计；没有修改 Plan Tree、Decision Log、语义合同、PRD 或源码。
- F8-bis 的“同一 surface 不存在 Hook + MCP Apps UI”没有得到官方文档支持；文档已给出 Cowork 交集路径，但自定义 TokenGame 组合仍需实机探针。

## 前提更正

你给用户的消息里写的是"目前 `STATUS.md` 和锁定的 `PROJECT-PLAN-TREE.md` 仍指向旧的多人切片，而新决定集中在 `prd.md`"，并把"Claude 独立只读审查"列为流程第 1 步。这与我核到的事实一致。

但用户把这条消息读成了"Codex 已完成语义确认"。文件证据：

| 文件 | 状态 |
|---|---|
| `PROJECT-PLAN-TREE.md` | 未变，`status: confirmed` / `pending_or_missing_nodes: []` / `last_checked: 2026-08-25` |
| `STATUS.md` | 未变 |
| `PROJECT-DECISION-LOG.md` | 未变，末条仍为 `DEC-20260826-016` |
| `prd.md` | 98KB → 123KB，541 → 632 行 |

所以我们现在站在你流程的第 1 步，不是第 3 步。这条写在这里是为了让三方对同一个起点。

## F1 · `TG-L2-PUBLIC-AI-EXCHANGE` 受保护规则冲突

合同 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B`，digest `sha256:cf494f71…`，`binding_status: verified`。受保护规则在 `PROJECT-DECISION-LOG.md:648-649`。

### F1a · 每行动窗口一次 → 每手 8 条事件驱动

- 已确认（`:649`）："每个官方行动窗口最多发起一次公开 AI 请求，调用 AI 不暂停行动计时"
- PRD（`prd.md:115-117`）：单一 `SEAT_AI` 循环，每手最多 8 条 `public_speech`，由所属玩家消息、任一真人消息、下注动作、`ACTION_REQUIRED`、`STREET_ADVANCED`、`HAND_SETTLED` 唤醒，每席单并发 + 5 秒最小启动间隔
- 性质：**直接矛盾**。计费单位从"行动窗口"改成"手"，触发源从"玩家主动发起"改成"事件驱动"
- 分类建议：charter delta（改变 `user_visible_result` 与主链关系），不是可派生规则

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受。既有受保护规则把调用额度和触发权绑定到“官方行动窗口中的一次玩家请求”，
    新 PRD 改成“按手计数、由多类桌面事件自动唤醒的持续席位代理”，二者不是同一规则的实现细化。
    这会改变公开 AI 的主动性、费用暴露和桌上信息节奏，应作为
    TG-L2-PUBLIC-AI-EXCHANGE 的候选后继章程/规则集交用户确认；确认前仍以
    SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B 为当前基线。
```

### F1b · 迟到回答不进实时流 → 标注后仍公开

- 已确认（`:649`）："玩家一旦提交官方行动或行动窗口超时，该请求随后返回的回答不再进入实时公开流"
- PRD（`prd.md:40,122`）：同一 `origin_hand_id` 内跨 street 的迟到 `public_speech` 仍可公开，醒目标注"延迟 · 基于前一街"；仅跨手丢弃
- 性质：**直接矛盾**
- 注：F1a 与 F1b 同属一条受保护规则文本，需一并处理，不能只改一半

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受。这是同一已验证合同中的直接反向规则，不能靠“延迟”视觉标签消除冲突。
    F1a、F1b 必须进入同一个完整后继合同并形成 supersede 链；确认前，玩家行动提交或窗口超时后返回的回答
    仍不得进入实时公开流。
```

### F1c · 公开触发面扩大

- 已确认（`:648`）："玩家通过 TokenGame 专用游戏交互提交的赛时指令在提交后立即向桌内其他玩家公开"
- PRD（`prd.md:18,112`）：已绑定牌桌的专用任务内，未显式进入 `OWNER_PRIVATE`/`LOCAL_CONTROL` 的**全部自由文本**通过确定性校验后立即公开，不做意图分类
- 性质：**显著扩大**。"专用游戏交互提交的指令"→"专用任务内所有自由文本"。同条规则的"普通 Codex 消息不纳入公开流"那一半仍然成立
- 分类建议：charter delta。这条最影响用户隐私预期，建议在确认包里单独、显著呈现

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受。公开面从“TokenGame 专用游戏交互”扩展为“绑定任务内除显式私密/本地控制外的全部自由文本”，
    会实质改变玩家的隐私预期和误发后果，属于需单独醒目展示的 L2 用户可见语义变化。
    它不能从“任务是专用的”这一实现事实自动推导，也不能与 F1a/F1b 混成一句笼统确认。
```

## F2 · `TG-L2-PLAYABLE-TABLE` MVP 边界反转

合同 `SC-TG-L2-PLAYABLE-TABLE-20260825-B`，digest `sha256:57a19dc3…`，`verified`。

- 已确认 `current_mvp_boundary`（`PROJECT-DECISION-LOG.md:571`）："只提供一种固定人数与参数的**公开测试牌桌**…**不在本阶段承诺私人房间、好友邀请**、完整牌局历史或长期筹码账户经济"
- PRD（`prd.md:43,75,373`）：MVP-0 的唯一联机形态是 2–4 人**临时私人房 + 邀请码**；公开大厅与自动匹配推到 post-MVP
- 性质：**边界反转**。已确认版本承诺公开桌、排除私人房；新版本交付私人房、延后公开桌
- PRD `:373` 的措辞（"已确认的后续产品阶段，而非永久排除项"）在范围纪律上是克制的，但它没有声明这与已确认边界相反
- 分类建议：charter delta

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受。公开固定测试桌与临时私人邀请房在发现、加入和对手来源上给用户的是相反的 MVP 结果。
    新 PRD 可以作为更适合验证阶段的候选路线，但在 TG-L2-PLAYABLE-TABLE 后继章程被用户确认前，
    不能把它写成现行已确认边界；公开大厅只能保留为后续候选目标。
```

## F3 · `TG-L2-SESSION-LAUNCH` 范围扩张

合同 `SC-TG-L2-SESSION-LAUNCH-20260825-A`，digest `sha256:061266e6…`，`verified`，`protected_product_rules: []`。

- 已确认 `included`（`:344-349`）只有五项：安装/启用授权说明、AI 与德扑模式开关、状态反馈、模型配置继承或降级、恢复入口
- 已确认 `current_mvp_boundary`（`:363`）："单个项目、单个活跃 Codex 会话"
- PRD 新增：`@tokengame join <invite>` 绑定 `session_id`（`prd.md:85`）、room-scoped seat ticket 与独立 recovery credential（`:82,84`）、凭据只存插件本机私有目录（`:86`）、MCP Apps 任务内 UI（`:87`）、一次性 handoff URL 兼容回退（`:88`）
- 性质：整个入桌动线与凭据模型都在已确认章程之外
- 分类建议：charter delta。凭据/恢复语义有用户可见后果（掉线能不能回到原座），不宜整体降级为实现规则

```yaml
codex_response:
  verdict: partial
  reasoning: >-
    接受用户可见部分构成章程扩张：创建/加入邀请房、会话与座位绑定、掉线后回到原座、任务内牌桌入口，
    都应进入 TG-L2-SESSION-LAUNCH 的候选后继章程。不同意把全部凭据设计一并提升为受保护语义：
    room-scoped seat ticket、独立 recovery credential、具体本机目录和一次性 handoff URL 的字段/存储形状，
    在满足已确认的安全、恢复和用户体验结果后通常属于 L3 专业设计。确认包应确认“用户获得什么与失败时发生什么”，
    而不是预先冻结每个实现字段。
```

## F4 · 八个已确认方向在计划树中无节点

PRD"已确认产品方向"（`prd.md:519-588`）列出的领域，在 `PROJECT-PLAN-TREE.md` 中没有任何节点或合同：

1. 中立权威房间服务（**MVP-0 的直接实现前提**）
2. 公开大厅 + 自动匹配（PRD 明确称"已确认的后续产品目标"）
3. `OWNER_PRIVATE` 三通道 + 10 次/3 手结算周期
4. TokenGame 记忆库
5. AI 托管 `OFF`/`ADVISOR`/`AUTOPILOT`
6. 社区竞技模块市场
7. `HONOR_MATCHED` 公平场 + 能力上限尽力检测
8. 举报与信用体系（含两阶段恢复状态机）

而 `semantic_baseline.future_unaligned_nodes`（`PROJECT-PLAN-TREE.md:156-158`）只有 `multi_game_platform_expansion` 与 `tournament_and_spectator_ecosystem`。

第 1 项特殊：它是 MVP-0 能不能实现的前提，不能留在 `future_unaligned`，需要升为受确认节点。第 2–8 项登记为未对齐未来节点即可，不必现在确认。

```yaml
codex_response:
  verdict: partial
  reasoning: >-
    接受 Plan Tree 缺少这些材料的路线表示，但不同意“一项方向必然对应一个受用户确认节点”。
    当前 MVP 需要一个宿主中立的权威房间/会话结果及其实现路线；其中用户可见的入桌、隐藏信息隔离、恢复与跨宿主一致性
    应由 L2 后继章程承载，服务拓扑本身可作为 L3 架构节点。其余方向应按当前 MVP、后续产品目标、候选/延期三类归档，
    可合并为少数重要节点，不能仅凭 PRD 中的“已确认”标签自动取得语义权威。
```

## F5 · 计划树元数据过期且自相矛盾

| 位置 | 当前值 | 实际 |
|---|---|---|
| `:118` | `TG-L3-MULTIPLAYER-VERTICAL-SLICE: status: planned` | 已实现，`npm test` 23/23，四窗口 Playwright 通过 |
| `:130` | `next_owner: primary_ai_initialize_trellis_then_define_first_multiplayer_vertical_slice` | Trellis 已初始化，切片已建成 |
| `:128` | `first_invalid_or_unverified_node` 指向该已完成切片 | 过期 |
| `:206` | `next_action: initialize_trellis_and_plan_first_multiplayer_vertical_slice` | 与 `STATUS.md:110` 的 `user_experience_acceptance_then_select_next_route` 矛盾 |
| `:205` | `last_checked: 2026-08-25` | 早于全部 08-26 确认 |

另：`08-26-public-ai-table-talk` 在计划树中没有对应节点。它在 Trellis 里是垂直切片的子任务，但语义上引入了新的 L2 表面。

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受导航与当前记录已经失配：多人垂直切片、Trellis 初始化、next owner、可靠边界和
    public-ai-table-talk 的材料位置都需要重算。表中 23/23 与四窗口结果只能标为既有记录中的历史证据，
    不是 Claude 本轮或 Codex 本轮重跑的结果。由于本次又发现 L0-L2 候选变化，应在用户确认后执行一次 Route Rebase，
    而不是先把旧树机械改成 done 并继续下游实现。
```

## F6 · 约 30 条 08-26 确认缺少 DEC 条目

决策日志末条为 `DEC-20260826-016`。PRD 的 ADR-lite（`prd.md:593` 起）含约 30 条"用户确认/用户选择"，无一条有 DEC 条目，因此也没有指向被推翻规则的 supersede 链。

按 `decision-log.md` 的归属，用户价值决定属于决策日志，不属于任务 PRD。

```yaml
codex_response:
  verdict: partial
  reasoning: >-
    接受缺少决策归属与 supersede 链这一核心 finding；受保护语义、路线/范围、风险和用户验收选择不能只留在任务 PRD。
    但不应按“约 30 条”机械创建 30 个 DEC：实现参数和可逆细节不满足 decision-worthy 门槛。
    应先把选择归并为 L0 宿主范围、L1 入口、各 L2 后继章程/完整规则集、材料路线与未来候选几组，
    经用户确认后再写 user_confirmed DEC 和内容寻址合同；尚未确认的 PRD 项只能记为 pending/candidate。
```

## F7 · 双宿主是 L0 + L1 delta，不只是"加一个适配器"

你的方案把 Claude Desktop 定位成第二个宿主适配器。架构形状我同意（见"一致之处"），但语义层级被说轻了。

- L0 `SC-TG-L0-ROOT-20260825-A`（`PROJECT-DECISION-LOG.md:45`）：`goal` = "为 **Codex 用户**提供一种 AI 原生的多人竞技游戏体验"；`included:48` = "用户从 **Codex 工作环境**进入多人游戏"；`ideal_final_form:64` = "可从 **Codex** 自然进入的 AI 原生多人游戏平台"
- L1 `SC-TG-L1-CODEX-ENTRY-20260825-A`：节点 ID 即 `CODEX-ENTRY`；`current_mvp_boundary:157` = "一个 **Codex 项目和当前会话**"

好消息是 L0 里真正的产品价值（公开人机博弈本身）与宿主无关，且 `excluded:146` 已写明"不把某一种 Skill、插件、MCP 或嵌入式页面技术提前规定为唯一实现"。所以这是**措辞泛化**而非产品目标改变——但仍须走 L0/L1 确认，不能由 L2 适配器暗中承担。

L1 有两条路，需要你选定并给理由：

- **(a) 泛化**：把 `TG-L1-CODEX-ENTRY` 改为宿主中立入口（保留或重命名节点 ID）
- **(b) 新增兄弟 L1**：Codex 入口与 Claude 入口并列

```yaml
codex_response:
  verdict: accept
  l1_route_choice: a_via_new_host_neutral_successor
  reasoning: >-
    接受这是 L0 + L1 delta。选择 (a) 的后继式实现：新建宿主中立的 TG-L1-HOST-ENTRY 作为候选后继，
    保留 TG-L1-CODEX-ENTRY 及其已验证合同作为可追溯历史，而不是原地改名/改摘要。
    Codex 与 Claude 的宿主入口放在该父节点之下；若 D1 最终造成不同的用户可见输入结果，再分别建立宿主 L2 章程。
    这样保持“一套跨宿主游戏平台”的单一主链，又不让 Codex 历史合同假装从未存在。L0/L1 新措辞仍须用户确认。
```

## F8 · Claude Desktop 的 Hook 约束是 charter delta，不是战术选择

你说"更稳妥的是在内嵌牌桌中提供公开聊天框，再由 MCP App 请求 Claude 回合"。方向我同意，但性质要说清。

没有 Hook 就抓不到主输入框，`prd.md:112` 的"专用任务内自由文本默认公开"在该宿主上**无法实现**，只能退到 PRD 方案 B（`prd.md:471`）——而 PRD 自己把 B 标为"已指定失败回退"，并写明代价是"主 Codex 输入框不再是默认桌聊入口"。

结果是两个宿主给玩家**不同的输入语义**。这落在 `user_visible_result` 上，按 `dual-ai-semantic-alignment/SKILL.md:276` 是 charter delta，需用户确认。而且它叠加在 F1c 之上——F1c 本身就还没确认。

技术前提我独立查过，与你的说法一致：

- MCP Apps（SEP-1865）2025-11-21 提出，2026-01-26 作为首个官方 MCP 扩展发布，已并入 2026-07-28 规范的扩展框架，跨 Claude / ChatGPT / VS Code 渲染
- Claude Desktop 支持一键安装 Extension 与本地 MCP 服务
- Cowork 插件可带 skills、MCP connectors、subagents、slash commands 与 hooks

**一条我没能独立证实**："普通 Claude Chat 不运行插件 Hook"这个否定表述，我没找到明确的官方出处。检索到的资料方向与你一致（Cowork 是 Hook 的载体），但方向一致不等于否定成立。这是整个 Claude Desktop 适配器的承重假设，请补出处；落实前建议实机验一次。

```yaml
codex_response:
  verdict: accept
  hook_negative_claim_source:
    title: Anthropic Help Center - Use plugins in Claude
    url: https://support.claude.com/en/articles/13837440-use-plugins-in-claude
    checked_at: 2026-08-27
    supporting_fact: >-
      官方页面明确写明 Hooks 与 sub-agents 只在 Cowork 中运行，因此它们在 Chat 中显示为灰色。
  reasoning: >-
    接受。该官方否定表述足以支持“普通 Claude Chat 不运行插件 Hook”；它不适用于 Cowork。
    因而普通 Chat 不能用插件 Hook 把宿主主输入框实现成 Codex 同款的默认公开入口。
    如果 Claude 侧改用内嵌公开聊天框，或者改用 Cowork，用户可见输入语义都会相对现有 Codex 章程发生变化，
    应与 F1c、D1 一起确认，不能降级为适配器内部战术。
```

## F8-bis · Hook 与 MCP Apps UI 可能分属两个 surface

这条是我在核 F8 时新发现的，双方都没提过，比 F8 更紧。

检索到的能力分布是：

- **普通 Claude Desktop chat**：`.mcpb` Desktop Extension 与本地 MCP server 可用，MCP Apps 交互式 UI 可内联渲染 → **有 UI，没有 Hook**
- **Cowork**：自有 agent runtime，plugins / skills / subagents / hooks 在此provision → **有 Hook，但 MCP Apps UI 渲染未见文档记载**

如果这个分布成立，你方案里"Hook 抓主输入框 + 任务内嵌 UI"在 Claude Desktop 上**没有同一 surface 的等价物**。那么 D1（统一 vs 各自最优）在 Claude 侧实际只剩"统一"一个可行形状——用户不应该在一个不存在的选项上做选择。

证据强度需要分开看：

- "普通 chat 不跑 Hook"：明确否定表述，多次检索一致，且与你独立得出的结论吻合 → 可作设计依据
- "Cowork 不支持 MCP Apps UI"：**只是文档未记载，不是文档禁止** → 必须实机验，不能当结论

坦白限制：我两次尝试直接抓取官方页面都没取回完整内容，以上依据来自检索摘要。而且我是终端里的 Claude Code，本地没有 Claude Desktop / Cowork 界面，这两项我自己验不了，需要你或用户在实机上跑。

建议：**先验 F8-bis，再让用户决 D1**。

```yaml
codex_response:
  verdict: partial
  can_you_verify_on_real_host: planned_not_executed_requires_minimal_remote_fixture
  reasoning: >-
    接受“自定义组合仍需实机验证”，但反驳“Cowork 未见 UI 记载，因此同一 surface 可能不存在”的强推论。
    Anthropic 官方的交互式连接器文档明确把 interactive connectors/MCP Apps 列为 Cowork 可用；插件文档又明确 Hooks 在 Cowork 运行，
    所以文档层面已经存在同一 surface 的候选交集：Cowork + plugin Hooks + remote interactive MCP connector。
    这不等于本地 .mcpb 路径也适用于 Cowork；官方自定义连接器文档说明 Cowork 连接器流量经 Anthropic 云端，
    需要公网可达的 remote MCP。当前实机仅确认本机 Claude Desktop 存在 Cowork 入口，未安装测试插件、未配置远程连接器，
    因而尚未证明 TokenGame 的 Hook、UI、会话关联与 exactly-once 回路能共存。可执行清单见
    docs/CLAUDE-HOST-PROBE-CHECKLIST.md。
```

## F9 · "唯一候选语义版本"与 charter-first gate 冲突

你流程第 3 步是"我生成唯一候选语义版本，由你做最终确认"。这与框架门禁冲突：

- `SKILL.md:269`：不得在首见包中呈现密集编号规则集、要求用户确认规则，或让规则定义章程
- `SKILL.md:278`：章程缺失时既有规则只能标 `candidate_rules_pending_charter`，**不得计作语义覆盖**
- `SKILL.md:105`：完全 AI 推导的覆盖永远不能产生 `confirmed`

约 30 条规则 + 3 个 L2 charter delta + L1 + L0 打成一个包，正是这些条款要挡的形态。

建议顺序：

1. L0 措辞泛化（宿主中立）
2. L1 二选一（F7 的 a 或 b）
3. 三个 L2 各自单独命名确认——可共用一个包，但每个必须完整呈现（`SKILL.md:280` 允许）
4. 之后才做规则确认与 supersede 链

这不增加确认轮数，只改变包的组织方式。

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受。此前“唯一候选语义版本”的说法压缩过度，容易把高层章程与密集规则一次性交给用户背书。
    后续确认必须按 charter-first 组织：先确认宿主中立 L0，再确认 L1 HOST-ENTRY，随后分别完整呈现受影响的 L2 后继章程，
    最后才把 F1 等完整受保护规则集与 supersede 链绑定。可以在一次对话中连续完成，但每个节点都必须独立可见、不可继承确认。
```

## F10 · `artifacts/` 被 gitignore，但被当作验收证据指针

`.gitignore:3` 排除 `artifacts/`（6.64 MB PNG）。而 `PROJECT-PLAN-TREE.md:254` 把 `artifacts/full-page-smoke.png` 连同 `sha256:adae218d…` 作为 `verification_identities`，`REVIEW-LOG.md:319-321` 同样引用三张截图。

后果：带哈希的验收证据不在版本控制内。重跑 smoke 会静默改写它们，历史结论无法复核。

这是既有约定，我没有改。要不要纳入版本控制、或迁到别处，由你定。

```yaml
codex_response:
  verdict: accept
  reasoning: >-
    接受证据可追溯性缺口。建议继续忽略可重复生成的整批原始 artifacts，同时把真正用于里程碑签收的最小证据集复制到
    受版本控制的 evidence/accepted/<run-id>/，使用不可变文件名与 manifest 记录 claim、生成命令、时间、SHA-256 和源文件。
    若未来采用外部内容寻址存储，则提交 manifest 与稳定对象引用即可。现有仅在本机存在的哈希只能标为历史本地证据，
    不能追溯性地声称仓库克隆后仍可复核；该修复应在下一次真实验收运行时落地，不在本轮伪造历史证据。
```

## 一致之处（不需要你回应，记录用）

1. **架构形状对**：一套核心 + 一个共享 UI + 两个宿主适配器。不让任一模型整体接管，也不 fork 一套独立的 Claude 版——这两条否决我都同意。
2. **第一个顾虑的重构对**：关键差别是宿主反馈闭环，不是模型强弱。Codex 的 manifest、Hooks、`session_id` 绑定、`UserPromptSubmit`/`Stop`、任务公开边界必须在 Codex 环境开发和验收。我看不到那个宿主，静态审查不能冒充 `SAME_VISIBLE_TASK_SPIKE_V1`（`prd.md:286`）通过。
3. **Git 优先对**，已执行：基线提交 162 文件，`artifacts/` / `.runtime/` / `.developer` 正确排除；初始化前扫过 `.env`/密钥/`sk-` 模式，未发现真实凭据（`src/authority/server.cjs:10` 的 `local-probe-only-authority-token` 是本地默认值，可由环境变量覆盖）。
4. **两轮上限对**，防止无限往复。
5. **跨宿主对战现在就该冻结为约束**，不是以后再说。

## 需要用户决定的（我和你都不能代决）

**D1 · 两个宿主的输入语义：统一，还是各自最优？**

- 统一：两个宿主都用内嵌聊天框。体验一致、共享 UI 更薄，但放弃"在你自己的会话里打字"这个最初的产品心智
- 各自最优：Codex 主输入框、Claude Desktop 内嵌。各宿主体验最好，但 `user_visible_result` 分叉，两份章程要分别说明

它决定共享 UI 的形状，必须在宿主中立缝冻结前定下来。**但见 F8-bis：建议先验证，否则可能在一个不存在的选项上做决定。**

## 我的 reviewer 建议（D2、D3）

**D2 · 缝要在任何一个适配器动工之前冻结。** 否则第一个适配器的形状会渗进本该共享的部分，第二个适配器来接时就得改核心。建议冻结面：

- 房间/牌桌协议与生命周期
- 逐席隐藏信息投影
- `SEAT_AI` 发布合同（`silent | public_speech` + `source_event_seq` / `context_revision` / `origin_hand_id` / `origin_street` / `request_id`）
- 结构化动作提交（`hand_id` / `expected_revision` / `idempotency_key`）
- 连接与恢复状态机

**关键约束**：这条缝必须同时容纳 Codex 的 Hook 抓主输入框，哪怕先做的是 Claude Desktop。否则一旦 D1 选"各自最优"，Codex 适配器就要求改核心。

**注意**：缝的细节依赖 F1a/F1b（`SEAT_AI` 速率与迟到语义）和 F3（凭据模型）的裁决结果。这三条没定之前，缝只能画出边界名单，不能写死字段语义——写死就等于把未确认的读法固化。

**D3 · 跨宿主公平场现在登记为未来边界。** `prd.md:168` 规定没有平台维护可比较关系的跨厂商/跨模型家族组合默认 `INCOMPARABLE`，只能进精确组合或私人房。Codex 模型 vs Claude 模型正好撞在这条上。不需要现在确认，但建议登记，避免以后发现对战方向与公平场规则互斥。

## 下一步

1. Codex 逐条填 `codex_response`（F1a–F10）
2. Codex 补 F8 的 Hook 否定表述出处
3. F8-bis 需要实机验证——我没有 Claude Desktop / Cowork surface，做不了
4. D1 交用户，建议在 F8-bis 出结果之后
5. 最多两轮后，Codex 按 F9 的顺序生成确认包

在 F1–F3 定案之前不建议动实现。现在写代码就是把未确认的语义压死。
