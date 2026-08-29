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
    - TG-EU-SINGLE-STACK-WEB-TABLE
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
      summary: 先定义两个宿主共享的 HostAdapter 合同，再实现任一侧适配器；不把 Claude 特例写进核心。合同的可发命令分类已由 host-surface.cjs 划出雏形，但适配器侧契约尚未成文。
      implementation_refs:
        - src/contract/adapter-contract.cjs
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
        two_contracts_rationale: >-
          人类面（HostCommand/UI）与模型面（SeatModel）权力不同：人类面能确认公开范围、能 ready、
          能下注，模型面一条都不能。合成一份意味着权限差别只能靠运行期检查表达，而那种检查漏一条
          就是模型拿到了下注权限。ADAPTER_ROLES 按引用指向 HUMAN_COMMANDS / MODEL_COMMANDS，
          不拷贝——拷贝会漂移。
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
      not_done:
        - id: host_command_adapter
          reason: >-
            要动 src/host/table-web-host.cjs，而那是一张已经闭合的单栈牌桌；两份合同拆成两份
            还是合成一份带角色字段，也该由 Codex 先裁。列为待裁决项而不是擅自开工。
      claim_limit: >-
        底座与模型面适配器可声称已实现并过自动化一致性套件。不得声称 HostCommandAdapter 已存在，
        也不得声称主动唤醒（Gate 5）已验证——一致性套件只验内部一致性，谎称有这个能力它仍然全绿，
        所以报告里另有 unverifiable 数组承载它，CAPABILITIES.proactive_wake 带
        verified_on_any_host: false。
    - id: TG-EU-CLAUDE-HOST-ADAPTER
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-HOST-ADAPTER-CONTRACT
      status: blocked
      unit_kind: host_adapter
      summary: Claude 侧宿主适配器。按用户指令暂缓：当前会话在终端 Claude Code 内，没有 Claude Desktop / Cowork 界面，跑不了实机门禁，先写会积累一堆无法验证的代码。
      blocking_reason: 本环境无法执行真实桌面探针；实机 Gate 5 保留为明确未验证，只提供可执行清单。
      claim_limit: 未开始且不得声称 Claude Cowork 已通过任何门禁。
    - id: TG-EU-PROACTIVE-WAKE-SPIKE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies: []
      status: blocked
      unit_kind: capability_spike
      summary: SAME_VISIBLE_TASK_SPIKE_V1。在固定记录的宿主版本上验证内嵌组件收到权威事件后无需玩家点击即可恰好启动一次当前任务 follow-up，以及缺少该能力时可被稳定检测。
      owner_links:
        - .trellis/tasks/08-26-public-ai-table-talk/research/codex-visible-task-proactive-turn-boundary.md
        - .trellis/tasks/08-26-public-ai-table-talk/research/host-active-turn-capability-refresh-20260827.md
      blocking_reason: 需要真实宿主实机环境；本环境不具备。
      claim_limit: 未执行。Codex 与 Claude 两侧的无点击主动唤醒均未验证，不得由自动化测试或源码推断代替。
    - id: TG-EU-PLAYABILITY-GATE
      parent: TG-L3-MULTIPLAYER-VERTICAL-SLICE
      dependencies:
        - TG-EU-SINGLE-STACK-WEB-TABLE
        - TG-EU-PROACTIVE-WAKE-SPIKE
      status: blocked
      unit_kind: acceptance_gate
      summary: PLAYABILITY_GATE_V1 两层——自动化全门禁（动态私人房、四个独立 binding、至少 10 手、故障矩阵、隐私金丝雀）与一次四真人 45 分钟试玩签字。
      owner_links:
        - .trellis/tasks/08-26-public-ai-table-talk/prd.md#mvp-0-权威验收
        - .trellis/tasks/08-26-public-ai-table-talk/research/mvp-playability-evidence.md
      blocking_reason: >-
        单栈产品闭环已完成（TG-EU-SINGLE-STACK-WEB-TABLE），但 TG-EU-PROACTIVE-WAKE-SPIKE 未执行，
        真人层也还没跑：要四个真人 45 分钟试玩签字。
      automation_layer_progress_2026_08_28: >-
        自动化层的手数要求已达成：浏览器验收现在打到第 12 手（此前第 3 至 4 手），201 条断言全过、
        控制台错误 0、四个隔离上下文、27 张截图、连续三轮干净运行。故障矩阵已覆盖：五种畸形投影的
        有界降级（带送达计数，否则整节恒真）、真实 reload、真实关闭上下文、网络中断与 120 秒保留窗
        恢复、陈旧版本号撞 409、入口幂等探针、有人跟的全下摊牌与筹码归零后的席位处理。
        隐私金丝雀与逐查看者本地隐藏另在第 8 节。
      automation_layer_still_missing: >-
        边池分层在浏览器层不可观测（投影只含 pot_total），如实记为缺口，由单元层覆盖。
        自动化层全部结果来自 simulated 模型适配器，不含任何真实宿主能力。
      claim_limit: >-
        自动化层的手数与故障矩阵要求已达成，真人层未执行。自动化层不能顶替真人层签字，
        模拟席或一人多窗口不能计入真人签字。
  active_node: TG-L3-MULTIPLAYER-VERTICAL-SLICE
  current_next_leaf: TG-EU-HOST-ADAPTER-CONTRACT
  current_execution_unit_ref: PROJECT-PLAN-TREE.md#TG-EU-HOST-ADAPTER-CONTRACT
  reliable_boundary:
    earliest_trustworthy_node_or_checkpoint: TG-EU-SINGLE-STACK-WEB-TABLE@eef01e9
    first_invalid_or_unverified_node: TG-EU-CLAUDE-HOST-ADAPTER
    boundary_meaning: >-
      八个执行单元有实现、自动化测试与变异测试证据，产品闭环另有四上下文浏览器验收（现已到第 12 手）。
      TG-EU-HOST-ADAPTER-CONTRACT 部分实现：共享底座与模型面适配器有实现、一致性套件与变异证据；
      HostCommandAdapter 未实现，止于此。Claude 适配器、无点击主动唤醒与可玩性门禁的真人层均无证据，
      不得按已通过对待。特别地：浏览器验收与一致性套件用的都是 simulated 适配器，它们证明 UI 到权威
      这条链路与合同的内部一致性，不证明任何真实宿主能力——谎称有主动唤醒，一致性套件仍然全绿，
      所以那一项由 unverifiable 数组单独承载。
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  project_intelligence_ref: STATUS.md#project_intelligence
  next_owner: primary_ai_execute_TG-EU-HOST-ADAPTER-CONTRACT

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
  last_checked: 2026-08-28
  next_action: implement_confirmed_semantics_no_semantic_change_pending
