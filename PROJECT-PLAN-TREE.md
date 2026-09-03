# TokenGame 项目路线树

本文件只负责当前路线与恢复位置；产品语义以已验证的决策合同为准。

```yaml
plan_tree:
  status: active
  root_goal_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
  active_path:
    - TG-L0-PRODUCT
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-PUBLIC-AI-EXCHANGE
    - TG-L3-MULTIPLAYER-VERTICAL-SLICE
    - TG-EU-PLAYABILITY-GATE
  nodes:
    - id: TG-L0-PRODUCT
      parent: none
      dependencies: []
      status: active
      summary: 已确认 TokenGame 是宿主中立的 AI 原生多人竞技游戏平台，以公开人机博弈为核心；Codex 与 Claude 是首批目标宿主，适配器允许分阶段交付。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260827-017
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
        current_revision_ref: SC-TG-L0-ROOT-20260827-B
        candidate_successor_ref: none
        presentation: aligned
        result_ref: none
    - id: TG-L1-HOST-ENTRY
      parent: TG-L0-PRODUCT
      dependencies: []
      status: planned
      summary: 已确认的共享宿主中立入口与会话承接能力域；Codex、Claude 及以后宿主作为其下适配器分阶段接入同一玩家身份、房间与恢复含义。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260827-018
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
        current_revision_ref: SC-TG-L1-HOST-ENTRY-20260827-A
        candidate_successor_ref: none
        presentation: aligned
        result_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#l1-truth-persistence-result
    - id: TG-L1-CODEX-ENTRY
      parent: TG-L0-PRODUCT
      dependencies: []
      status: superseded
      summary: 已被共享 TG-L1-HOST-ENTRY 替代的 Codex 专属入口历史章程；其 Codex 聚焦证据保持原范围，不再控制当前入口路线。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-002
        - PROJECT-DECISION-LOG.md#DEC-20260827-018
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260825-002
        current_revision_ref: SC-TG-L1-CODEX-ENTRY-20260825-A
        candidate_successor_ref: none
        presentation: aligned
        result_ref: none
    - id: TG-L1-LIVE-TABLE
      parent: TG-L0-PRODUCT
      dependencies:
        - TG-L1-HOST-ENTRY
      status: planned
      summary: 已确认的可信实时牌局能力域；宿主中立会话、座位恢复、临时私人牌桌章程及牌桌体验规则已确认并唯一绑定，相关产品实现仍待后续重验。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-003
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260825-003
        current_revision_ref: SC-TG-L1-LIVE-TABLE-20260825-A
        candidate_successor_ref: none
        presentation: aligned
        result_ref: none
    - id: TG-L1-PUBLIC-AI-PLAY
      parent: TG-L0-PRODUCT
      dependencies:
        - TG-L1-HOST-ENTRY
        - TG-L1-LIVE-TABLE
      status: active
      summary: 已确认的公开人机博弈能力域；其一席一 AI、座位旁上下文气泡、事件驱动主动发言及七条公开交流规则已经确认并唯一绑定，当前实现与宿主证据仍待按新合同重验。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-004
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260825-004
        current_revision_ref: SC-TG-L1-PUBLIC-AI-20260825-A
        candidate_successor_ref: none
        presentation: aligned
        result_ref: none
    - id: TG-L2-SESSION-LAUNCH
      parent: TG-L1-HOST-ENTRY
      dependencies: []
      status: blocked
      summary: 宿主中立游戏会话、临时私人房、座位归属与普通中断恢复章程已确认并唯一绑定；产品实现与双宿主能力仍待后续重验。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-005
        - PROJECT-DECISION-LOG.md#DEC-20260827-019
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
        current_revision_ref: SC-TG-L2-SESSION-LAUNCH-20260827-B
        candidate_successor_ref: none
        presentation: aligned
        result_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#l2-session-launch-truth-persistence-result
    - id: TG-L2-PLAYABLE-TABLE
      parent: TG-L1-LIVE-TABLE
      dependencies:
        - TG-L2-SESSION-LAUNCH
      status: planned
      summary: 宿主中立的两至四人临时私人牌桌章程，以及 Ready、掉线恢复、主动退出与亮牌四条受保护规则已经确认并唯一绑定；实现与验收仍待后续重验。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-008
        - PROJECT-DECISION-LOG.md#DEC-20260827-020
        - PROJECT-DECISION-LOG.md#DEC-20260827-022
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022
        current_revision_ref: SC-TG-L2-PLAYABLE-TABLE-20260827-D
        candidate_successor_ref: none
        presentation: aligned
    - id: TG-L2-PUBLIC-AI-EXCHANGE
      parent: TG-L1-PUBLIC-AI-PLAY
      dependencies:
        - TG-L2-SESSION-LAUNCH
        - TG-L2-PLAYABLE-TABLE
      status: blocked
      summary: 宿主中立的一席一 AI、座位气泡、事件驱动主动发言章程及默认公开、主动评估、反刷屏、并发归并、迟到、关闭降级与本地隐藏七条规则已经确认并唯一绑定；旧实现、主动唤醒与双宿主证据仍待重验。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-009
        - PROJECT-DECISION-LOG.md#DEC-20260827-021
        - PROJECT-DECISION-LOG.md#DEC-20260827-023
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
        current_revision_ref: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
        candidate_successor_ref: none
        presentation: aligned
        result_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#public-ai-rules-truth-persistence-result
    - id: TG-L3-CODEX-BRIDGE-SPIKE
      parent: TG-L2-SESSION-LAUNCH
      dependencies:
        - TG-L2-PUBLIC-AI-EXCHANGE
      status: blocked
      summary: 旧 Codex 聚焦范围下的本地回环协议、Hook、MCP、伪权威事件服务和独立 Web 视图证据保持可复用；在当前公开 AI 规则合同与双宿主路线下尚未重验，不能继续视为当前完成节点。
      owner_links:
        - STATUS.md#project_intelligence
        - PROJECT-DECISION-LOG.md#DEC-20260825-011
      understanding_view:
        current_ref: STATUS.md#project_intelligence
        current_revision_ref: PI-TG-CODEX-BRIDGE-R4
        candidate_successor_ref: none
        human_brief_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE.md
        ai_working_contract_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE-AI.json
        evidence_appendix_refs:
          - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md
        artifact_receipt_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE-RECEIPT.json
        related_understanding_ids:
          - UE-TG-CODEX-BRIDGE
        presentation: review_required
        plan_ref: PROJECT-PLAN-TREE.md#当前恢复点
        result_ref: PROJECT-PLAN-TREE.md#本地探针执行结论
        gap_ref: docs/HOST-PROBE-CHECKLIST.md#修复后边界
        material_v2_00:
          runtime_profile: adaptive
          runtime_profile_source: adapter_default
          impact_scope_ref: STATUS.md#project_intelligence
          navigation_context_ref: .dual/CODEX-BRIDGE-GENERATION-CONTEXT.json
          route_permission_ref: STATUS.md#project_intelligence
          generation_context_receipt_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE-RECEIPT.json
    - id: TG-L4-CODEX-HOST-INTEGRATION-PROBE
      parent: TG-L3-CODEX-BRIDGE-SPIKE
      dependencies: []
      status: completed
      summary: 已在无秘密专用任务中完成 marketplace 安装、显式信任、UserPromptSubmit/Stop、PreToolUse、MCP、故障补交和可逆卸载；清理后插件、配置、缓存、数据、端口与本次子进程残留均为零。
      owner_links:
        - docs/HOST-PROBE-CHECKLIST.md
        - PROJECT-PLAN-TREE.md#本地探针执行结论
    - id: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      parent: TG-L2-PLAYABLE-TABLE
      dependencies:
        - TG-L4-CODEX-HOST-INTEGRATION-PROBE
      status: active
      summary: 宿主中立临时私人牌桌 MVP 的本地完整纵向切片。原摘要写的「固定测试桌一手牌」已被 D 版合同反转为 2～4 人临时私人房、Ready 门与连续多手；旧固定桌切片的实现与四窗口验收保留为已替代历史证据。当前范围是一份共享权威内核加一套 UI，Codex 与 Claude 只能是其适配器。
      trellis_task_ref: .trellis/tasks/08-26-multiplayer-vertical-slice/task.json
      trellis_child_task_ref: .trellis/tasks/08-26-public-ai-table-talk/task.json
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260827-022
        - PROJECT-DECISION-LOG.md#DEC-20260827-023
        - .trellis/tasks/08-26-public-ai-table-talk/prd.md#mvp-0-权威范围已锁定
        - STATUS.md#project_intelligence
      execution_units:
        - TG-EU-HOLDEM-ADJUDICATION
        - TG-EU-ROOM-LIFECYCLE
        - TG-EU-SEAT-AI-EXCHANGE
        - TG-EU-ORCHESTRATION
        - TG-EU-HOST-NEUTRAL-SURFACE
        - TG-EU-SEAT-CUSTODY
        - TG-EU-REVIEW-CLOSURE-F1-F6
        - TG-EU-SINGLE-STACK-WEB-TABLE
        - TG-EU-HOST-ADAPTER-CONTRACT
        - TG-EU-CLAUDE-HOST-ADAPTER
        - TG-EU-PROACTIVE-WAKE-SPIKE
        - TG-EU-PLAYABILITY-GATE
    - id: TG-EU-HOLDEM-ADJUDICATION
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies: []
      status: completed
      unit_kind: kernel
      summary: 无限注德州扑克裁决：四轮下注、短额 all-in、主池与多层边池、平池奇数筹码、标准摊牌与超时。D 版合同没有反转牌局裁决本身，本单元按原样保留复用。
      implementation_refs:
        - src/game/holdem.cjs
      verification:
        - "test/holdem-engine.test.cjs：10 tests / 10 pass"
      commits:
        - cf1a1b7
        - 50a3b08
      claim_limit: 已验证扑克规则裁决，不含房间、席位、凭据或 AI 语义。
    - id: TG-EU-ROOM-LIFECYCLE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-HOLDEM-ADJUDICATION
      status: completed
      unit_kind: kernel
      summary: 临时私人房与席位归属的权威内核。实现 PLAYABLE-TABLE 规则 1～3（Ready 门与 3 秒倒计时、DISCONNECT_STRICT_V1 的 0ms 行动延长与 120 秒保留窗、VOLUNTARY_EXIT_V1 的暂离与离桌），并为 SESSION-LAUNCH 提供创建、邀请兑换与席位恢复。
      implementation_refs:
        - src/authority/room-store.cjs
      verification:
        - "test/room-store.test.cjs：32 tests / 32 pass"
        - "test/cross-hand-stacks.test.cjs：14 tests / 14 pass"
        - "变异规格 test-support/mutations/f1-cross-hand-stacks.json：15/15 杀死"
      commits:
        - 2e119b1
        - fb77496
        - 50a3b08
        - 99acd63
      claim_limit: 已验证房间与席位生命周期判定，不含任何宿主适配器或 UI。
    - id: TG-EU-SEAT-AI-EXCHANGE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-ROOM-LIFECYCLE
      status: completed
      unit_kind: kernel
      summary: SEAT_AI 权威内核，实现 PUBLIC-AI-EXCHANGE 的七条受保护规则：默认公开、事件驱动主动评估、LIVELY_V1 四层反刷屏、并发归并为唯一 dirty 上下文、同手迟到仍公开且跨街须标注、关闭降级、本地隐藏只影响渲染。字素计数用 Intl.Segmenter，不用 String.length。
      implementation_refs:
        - src/authority/seat-ai-store.cjs
      verification:
        - "test/seat-ai-store.test.cjs：32 tests / 32 pass"
        - "test/ai-evaluation-lease.test.cjs：15 tests / 15 pass"
        - "test/ai-intent-claim.test.cjs：33 tests / 33 pass"
        - "test/public-scope-consent.test.cjs：10 tests / 10 pass"
        - "变异规格 f3 14/14、f5 28/28 杀死"
      commits:
        - a8763c4
        - e641312
        - 50a3b08
        - 684d680
        - ffbcf51
        - d8caeec
      claim_limit: 已验证 AI 公开发言的权威判定与配额；不调用任何模型，模型结果由适配器回填。
    - id: TG-EU-ORCHESTRATION
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-ROOM-LIFECYCLE
        - TG-EU-SEAT-AI-EXCHANGE
        - TG-EU-HOLDEM-ADJUDICATION
      status: completed
      unit_kind: kernel
      summary: 编排层把三个内核咬合起来且不新增任何产品语义；官方动作幂等账绑定 hand_id、expected_revision 与 idempotency_key；到期驱动让「玩家不在场时该发生什么」按时发生，且到期判定在每个读取点自行促进，不取决于驱动跑没跑。
      implementation_refs:
        - src/authority/table-orchestrator.cjs
        - src/authority/action-ledger.cjs
        - src/authority/due-work.cjs
      verification:
        - "test/table-orchestrator.test.cjs：31 tests / 31 pass"
        - "test/action-idempotency.test.cjs：18 tests / 18 pass"
        - "test/due-work.test.cjs：15 tests / 15 pass"
        - "test/tick-phase-independence.test.cjs：9 tests / 9 pass"
        - "test/authority-timing-ownership.test.cjs：6 tests / 6 pass（时间比较归属注册表）"
        - "变异规格 f2 18/18 杀死"
      commits:
        - fcd9447
        - 8436f67
        - 925a0c6
        - 67bc316
        - 99acd63
        - 444607c
        - d8caeec
      verification_commits:
        - 7218faa
        - 50a3b08
      claim_limit: 已验证事件路由与幂等；编排层不重新判定任何受保护规则。
    - id: TG-EU-HOST-NEUTRAL-SURFACE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-ORCHESTRATION
      status: completed
      unit_kind: kernel
      summary: 两个宿主适配器共用的唯一命令词表、进程外传输面、可发命令的三分类，以及核心的进程入口 npm run core。这是 L0「不由任一玩家宿主掌握牌堆、对手底牌或结算权」的落地位置：权威一旦只能进程内调用，先落地的适配器必然把核心嵌进自己进程。
      implementation_refs:
        - src/authority/command-surface.cjs
        - src/authority/command-server.cjs
        - src/authority/host-surface.cjs
        - src/run-table-core.cjs
      verification:
        - "test/command-surface.test.cjs：27 tests / 27 pass"
        - "test/command-server.test.cjs：11 tests / 11 pass"
        - "test/host-surface.test.cjs：8 tests / 8 pass"
        - "test/core-entry.test.cjs：7 tests / 7 pass"
        - "test/two-process-table.test.cjs：2 tests / 2 pass（两个独立进程在同一份权威状态上打完一手牌）"
        - "test/seat-authorization.test.cjs：17 tests / 17 pass；变异规格 f4 14/14 杀死"
      commits:
        - fb77496
        - 7f851ef
        - a2083f9
        - fd00dce
        - 6172ec5
        - 2e18b94
      verification_commits:
        - 54854f4
        - 6fb20b6
        - 6bf7f30
      claim_limit: 已实证进程外可达与宿主中立性；桥接鉴权仍是 U-TG-LOCAL-BRIDGE-AUTH，未设计完成，不得声称生产鉴权。
    - id: TG-EU-SEAT-CUSTODY
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-HOST-NEUTRAL-SURFACE
      status: completed
      unit_kind: kernel
      summary: 席位凭据的本机托管。核心继续校验凭据（权威的信任边界不削弱），但凭据只在协调器进程内存在，模型只拿到进程内存作用域的不透明句柄。句柄不可移植、不能过网、不能在别的进程恢复席位。
      implementation_refs:
        - src/host/seat-custody.cjs
      verification:
        - "test/seat-custody.test.cjs：18 tests / 18 pass，含 transcript / 错误 / 日志 / 投影四处负例泄漏扫描"
        - "变异规格 f6 14/14 杀死"
      commits:
        - fb3f323
      claim_limit: 已验证凭据不进入模型可见结果；未验证生产密钥管理或跨设备同步。
    - id: TG-EU-REVIEW-CLOSURE-F1-F6
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-SEAT-CUSTODY
      status: completed
      unit_kind: review_closure
      summary: 逐条闭合 Codex 实现复核的六项 finding，每条都有失败复现、修复与回归测试；并用变异测试作为验收标准而不是测试数量。
      implementation_refs:
        - docs/CODEX-IMPLEMENTATION-REVIEW-20260828.md
        - docs/CLAUDE-REVIEW-RESPONSE-20260828.md
        - test-support/mutate-suite.cjs
      verification:
        - "F1 筹码跨手存活 99acd63；F2 动作幂等 444607c；F3 逐席公开确认 684d680+ffbcf51；F4 席位授权 2e18b94+6bf7f30；F5 意图 claim 原子化 d8caeec；F6 凭据托管 fb3f323"
        - "六个变异规格在全新克隆重跑：f1 15/15、f2 18/18、f3 14/14、f4 14/14、f5 28/28、f6 14/14，合计 103 变异 0 存活 0 未评估"
        - "npm test 2026-08-28 实测 336/336 pass、0 fail，工作树与全新克隆各一次"
      commits:
        - 675a7d3
        - 3081d01
      claim_limit: >-
        更正一处历史假绿：此前 F3/F4 的 14/14 由 `grep -E "^not ok"` 判定，而 Node 默认 reporter
        不输出 TAP，判定从未真正生效。驱动在 675a7d3 修好后重跑才是真值。
    - id: TG-EU-SINGLE-STACK-WEB-TABLE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-REVIEW-CLOSURE-F1-F6
      status: completed
      unit_kind: product_loop
      summary: 把 web/ 从旧探针栈切到同一宿主中立内核，形成单栈产品闭环：建房与邀请码加入、逐席公开范围确认、Ready 与倒计时、私有底牌与公共牌、底池与当前行动者、合法按钮与下注滑杆、筹码跨手存活、玩家与所属 AI 相邻且气泡可区分、THINKING/DEGRADED/OFFLINE/OFF/迟到标注、逐查看者本地隐藏、掉线与 120 秒恢复、暂离与离桌。UI 不直接读取权威原始事件或秘密。
      implementation_refs:
        - web/table/index.html
        - web/table/table.css
        - web/table/table.js
        - src/host/table-web-host.cjs
        - src/host/table-view-model.cjs
        - src/host/core-client.cjs
        - src/run-table-web.cjs
      current_state: >-
        新 UI 在 web/table/，只认 /api/view 的 tokengame.table-view.v1 契约，经协调器连同一份权威内核，
        入口是 npm run web。旧探针栈 web/app.js 与 npm run authority / table 原样保留为已替代历史证据，
        不再是产品路径——两套牌桌不并行维护，新 UI 不读旧 /api/table/*。
      verification:
        - "test/table-web-host.test.cjs：15 tests / 15 pass"
        - "变异规格 test-support/mutations/web-host-boundary.json：16/16 杀死，0 存活 0 未评估"
        - "浏览器验收 test-support/table-web-acceptance.mjs：80 条断言全过，控制台错误 0，四个隔离 Chromium 上下文，连续打到第 3 手"
        - "npm test 2026-08-28 实测 351/351 pass、0 fail；全新克隆一次、工作树一次"
        - "浏览器验收在全新克隆连跑三次、工作树连跑四次，均 80/80"
        - "【2026-08-28 复开后实测】npm test 498/498 pass、0 fail"
        - "【2026-08-28 复开后实测】npm run gate：MUTATION_TOTAL=226 KILLED=226 SURVIVED=0 SKIPPED=0 GATE=PASS"
        - "【2026-08-28 复开后实测】按 2549474 全新 git clone 重跑（无 npm install，本仓库零依赖）：npm test 498/498、门禁 226/226 GATE=PASS、浏览器验收 150/150 控制台错误 0；抽查行尾均 LF"
        - "【2026-08-28 复开后实测】浏览器验收 artifacts/acc-item7-redact：150 条断言全过，控制台错误 0，四个隔离上下文，打到第 4 手，24 张截图。artifacts/ 被 .gitignore 忽略，该路径只在本机存在；判定数字誊在 docs/ACCEPTANCE-EVIDENCE.md，那才是记录在案的证据"
        - "【2026-08-29 实测 5235bf5】npm test 698/698 pass、0 fail、0 skipped；npm run gate MUTATION_TOTAL=358 KILLED=358 SURVIVED=0 SKIPPED=0 GATE=PASS"
        - "【2026-08-29 实测 5235bf5】浏览器验收 209 条断言全过、控制台错误 0、窗口外网络失败 0、到第 13 手：工作树连跑 3 次 + 全新无硬链接克隆连跑 3 次，六次 EXIT=0 且断言名单完全一致（用 artifacts/drift-diff.cjs 逐条比对多重集，不是只比条数）"
        - "【2026-08-29 实测 5235bf5】新增变异规格 deterministic-deck 9/9、poll-lifecycle-race 10/10；multi-hand-verdict 由 41 扩到 46/46（新增 5 条盯破产循环）"
        - "【2026-08-29 修掉的偶发】断网窗口关闭之后的 403 有三个来源，不是一个：测试窗口竞态（证据按响应到达时刻归类）、离桌竞态（await 期间那一跳轮询带着即将作废的凭据）、掉线竞态（touchConnection 对被摘掉的连接 id 会重新建连，那一跳轮询把刚掉的线接回去，保留窗根本没走）。第三条用响应围栏挡不住——请求已经到了服务端，只有顺序能修。双向验证：旧客户端 1 条 403，新客户端 0 条"
        - "【2026-08-29 覆盖不再靠牌运】9d 的破产分支原先取决于摊牌，项数在 200/201 之间漂。加确定性发牌只解决了漂移，没解决覆盖：第一版种子正好让全下方赢，破产分支变成**稳定地**跳过。改成重复「短码全下、大码跟、其余弃」直到真有一席归零，预算用尽就红；六次运行都在第 2 轮归零 bob"
        - "【2026-08-28 复开后新增变异规格】connection-lease 16/16、voluntary-reveal 6/6、entry-consent-idempotency 11/11、scope-reconfirmation 12/12、view-model-degradation 7/7，全部 0 存活 0 未评估"
      commits:
        - 8ad8cac
        - bfaaea5
        - d1bf428
        - e029491
        - eb8ce9a
        - 62cfdae
        - 550d719
        - b11528a
        - eef01e9
        - 0e46add
        - 560282c
        - 149f275
        - 2d89671
        - 0346d3c
        - 959a29c
        - 2e00f01
        - af0865d
        - 287f083
        - 5235bf5
      acceptance_intent:
        - 用确定性 fake 宿主/模型适配器做自动化产品测试，不用假模型结果冒充真实宿主能力
        - 2～4 个隔离浏览器上下文验证，控制台错误必须为 0
      acceptance_result: >-
        两条都已满足。适配器是 test-support/scripted-model-adapter.cjs，simulated:true 硬编码不可覆盖，
        视图显示为「（模拟）」，所以每张截图都自证不是真实宿主能力。
      defects_found_by_browser: >-
        三个缺陷是浏览器验收发现的，351 个单元测试与代码复核都没发现：[hidden] 被类选择器上的 display
        盖掉导致三个元素带 hidden 仍占布局（其中 scope-gate 是全屏遮罩，吃掉后续所有点击）；离桌后轮询
        不停，每 700ms 一条 403；公共牌从未被观察过——74 条断言全绿而 board 一直是 0。另有一处竞争在
        全新克隆才暴露：只等建房者一页就读四页，其余三页差一个 tick 读到空桌，同时暴露五条断言在空数据
        上空过（含全场最严的跨上下文泄漏检查，只搜了 24 次里的 6 次）。
      claim_limit: >-
        已验证本地单栈产品闭环与四上下文隔离。不含真实宿主适配器、无点击主动唤醒、真人试玩签字、
        生产鉴权与远程部署；桥接鉴权仍是 U-TG-LOCAL-BRIDGE-AUTH，未设计完成。
      errata:
        - date: 2026-08-28
          why_reopened: >-
            上面那份 completed 与当时的证据一致（80 条断言确实全过），但它掩盖了五处「有代码、有按钮、
            有权威支持，而功能从未成立」的缺口——共同点是它们都不会红：没有失败的测试，没有报错，
            画面上也看不出异常。80 条断言之所以全过，是因为没有一条走到那些路径上。
          gaps_found:
            - "连接租约不存在：seat.disconnect 只由「模拟掉线」按钮触发，页面上既没有 pagehide 也没有 sendBeacon。真实关标签页、刷新、拔网线之后权威侧那一席一直是 connected，保留窗永远不起算、位子永远不还，别人只看到一个「在线但永远不行动」的席位。"
            - "自愿亮牌从未成立：can_reveal 检查 settlement.payouts，而权威侧不存在这个字段（真实字段是 winner_ids）。这个条件恒假，所以按钮一次都没出现过；又因为它没出现过，客户端只传一个参数的缺陷从未被触发——两个缺陷互相掩盖。"
            - "同意门在绑定之后：提交表单先 POST create/join，座位建好、凭据发出、公开时间线落下 SEAT_BOUND，然后才弹说明。合同要求确认在绑定之前。"
            - "换绑或改桌规之后同意门再也不出现：public_scope_confirmed 算的是「存在过一份确认」，而权威按三元组比对。玩家看到已确认而每句话都被拒，页面上没有任何解释。"
            - "畸形上游投影让整页停更：视图模型在四条路径上抛 TypeError，而它在请求路径上——抛错就是 /api/view 回 500，页面永远停在最后一帧，牌桌看起来还在只是不动了。"
          also_fixed_in_tooling: >-
            变异驱动此前对非 JS 文件一律判 INVALID（node --check 认扩展名），于是 HTML 结构与 CSS 规则
            这两类产品真的依赖的不变量永远不会被评估。已改为按扩展名分流。
          still_unverified: >-
            真实宿主 Gate 5（事件驱动主动唤醒）仍未验证，四真人 UAT 未做。本轮全部证据来自自动化，
            不能代替实机门禁。
        - date: 2026-08-28
          kind: coverage_extension
          what: >-
            自动化验收从第 4 手推到第 11 手。跨十手要暴露的是另一类问题：累积状态错误——筹码结转、
            按钮位轮转、手序号，在第二手上对，在第八手上不一定还对。新增三节，都放在玩家开始离桌
            （第 10/11 节）之前，那之后桌上凑不出多人局：8c 连续打到第 11 手并逐手查筹码守恒、
            8d 五种畸形投影的有界降级、9d 有人跟的全下摊牌。
          measured:
            browser_acceptance: 201_pass_0_fail_0_console_errors_27_screenshots_hand_12
            consecutive_clean_runs: 3
            npm_test: 644_pass_0_fail_0_skipped
            mutation_gate: 315_killed_0_survived_0_skipped_GATE_PASS
          my_own_defects_fixed_along_the_way:
            - "筹码守恒写成等式必然误报：结算后 stack 是账本值而 pot 仍是 settlement.total_pot，相加把池算了两遍，真实运行的第 7 手上炸出 800+3=803。DOM 里读不到 in_hand 所以画面上分不清阶段，改成双边界（上界抓凭空产生、下界抓凭空消失），两个阶段都成立。"
            - "单挑数成了「有多少人动过手」：两弃两跟的一手里四个人都动过，于是被算成多人局，而摊牌其实只有两家。第 5 轮凑巧出现过一次两人都动的手所以判通过，第 6 轮就红了——一条看牌运气的断言比没有断言更糟，它会教人重跑到绿。改成数「还在这手牌里且没弃牌」（底牌位有牌即在这手牌里），由弃牌偏好定死，两轮逐手数字完全一致。"
            - "全下标记挂在 onNewStreet 上：全下常把一手打在翻牌前收掉，那一手一张公共牌都不发，钩子一次都不触发。playHand 加 onAction 钩子。"
            - "8c 的全下原本有人跟，把 dave 打到 0，于是第 9 节在「reload 前 dave 看得到自己两张底牌」上红了。那不是产品缺陷，是这一节把下游前置条件打掉了——筹码归零的席位进 sit out 且再也进不了下一手。8c 改成无人跟的全下；有人跟的摊牌另放 9d，破产风险按筹码大小选定落在非 carol 的一席上。"
            - "畸形投影只有断言没有送达计数：路由没命中或改错层（投影嵌在 body.view 里而非顶层）时页面收到的是完好投影，于是「页面没停死」恒为真、整节全绿。加了 delivered 计数并判它大于 0。"
          evidence_integrity_fix: >-
            第 7 轮运行死在路由回调的未处理拒绝上（route.fulfill: Route is already handled）。
            那条拒绝绕过 main 的 catch，finally 不跑、result.json 写不出来，于是目录里留下的是
            第 6 轮那份。第 6 轮恰好 passed:false，但如果它通过，一次崩掉的运行在证据目录里就长得
            和通过一模一样——与上一节的 negctl6 同类，载体从「判定式漏了 aborted」换成「陈旧文件」。
            三处修：路由回调整体包 try 且吞下的错误落进 routeErrors 由第 13 节结账（只吞不判等于开一个
            静默失败的口子）、开跑前先删 result.json、加 unhandledRejection 处理器。
            负控实测：注入一条未处理拒绝，退出码 1、result.json 不留下、stderr 写明原因。
          verdict_logic_extracted_for_testability: >-
            8c/8d/9d 的判定原本写在 .mjs 里，而 .mjs 的逻辑单元测试装不进来——装不进来的判定式等于
            没有测试（上一节「中止却判通过」正是这么漏过去的）。chipConservation /
            degradationVerdict / handCoverage 三个纯函数抽进 test-support/acceptance-result.cjs，
            test/multi-hand-verdict.test.cjs 39 条盯着，含盯调用点的静态断言；
            multi-hand-verdict 变异 41/41 全杀。
          f1_first_verified_in_browser: >-
            9d 让 bob（89）全下、dave（405）跟，摊牌后 bob 归零、桌上总额 797 → 797 一致，
            且 bob 没有带着 0 筹码进下一手。「筹码归零的席位不带着 0 筹码进下一手」这条 F1
            此前只有单元测试，这是第一次在浏览器层被验过。
          honest_coverage_gap: >-
            边池分层在浏览器层不可观测：投影只给 pot_total（src/host/table-view-model.cjs:456），
            引擎算出的 pots 没进 tokengame.table-view.v1，DOM 里没有边池可读。没有写一条读 undefined
            的断言——那种断言永远为真，会让缺口看起来像覆盖。由 test/holdem-engine.test.cjs 与
            test/cross-hand-stacks.test.cjs 在单元层覆盖；是否投影出去列为待裁决项。
    - id: TG-EU-HOST-ADAPTER-CONTRACT
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-SINGLE-STACK-WEB-TABLE
      status: partially_implemented
      unit_kind: contract
      summary: 先定义两个宿主共享的 HostAdapter 合同，再实现任一侧适配器；不把 Claude 特例写进核心。合同已成文（src/contract/adapter-contract.cjs），两个权限剖面各有一份真实参考实现并过了一致性套件（seat_model 于 2026-08-28、host_command 于 2026-08-29）。两份都在运行路径上零个构造点，由 test/adapter-integration-truth.test.cjs 一正一反钉住——「合同可实现」已证，「产品已改用适配器」未证。
      implementation_refs:
        - src/contract/adapter-contract.cjs
        - src/host/host-command-adapter.cjs
        - src/host/seat-model-adapter.cjs
        - test-support/adapter-conformance.cjs
        - test-support/adapter-simulator.cjs
        - docs/HOST-ADAPTER-CONTRACT.md
        - test/adapter-contract.test.cjs
        - test/adapter-conformance.test.cjs
        - test/seat-model-adapter.test.cjs
      progress_2026_08_28:
        commit_range: 46d5b5d..0e80395
        done: >-
          共享底座已成文并实现：三个信封、7 类错误映射（覆盖源码 65 个码）、三层身份
          （player_id / seat_handle / authority_id，seat_credential 刻意不在其中）、生命周期迁移、
          能力协商。模型面适配器 SeatModelAdapter 已实现并过一致性套件。一致性套件配 14 个
          故意坏掉的变体，每个必须至少让一条检查变红。
        two_permission_profiles_rationale: >-
          措辞于 2026-08-29 更正：不是「两份合同」，而是一套 HostAdapter 协议加 host_command 与
          seat_model 两个权限剖面。除 commands 之外信封、错误映射、身份层、生命周期、能力协商全部共享，
          说成两份合同会让人以为要各自验证一遍，而一致性套件是同一批检查跑两个剖面。
          真正必须分开的是命令清单：人类面能确认公开范围、能 ready、能下注，模型面一条都不能；
          合成一张表意味着权限差别只能靠运行期检查表达，而那种检查漏一条就是模型拿到了下注权限。
          ADAPTER_ROLES 按引用指向 HUMAN_COMMANDS / MODEL_COMMANDS，不拷贝——拷贝会漂移。
        host_neutrality_enforced_by_test: >-
          test/adapter-contract.test.cjs 扫源码，按词边界匹配 claude / codex / cowork / anthropic 四个词。
          唯一命中是 src/authority/table-store.cjs 里一个用户可见的牌桌显示名，文件带
          SUPERSEDED_BY_ 冻结标记，是字符串而非判断分支。未擅自改（改用户可见语义不在本轮权限内），
          测试改为按标记豁免，并钉住：带标记的是哪两个文件、其中只有一个真的需要豁免、
          那处出现不是分支条件。
        conformance_suite_own_holes_found_and_fixed: 4
        measured:
          npm_test: 644_pass_0_fail_0_skipped
          mutation_gate: 315_killed_0_survived_0_skipped_GATE_PASS
          new_mutation_specs: adapter-contract_34_of_34, seat-model-adapter_14_of_14, multi-hand-verdict_41_of_41
      progress_2026_08_29:
        commit: e6397c3
        request_envelope_now_on_real_path: >-
          requestEnvelope 此前零个非测试调用方，「每次请求都有信封」只在纯函数测试里成立。
          两个传输（HttpCoreClient、MCP coreRequest）改为经它构造，服务端在令牌之后、派发之前
          校验 contract_version，缺失也拒。版本号移到 src/shared/contract-version.cjs：
          让权威层 require 合同层会倒转依赖方向，抄一份则会漂移。
        single_source_needs_behavioural_test: >-
          「抄一份数字」与「传输自己拼字面量」此刻无害（两数相等、形状也对），坏在下次改版本时
          只有一侧跟着改，所以 4 条这类变异首轮全部存活。源码断言钉的是文本，不是来源。
          test/contract-version-single-source.test.cjs 改掉那唯一的来源，看五处是否都跟着变——
          测的是值从哪儿来。MCP 侧 coreRequest 未导出，用 TOKENGAME_COMMAND_ORIGIN 指向记账用的
          假核心取落地字节，没有为可测性给产品开测试专用出口。
        gateway_vs_runtime_pinned: >-
          SeatModelAdapter 是参考实现，运行路径上零个构造点（MCP server 直接持 ModelCommandSurface）；
          evaluate 确实接进了 driveOnce，但唯一实现是硬编码 simulated:true 的脚本适配器。
          test/adapter-integration-truth.test.cjs 双向钉住，接线与文案哪一侧先动都会红。
        measured:
          npm_test: 714_pass_0_fail_0_skipped
          mutation_gate: 370_killed_0_survived_0_skipped_GATE_PASS
          new_mutation_spec: request-envelope_12_of_12（首轮 8 杀 4 存活）
          browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
        conformance_report_structure_2026_08_29: >-
          提交 31537dc。每项检查有稳定 check_id 与 pass|fail|not_run|unverifiable 四态；
          必需项按角色登记，跑完逐条对账，漏记/重记/越界记账都是硬失败并进 failures。
          passed 拆成 conformance_passed 与 fully_verified，不再导出叫 passed 的字段。
          proactive_wake_actually_works 恒定登记且没有 pass 分支：声明了记 unverifiable，
          没声明记 not_run，两个角色的 fully_verified 当前都是 false。
          每个 BROKEN 变体声明 expect 并断言命中该 check_id——只断言 failures 非空的话，
          out_of_face_passthrough 那种宽破坏被下游检查抓住就算过，而越界那条其实是空的。
          请求信封在适配器层落成 dispatch_payload_envelope_ready：适配器只交
          (command, params)，信封由传输构造，所以这一层验的是载荷构不构得出合规信封；
          需要调用方提供 observeDispatch，缺了记 not_run，没有为可测性给适配器加出口。
        measured_2026_08_29_d:
          npm_test: 734_pass_0_fail_0_skipped
          mutation_gate: 385_killed_0_survived_0_skipped_GATE_PASS
          new_mutation_spec: conformance-report_15_of_15（首轮 5 杀 10 存活）
          repaired_stale_finds: adapter-contract_34_of_34, seat-model-adapter_14_of_14
          browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
        unverified_boundary: >-
          浏览器验收跑的是 core_transport=in_process，InProcessCoreClient 不构造信封，
          所以 209 项全过不构成 HTTP 传输已验证。远端那条另用一次性探针验过 4/4，
          并双向验证（摘掉客户端版本会红成 contract_version_missing）；探针在 artifacts/、不入库。
          远端模式跑不了整套 209 项：run-table-core.cjs 不接受牌堆种子，确定性发牌那几条只对
          自带内核成立，没有为了让它通过去弱化断言。Gate 5 仍未验证。
      governance_closure_2026_08_29:
        commit: 4456a4c
        policy_epoch_enforced_by_authority: >-
          提交 4456a4c。公开范围同意的实质性判据改由 src/authority/policy-epoch.cjs 表达：
          六个公开范围字段加绑房、桌规合成一个串，gate 与投影同一处推导。此前 limits 那一维
          只在 src/host/table-view-model.cjs 里生效——limits_version 写进了确认记录却从不被
          requireConfirmedScope 检查，绕过界面直接打命令的调用方在额度实质放宽之后仍握着旧同意
          继续发言。同意门只在界面上成立等于没有同意门。
        materiality_is_an_explicit_list: >-
          version 与 bubbleDisplayMs 列在 POLICY_EXCLUDED_FIELDS 并各自写了理由：把 version
          算进去会让任何版本号变动都让既有确认失效，同意门被刷成噪音；bubbleDisplayMs 只改本地
          屏幕上停留多久，不改变公开了什么也不改变公开的量。playerRollingWindowMs 反过来算实质，
          窗时长与条数合起来才是速率。
        decided_reversal_not_regression: >-
          test/scope-reconfirmation.test.cjs 中「版本串变化即要求重新确认」的断言方向被反转。
          该文件开头本就把「权威侧要不要按版本串强制」记成待裁决项，并写明按版本串强制会让一次
          非实质的版本号变动也让既有确认失效。裁决是不强制，改由 epoch 表达实质性。
        projection_epoch_was_always_hollow: >-
          同一轮修掉的连带缺陷：projection() 读 roomState() 顶层的 room_binding_id，而那些字段
          收在 .room 里，于是投影报的 epoch 恒为 binding:-|rules:-。表现是界面每次渲染都要求
          重新确认、理由永远是 new_room_binding，而权威侧照常放行、无任何错误日志。
          policy-epoch 那组单元测试查不出它（直接拿真值调权威，两侧都对），查出它的是把 epoch
          接进视图层之后既有断言变红。新增一条断言投影 epoch 与 gate epoch 同值且两段都非空壳。
        fallback_pinned_at_its_own_condition: >-
          三字段旧路径保留为权威不报 epoch 时的退路，并单独用一条把投影里的 policy_epoch 摘掉的
          测试站在那个条件上。不这样做的话退路里的取值错误没有可观察后果——变异
          host-reports-lifecycle-version 正是这样先从「代码不可达」里活着出去的。
        plugin_entry_copy_had_the_adjudicator_backwards: >-
          plugin.json 的 interface.longDescription 此前写着「牌局行动仍由独立四人 Web 牌桌裁决」。
          裁决在宿主中立的权威内核，Web 牌桌只是真人操作它的界面之一。读者据此会以为换一个界面
          就换了一个裁决者，于是「两个宿主是不是同一场牌局」的答案在装机页上是错的，而那正是
          L2 章程点名要防的事。装机前唯一的说明此前没有任何检查看着它。
          测试自身也补过一次：/真人的决定|由真人/ 的松散选项被「通常由真人操作」满足，
          把一道硬边界读成一个习惯做法，变异 soften-human-decision 从这个缺口活着出去。
        measured_2026_08_29_governance:
          npm_test: 756_pass_0_fail_0_skipped
          mutation_gate: 410_killed_0_survived_0_skipped_GATE_PASS
          new_mutation_specs: policy-epoch_16_of_16, plugin-entry-copy_9_of_9
          repaired_stale_finds: f3-public-scope-consent_14_of_14
          target_tests: policy-epoch_18_of_18, plugin-entry-copy_5_of_5, scope-reconfirmation_14_of_14
          red_on_old_code: policy-epoch_3, plugin-entry-copy_3, scope-reconfirmation_2
          browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
        unverified_boundary_governance: >-
          验收里那三条重新确认用的是改写 /api/view 的响应体，检验的是客户端渲染
          （render -> renderScopeGate -> renderScopeReason），不是 epoch 判定本身。
          epoch 端到端对得上这件事的证据是同意门在确认后确实收起——修复前的缺陷会让它永不收起——
          而不是一条直接断言 epoch 值的浏览器步骤。
        unidentified_flake_2026_08_29: >-
          记录门禁通过之后的一次孤立失败：某一轮全量 npm test 出 755 过 1 失败，随后连续六轮
          756/756。那一轮只抓了汇总行，没抓到失败用例名，所以这里不能说它是已知的 due-work
          定时器抖动——那是猜测。如实记成「一次未定名的失败」，并保留为待查项：一次查不出名字的
          红比一次已知的抖动更值得记，因为它连「是不是同一个」都还不知道。
      host_command_reference_adapter_2026_08_29:
        commits: [0542c1c, b93b3d5]
        why_it_had_to_exist: >-
          此前 host_command 那一侧只有模拟器实现。模拟器过了只说明套件自洽——一份只有模拟器
          实现的剖面，整个就是本轮反复撞到的那类缺陷：一段永远走不到的检查。
        what_it_is_not: >-
          不是 TableWebHost 的替代品。牌桌有 HTTP 路由、会话表、轮询租约、驱动定时器和
          209 条浏览器验收，本文件一行都不碰它，也不起服务、不开定时器、不碰网络
          （一致性套件必须能在没有核心的情况下构造它）。
        three_judgements:
          credential_list_not_duplicated: >-
            第一版在本层抄了一份 CREDENTIAL_COMMANDS，而托管层的 inject 自己就按那份清单分流。
            抄一份的后果分两个方向且都不报错：漏一条表现为某个操作偶尔不管用，多一条表现为
            建房第一步就失败。改成句柄有就交上去，由 inject 决定用不用它。
          never_guesses_the_handle: >-
            「只有一席就用那一席」在单席上永远对，在多席宿主上的表现是替错的人行动，而单席
            测试永远发现不了。托管层那条 seat_handle_required 的注释已经把这件事写死。
          human_face_does_not_sanitize: >-
            真人面不净化 details，模型面必须净化：两侧收件人不同。这一侧的收件人就是持有该席
            凭据的那个真人，净化会把 seat_handle_missing 这类诊断摘掉，让掉线恢复无从排查。
            同理 command 不过 assertNoLeak——真人面的 command 来自宿主自己的路由表。
        characterization_protects_the_closed_table: >-
          四条命令的注入结果与 host.injected 逐字段对账，另加一条钉住「对账通过不等于两边都
          什么也没做」（要凭据的命令确实补上了 seat_id 与 recovery_credential）。两处各自调
          inject 看着不可能漂移，而漂移的真实形状是有人在一侧加了「顺手补个默认值」。
        new_error_code: >-
          command_not_host_facing，归入 identity 类。刻意不与 command_not_model_facing 合成
          一个码：合成之后日志里读不出是哪一面越界，而模型面越界意味着模型可能拿到下注权限。
          这一条是 test/adapter-contract.test.cjs 的「每个错误码都被归类」当场抓出来的。
        own_test_holes_found_by_mutation:
          findings:
            - 没有断言本地拒绝**不**推进 degraded（把它算成降级会让宿主一次伪造参数就退回轮询）
            - 没有测 rememberHandle 拒空串（收下空句柄后 seat_handle_count 报了个数而句柄用不了）
          first_run: 19_total_17_killed_2_survived
        zero_construction_points_is_now_a_test: >-
          「运行路径上零个构造点」此前只写在提交信息里。一正一反两条对账钉住它：反面是七个
          运行路径文件里零个 new HostCommandAdapter，正面是 TableWebHost 仍自己持 SeatCustody
          并自己调 inject。少了正面那条，反面读起来像「真人面根本没有实现」，而那是错的。
          变异方向是「给产品加 require，由这条对账杀掉」——削弱测试里的断言永远杀不掉，
          因为削弱后的断言自己就是绿的，限制记在该规格的 excluded 里。
        measured_2026_08_29_e1:
          host_command_adapter_tests: 20_of_20
          integration_truth_tests: 8_of_8
          new_mutation_spec: host-command-adapter_20_of_20
          npm_test: 778_pass_0_fail_0_skipped
          mutation_gate: 430_killed_0_survived_0_skipped_GATE_PASS
          browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
        claim_limit_e1: >-
          可声称「合同的真人剖面有一份真实实现并过了一致性套件」。不得声称产品已改用它：
          运行路径上零个构造点，TableWebHost 仍是真人面的产品实现。
      not_done:
        - id: host_command_extracted_from_table_web_host
          reason: >-
            参考适配器已于 2026-08-29 落地（见上），但是否把 host_command 从
            src/host/table-web-host.cjs 里**拆出来**、让牌桌改经适配器走，仍待裁决。
            那是一张已经闭合、有 209 条浏览器验收看着的单栈牌桌，拆它属于改动已确认的
            产品结构。措辞项（「两份合同」拆两份还是合成一份带角色字段）已于同日关闭：
            统一为「一套 HostAdapter 协议、host_command 与 seat_model 两个权限剖面」。
      claim_limit: >-
        底座、SeatModelAdapter 与 HostCommandAdapter 两份参考实现已存在并过自动化一致性套件；
        不得声称产品已改经 HostCommandAdapter，TableWebHost 仍是真人面的产品实现。
        无点击主动唤醒（Gate 5）未验证，verified_on_any_host 仍为 false；当前合同会拒收该声明，
        套件还用 unverifiable 保留绕过协商或未来合法声明仍不能由内部测试证明的证据边界。
    - id: TG-EU-SEAT-MODEL-BINDING
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies: [TG-EU-SINGLE-STACK-WEB-TABLE, TG-EU-HOST-ADAPTER-CONTRACT]
      status: completed
      unit_kind: coherent_leaf_bundle
      summary: B8，承接B6/B7，补齐同一协调器上的真人逐席AI绑定、撤销及权威评估的本席上下文；不关闭真实宿主门禁。
      owner_links: [TAKEOVER-PLAN.md, UNDERSTANDING-AUDIT.md, STATUS.md#project_intelligence]
      result_ref: REVIEW-LOG.md#b8-seat-model-binding
      understanding_view:
        current_ref: TAKEOVER-PLAN.md
        current_revision_ref: B8-frozen-local-contract-20260830
        candidate_successor_ref: none
        plan_ref: TAKEOVER-PLAN.md
        result_ref: REVIEW-LOG.md#b8-seat-model-binding
        presentation: aligned
      claim_limit: 已实现并通过本地925测试、557变异、35连接UI与209四人13手自动化；真实宿主、主动唤醒和真人试玩不在该完成声明中。
    - id: TG-EU-REAL-HOST-SEAT-PROBE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies: [TG-EU-SEAT-MODEL-BINDING]
      status: completed
      unit_kind: capability_spike
      summary: 本叶仅验证当前Codex Desktop一席真实模型从本人授权文件到显式生成、同桌气泡及撤销的闭环；第二真实席和Claude留待后续，主动唤醒另有专门叶。
      owner_links: [RETURN-HANDOFF.md, plugins/tokengame/README.md, docs/CLAUDE-HOST-PROBE-CHECKLIST.md]
      authorization_ref: PROJECT-DECISION-LOG.md#DEC-20260830-001
      result_ref: REVIEW-LOG.md#b9-real-host-seat-probe
      understanding_view:
        current_ref: RETURN-HANDOFF.md
        current_revision_ref: B9-single-native-seat-20260830
        candidate_successor_ref: none
        plan_ref: PROJECT-PLAN-TREE.md#当前恢复点
        result_ref: REVIEW-LOG.md#b9-real-host-seat-probe
        presentation: aligned
      blocking_reason: none；本窗口有限实机探针已完成并清理。
      claim_limit: 一原生任务五轮输入九次MCP；两次生成一次公开一次跨手丢弃，撤销后旧权限被拒。不是完整插件入口、第二真实席、主动唤醒或真人内测通过。
    - id: TG-EU-CLAUDE-HOST-ADAPTER
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-HOST-ADAPTER-CONTRACT
      status: blocked
      unit_kind: host_adapter
      summary: Claude 侧宿主适配器本体暂缓；现有能力声明防线不等于 Claude Desktop / Cowork 已接入。
      blocking_reason: 本轮未执行 Claude Desktop / Cowork 实机探针，当前安装状态 unknown；须在明确宿主配置/真实调用范围后实测，不能沿用旧终端会话的环境判断。
      browser_free_part_done_2026_08_29:
        commit: 509417d
        what: >-
          这一侧真正与宿主无关、又只有这一侧才逼得出来的那一条：能力不确定时的诚实协商。
          Claude 侧的能力本来就不确定（本环境跑不了实机门禁），而「不确定时不声明」此前只写在
          每个适配器自己的 DECLARED_CAPABILITIES 里，合同从不检查——与 policy epoch 同形：
          规则只在记得它的地方成立。两份参考适配器都恰好做对了，所以没有任何测试要求过。
        why_it_matters_not_cosmetic: >-
          negotiate 返回的 degradations 是宿主决定要不要轮询的唯一依据。声明了 proactive_wake，
          polling 就不在清单里，宿主不轮询，而那个能力实际上并不存在——牌局停在某一席上，
          谁都不知道是在等模型还是已经死了。这正是 CAPABILITIES 那张表自己写着的后果。
        enforcement: >-
          negotiate 按 verified_on_any_host 拒收，码 capability_not_verified（归 invalid_request：
          重试同一份声明不会变好，改声明才行）。按字段走不写死名字——写死的实现在下一个
          未验证能力加进来时不会红，而它同样会被静默接受。
        self_retiring: >-
          判据是「至今没有任何宿主验证过它」，不是「你这个宿主做不到」。实机 Gate 5 通过之后
          把标志翻成 true，声明立刻合法。所以它不与旧设计那条顾虑冲突（判成失败会逼人为了让
          套件绿而少声明一项）：没有人会因此少声明一项自己真有的能力。
        three_assertions_intentionally_reversed: >-
          旧版靠声明 proactive_wake 去到达「合规但被标注」那一格，而那个组合现在协商就过不去。
          换的理由是后果不对称：标注在报告里，而轮询决定在宿主里，一份被标注的报告挡不住
          宿主不轮询。逐条理由写在测试里。
        suite_side_defence_kept_and_pinned: >-
          套件不要求适配器走 contract.negotiate()，所以一个自己拼 negotiation 的适配器能绕过
          合同的拒收，那时套件里那条 unverifiable 就是最后一道。用手写 rogue 适配器站在那个
          条件上——不站的话该分支在拒收之后没有到达路径，而没有到达路径的分支与正常工作的
          分支读起来一模一样（变异 conformance-wake-unverifiable-not-recorded 正是这样先存活的）。
        measured:
          capability_honesty_tests: 8_of_8
          red_on_old_code: 5
          new_mutation_spec: capability-honesty_8_of_8
          npm_test: 789_pass_0_fail_0_skipped
          mutation_gate: 438_killed_0_survived_0_skipped_GATE_PASS
          browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
      claim_limit: >-
        适配器本体未开始，不得声称 Claude Cowork 已通过任何门禁。已完成的只是「能力不确定时
        诚实降级由合同强制」这一条，它没有让 Gate 5 前进一步，也不构成任何 Claude 侧实机证据。
    - id: TG-EU-PROACTIVE-WAKE-SPIKE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies: []
      status: blocked
      unit_kind: capability_spike
      summary: SAME_VISIBLE_TASK_SPIKE_V1。在固定记录的宿主版本上验证权威新事件无需玩家再次点击或输入即可恰好启动一次当前可见游戏任务；B10优先验证本地queue通道，不要求先具备内嵌组件。
      owner_links:
        - .trellis/tasks/08-26-public-ai-table-talk/research/codex-visible-task-proactive-turn-boundary.md
        - .trellis/tasks/08-26-public-ai-table-talk/research/host-active-turn-capability-refresh-20260827.md
        - .trellis/tasks/08-26-public-ai-table-talk/research/b10-codex-queue-wake-spike-20260830.md
        - .trellis/tasks/08-26-public-ai-table-talk/research/b10-b9-latency-breakdown-20260830.md
        - PROJECT-DECISION-LOG.md#DEC-20260830-002
        - REVIEW-LOG.md#b10-queue-wake-probe-preparation
        - PROJECT-DECISION-LOG.md#DEC-20260830-003
        - REVIEW-LOG.md#b10-native-queue-wake-probe
        - .trellis/tasks/08-26-public-ai-table-talk/research/b11-ai-lifecycle-receipts-20260831.md
        - REVIEW-LOG.md#b11-ai-lifecycle-receipts
        - docs/AI-LIFECYCLE-RECEIPTS.md
        - PROJECT-DECISION-LOG.md#DEC-20260831-001
        - REVIEW-LOG.md#b12-native-receipts-window
        - REVIEW-LOG.md#b13-host-readiness-shutdown
        - PROJECT-DECISION-LOG.md#DEC-20260831-002
        - REVIEW-LOG.md#b14-native-readiness-permission-boundary
        - PROJECT-DECISION-LOG.md#DEC-20260831-003
        - REVIEW-LOG.md#b14-native-public-replies
        - evidence/probes/b14-codex-queue-native-20260831/manifest.json
        - .trellis/tasks/08-26-public-ai-table-talk/research/b15-managed-wake-session-20260831.md
        - docs/MANAGED-WAKE-SESSION.md
        - REVIEW-LOG.md#b15-managed-wake-session
        - .trellis/tasks/08-26-public-ai-table-talk/research/b16-managed-wake-controls-20260831.md
        - REVIEW-LOG.md#b16-managed-wake-controls
        - REVIEW-LOG.md#b17-native-managed-wake-carrier-boundary
        - .trellis/tasks/08-26-public-ai-table-talk/research/b18-stable-project-mcp-activation-20260901.md
        - REVIEW-LOG.md#b18-stable-project-mcp-activation
        - .trellis/tasks/08-26-public-ai-table-talk/research/b19-stable-managed-wake-native-20260901.md
        - REVIEW-LOG.md#b19-stable-managed-wake-native
        - .trellis/tasks/08-26-public-ai-table-talk/research/b20-hand-active-managed-wake-diagnostic-20260901.md
        - REVIEW-LOG.md#b20-hand-active-managed-wake-diagnostic
        - .trellis/tasks/08-26-public-ai-table-talk/research/b21-hand-active-managed-wake-20260901.md
        - REVIEW-LOG.md#b21-hand-active-managed-wake
        - .trellis/tasks/08-26-public-ai-table-talk/research/b22-fast-path-native-20260901.md
        - REVIEW-LOG.md#b22-fast-path-native
        - REVIEW-LOG.md#b23-fixed-target-codex-play
        - .trellis/tasks/08-26-public-ai-table-talk/research/b25-relative-cwd-host-failure-20260901.md
        - REVIEW-LOG.md#b25-relative-cwd-host-failure
        - .trellis/tasks/08-26-public-ai-table-talk/research/b26-absolute-cwd-real-config-migration-20260901.md
        - REVIEW-LOG.md#b26-absolute-cwd-real-config-migration
        - .trellis/tasks/08-26-public-ai-table-talk/research/b27-absolute-cwd-post-restart-fixed-target-20260901.md
        - REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target
        - .trellis/tasks/08-26-public-ai-table-talk/research/b28-idle-game-task-handoff-20260902.md
        - REVIEW-LOG.md#b28-idle-game-task-handoff
      blocking_reason: B14具体权限确认后，原任务实际MCP准备成功，3个不同来源分别经一次queue触发真实start/resolve及成功公开，Codex Gate5只在固定版本单席探针中pass。B15/B16完成有界API与本人控件，B18稳定项目入口消除B17工具重激活阻塞，B19等待区两次串行通知达到2/2/2。B20行动期样本以wake_start_failed、1/1/0停止且历史精确码仍unknown；B21改用Ready前开启的新窗口，唯一queue达到1/1/1和跨手合法终态。B22保留managed fast-path后，唯一queue同为1/1/1，并在第1手开始13.709秒后启动、9.817秒后以silent在行动截止前6.476秒同手结清；相对B21的HAND→start名义缩短9.992秒，但精确source时刻、首项工具顺序及归因仍unknown，0条AI气泡。B23完成本地固定目标去敏和Codex当前任务入口；B24迁移相对`cwd`后，B25确认相对`cwd`不能加载工具，B26恢复真实绝对`cwd`，B27则直接证明第二次重启后项目工具已加载。B27唯一通知固定到正在运行的同一开发任务，60.003秒后为1/1/0；没有可重入新模型回合、权威终态或AI气泡，精确排队规则unknown且没有重试。B28已把空闲任务前提落实到入口、本人确认、Skill和文档并通过1356项全量回归，但没有原生模型样本，页面确认也不是宿主空闲遥测。Claude未跑，真实空闲游戏任务的朋友组合、牌局内公开与完整实时性未通过，Gate9及七份失效下载清理仍未闭合。
      claim_limit: Codex可声称B14的3个来源各一次无点击真实公开、B19等待区两次串行真实公开、B21跨手合法终态，以及B22一次截止前同手silent合法终态；B23可声称固定目标和当前任务入口的本地合同通过，B24可声称相对配置迁移及首次停止，B25可声称重启后相对`cwd`运行时加载失败且本地修复已完成，B26/B27可合并声称真实绝对`cwd`迁移、第二次真人重启和工具直接恢复，B28可声称空闲任务交接合同本地通过。不能把B27的1/1/0写成模型回合、主动唤醒或公开回复通过，也不能把B28的页面确认写成宿主空闲证明；不能把B22的1/1/1或silent写成牌局内公开、完整主动闭环或SLA。完整主动AI、第二真实席或Claude仍未证明；Gate9未闭合，默认proactive_wake声明仍不改。
    - id: TG-EU-PLAYABILITY-GATE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-SINGLE-STACK-WEB-TABLE
        - TG-EU-PROACTIVE-WAKE-SPIKE
      status: blocked
      unit_kind: acceptance_gate
      summary: PLAYABILITY_GATE_V1 两层——自动化全门禁（动态私人房、四个独立 binding、至少 10 手、故障矩阵、隐私金丝雀）与一次四真人 45 分钟试玩签字。
      active_milestone: MVP-0.1按2026-09-03用户确认先验收两好友、两设备、两个真实Codex的十手；四真人扩展后置，父节点不提前关闭。
      understanding_view:
        current_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#mvp-0-1-two-friends
        current_revision_ref: B30-two-friend-MVP-0.1-20260903
        candidate_successor_ref: none
        plan_ref: PROJECT-PLAN-TREE.md#当前恢复点
        result_ref: REVIEW-LOG.md#b30-two-friend-remote-candidate
        presentation: aligned
      owner_links:
        - .trellis/tasks/08-26-public-ai-table-talk/prd.md#mvp-0-权威验收
        - .trellis/tasks/08-26-public-ai-table-talk/research/mvp-playability-evidence.md
        - REVIEW-LOG.md#b23-fixed-target-codex-play
        - REVIEW-LOG.md#b26-absolute-cwd-real-config-migration
        - REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target
        - REVIEW-LOG.md#b28-idle-game-task-handoff
        - REVIEW-LOG.md#b30-two-friend-remote-candidate
        - docs/REMOTE-FRIEND-MVP.md
      blocking_reason: >-
        单栈产品闭环已完成（TG-EU-SINGLE-STACK-WEB-TABLE）；B14固定版本单席queue探针已得到真实公开，
        B21牌局内第1手早期窗口的唯一queue已取得权威开始与合法跨手终态；B22又取得一次在30秒行动截止前
        6.476秒同手结清的silent终态，但仍没有公开气泡，也没有第二真实AI席或朋友组合验收。B23只完成
        固定目标去敏和Codex当前任务入口的本地合同；B25已证明相对cwd在当前Desktop重启后未加载工具，
        B26/B27已完成绝对cwd迁移、第二次真人重启和直接工具就绪。B27唯一通知固定到正在运行的开发任务，
        最终只到1/1/0；B28已补齐空闲任务入口说明与本人确认，但没有真实空闲任务样本，仍不能替代端到端组合。主动产品公开往返、
        宿主资源可回收和可玩MVP验收仍未交付，Gate9清理blocked，Claude未跑。
        B30已把显式HTTPS地址、出站连接器与独立Web工作面整合为本地已验证的两好友候选；本地脚本不等于异地服务实测。
        当前先缺两真人、两设备、两个真实Codex和十手签字，四真人45分钟层按最新MVP-0.1阶段后置。
      automation_layer_progress_2026_08_28: >-
        自动化层的手数要求已达成：浏览器验收现在打到第 12 手（此前第 3 至 4 手），201 条断言全过、
        控制台错误 0、四个隔离上下文、27 张截图、连续三轮干净运行。故障矩阵已覆盖：五种畸形投影的
        有界降级（带送达计数，否则整节恒真）、真实 reload、真实关闭上下文、网络中断与 120 秒保留窗
        恢复、陈旧版本号撞 409、入口幂等探针、有人跟的全下摊牌与筹码归零后的席位处理。
        隐私金丝雀与逐查看者本地隐藏另在第 8 节。
      automation_layer_still_missing: >-
        边池分层在浏览器层不可观测（投影只含 pot_total），如实记为缺口，由单元层覆盖。
        自动化层全部结果来自 simulated 模型适配器，不含任何真实宿主能力。
      automation_layer_revalidated_20260830:
        result_ref: REVIEW-LOG.md#b8-seat-model-binding
        evidence: 本批产品版本四上下文209项到第13手通过；另外两MCP进程连接UI35项通过。模型为脚本文字，真人层仍未跑。
      claim_limit: >-
        自动化层的手数与故障矩阵要求已达成，B23本地入口合同、B25本地载体修复、B26真实配置迁移、B27工具恢复/活动任务1/1/0和B28空闲任务说明回归都不等于朋友组合验收，真人层未执行。
        自动化层不能顶替真人层签字，模拟席或一人多窗口不能计入真人签字。
  active_node: TG-L3-MULTIPLAYER-VERTICAL-SLICE
  current_next_leaf: TG-EU-PLAYABILITY-GATE
  current_execution_unit_ref: REVIEW-LOG.md#b30-two-friend-remote-candidate
  reliable_boundary:
    earliest_trustworthy_node_or_checkpoint: EC-TG-REAL-HOST-SEAT-PROBE-20260830-A
    first_invalid_or_unverified_node: TG-EU-PROACTIVE-WAKE-SPIKE
    boundary_meaning: >-
      共享底座、B6单协调器、B7入口与B8逐席授权/上下文均有实际本地证据；925测试和557变异属于B8实跑结果。
      B8的35项连接UI及209项四人13手使用脚本文字；B9另由当前Codex原生任务完成单席显式生成与撤销。
      B9新增51项连接UI与20项Node回归通过；B9当批修补仅差一份CSS，其原生运行的核心与MCP字节未改。
      B10一次同任务自动唤醒已观察，B12补读工具回执确认跨手丢弃，不能关闭主动AI节点；B11的1110回归、另7项补验、37变异及51连接UI是本地证据。B12两个新输入停在工具发现，没有新游戏AI评估；当时清理与日志收尾缺口保留。
      B13补齐本地IPC关停，46项定向/相邻测试、9条实际变异、26项主线程整合通过；591条仅静态可达，未重跑全量、浏览器或真实模型。原任务runtimeStatus读取仍未实证，宿主reload未执行，不能以本地修复关闭Gate5。
      B14另有原任务实际工具成功调用、3次queue/3次真实公开的直接证据，Codex Gate5仅该固定版本单席探针pass；Gate9清理blocked。跨街延迟映射修复后相邻45项、1条变异和脚本UI14项通过，不重算旧实机显示结果。
      B15有界通知API经独立检查和主线程整合，最终1239项全量Node、31条定向变异通过；脚本接收端不等于真实Codex连续运行，启停UI未接入。首轮变异存活及补测记录保留，不覆盖B14清理阻塞。
      随后B16已接入本人显式启停UI，最终1314项全量Node、35项补充浏览器通过，原纯模块10条变异全被杀；新旧回执误配、模块挂起阻断恢复及迟到初始化遗漏授权屏障均已修。真实原生调用0，当前仍缺连续宿主和历史资源清理，不再把B15阶段缺UI写作现状。
      B17独立检查修复resolve先于queue ACK再撤权时丢失结清回执的竞态；最终1315项全量Node通过。三批实机共4次原任务输入/1次queue，只有一次readiness游戏MCP调用，0次start/resolve/AI公开。第一批测试外壳过早退出，修正后既有任务未重激活项目MCP；全部B17资源已清理，不将载体阻塞写作连续产品通过。
      B18稳定项目MCP完成项目级加载和逐席活动槽热换；B19等待区两次串行queue均权威结清并双页公开。B20进入真实行动期后任务无点击启动一次，但窗口以wake_start_failed、尝试1/接收1/结清0停止，回执0评估开始/终态；相关诊断补强后全量1332/1332、两组变异34/34和脚本浏览器35/35通过。这些本地结果不把B20变成原生通过。B21用Ready前开启的新窗口只投递一次，达到1/1/1与跨手合法终态。B22仅优化managed固定prompt，红37/38后绿38/38、旧probe117/117、变异5/5+8/8、合并及独立复核155/155；唯一原生queue在HAND1后13.709秒start并在9.817秒后同手silent，截止前余6.476秒。精确source和首项工具顺序unknown，0气泡，不翻proactive_wake_verified。
      B23完成服务端固定目标去敏和Codex当前任务一键入口的本地合同：固定目标复核184/184、限定变异11/11、脚本浏览器44/44；一键入口独立复核9/9、beta/config/lifecycle 88/88、变异15/15。B24按DEC-20260901-001执行真实项目配置相对化迁移并停止。B25以进程时刻确认用户完成该决策授权的一次重启；CLI列出服务器但当前任务没有`tokengame_table`，与同任务旧绝对cwd成功加载形成直接对照。两页固定目标UI已目检，但工具未就绪，0通知/模型/queue并完整清理。本地生成器恢复canonical绝对cwd，聚焦红绿与定向变异通过。B26按DEC-20260901-002把真实父项目唯一托管块恢复为该绝对cwd，块外SHA-256未变，入口在beta前停止。B27确认第二次手动重启后项目工具直接恢复，唯一固定当前活动任务通知为1/1/0、60.003秒到限；页面与连接资源完整清理，未补发或伪造权威终态。B28把启动回复结束/任务空闲要求接入横幅、页面本人确认、Skill与文档，聚焦19/19、浏览器46/46及全量1356/1356通过，0原生模型或queue。
      B30按2026-09-03用户确认先推进两好友阶段：显式HTTPS地址、出站连接器与双人优先的外部Web工作面已落地；当前本地候选的1456项Node与693项变异组合覆盖、双席整合和四页长程均已通过。第一次完整gate的四项验证定义问题及定向复绿如实保留，不冒充第二次完整gate exit0。真实两机、第二真实AI、牌局内公开往返和十手真人验收仍未执行；同一活动开发任务不重投，内嵌UI、Claude和大厅保留后续。
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  project_intelligence_ref: STATUS.md#project_intelligence
  next_owner: user_and_friend_two_device_acceptance_with_codex_primary_support

semantic_baseline:
  required: yes
  status: confirmed
  coverage: complete_for_scope
  authority: user_confirmed
  currency: current
  consistency: aligned
  scope: current_mvp
  protected_levels:
    - L0
    - L1
    - L2
  confirmed_nodes:
    L0:
      - TG-L0-PRODUCT
    L1:
      - TG-L1-HOST-ENTRY
      - TG-L1-LIVE-TABLE
      - TG-L1-PUBLIC-AI-PLAY
    L2:
      - TG-L2-SESSION-LAUNCH
      - TG-L2-PLAYABLE-TABLE
      - TG-L2-PUBLIC-AI-EXCHANGE
  pending_or_missing_nodes: []
  future_unaligned_nodes:
    - multi_game_platform_expansion
    - tournament_and_spectator_ecosystem
  legacy_unverified_nodes: []
  confirmation_evidence:
    - node_id: TG-L0-PRODUCT
      contract_id: SC-TG-L0-ROOT-20260827-B
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
      digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
      binding_status: verified
      verified_at: 2026-08-27
    - node_id: TG-L1-HOST-ENTRY
      contract_id: SC-TG-L1-HOST-ENTRY-20260827-A
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
      digest: sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160
      binding_status: verified
      verified_at: 2026-08-27
    - node_id: TG-L1-LIVE-TABLE
      contract_id: SC-TG-L1-LIVE-TABLE-20260825-A
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-003
      digest: sha256:69f5be696f574556edd55ca49db6853c8086674a4f21440a67d904bfdadd9f91
      binding_status: verified
      verified_at: 2026-08-25
    - node_id: TG-L1-PUBLIC-AI-PLAY
      contract_id: SC-TG-L1-PUBLIC-AI-20260825-A
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-004
      digest: sha256:37f755856560105a5a33a2cc493200cae4ae96960f29dbbe9c7612e90fc903ae
      binding_status: verified
      verified_at: 2026-08-25
    - node_id: TG-L2-SESSION-LAUNCH
      contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
      digest: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
      binding_status: verified
      verified_at: 2026-08-27
    - node_id: TG-L2-PLAYABLE-TABLE
      contract_id: SC-TG-L2-PLAYABLE-TABLE-20260827-D
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022
      digest: sha256:d73e30748ac4d7a3fc814e6f44d6aa96676dc3677e0ef04f8f1298e9f84ca453
      binding_status: verified
      verified_at: 2026-08-27
    - node_id: TG-L2-PUBLIC-AI-EXCHANGE
      contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
      digest: sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54
      binding_status: verified
      verified_at: 2026-08-27
  blocking_paths: []
  unaffected_confirmed_paths: []
  last_checked: 2026-08-31
  next_action: implement_confirmed_semantics_no_semantic_change_pending
```

