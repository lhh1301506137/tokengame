# TokenGame 项目路线树

本文件只负责当前路线与恢复位置；产品语义以已验证的决策合同为准。

```yaml
plan_tree:
  status: needs_reconciliation
  root_goal_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
  active_path:
    - TG-L0-PRODUCT
    - TG-L1-HOST-ENTRY
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
      status: active
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
      summary: 已确认的可信实时牌局能力域；其旧 Codex 接入与牌桌证据保持原范围，等待新的宿主中立会话与私人房 L2 章程确认后重验受影响主链。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-003
    - id: TG-L1-PUBLIC-AI-PLAY
      parent: TG-L0-PRODUCT
      dependencies:
        - TG-L1-HOST-ENTRY
        - TG-L1-LIVE-TABLE
      status: planned
      summary: 已确认的公开人机博弈能力域；其赛时消息桥接将先在接入可行性切片中验证。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-004
    - id: TG-L2-SESSION-LAUNCH
      parent: TG-L1-HOST-ENTRY
      dependencies: []
      status: blocked
      summary: 旧 Codex 专属游戏会话启动章程仍是最后一个已验证历史合同，但父级和私人房/座位恢复责任已经变化；宿主中立后继等待 DEC-20260827-019 确认。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-005
        - PROJECT-DECISION-LOG.md#DEC-20260827-019
      understanding_view:
        current_ref: PROJECT-DECISION-LOG.md#DEC-20260825-005
        current_revision_ref: SC-TG-L2-SESSION-LAUNCH-20260825-A
        candidate_successor_ref: docs/SEMANTIC-CONFIRMATION-L2-SESSION-LAUNCH-20260827.md#l2-session-launch-charter
        presentation: presented
        result_ref: none
    - id: TG-L2-PLAYABLE-TABLE
      parent: TG-L1-LIVE-TABLE
      dependencies:
        - TG-L2-SESSION-LAUNCH
      status: active
      summary: 已确认的完整可玩牌桌章程与亮牌规则；弃牌获胜默认不强制亮牌，可自愿亮牌。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-008
    - id: TG-L2-PUBLIC-AI-EXCHANGE
      parent: TG-L1-PUBLIC-AI-PLAY
      dependencies:
        - TG-L2-SESSION-LAUNCH
        - TG-L2-PLAYABLE-TABLE
      status: planned
      summary: 已确认的公开 AI 交换章程、分阶段实时公开规则与每行动窗口一次 AI 请求规则。
      owner_links:
        - PROJECT-DECISION-LOG.md#DEC-20260825-009
    - id: TG-L3-CODEX-BRIDGE-SPIKE
      parent: TG-L2-SESSION-LAUNCH
      dependencies:
        - TG-L2-PUBLIC-AI-EXCHANGE
      status: completed
      summary: 本地回环协议、Hook、MCP、伪权威事件服务和独立 Web 视图已通过 11 项自动化、浏览器及真实 Codex 0.145.0 插件宿主验收；节点以 pass_with_notes 关闭。
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
        presentation: presented
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
      status: planned
      summary: 定义并实现固定测试桌的一手完整多人牌局纵向切片，以服务端权威状态机、合法行动、结算和可观察验收为主；进入开发前先初始化 Trellis。
      owner_links:
        - PROJECT-PLAN-TREE.md#当前恢复点
        - STATUS.md#project_intelligence
  active_node: TG-L1-HOST-ENTRY
  current_next_leaf: none
  current_execution_unit_ref: none
  reliable_boundary:
    earliest_trustworthy_node_or_checkpoint: TG-L1-HOST-ENTRY@SC-TG-L1-HOST-ENTRY-20260827-A
    first_invalid_or_unverified_node: TG-L2-SESSION-LAUNCH@SC-TG-L2-SESSION-LAUNCH-20260827-B-pending
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  project_intelligence_ref: STATUS.md#project_intelligence
  next_owner: user_confirm_stage_3_l2_session_launch_charter

semantic_baseline:
  required: yes
  status: conflict
  coverage: partial
  authority: mixed
  currency: current
  consistency: conflict
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
  pending_or_missing_nodes:
    - TG-L2-SESSION-LAUNCH@SC-TG-L2-SESSION-LAUNCH-20260827-B-pending
    - TG-L2-PLAYABLE-TABLE@successor_not_yet_presented
    - TG-L2-PUBLIC-AI-EXCHANGE@successor_not_yet_presented
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
      contract_id: SC-TG-L2-SESSION-LAUNCH-20260825-A
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-005
      digest: sha256:061266e6c84ec3f94c1be078bcb13e22edb4ae3c6364d1497a801c9e79feff6d
      binding_status: verified
      verified_at: 2026-08-25
    - node_id: TG-L2-PLAYABLE-TABLE
      contract_id: SC-TG-L2-PLAYABLE-TABLE-20260825-B
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-008
      digest: sha256:57a19dc3c4e0d22fa2f6c10467ed40bcaaacb745c2c2148f6c16050842d1c482
      binding_status: verified
      verified_at: 2026-08-25
    - node_id: TG-L2-PUBLIC-AI-EXCHANGE
      contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B
      decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-009
      digest: sha256:cf494f719361565de3e28e714d5e8811aa2007199c34dfe3f5d5ecee0fda647c
      binding_status: verified
      verified_at: 2026-08-25
  blocking_paths:
    - TG-L0-PRODUCT@SC-TG-L0-ROOT-20260827-B -> TG-L1-HOST-ENTRY@SC-TG-L1-HOST-ENTRY-20260827-A -> pending TG-L2-SESSION-LAUNCH successor -> pending remaining L2 successors -> affected current MVP route
  unaffected_confirmed_paths: []
  last_checked: 2026-08-27
  next_action: user_confirm_stage_3_l2_session_launch_charter
```

## 当前恢复点

宿主中立 L0 与共享 `TG-L1-HOST-ENTRY` 已分别由用户确认并通过内容寻址校验；旧 Codex 专属 L0/L1 保留为已替代历史。当前活动路径推进到共享 L1，下一动作只确认 `TG-L2-SESSION-LAUNCH` 的宿主中立后继章程，重点是临时私人房、房间与座位归属、普通中断恢复和允许宿主入口形态不同。后续两个 L2 与任何产品规则仍未确认。既有 Codex 桥接、牌桌和气泡证据继续按旧范围保留，不证明双宿主、私人房恢复或主动唤醒已经交付。

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
      status: current
    verification_identities:
      - evidence_pointer: docs/ACCEPTANCE-EVIDENCE.md#自动化
        identity: test_file_set_sha256:76b5740bcf074bbd81d0bcbc062b36e74a02acde1f2d6d01d35944adef48b409;npm_test:11_pass
        status: current
      - evidence_pointer: artifacts/full-page-smoke.png + docs/ACCEPTANCE-EVIDENCE.md#浏览器
        identity: sha256:adae218d82a59a330a2e333bbfceca71433e045a1ad3173e73352214908c9af9;console_errors:0
        status: current
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
