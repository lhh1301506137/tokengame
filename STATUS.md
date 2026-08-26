# TokenGame 项目状态

更新日期：2026-08-27

## 初始化状态

- 初始化分类：`fresh_init`
- 框架就绪度：`continue_ready`
- 当前阶段：`prototype`
- 当前目标：三个宿主中立 L2 章程已经分别确认并完成唯一绑定；当前进入产品规则阶段，先确认可玩牌桌体验规则包，再独立确认公开座位 AI 规则包。
- 当前路径：`SC-TG-L0-ROOT-20260827-B`、`SC-TG-L1-HOST-ENTRY-20260827-A`、`SC-TG-L2-SESSION-LAUNCH-20260827-B`、`SC-TG-L2-PLAYABLE-TABLE-20260827-C` 与 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-C` 是现行已验证语义主链；受保护规则与受影响实现仍待确认或重验。
- 裸指令 `继续`：不会确认当前“可玩牌桌体验规则包”，也不会授权发布、部署、付费服务或扩大产品范围。

```yaml
user_facing_language_resolution:
  contract: dual-ai.user-facing-language-resolution.v1
  status: resolved
  normalized_tag: zh-CN
  source: adapter_default
  adapter: private_dual
  canonical_carrier: STATUS.md
  canonical_before: absent
  project_local_instruction: absent
  persisted: yes
  conflict: none
  evidence:
    - private_dual adapter default

runtime_profile_selection:
  requested: missing
  source: adapter_default
  persistence: product_default
  user_selected: false
  inherited_across_framework_update: not_applicable
  previous_display_name: none
  legacy_machine_preference: absent
  effective: adaptive
  display_name: v2.01-A
  trellis_dispatch_mode: sub-agent_default
  recommendation: none
  recommendation_pointer: none
  unresolved_reason: none
project_adoption_profile: standard

trellis:
  mode: active
  version: 0.5.8
  initialized_at: 2026-08-26
  developer_identity: lhh1301506137
  codex_integration: generated
  codex_hooks_feature: enabled
  hook_review_status: not_verified_in_this_session
  bootstrap_task: archived/2026-08/00-bootstrap-guidelines
  active_task: .trellis/tasks/08-26-public-ai-table-talk
  active_task_status: planning
  active_task_research: .trellis/tasks/08-26-public-ai-table-talk/research/semantic-candidate-rules-playable-table-20260827.json
  recommendation: user_confirm_rules_stage_a_playable_table
  reason: all_current_mvp_charters_are_verified_but_protected_product_rules_remain_unconfirmed

continuous_risk_authorization:
  status: active
  max_continuous_risk: medium
  authorization_basis: default_medium
  selection_source: default
  recommendation: none
  recommendation_authorizes_selection: no
  authorized_by_user_phrase: none
  scope: framework_initialization_and_future_in_scope_local_development
  project_stage: prototype
  local_only_confirmed: yes
  data_scope: synthetic_public_probe_text_only
  public_release_or_remote_upload: no
  expires: current_project
  excluded_critical_risk:
    - canonical_critical_never_unattended_stop_list
  posture_notice:
    status: not_needed
    trigger_fingerprint: none
    shown_at: none

local_closeout_authorization:
  status: disabled
  mode: manual_closeout
  authorization_basis: disabled_by_policy
  scope: current_project
  allowed_actions:
    - durable_status_review_log_updates
  excluded_actions:
    - push_deploy_release_publish
    - force_push_or_history_rewrite
    - secrets_or_private_data
    - destructive_or_irreversible_real_data
    - scope_expansion_or_user_acceptance

semantic_alignment:
  mode: semantic_change
  alignment_stage: product_rules
  edit_authorization: align_truth_after_confirmation
  semantic_baseline_status: confirmed
  confirmed_nodes:
    - TG-L0-PRODUCT
    - TG-L1-HOST-ENTRY
    - TG-L1-LIVE-TABLE
    - TG-L1-PUBLIC-AI-PLAY
    - TG-L2-SESSION-LAUNCH
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  pending_or_missing: []
  binding_index: H:/tokengold/tokengame/PROJECT-PLAN-TREE.md#semantic_baseline
  current_root_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
  current_entry_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
  current_session_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
  current_table_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-020
  current_public_ai_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-021
  candidate_confirmation_ref: docs/SEMANTIC-CONFIRMATION-RULES-PLAYABLE-TABLE-20260827.md#playable-table-rules
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  next_action: user_confirm_rules_stage_a_playable_table