## 当前恢复点

宿主中立 L0、共享 `TG-L1-HOST-ENTRY`、三个当前 MVP L2，以及可玩牌桌四条体验规则和公开座位 AI 七条交流规则均已分别由用户确认并通过内容寻址校验；旧 Codex 专属入口、会话、公开测试桌、被动问答章程及其旧规则保留为已替代历史。语义门禁已经闭合，且本轮不存在待确认的语义变更。

当前理解以 `STATUS.md#project_intelligence` 与本轮 `UNDERSTANDING-AUDIT.md` 为准。
351项测试/122条变异是2026-08-28旧检查点，不是当前验证数，也不能用旧执行单元数量推算完成度。
B8从 `bbdcf2b` 的875项实测基线接手；B8最终证据和完成裁决统一指向 `REVIEW-LOG.md#b8-seat-model-binding`。

新 UI 在 `web/table/`，经协调器连同一份宿主中立内核。第 3 手/80 断言属于 `3127a99` 的旧检查点；后续已到第 13 手/209 断言（`c284568` 等记录），模型为脚本替身。旧探针栈 `web/app.js` 与 `npm run authority` / `table` 原样保留为历史，不再是产品路径。

`TG-EU-HOST-ADAPTER-CONTRACT` 的合同底座与两份参考实现已完成；节点仍是 `partially_implemented`，
产品是否改用参考适配器尚非已交付事实。合同在 `docs/HOST-ADAPTER-CONTRACT.md` 与
`src/contract/adapter-contract.cjs`；`SeatModelAdapter` 在 `src/host/seat-model-adapter.cjs`，
`HostCommandAdapter` 在 `src/host/host-command-adapter.cjs`（`0542c1c`）。能力按「角色 + 具体宿主剖面」
协商。B8依赖的是已证实底座及分权边界，不要求另做参考实现迁移。