```

## 当前恢复点

宿主中立 L0、共享 `TG-L1-HOST-ENTRY`、三个当前 MVP L2，以及可玩牌桌四条体验规则和公开座位 AI 七条交流规则均已分别由用户确认并通过内容寻址校验；旧 Codex 专属入口、会话、公开测试桌、被动问答章程及其旧规则保留为已替代历史。语义门禁已经闭合，且本轮不存在待确认的语义变更。

Project Intelligence 刷新门禁已通过（`STATUS.md#project_intelligence`，`freshness: current`）。`TG-L3-MULTIPLAYER-VERTICAL-SLICE` 现在展开为 12 个执行单元：七个内核单元加一个产品闭环单元已完成并有实现、自动化测试与变异测试证据（`npm test` 2026-08-28 实测 351/351，八个变异规格全部重跑合计 122 变异 122 杀掉 0 存活），四个单元没有证据。

`TG-EU-SINGLE-STACK-WEB-TABLE` 已完成：新 UI 在 `web/table/`，经协调器连同一份宿主中立内核，入口 `npm run web`；四个隔离 Chromium 上下文的 80 条断言全过、控制台错误 0、连续打到第 3 手。旧探针栈 `web/app.js` 与 `npm run authority` / `table` 原样保留为已替代历史证据，不再是产品路径。

下一恢复点是 `TG-EU-HOST-ADAPTER-CONTRACT`：先把两个宿主共享的 HostAdapter 合同写成文，再实现任一侧适配器，不把 Claude 特例写进核心。

产品闭环成立不等于 MVP 可玩已通过：`TG-EU-PLAYABILITY-GATE` 的两层都还没跑（自动化层要求至少 10 手、故障矩阵与隐私金丝雀，现有验收只到第 3 手；真人层要四个真人 45 分钟签字），而浏览器验收用的是 `simulated: true` 的脚本适配器。它证明 UI 到权威这条链路，不证明任何真实宿主能力。

明确保留为未验证、不得按已通过对待：`TG-EU-HOST-ADAPTER-CONTRACT`（共享合同未成文）、`TG-EU-CLAUDE-HOST-ADAPTER`（按用户指令暂缓，本环境无 Claude Desktop / Cowork 界面，跑不了实机门禁）、`TG-EU-PROACTIVE-WAKE-SPIKE`（`SAME_VISIBLE_TASK_SPIKE_V1` 未执行，两个宿主的无点击主动唤醒都未验证）、`TG-EU-PLAYABILITY-GATE`（自动化层与四真人试玩层均未执行）。既有 Codex 桥接与旧牌桌气泡证据只按旧范围保留，不证明新私人房牌桌、双宿主能力、跨宿主私人房或事件驱动主动唤醒已经交付。

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