project_intelligence:
  contract: dual-ai.project-intelligence.v1
  purpose: refresh_affected_model
  scope: affected_l1_domain
  trigger_reasons:
    - formal_high_effort_same_session_self_review
    - foundational_architecture_correction
    - failed_understanding_projection_gate_recovery
    - codex_real_host_probe_closure
  basis:
    value_semantic_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260825-005
      - PROJECT-DECISION-LOG.md#DEC-20260825-009
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
      - PROJECT-DECISION-LOG.md#DEC-20260827-021
    route_design_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260825-011
      - PROJECT-PLAN-TREE.md#当前恢复点
    necessary_reality_refs:
      - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md
    change_boundary_ref: implementation-file-set:173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
  project_thesis:
    why_worthwhile: 把 AI 工作宿主中的真人与当前会话 AI 协作本身变成公开、可欺骗、可判断的牌桌信息，而不是再做一个外挂胜率计算器。
    target_user_and_usage: 已在受支持 AI 工作宿主中的玩家，通过 TokenGame 明确进入一张外部权威牌桌，并由该游戏会话的唯一座位 AI 参与公开语言博弈。
    promised_experience: 普通宿主内容保持私密；规定游戏范围内的玩家与 AI 表达以座位气泡公开，AI 可沉默、回答或由可审计事件主动发言，真人仍通过结构化牌桌控件提交官方动作。
    what_good_means:
      - 当前会话模型实际生成回答，不要求第二套模型 API
      - 公开边界可解释且默认失败关闭
      - 牌桌状态由服务端权威维护，语言声明不能覆盖官方事实
    anti_goals:
      - 不镜像整个 Codex 会话
      - 不把真实 Token 额度或金钱引入 MVP
      - 不以未公开稳定的 Codex 自定义 UI 能力作为首版依赖
    stage_constraints:
      - prototype
      - local_first
      - host_probe_completed_and_uninstalled
      - multiplayer_vertical_slice_next
    professional_challenges:
      - 首次安装后同一旧会话立即获得新插件能力并非当前文档保证；完整能力可靠可用通常需要新会话
      - 自定义斜杠命令不是公开插件扩展面；入口改为显式 Skill 或插件提及
      - Codex 自定义 MCP UI 支持边界仍需实机探针，不能作为 MVP 阻塞依赖
      - MCP 主机管理的 OAuth 不能推导为独立 Hook 命令自动获得同一认证；需要捆绑本地桥接进程承接认证和远端连接
      - 本地过滤能阻止普通提示外发，却不能单独阻止当前模型在公开回答中复述私密历史；专用游戏任务和最小上下文是必要边界
      - 用户可修改本地插件，远端无法仅凭 Hook 事件加密证明内容确由 Codex 生成
      - Hook 的 PLUGIN_DATA 在本机不会自动传给旧式捆绑 MCP，补交后的本地 pending 归档需统一状态所有权
      - Codex exec 插件刷新可能留下 MCP 子进程；产品化必须有正常退出、健康检查和精确回收
    unresolved_user_only_information: []
  planes:
    value_and_product:
      current_summary_ref: PROJECT-DECISION-LOG.md#DEC-20260825-005
      unknowns: []
    design_and_architecture:
      selected_views:
        - interfaces_and_invariants
        - ownership_and_persistence
        - failure_and_privacy
      evolution_pressures:
        - 将牌桌视图从独立浏览器逐步升级为支持该标准的内嵌 MCP UI
      observable_evidence_obligations:
        - 同步 UserPromptSubmit Hook 在模型生成前让服务端原子接受一次请求额度并写入公开提示事件
        - 非 TokenGame 提示与回复不产生本地桥接或网络事件
        - Stop 只提交与同一服务端请求、回合和行动窗口匹配的最终回答；迟到或重复回答被服务端拒绝
        - 事件可携带本地观察到的当前模型标识，但不读取不稳定 transcript，也不把该标识宣传为不可伪造证明
        - 桥接不可用时只失败关闭当前 TokenGame 公共请求，不影响普通 Codex 提示
      adversarial_challenge: 上传后过滤会直接泄露隐私；仅在 Hook 内过滤仍会遗漏模型从旧会话复述敏感上下文的风险。必须同时采用精确显式入口、专用游戏任务、结构化最小牌局上下文、本地桥接隔离和服务端原子裁决。
    current_reality:
      implementation_data_integration_verification_runtime_experience:
        - 已建立无第三方运行依赖的 Node.js 本地探针、仓库内 Codex 插件、同步 Hook、stdio MCP、回环桥、伪权威事件服务和独立 Web 观察页
        - npm test 共 11 项通过，覆盖普通 Prompt/Stop 零桥流量、提示预公开、回答配对、幂等、截止时间、失败关闭、PreToolUse、Stop 重入、MCP stdio、显式补交与 HTTP/UI 合同
        - Playwright 已真实点击关闭与重开窗口，并运行公开 Prompt Hook 与 Stop Hook；最终权威事件序号为 prompt 5、answer 6，完整页面控制台错误为 0
        - 浏览器验收发现只读状态未结算过期窗口的分叉，现已修复并增加回归测试
        - 已通过仓库本地 marketplace 把插件安装进 Codex 0.145.0 真宿主，并直接验证公开、普通、重复、关窗、PreToolUse、MCP 状态、桥故障补交和卸载路径
        - 真宿主要求清单显式声明 hooks；补充后宿主运行通过，但当前 plugin-creator 校验器误报 hooks 字段，属于已知假阴性，不能继续声称当前校验器通过
        - 安装的 Hook 默认不自动受信任；专用任务一次性明确信任后运行，普通未信任路径保持零桥流量
        - Stop 重入曾覆盖桥故障时保留的原回答；已用 stop_hook_active 保护修复，并由自动化和真宿主复测
        - 故障回答可由真宿主 publish_ai_answer 补交为唯一权威事件；旧式 MCP 不继承 Hook PLUGIN_DATA，pending 即时归档仍待统一状态所有权
        - 探针结束后插件、测试 marketplace、专用信任配置、缓存、插件数据、端口与本次 MCP 子进程残留均清理为零
        - 本机 Codex CLI 0.145.0 已提供稳定 plugins、hooks、skills 与 MCP 管理能力
        - Hook 文档提供当前模型、用户提示、回合标识和最终助手消息；同步 Hook 可在继续生成前等待，异步 Hook 可能乱序且会在会话结束时取消
        - 插件可捆绑本地 stdio MCP 服务；Hook 可通过 PLUGIN_DATA 持久化私有状态，但本次旧式 MCP 进程没有获得同一变量
        - 远程 MCP 的 OAuth 令牌由宿主附着到 MCP 调用；没有证据表明任意 Hook 网络请求自动继承该令牌
        - 当前 CLI 没有临时 plugin-dir 参数；插件需先加入 marketplace 再安装，会修改 Codex 本地配置和缓存
        - 本机 enable_mcp_apps 为未启用的开发中能力，不能据此承诺 Codex 内嵌牌桌
        - 已新增项目内无限注德州扑克领域状态机与四身份表级权威层，覆盖四轮下注、短额 all-in、主池/多层边池、平池奇数筹码、标准摊牌、超时与自愿亮牌
        - "`npm test` 当前 23/23 通过，包含原有 11 项 Codex 桥接回归；四个隔离 Chromium context 已经由真实 UI 完成 checkdown、四人 all-in 和加注弃牌后自愿亮牌，控制台错误为 0"
        - "最新 `npm run table` 已验证权威服务、本地桥、四席观察者零底牌及 Ctrl+C 无监听残留；当前仍是单进程内存固定桌"
      claim_limits:
        - 尚未证明当前 Codex 桌面会渲染插件 MCP UI
        - 安装后的新能力应在新聊天或新 CLI 会话使用；旧会话热激活不作为产品承诺
        - 已证明 UserPromptSubmit 原始入口、同步预公开、Stop 最终回答与重入保护的真宿主最小路径；尚未覆盖所有取消、并发、hosted tool 与跨平台组合
        - 本地跨进程 IPC、幂等、失败关闭和 MCP 补交已经在真宿主受控探针中执行；尚未证明生产 OAuth、真实断线重放或多人并发安全
        - 当前本地事件不能作为远端可验证的 Codex 来源证明
        - 当前可以声称 Codex 插件宿主聚焦探针通过，不能声称完整产品集成、Codex 桌面原生牌桌 UI 或生产就绪
        - 当前可以声称本地四人牌桌垂直切片已实现并通过 AI 验收，不能据此声称用户已经接受、四个真实 Codex 会话已经绑定或完整 MVP 已完成
    candidates_unknowns_history:
      candidates:
        - selected: Codex 插件 Skill + 同步显式范围 Hook + 捆绑本地 stdio MCP 桥 + 远程权威事件/牌局服务 + 独立 Web 牌桌
        - fallback: 若 Stop Hook 实机不可靠，使用显式 publish_ai_answer MCP 工具提交并回显规范化最终回答
        - deferred: Codex MCP 内嵌 UI，待宿主支持探针通过后作为增强
        - rejected: 独立 OpenAI API 助手，违背无需第二套模型配置与当前会话 AI 的核心价值
        - rejected: Hook 直接调用远端服务，鉴权归属、重连和幂等边界不成立
      superseded_refs:
        - PROJECT-DECISION-LOG.md#DEC-20260825-010
      unknowns:
        - U-TG-CODEX-UI-SUPPORT
        - U-TG-HOOK-RUNTIME-BEHAVIOR
        - U-TG-LOCAL-BRIDGE-AUTH
        - U-TG-CONTEXT-LEAKAGE-GUARD
        - U-TG-CODEX-PROVENANCE-ATTESTATION
      impact_if_resolved:
        - 内嵌 UI 可用时减少窗口切换，但不改变服务端权威与隐私桥接架构
        - 原始入口与 Stop 自动路径已经通过，显式工具回退也已验证；产品期仍需取消、并发与进程生命周期压力测试
        - 本地桥接鉴权与隐私金丝雀通过后才允许连接真实远端环境
  important_unknowns:
    - unknown_id: U-TG-CODEX-UI-SUPPORT
      owner: evidence_unknown
      status: open
      blocking_boundary: evidence_claim
      blocked_scope_refs: []
    - unknown_id: U-TG-HOOK-RUNTIME-BEHAVIOR
      owner: evidence_unknown
      status: resolved
      blocking_boundary: none
      blocked_scope_refs: []
      resolution_ref: docs/HOST-PROBE-CHECKLIST.md#已执行验收
    - unknown_id: U-TG-LOCAL-BRIDGE-AUTH
      owner: professional_design_unknown
      status: open
      blocking_boundary: release
      blocked_scope_refs: []
    - unknown_id: U-TG-CONTEXT-LEAKAGE-GUARD
      owner: professional_design_unknown
      status: open
      blocking_boundary: evidence_claim
      blocked_scope_refs: []
    - unknown_id: U-TG-CODEX-PROVENANCE-ATTESTATION
      owner: professional_design_unknown
      status: resolved
      resolution_ref: PROJECT-DECISION-LOG.md#DEC-20260825-011
  artifact_validation:
    revision_id: PI-TG-CODEX-BRIDGE-R4
    status: pass
    receipt_ref: PROJECT-UNDERSTANDING/CODEX-BRIDGE-RECEIPT.json
    generation_context_ref: .dual/CODEX-BRIDGE-GENERATION-CONTEXT.json
    generation_context_sha256: 40026d4f3fbab75bf70996686c375ab1419d1474d527082d230bfd7429c1dca5
    repair_attempts: 1
    validated_checks:
      - actual_hashes
      - human_orientation
      - human_project_position
      - projection_binding
      - owner_reads
      - project_route_reads
      - navigation_context
      - route_permission
      - unknown_integrity
      - impact_isolation
      - scope_isolation
      - operation_policy
      - required_authority_findings
  freshness: refresh_required
  protected_semantic_delta: product_rules_confirmation_required
  semantic_reconciliation: charters_aligned_rules_pending
  collaboration_state: hold_affected_for_rule_confirmation
  execution_closure_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#l2-public-ai-exchange-truth-persistence-result
  dependent_implementation_acceptance: revalidation_required
  route_permission:
    requested_route_ref: TG-L2-PLAYABLE-TABLE@DEC-20260827-022
    decision: held
    basis_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260827-017
      - PROJECT-DECISION-LOG.md#DEC-20260827-018
      - PROJECT-DECISION-LOG.md#DEC-20260827-019
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
      - PROJECT-DECISION-LOG.md#DEC-20260827-021
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - CLAUDE-SEMANTIC-REVIEW-20260826.md#claude-round-2-final
      - PROJECT-PLAN-TREE.md#semantic_baseline
  next_owner: direct_dual_ai_semantic_alignment_rules_stage_a_playable_table