**B8逐席模型绑定与上下文已完成本地验收**，唯一裁决为 `REVIEW-LOG.md#b8-seat-model-binding`。
B6-1 `095b4b6`、B6-2 `71ae5fa`、B7 `bbdcf2b` 已提交；B8仍是手工收口策略下的未提交diff。
共用令牌与缺少本席牌面的问题已修，最终925测试/557变异/35连接UI/209四人验收通过。
B9 `TG-EU-REAL-HOST-SEAT-PROBE` 已在明确授权下完成：当前Codex原生游戏任务实际读牌、生成公开气泡，
撤销后旧连接被拒，见 `REVIEW-LOG.md#b9-real-host-seat-probe`。只用了一个游戏任务、五轮输入；
临时配置、连接文件和服务已清理，旧演示未动。成功发言整轮44.917秒，不代表实时体验合格。
还修复了首次建房长邀请码的窄屏溢出，51项连接UI及20项定向Node通过；未重跑B8全量门禁。
当前叶仍为 `TG-EU-PROACTIVE-WAKE-SPIKE`：B10选择当前CLI的queue作为同任务候选，已完成默认关闭的
单次本地探针、独立复核、117项定向测试、89项相邻回归和8条变异。证据见
`REVIEW-LOG.md#b10-queue-wake-probe-preparation`。随后用户“同意验证”，一次真实queue确实自动唤醒原任务，
不需A新提示或点击；但未产生AI公开消息，合法终态收据unknown。Codex Gate5为blocked，Claude为not_run，
详见 `REVIEW-LOG.md#b10-native-queue-wake-probe`。3次任务输入/1次queue的窗口已结束，临时连接和进程已清理。
B11已在同一节点补齐默认关闭、去敏有界的权威事件记录与离线时序汇总，见 `REVIEW-LOG.md#b11-ai-lifecycle-receipts`。
文件内容、写入回执及资源关闭分项报告，缺来源/终态与畸形链不虚构成功或时差；没有新增权威事件或改变扑克时钟。
最终全量1110项通过（显式过滤默认端口1项，另跑7项补验）；37项相关变异全被杀掉、51项连接UI通过。
585项变异锚点全部静态可达不等于585项已实跑；本批没有重跑四人13手或真实AI模型。
B12已另获授权，但两次原生只读准备均未发现新MCP；没有Ready、来源消息、queue或游戏评估，窗口已停止。详见 `REVIEW-LOG.md#b12-native-receipts-window`。旧B10工具回执本次可读，已确认回答因hand_advanced丢弃；上段unknown是当时的取证边界，不再是当前原因判断。下一步先核对同一任务MCP加载及可靠关闭；不自动重跑模型、不扩常驻调度、不关闭父节点。
B13本地关停已完成正式检查与主线程整合，三类交叠失败已修复；最终46项定向/相邻测试、9条实际变异和26项非空捕获整合通过。裁决见 `REVIEW-LOG.md#b13-host-readiness-shutdown`，恢复先读 `RETURN-HANDOFF.md#b13-当前工作`。不重做已完成实现，不重开B12窗口；原任务工具就绪仍未验证，新增真实输入或影响其他任务的刷新需另获授权。
其后用户明确“允许长期测试”，由 `DEC-20260831-002` 授权B14起的同范围有界实机批次，不再逐次申请输入；全局刷新、宿主重启和发布等边界未授权。B14第一批在具体逐席AI权限门暂停，0原生输入/queue/评估并关闭服务；保留为历史，不当作MCP失败，详见 `REVIEW-LOG.md#b14-native-readiness-permission-boundary`。
最新用户“允许”由`DEC-20260831-003`确认本席合成底牌/公共聊天、AI公开发言和本机连接凭据。B14新批次已完成1次实际MCP准备和3次单次queue，各有1次start/resolve及成功公开，A无额外点击/提示；两例等待区、一例进行中第1手。Codex Gate5仅固定版本单席探针pass，来源到公开43.857/46.785/43.660秒不证明实时性。权限已撤销、配置/beta/页面及完整捕获正常关闭；失效私有文件及宿主管理MCP清理被工具策略拒绝，Gate9 blocked，不绕过。唯一当前裁决见`REVIEW-LOG.md#b14-native-public-replies`。
第3例权威迟到字段未显示的问题已修：仅视图映射，真实producer回归先5项失败再20/20，相邻45/45、1条变异被杀、隔离上下文检查及脚本UI14/14；当时窄屏/全量/13手未跑，脚本修复不倒算原生样本。不再把原任务MCP未就绪当作当前事实；新增原生批次仍须满足实际可用和清理停止条件。
B15已在同一协调器接入默认关闭的有界通知API与显式beta配置；真实本地HTTP/MCP/脚本进程链先公开、后沉默，两次终态已观察。独立检查的两处边界缺陷已修，另补一处取消竞态测试；最终全量Node1239/1239、31条定向变异全部杀掉，0存活/未评估。唯一当批事实见`REVIEW-LOG.md#b15-managed-wake-session`，含首轮失败、各轮耗时和最终身份。该批结束时尚缺本人启停UI，现由下一段B16更新；旧事实不改写成已做过浏览器验证。
B16已在原牌桌加入本人每窗确认、实际上限、启停/同键核对及分项状态。主线程截图修复新旧窗口回执混用；独立检查以实际红测修复模块挂起阻塞会话恢复及迟到模块丢失未决授权屏障。最终全量Node1314/1314、69844.1736ms，补充浏览器35/35、9360.2016ms，纯状态模块10条正式变异被杀；真实Browser刷新/启停与游戏客户端入口另行记录，不与此前轮次相加。唯一当批事实见`REVIEW-LOG.md#b16-managed-wake-controls`。
B17按冻结判据尝试连续原生窗口。独立检查先修复一项resolve先于ACK再撤权时的结清回执竞态；最终全量Node1315/1315、69343.9369ms。三批共4次原任务输入、1次queue：第一批readiness成功但专用外壳90秒空闲退出，首个queue回合无MCP调用；延长外壳并验证撤权退出后，另两批readiness完成但既有任务没有重启项目MCP。全程0次start/resolve/AI公开，全部B17临时资源清理。唯一当批事实见`REVIEW-LOG.md#b17-native-managed-wake-carrier-boundary`。下一步先做稳定项目MCP激活/连接换代，再开真实连续批次；第二真实席位与B14 Gate9阻塞仍未闭合，当前叶和父节点均不关闭。
B18已完成稳定项目MCP与逐席连接热切换的本地及原生显式切片：固定Git忽略活动槽位、逐请求重读、原子激活/换发/清除，以及只管理显式项目受管块的Codex插件配置器。首次全量1327/1328暴露宿主专有配置越过`src/`边界，架构搬到插件层后最终1328/1328；首轮门禁632/638的2存活/4未评估均修复，最终638/638，Browser51/51，Skill有效。随后`H:/tokengold`受管块写入、真人重启，当前任务只发现既定`tokengame_table`；原生实测缺槽失败、激活成功、撤权后旧令牌被拒、同席换发不重启恢复，并由第二浏览器公开消息触发当前Codex一次start/resolve，两页显示AI气泡。该批0 queue，仅关闭B17“稳定项目工具无法重新发现”的载体阻塞，不关闭`TG-EU-PROACTIVE-WAKE-SPIKE`。下一步复用该入口做有界持续通知；B14 Gate9、本轮失效下载手工删除、第二真实AI席、Claude、异地和四真人UAT继续开放。唯一当批事实见`REVIEW-LOG.md#b18-stable-project-mcp-activation`。
B19已在B18稳定入口完成等待区两次串行原生通知：发送器固定既有专用任务，页面逐席授权并本人开启2次/180秒窗口；第一来源达到尝试/接收/权威结清1/1/1及双页AI气泡后才发送第二来源，最终2/2/2、两页两条AI回复、窗口按次数上限停止。专用任务无需A再次点击或补提示，两个回合分别28.977秒和24.405秒；116.911秒窗口驻留不能当模型耗时。样本未Ready、未开手，因此只关闭稳定入口等待区连续通知子切片，不关闭`TG-EU-PROACTIVE-WAKE-SPIKE`也不翻`proactive_wake_verified`。B19当时的下一叶是牌局进行中来源，现由下一段B20更新；第二真实AI席、Claude、异地、四真人UAT、B14 Gate9及失效下载手工删除继续开放。唯一事实见`REVIEW-LOG.md#b19-stable-managed-wake-native`。
B20已执行一次牌局内有界样本：两席Ready，第1手行动期内本人开启1次/120秒窗口；专用任务无新点击/提示自动完成17.426秒回合，但页面20.342秒时以`wake_start_failed`、尝试1/接收1/结清0停止，两页无AI气泡。生命周期文件记录第1～4手和第3手B公开消息，却有0评估开始/turn/终态；任务启动早于该B消息，具体更早扑克来源unknown。按停止条件没有重试。已补只保留稳定码、不保留详情/自由文本的失败诊断；最终Node1332/1332、相关变异34/34和脚本浏览器35/35通过，不能倒推本次业务错误码或把原生失败改成通过。B20当时的下一叶是在新窗口读取精确码，现由下一段B21更新；`proactive_wake_verified`仍false，B20收尾时三份失效下载需真人删除。唯一事实见`REVIEW-LOG.md#b20-hand-active-managed-wake-diagnostic`。
B21没有重试B20窗口，而是在Ready前开启一个新1次/120秒窗口，并在窗口开启后不再添加玩家公开消息。第1手开始后唯一原生queue最终达到尝试/接收/权威结清1/1/1；第1手开始到评估开始23.701秒，评估直到30秒行动截止前约6.302秒才启动，开始到terminal 10.781秒。terminal为`silent/hand_advanced`，发生于第2手开始1.104秒后，两页0条AI气泡。由于本次start成功而没有`failure_code`，B20历史精确码仍为unknown；本批没有源码变更或测试重跑，不能写成牌局内公开或实时性通过，`proactive_wake_verified`仍false。服务端撤权、活动槽、浏览器和相关端口已清；直接PTY停止返回1，不能冒充beta exit0；B21新增一份167字节失效下载，现与前三份一并等待真人手工删除。canonical next leaf仍属于`TG-EU-PROACTIVE-WAKE-SPIKE`：先在不改扑克30秒规则和模型设置的前提下优化原生通知fast-path prompt并做有界对比，再根据数据决定传输优化或提出可配置时限，当前不直接宣布延长时限。唯一事实见`REVIEW-LOG.md#b21-hand-active-managed-wake`。
B22完成了B21指定的最小fast-path与唯一原生对照。managed通知在两个已校验编号后立即要求首项工具为`ai.start`并禁止前置读取/其他工具；旧B10未设置`noticeKind`的文本逐字不变。新断言先红37/38再绿38/38，旧probe117/117，变异5/5+8/8，合并与独立复核均155/155。唯一queue达到1/1/1、`failure_code=null`；HAND1→start 13.709秒，start→silent 9.817秒，终态在截止前6.476秒且距HAND2 9.678秒。相对B21的HAND→start名义缩短9.992秒，但任务时刻只有秒级、精确source时刻与首项工具顺序unknown，不能把改善全归因prompt或外推SLA；silent、0气泡不是公开回复。当前保留fast-path，不延长30秒、不立即重写传输，也不关闭`TG-EU-PROACTIVE-WAKE-SPIKE`或`TG-EU-PLAYABILITY-GATE`。canonical next leaf转为`TG-EU-PLAYABILITY-GATE`下的最小可复现组合验收：朋友建房→连接各自会话AI→牌局内玩家/AI气泡，不强迫模型固定公开；第二真实AI席、公开往返和四真人UAT仍开放。唯一事实见`REVIEW-LOG.md#b22-fast-path-native`。
B23完成该组合验收的两个本地入口缺口，但没有执行真实宿主验收。固定sender现在由服务端选择唯一预配置任务；固定页面隐藏/禁用UUID输入且请求、轮询和start/status/stop响应不含`thread_id`，旧自定义queue仍保留手填兼容。实现聚焦184/184、初始变异14/14，独立复核184/184并修失效锚点/错误响应防回显，限定变异11/11；脚本浏览器旧夹具在累计7 checks时按预期失败，固定夹具最终44/44、约11.40秒、0 console/page error，固定4次start无`thread_id`、旧手填1次含测试UUID、45个可见响应零已知ID。

B23同时新增`npm run codex:play -- "<当前 Codex 项目根绝对路径>"`：只用`CODEX_THREAD_ID`，按项目→thread→可执行文件完成只读前置后才原子配置；显式可执行文件独占，Windows无显式值时只接受PATH中第一个实际存在且canonical位于`LOCALAPPDATA/OpenAI/Codex/bin/<hex>/codex.exe`的可信候选，非Windows需显式值。受管MCP的`cwd`改为相对项目根；配置变化只提示重启，未变化才同进程启动beta，并强制回环/进程内/无adapter/无receipt，不覆盖模型/推理或自动开通知窗。红0/1后首轮9/9、既有5/5、变异9/9；独立审查修复beta启动失败exit 0、绝对cwd与畸形Windows路径，最终新叶9/9、beta/config/lifecycle 88/88、变异15/15。一键入口子叶0监听、模型、浏览器或原生任务；固定目标脚本浏览器另行单列且0原生模型/queue，真实`H:/tokengold/.codex`未改；短命queue参数和同账户进程元数据仍可能暴露任务ID。唯一事实见`REVIEW-LOG.md#b23-fixed-target-codex-play`。

B24依据`DEC-20260901-001`在当前任务实际执行上述命令的首次运行。命令exit 0，只给去敏重启提示并在beta前停止；`H:/tokengold/.codex/config.toml`的唯一托管块现为`cwd = "tokengame"`，块外哈希前后一致，配置无任务UUID、绝对仓库路径或绝对可执行路径，7802无监听。该迁移事实见`REVIEW-LOG.md#b24-project-config-migration`。