capability_inventory:
  contract: dual-ai.capability-inventory.v1
  status: initialized
  carrier: STATUS.md
  last_reconcile:
    mode: material_scope_incremental
    completed_at: 2026-08-25
    vcs_anchor: none
    anchor_relation: unavailable
    relevant_surface_digest: 173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
    working_evidence_digest: 173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
    reliability: reliable
    checkpoint_receipt: STATUS.md#capability_inventory
  active_count: 2
  active_capability_refs:
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
```

## 连续性边界

宿主中立 L0、共享宿主入口 L1 与三个当前 MVP L2 已分别由用户确认并通过内容寻址校验，旧 Codex 专属 L0/L1/会话、公开测试桌、被动问答章程及其规则转为已替代历史。当前 L0-L2 语义基线为 `confirmed`；实现仍停在规则门禁，因为 Ready/掉线/退出/亮牌以及公开 AI 的精确规则尚未获得后继合同权威。既有 Codex 桥接、多人牌桌与座位旁气泡测试只按原记录保留，本轮没有安装依赖、重跑 `npm test` 或 Playwright，也不把历史 23/23 冒充本轮实测。现有证据仍不覆盖新私人房牌桌、双宿主能力、跨宿主私人房、座位恢复、Codex 或 Claude 的事件驱动主动唤醒、完整 MVP、生产认证/持久化/远程并发、隐私完备性、用户接受或发布状态。