B25确认用户已经完成该授权的一次重启：配置写入后出现新的Codex与ChatGPT进程；`codex mcp list --json`可列出相对`cwd`服务器，但当前任务没有`tokengame_table`。同一任务在旧canonical绝对仓库`cwd`时曾实际调用该工具，因此相对运行时假设被直接反证。重跑入口成功起回环beta，两隔离浏览器目检固定目标、UUID不公开、上限1次/60秒；因工具未就绪，窗口未开启、两席未Ready，实际0通知/模型/queue。服务端撤权、本地槽、浏览器、beta和7802均已清，本批新增一份166字节已撤权下载待真人删除。生成器已在本地恢复canonical绝对仓库`cwd`，相对块迁移、输出去敏及定向变异通过；真实父项目配置未再次修改。事实见`REVIEW-LOG.md#b25-relative-cwd-host-failure`。

B26已按`DEC-20260901-002`执行真实配置恢复：入口exit 0并在beta前停止，唯一托管块现精确为`cwd = "H:/tokengold/tokengame"`，旧相对值消失；托管块外SHA-256前后均为`01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`，配置无任务UUID或绝对Codex可执行路径，7802无监听。本批0通知、0模型、0queue、0浏览器。事实见`REVIEW-LOG.md#b26-absolute-cwd-real-config-migration`。

B27确认用户完成第二次手动重启，当前任务实际且唯一加载项目`tokengame_table`；缺活动槽时原生只读失败关闭、激活后只读成功，宿主工具恢复已闭合。随后两隔离headed页面只发一条合成公开来源，固定当前正在运行的开发任务窗口在60.003秒以尝试/接收/权威结清1/1/0停止；同期目标任务仍为`inProgress`，0个可重入新模型回合、0次权威start/resolve、0条AI气泡，精确排队规则unknown。没有重投或手工抢待办。两页0 error/0 warning；服务端撤权、活动槽、浏览器、beta和7802均已清，本批新增一份失效下载后仓库精确模式累计7份、1165字节，未读未删。事实见`REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target`。

B28没有重试B27通知，而是把可控的空闲载体前提写成产品合同：managed启动横幅、固定目标页面说明与每窗本人确认、项目Skill及三份入口/操作文档均要求目标游戏任务先结束当前回复并保持空闲；同时明确queue已接收不等于模型开始或权威结清。聚焦Node首轮18/19后修正同义措辞，最终19/19、1833.6463ms；脚本浏览器46/46、20729.272ms、0错误、6项清理通过，桌面与320px目检；完整Node1356/1356、79933.5359ms。Skill普通校验遇GBK载体失败，同一校验器加UTF-8模式后有效。本批0通知/queue/原生模型/权威评估，活动槽不存在且7802无监听。事实见`REVIEW-LOG.md#b28-idle-game-task-handoff`。

**产品路线恢复点仍是B30候选的真人两机验收；B32已把本地工程面收口为待发布提交。** 用户已确认先完成两好友MVP，再考虑服务器和公开大厅。B30不改变既有2–4席扑克规则，只增加显式HTTPS入口、各机出站连接器和外部Web游戏/配置工作面。真实测试时，两人进入同一外部牌桌，并在各自空闲的Codex游戏任务运行`codex:connect`；好友不能用`codex:play`另起本地牌桌。由本人逐席授权并开启有限通知窗，按权威start和唯一terminal判断成功，不以queue接收数代替。真人步骤和回填格式见`docs/REMOTE-FRIEND-MVP.md`。

工程收尾补充：B30已以`4135611`推送，其Node 22两平台CI均失败。B31只修测试夹具和验证驱动，
不推进或关闭上面的MVP验收节点；冻结代码的Windows 1475项、WSL 1467项及相关变异各25条已通过，
限定独立复核也通过，并按`DEC-20260903-001`以`360db26`提交推送；Actions `33690705812`的Windows 1475项和Ubuntu 1467项均成功。
修补、复核与实际发布事实见`REVIEW-LOG.md#b31-node22-ci-verification`；不能把本机WSL当GitHub验证，也不能把
GitHub通过当两好友验收。此前的Node 24和693条变异记录仍是B30历史范围，不是B31全量重跑。

B32修复了默认Node24下仅测试夹具的取消语义超时，并把CI扩为Node22/24×Windows/Linux；产品代码未改。
同字节Node22与Node24完整测试各1475/1475，Node24完整gate实际exit0且693/693变异全杀；双席本地浏览器
18/18、清理7/7并完成桌面截图目检。实现已提交为`1f522d3`但未push，因此新的远端四作业CI为not_run。
机器事实见`.trellis/tasks/08-26-public-ai-table-talk/research/b32-friend-readiness-20260903.json`。

本轮没有自动开公网隧道、创建宿主任务、修改模型或采购服务器。两台设备、两个真实AI和十手体验尚未验证，不能因本地脚本通过关闭MVP。页面确认只是用户声明，不是宿主空闲遥测。`proactive_wake_verified=false`，`TG-EU-PROACTIVE-WAKE-SPIKE`和`TG-EU-PLAYABILITY-GATE`继续开放；四真人完整UAT后置，不抹除其历史要求。

- `latest_review_ref`: `REVIEW-LOG.md#b32-friend-readiness`（本地工程就绪；MVP闭合仍归B30真人验收）
- `readiness`: `B32_local_friend_carrier_ready_commit_not_pushed_real_two_friend_acceptance_not_run`
- `known_failures`: 相对cwd运行时失败是已修历史；B27同一活动任务1/1/0的精确排队规则unknown；B32远端Node22/24矩阵因未push而not_run，真实隧道、双原生AI与十手真人验收未跑，旧七份失效下载未动。Claude、内嵌UI和四真人UAT仍未验证，但不作为两好友阶段的新增前置。
- `next_owner`: `user_for_push_then_primary_for_GitHub_matrix_verification_then_user_and_friend_acceptance`
B9过滤日志复算：成功样本从玩家事件到权威公开33.460秒，公开后收尾11.556秒；已超过该次行动截止3.822秒。
这些是已存日志的分段事实，不是本轮新模型调用，更不能称为实时性能通过。

`TG-EU-PLAYABILITY-GATE` 不能笼统写“两层未跑”：历史及B8自动化都已执行到第13手；B8的209项通过，
四真人45分钟层未执行。第3手/80项是旧版本检查点；第13手/209项是明确产物对应的脚本模型运行，
它们都不能替代真实宿主生成或真人可玩性。

明确保留为未验证、不得按已通过对待：`TG-EU-CLAUDE-HOST-ADAPTER`（当前安装状态 unknown，
`claude_desktop` 剖面没有实机能力证据）、`TG-EU-PROACTIVE-WAKE-SPIKE`（B14已证明固定版本单席无点击公开，B16有本地启停UI，B19有等待区连续公开，B21有牌局内跨手合法终态，B22有一次截止前同手silent，B23完成固定目标去敏和本地一键入口，B24～B27已闭合相对cwd失败、绝对cwd迁移、真人重启和工具恢复，B28已闭合空闲任务入口说明；但B27固定当前活动任务只到1/1/0，B28没有原生模型样本，B22仍为0气泡、source与首项工具顺序unknown，Gate9清理blocked，完整连续原生运行和实时公开未验证，
Claude未执行，合同继续拒收完整主动能力声明）、四真人45分钟试玩。当前开发载体是Codex Desktop，
不是旧记录中的Claude Code终端；不得将B14的有限探针或旧CLI结果外推为完整入口与主动能力交付。
既有 Codex CLI 桥接证据只按旧范围保留，不证明新私人房、双宿主、跨宿主私人房或主动唤醒已经交付。

## 本地探针执行结论

`原理解 -> 实际结果 -> 差距/新理解`：原路线要求提示在模型生成前公开、最终回答严格配对、普通内容零桥流量，并以独立牌桌观察权威事件。实际实现与真实宿主均满足这些合同；浏览器验收修复了“只读状态未结算过期窗口”，宿主故障试验又修复了 Stop 重入覆盖原回答。新边界是：旧式 MCP 与 Hook 的 `PLUGIN_DATA` 不自动共享，且 `codex exec` 刷新可能留下 MCP 子进程；这些是产品化生命周期工作，不推翻桥接可行性。可以声称“Codex 插件宿主聚焦探针通过”，不能声称完整产品集成、桌面原生牌桌 UI 或生产就绪。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-CODEX-BRIDGE-SPIKE-20260825-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-L3-CODEX-BRIDGE-SPIKE
    exact_outcome: 在真实 Codex 0.145.0 插件宿主中，以当前会话模型完成提示预公开、最终回答配对、普通内容零桥流量、MCP 故障补交和可逆卸载的聚焦探针
    owner_ref: PROJECT-PLAN-TREE.md#TG-L3-CODEX-BRIDGE-SPIKE
  trigger: material_node_navigation_gate
  basis:
    semantic_contract_refs:
      - node_id: TG-L2-SESSION-LAUNCH
        contract_id: SC-TG-L2-SESSION-LAUNCH-20260825-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-005
        expected_digest: sha256:061266e6c84ec3f94c1be078bcb13e22edb4ae3c6364d1497a801c9e79feff6d
        binding_status: verified
      - node_id: TG-L2-PUBLIC-AI-EXCHANGE
        contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-009
        expected_digest: sha256:cf494f719361565de3e28e714d5e8811aa2007199c34dfe3f5d5ecee0fda647c
        binding_status: verified
    project_intelligence_ref: STATUS.md#project_intelligence
    understanding_view_ref: PROJECT-PLAN-TREE.md#TG-L3-CODEX-BRIDGE-SPIKE
    understanding_projection_refs:
      - PROJECT-UNDERSTANDING/CODEX-BRIDGE.md
      - PROJECT-UNDERSTANDING/CODEX-BRIDGE-AI.json
      - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md
    implementation_identity:
      kind: file_set_digest
      scope: package.json + src/** + web/** + plugins/tokengame/**
      identity: sha256:173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
      status: superseded_scope_rewritten
      status_note: >-
        该摘要在本节闭合时（2026-08-25）为 current。此后同一覆盖面已被
        a8763c4..ab29e34 大幅改写，因此它不再描述当前仓库，只作为本节闭合时的实现身份保留。
        仓库内没有生成该摘要的脚本，算法不可复现，所以不自行编造新值冒充同一算法的结果；
        当前实现身份改用 Git 提交范围锚定，见 STATUS.md#capability_inventory。
    verification_identities:
      - evidence_pointer: docs/ACCEPTANCE-EVIDENCE.md#自动化
        identity: test_file_set_sha256:76b5740bcf074bbd81d0bcbc062b36e74a02acde1f2d6d01d35944adef48b409;npm_test:11_pass
        status: superseded_scope_rewritten
        status_note: >-
          `npm_test:11_pass` 是本节闭合时的实测值，现已被 351/351 取代（测试集也已扩写）。
          保留原值是因为本节的结论只由当时那 11 项支撑；引用时不得当作当前测试规模。
      - evidence_pointer: artifacts/full-page-smoke.png + docs/ACCEPTANCE-EVIDENCE.md#浏览器
        identity: sha256:adae218d82a59a330a2e333bbfceca71433e045a1ad3173e73352214908c9af9;console_errors:0
        status: current
        status_note: >-
          2026-08-28 重算该文件 SHA256 与此处一致。但 `artifacts/` 在 .gitignore 内、
          文件未入库，全新克隆没有它——复核者只能重跑生成命令，不能指望检出即可比对。
      - evidence_pointer: docs/HOST-PROBE-CHECKLIST.md
        identity: codex_cli:0.145.0;host_probe:pass_with_notes;cleanup:zero_residuals
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - obligation_id: TG-ACC-PROMPT-BEFORE-GENERATION
        claim_or_predicate: 公开提示必须在 Hook 允许模型继续前由权威服务接受并写入事件
        required: yes
        real_condition: 明确公开前缀、开放行动窗口、真实 Hook 子进程
      - obligation_id: TG-ACC-ORDINARY-ZERO-BRIDGE
        claim_or_predicate: 普通 Prompt 和无 pending 的普通 Stop 不产生桥请求
        required: yes
        real_condition: 同一插件代码与桥统计计数器
      - obligation_id: TG-ACC-PAIRING-IDEMPOTENCY-DEADLINE
        claim_or_predicate: prompt/answer 严格配对、每窗口一次、重复幂等、关闭或迟到拒绝
        required: yes
        real_condition: 权威服务端时钟与原子内存状态机
      - obligation_id: TG-ACC-MCP-FALLBACK
        claim_or_predicate: stdio MCP 可握手并提供状态和显式回答补交工具
        required: yes
        real_condition: 独立 MCP 子进程经本地桥访问权威服务
      - obligation_id: TG-ACC-WEB-OBSERVABILITY
        claim_or_predicate: Web UI 读取同一权威事件并可操作窗口，无控制台错误
        required: yes
        real_condition: Chromium Playwright 1440x980 与技能客户端真实点击
      - obligation_id: TG-ACC-CODEX-DESKTOP-HOST
        claim_or_predicate: 当前 Codex 插件真宿主加载插件后保持原始前缀、Hook/Stop 顺序、MCP 调用和可逆卸载
        required: yes
        real_condition: 无秘密专用 Codex 任务内安装并信任仓库插件
    selected_surfaces:
      - integration
      - browser_smoke
      - focused_probe
      - inspection
    observations:
      - obligation_id: TG-ACC-PROMPT-BEFORE-GENERATION
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/hook-integration.test.cjs + docs/HOST-PROBE-CHECKLIST.md#已执行验收
        result: pass
        caveat: 权威服务仍为本地受控探针，不是远程生产服务
      - obligation_id: TG-ACC-ORDINARY-ZERO-BRIDGE
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/hook-integration.test.cjs + docs/HOST-PROBE-CHECKLIST.md#已执行验收
        result: pass
        caveat: 无
      - obligation_id: TG-ACC-PAIRING-IDEMPOTENCY-DEADLINE
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/event-store.test.cjs + test/hook-integration.test.cjs + docs/HOST-PROBE-CHECKLIST.md#已执行验收
        result: pass
        caveat: 单进程内存伪权威服务，不代表分布式一致性
      - obligation_id: TG-ACC-MCP-FALLBACK
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/mcp-and-http.test.cjs + docs/HOST-PROBE-CHECKLIST.md#已执行验收
        result: pass
        caveat: MCP 补交完成权威闭环；旧式 MCP 未继承 Hook PLUGIN_DATA，pending 即时归档仍待统一状态所有权
      - obligation_id: TG-ACC-WEB-OBSERVABILITY
        evidence_type: executed
        correspondence: direct
        evidence_pointer: docs/ACCEPTANCE-EVIDENCE.md#浏览器
        result: pass
        caveat: 独立 Web 观察页，不是 Codex 内嵌 MCP UI
      - obligation_id: TG-ACC-CODEX-DESKTOP-HOST
        evidence_type: executed
        correspondence: direct
        evidence_pointer: docs/HOST-PROBE-CHECKLIST.md
        result: pass_with_notes
        caveat: 验证插件宿主而非桌面原生 UI；MCP 子进程曾需精确手动回收后才能卸载缓存
    skipped: []
    result: pass_with_notes
  capability_claim:
    overall_result: pass_with_notes
    claims:
      - capability_id: TG-L3-CODEX-BRIDGE-SPIKE
        parent_capability_id: TG-L2-SESSION-LAUNCH
        claim: Codex 会话桥接聚焦探针已在真实插件宿主中完成并可据此推进牌桌纵向切片
        exact_scope: Skill + UserPromptSubmit/Stop Hooks + stdio MCP + 本地桥 + 伪权威事件服务 + 独立 Web UI + Codex 0.145.0 插件宿主生命周期
        result: pass_with_notes
        dimensions:
          semantic:
            required: yes
            status: sufficient_for_claim
            evidence_type: inspection
            evidence_pointer: DEC-20260825-005, DEC-20260825-009, DEC-20260825-011
            user_readable_meaning: 产品边界、公开规则和修订架构均有当前合同
            caveat: 无
          implementation:
            required: yes
            status: sufficient_for_claim
            evidence_type: executed
            evidence_pointer: src/** + plugins/tokengame/** + web/** + npm test
            user_readable_meaning: 本地协议实现、可执行 Hook/MCP 和观察 UI 已建立并运行
            caveat: 权威服务、固定 token 和数据持久化仍是本地探针实现
          data:
            required: no
            status: not_applicable
            evidence_type: inspection
            evidence_pointer: DEC-20260825-011 + docs/CODEX-BRIDGE-PROBE.md
            user_readable_meaning: 本探针只承诺受控内存事件，不承诺真实玩家数据或持久化
            caveat: 无
            not_applicable_reason: 生产数据、迁移与持久化明确在本聚焦探针范围外
          integration:
            required: yes
            status: sufficient_for_claim
            evidence_type: executed
            evidence_pointer: test/hook-integration.test.cjs + docs/HOST-PROBE-CHECKLIST.md
            user_readable_meaning: 真实 Codex 宿主已执行 Hook/MCP 到桥和权威事件服务的完整最小链路
            caveat: 不包含远程生产服务或桌面内嵌牌桌 UI
          verification:
            required: yes
            status: sufficient_for_claim
            evidence_type: executed
            evidence_pointer: docs/ACCEPTANCE-EVIDENCE.md
            user_readable_meaning: 11 项自动化、浏览器和宿主级必需场景均已运行
            caveat: hosted tool、多人并发和跨平台生命周期未覆盖
          operational:
            required: yes
            status: sufficient_for_claim
            evidence_type: executed
            evidence_pointer: docs/HOST-PROBE-CHECKLIST.md#清理核对
            user_readable_meaning: 本地 marketplace 安装、显式信任、卸载和零残留核对已执行
            caveat: codex exec 刷新曾留下 MCP 子进程；固定开发 token 不构成生产认证
        safe_wording: TokenGame 的 Codex 插件宿主桥接聚焦探针已通过：当前会话模型可在提示预公开后生成，最终回答严格配对，普通内容零桥流量，故障可显式补交，插件可逆卸载；这不等于完整多人产品或桌面原生 UI 已完成。
        gaps:
          - Hook 与旧式捆绑 MCP 的 PLUGIN_DATA 状态所有权尚未统一
          - Codex MCP 子进程需要产品级正常回收与跨平台生命周期策略
          - 生产认证、持久化、多人并发和上下文泄漏完备防护不在本探针中
  route_boundaries:
    local:
      result: supported
      evidence_refs:
        - docs/ACCEPTANCE-EVIDENCE.md#自动化
        - docs/ACCEPTANCE-EVIDENCE.md#浏览器
    adjacent:
      result: supported
      evidence_refs:
        - test/hook-integration.test.cjs
        - docs/HOST-PROBE-CHECKLIST.md
    cumulative:
      result: supported
      evidence_refs:
        - PROJECT-PLAN-TREE.md#当前恢复点
        - docs/CODEX-BRIDGE-PROBE.md#真实宿主结论
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits:
    - 支持“Codex 插件宿主聚焦探针通过”，不支持“完整 Codex 产品集成或桌面原生 UI 完成”
    - 不支持完整牌桌、生产鉴权、持久化、多人并发、发布或 Codex 来源证明
  remaining_non_blocking:
    - 内嵌 MCP UI 保持延后，不阻塞独立 Web UI 路线
    - MCP 补交后的 pending 即时归档与子进程正常回收进入后续生命周期工作
  advance_allowed: yes
  next_owner: primary_ai_initialize_trellis_then_define_first_multiplayer_vertical_slice
```
