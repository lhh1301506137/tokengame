# TokenGame 项目状态

更新日期：2026-08-29

## 初始化状态

- 初始化分类：`fresh_init`
- 框架就绪度：`continue_ready`
- 当前阶段：`prototype`
- 当前目标：当前 MVP 的 L0-L2 章程、可玩牌桌四条体验规则和公开座位 AI 七条交流规则均已确认并完成唯一绑定；宿主中立权威内核已按这些合同实现并闭合 Codex 复核 F1–F6；新牌桌 UI 已与该内核形成单栈产品闭环，四个隔离浏览器上下文的多人回路已闭合。共享 HostAdapter 合同的底座与模型面适配器已实现并过一致性套件，自动化验收已打到第 12 手；HostCommandAdapter 尚未实现（要动已闭合的单栈宿主，且合同拆分待 Codex 裁决）；真实宿主主动唤醒（Gate 5）与四真人 UAT 仍未通过，不得写成已验证。
- 当前路径：`SC-TG-L0-ROOT-20260827-B`、`SC-TG-L1-HOST-ENTRY-20260827-A`、`SC-TG-L2-SESSION-LAUNCH-20260827-B`、`SC-TG-L2-PLAYABLE-TABLE-20260827-D` 与 `SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D` 是现行已验证语义主链；语义完成不等于相关产品能力已经实现。
- 裸指令 `继续`：在本次显式语义流程回交后，只授权恢复同一已确认路线的专业刷新与开发；不会扩大产品范围，也不会授权发布、部署或付费服务。

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
  active_task_status: in_progress
  active_task_scope: fullstack
  active_task_context_curated: yes
  active_task_research: .trellis/tasks/08-26-public-ai-table-talk/research/semantic-candidate-rules-public-ai-exchange-20260827.json
  recommendation: define_shared_host_adapter_contract_then_claude_side_adapter
  reason: single_stack_product_loop_closed_in_browser_but_no_shared_host_adapter_contract_exists_yet

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
  alignment_stage: truth_persistence
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
  current_table_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022
  current_public_ai_contract_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
  candidate_confirmation_ref: none
  route_rebase_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#semantic-change-20260827
  next_action: implement_confirmed_semantics_no_further_semantic_change_pending

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
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - PROJECT-DECISION-LOG.md#DEC-20260827-023
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
      - single_stack_browser_loop_closed
      - host_adapter_contract_next
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
        - "已按 D 版合同实现宿主中立权威内核：`room-store.cjs`（房间/席位生命周期）、`seat-ai-store.cjs`（公开 AI 七条规则）、`table-orchestrator.cjs`（咬合三内核、不新增语义）、`action-ledger.cjs`（官方动作幂等账）、`due-work.cjs`（到期驱动）、`command-surface.cjs`/`command-server.cjs`/`host-surface.cjs`（唯一命令词表与进程外传输）、`host/seat-custody.cjs`（凭据本机托管）、`run-table-core.cjs`（进程入口 `npm run core`）"
        - "`npm test` 2026-08-28 实测 351/351 通过、fail 0，工作树与全新克隆两处各跑一次；旧探针栈的 11 项 Codex 桥接回归仍在其中。不再引用历史 23/23 或本轮之前的 336/336"
        - "Codex 实现复核 F1–F6 已逐条闭合，每条都有失败复现、修复与回归测试：F1 `99acd63`、F2 `444607c`、F3 `684d680`+`ffbcf51`、F4 `2e18b94`+`6bf7f30`、F5 `d8caeec`、F6 `fb3f323`；回应文档 `3081d01`"
        - "八个变异规格在修好的驱动下全部重跑：f1 15/15、f2 18/18、f3 14/14、f4 14/14、f5 28/28、f6 14/14、web-host-boundary 16/16、vacuous-empty-collections 3/3，合计 122 个变异 122 杀掉 0 存活 0 未评估。此前 F3/F4 的 14/14 是假绿，原因是判定用 `grep -E \"^not ok\"` 而 Node 默认 reporter 不输出 TAP，已在 `675a7d3` 修好并在 `docs/CLAUDE-REVIEW-RESPONSE-20260828.md` 更正"
        - "`vacuous-empty-collections.json` 是自查产物，问的是另一个问题：把被断言的集合替换成空数组，整个测试是否仍然通过。判定刻意不是「某条断言是否空过」而是「集合空了是否产生假绿」——三条变异全部 KILLED，说明 holdem / mcp / 协调器三条路径上的 `every()` 都有别的断言兜住"
        - "`test/two-process-table.test.cjs` 已用两个独立 Node 进程在同一份权威状态上打完一手牌，实证 L0 宿主中立性；错凭据进程失败且权威状态不变"
        - "最新 `npm run table` 已验证旧探针栈的权威服务、本地桥、四席观察者零底牌及 Ctrl+C 无监听残留；该栈现已被替代，作为历史证据冻结保留"
        - "新牌桌 UI 已与宿主中立内核形成单栈闭环：`host/table-web-host.cjs`（会话、连接、动作转发、出口泄漏扫描）、`host/table-view-model.cjs`（权威投影 → `tokengame.table-view.v1`）、`run-table-web.cjs`（进程入口 `npm run web`）、`web/table/`（原生 HTML/CSS/JS 牌桌）。浏览器拿不到权威原始事件与秘密，也拿不到席位凭据——凭据留在协调器进程内"
        - "`test-support/table-web-acceptance.mjs` 用四个隔离浏览器上下文跑通完整回路：建房/邀请码加入 → 逐席公开范围确认 → Ready 与倒计时 → 连续三手无限注德州（跨手筹码延续）→ 玩家公开聊天 → 座位 AI 公开发言与沉默（THINKING/DEGRADED/OFFLINE/OFF 与迟到标注）→ 掉线与 120 秒保留窗恢复 → 暂离 → 离桌 → 逐查看者本地隐藏。2026-08-28 实测 80 条断言全过、控制台错误 0、exit 0；工作树四次、全新克隆三次"
        - "座位 AI 用 `test-support/scripted-model-adapter.cjs` 这个确定性 fake 宿主适配器驱动，覆盖公开/沉默/降级/离线各分支；它证明的是内核与 UI 的咬合，不能据此声称真实宿主模型能力已验证"
        - "【2026-08-28 复开勘误】上面那条「80 条断言全过」与当时的证据一致，但它掩盖了五处「有代码、有按钮、有权威支持，而功能从未成立」的缺口——共同点是它们都不会红：没有失败的测试，没有报错，画面上也看不出异常。80 条断言之所以全过，是因为没有一条走到那些路径上。逐条见 `PROJECT-PLAN-TREE.md#TG-EU-SINGLE-STACK-WEB-TABLE` 的 `errata`：连接租约不存在（真实关页面/刷新/拔网线之后席位永远显示在线）、自愿亮牌恒假（`can_reveal` 查了一个权威侧不存在的 `settlement.payouts`，按钮一次都没出现过，因此客户端缺参数的缺陷也从未被触发）、同意门在绑定之后而非之前、换绑或改桌规之后同意门再也不出现（`public_scope_confirmed` 算的是「存在过一份确认」）、畸形上游投影让 `/api/view` 回 500 而页面停在上一帧"
        - "【2026-08-28 复开后实测】`npm test` 498/498 通过、fail 0；`npm run gate` MUTATION_TOTAL=226 KILLED=226 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 `artifacts/acc-item7-redact` 150 条断言全过、控制台错误 0、四个隔离上下文、打到第 4 手、24 张截图（artifacts/ 被忽略，路径只在本机存在）。新增六个变异规格：connection-lease 16/16、voluntary-reveal 6/6、entry-consent-idempotency 11/11、scope-reconfirmation 12/12、view-model-degradation 7/7、acceptance-result 15/15。不再引用本轮之前的 351/351、122 个变异或 80 条断言作为当前实测"
        - "【2026-08-28 复开后工具修正】变异驱动此前对非 JS 文件一律判 INVALID（`node --check` 认扩展名），于是 HTML 结构与 CSS 规则这两类产品真的依赖的不变量永远不会被评估——报出来是「未评估」而不是「防线有洞」。已按扩展名分流，`web/table/index.html` 与 `table.css` 上的变异现在可判定"
        - "【2026-08-28 适配器合同与多手验收实测】提交范围 `46d5b5d..0e80395`。`npm test` 644/644 通过、fail 0、skipped 0；`npm run gate` MUTATION_TOTAL=315 KILLED=315 SURVIVED=0 SKIPPED=0 GATE=PASS；浏览器验收 201 条断言全过、控制台错误 0、四个隔离上下文、**打到第 12 手**、27 张截图，连续三轮干净运行。新增三个变异规格：adapter-contract 34/34、seat-model-adapter 14/14、multi-hand-verdict 41/41。验收新增三节：8c 连续打到第 11 手并逐手查筹码守恒、8d 五种畸形投影的有界降级、9d 有人跟的全下摊牌（浏览器层首次验到「筹码归零的席位不带着 0 筹码进下一手」这条 F1）。不再引用本轮之前的 498/498、226 个变异或 150 条断言作为当前实测"
        - "【2026-08-28 宿主中立底座】`src/contract/adapter-contract.cjs` 是两份合同的共享底座：三个信封、7 类错误映射（覆盖源码 65 个码）、三层身份（`player_id`/`seat_handle`/`authority_id`，`seat_credential` 刻意不在其中）、生命周期迁移、能力协商。`src/host/seat-model-adapter.cjs` 是真实的模型面适配器，过一致性套件。内核里不出现 Claude/Codex 专有判断，由 `test/adapter-contract.test.cjs` 扫源码盯着；唯一命中是 `src/authority/table-store.cjs` 里一个用户可见的牌桌显示名，文件带 `SUPERSEDED_BY_` 冻结标记，未擅自改，列为待裁决项。HostCommandAdapter 未实现：它要动已闭合的 `table-web-host.cjs`，且两份合同的拆分该由 Codex 先裁"
        - "【2026-08-28 判定式可测性】8c/8d/9d 的判定原本写在 `.mjs` 里，而 `.mjs` 的逻辑单元测试装不进来——装不进来的判定式等于没有测试（上一轮「中止却判通过」正是这么漏过去的）。`chipConservation`/`degradationVerdict`/`handCoverage` 抽进 `test-support/acceptance-result.cjs`，`test/multi-hand-verdict.test.cjs` 39 条盯着，含盯调用点的静态断言"
        - "【2026-08-28 证据完整性修正】第 7 轮运行死在路由回调的未处理拒绝上，它绕过 `main` 的 `catch`，`finally` 不跑、`result.json` 写不出来，于是目录里留下的是上一轮那份——上一轮恰好通过的话，崩掉的运行看起来和通过一模一样（与 negctl6 同类，载体换成陈旧文件）。三处修：路由回调包 try 且吞下的错误由第 13 节结账、开跑前先删 `result.json`、加 `unhandledRejection` 处理器。负控实测：退出码 1、判定文件不留下、stderr 写明原因"
        - "【2026-08-28 如实记为缺口】边池分层在浏览器层不可观测：投影只给 `pot_total`（`src/host/table-view-model.cjs:456`），引擎算出的 `pots` 没进 `tokengame.table-view.v1`。没有写读 `undefined` 的断言（那种断言永远为真），由 `test/holdem-engine.test.cjs` 与 `test/cross-hand-stacks.test.cjs` 在单元层覆盖。是否投影出去列为待裁决项"
        - "【2026-08-29 模型可见凭据边界】提交 `287f083`。三个模型可见出口（成功 result、核心错误 details、本地拒绝 details）此前各自净化，成功路径回显 `recovery_credential`，且 `adapter.surface.custody` 可从公开属性取到句柄与凭据映射。改为唯一托管净化 + `assertNoLeak`，命中秘密时**失败关闭**（返 `credential_leak`），不是打码后继续；`#custody`/`#dispatch`/`#surface`/`#issued` 改成真正的 JS 私有字段，不靠 `inspectableState`「选择不展示」。顺序是载荷：先扫后洗，反过来 `sanitizeResult` 会先把 `recovery_credential` 剥掉，扫描什么都找不到，于是上游缺陷被静默修好。字段名扫描收窄到键位（`\"field\":` 形式）——不收窄的话 `seat_identity_not_model_supplied` 这个成功拦截的 `details.field` **值**恰好是 `\"recovery_credential\"`，会被误判成泄漏，而把一次成功拦截读成泄漏会引人去删那份报告。本轮实测：`test/model-visible-credential-boundary.test.cjs` 26 项全过（只用合成秘密）；`credential-boundary` 变异 19/19 杀掉；`npm test` 670/670；`npm run gate` 334/334 GATE=PASS。55 节点对象图搜索：通向 custody 的路径无，对照组仍可取出。本地拒绝出口没有可构造的行为负例（`ModelSurfaceError.details` 只有三种形状、字段全是字面量、命令名在到达 `#surface.call` 之前已被拦），只有静态门禁存在性断言，限制写进测试与 `excluded`"
        - "【2026-08-29 浏览器门禁根因修复】提交 `5235bf5`。B.1 三类证据都带 player/阶段/method/URL/status，新增「窗口外非 2xx/3xx 必须为 0」——补的是结构性盲区：浏览器不为 4xx 打控制台日志（fetch 拿到 403 是「成功收到响应」），只查控制台的脚本永远不会因为「请求发出去了但被拒」而红。豁免按语义不按文本。B.2 偶发 403 有三个来源：测试窗口竞态（证据按响应到达时刻归类，改为按发出时刻，用 WeakMap 记发出时的阶段与窗口状态）、离桌竞态（await 期间的轮询带着即将作废的凭据）、掉线竞态（更坏：`touchConnection` 对被摘掉的连接 id 会重新建连，那一跳轮询把刚刚的掉线撤销，保留窗根本没走；响应围栏挡不住，请求已经到了服务端）。两条产品竞态由「先 stopPolling 再发请求」修好；`refresh` 里刻意不中止上一次，重叠由 await 之后的围栏处理。双向验证：旧客户端 1 条 403 + 1 条控制台错误，新客户端 0 条。B.3 加确定性发牌（sfc32 + 拒绝采样，入口三道约束：只自带内核、只回环、启动报指纹不报原文）**还不够**——第一版种子正好让全下方赢，破产分支被稳定地跳过，而报告写着「确定性发牌，两次名单一致」；稳定缺失比随机缺失更坏。§9d 改成重复「短码全下、大码跟、其余弃」直到真有一席归零，预算用尽就红，失败收集到循环外一次性判定。本轮实测：`npm test` 698/698 fail 0 skipped 0；`npm run gate` MUTATION_TOTAL=358 KILLED=358 SURVIVED=0 SKIPPED=0 GATE=PASS；新增两个变异规格 deterministic-deck 9/9、poll-lifecycle-race 10/10，multi-hand-verdict 扩到 46/46；浏览器验收 **工作树连跑 3 次 + 全新无硬链接克隆连跑 3 次，六次全 EXIT=0、各 209 项全过、到第 13 手、名单完全一致**，破产分支六次都走到（第 2 轮归零 bob）。不再引用本轮之前的 644/644、315 个变异或 201 条断言作为当前实测"
        - "【2026-08-29 顺带修掉两处永不会红的断言】六面骰那条均匀性检查查不出「拒绝采样退化成取模」：2^32 对 6 的偏差约 1.4e-9，比 5% 容差小九个数量级，也就是说删掉拒绝采样在那条下面永远绿。补一条上界取 3*2^30 的——拒绝采样下最低段占 1/3，取模下占 1/2，实测 33.3% 对 50.0%。另一处：四条 `xxxFailures` 断言原先只查串在文件里出现过，而每条 check 的 detail 里也有同一个三元，于是把条件位换成 `true` 仍然满足；改为断言 check 的**条件位**。两处都是变异存活指出来的，不是审读发现的"
        - "【2026-08-29 记为已知代价】`deterministic-deck` 里两条变异杀不掉，且是实测而非推断：去掉 sfc32 的 12 次预热丢弃、把四个 FNV 起点改成同一个，相邻种子 1–64 各洗第一副牌的三项指标与基线无法区分（互不相同 64/64、前八张同位同牌 1.85%/1.81%/1.97%（随机期望 1.92%）、第一张用到的牌面 39–40/52）。原因是 `seedToState` 那轮额外搅拌已承担实际去相关，两者是第二道防线。留着代码但不为它们编阈值——那样的断言只会在改动无关代码时红。`poll-lifecycle-race` 十条中多数只由源码断言杀：`web/table/table.js` 是 classic script，没有测试能 require 它，行为侧兜底只有验收那条「窗口外非 2xx/3xx 为 0」。两处代价都写进各自 `excluded`"
        - "【2026-08-29 措辞勘误·不改写上条】上面 2026-08-28 那条里的「两份合同」是当时的说法，保留原文不改。措辞已于本日更正为「一套 HostAdapter 协议、`host_command` 与 `seat_model` 两个权限剖面」：除 `commands` 之外信封、错误映射、身份层、生命周期、能力协商全部共享，说成两份合同会让人以为要各自验证一遍，而一致性套件是同一批检查跑两个剖面。**关闭的是说法与结构不符，不是改了结构**——`ADAPTER_ROLES` 本来就按对象身份引 `HUMAN_COMMANDS`/`MODEL_COMMANDS`，没有拷贝。真正必须分开的只有命令清单：合成一张表意味着权限差别只能靠运行期检查表达，漏一条就是模型拿到了下注权限"
        - "【2026-08-29 请求信封落到真实路径】提交 `e6397c3`。`requestEnvelope` 此前**零个非测试调用方**——「每次请求都有信封」只在纯函数测试里成立，而合同文档把它写成了协议。二选一里选接线不选删除：响应带版本、请求不带，服务端因此无法察觉一个跑在别的合同上的客户端，而这正是版本号存在要回答的那句「你认得我说的话吗」。两个传输（`HttpCoreClient`、MCP `coreRequest`）都改为经 helper 构造；服务端在**令牌之后、派发之前**校验——放在令牌前会把合同版本泄给未授权者，放在派发后跨版本客户端拿到的是「未知命令」，它会去查命令表而那张表在它那一版里是对的。缺版本也拒：放行等于让这条检查对任何从不带版本的客户端永远不会红。版本号移到 `src/shared/contract-version.cjs`——让权威层 require 合同层会把依赖方向倒过来，抄一份则会漂移（与禁止复制命令表同一条理由）"
        - "【2026-08-29 单一来源要行为测试才钉得住】`request-envelope` 变异首轮 12 条里 4 条存活，全是同一类：抄一份数字、或传输自己拼 `contract_version: 1` 字面量。这类写法**此刻什么都不坏**——两个数相等、形状也对、既有断言全绿；坏的是下一次改版本号时只有一侧跟着改。源码断言（查 require 那行在不在）是弱答案，钉的是文本。改为行为测试：`test/contract-version-single-source.test.cjs` 把那唯一的来源改掉，再看合同层请求信封、响应信封、`HttpCoreClient` 线上 body、MCP 线上 body、服务端版本闸门五处是否都跟着变，测的是「值从哪儿来」。MCP 那侧 `coreRequest` 没有导出也不收注入的 fetch，用 `TOKENGAME_COMMAND_ORIGIN` 指向一个记账用的假核心取到落地字节，没有为可测性给产品开测试专用出口。fake 版本号由真值加偏移算出，不写死——写死的数字有一天会撞上真版本，那时这些测试会在「fake 等于真值」的情况下继续全绿。逐条验过归因：四条变异各自被对应那条断言杀掉，不是被别的测试连带杀掉"
        - "【2026-08-29 记为已知代价】`withVersion` 里的 `await body()` 杀不掉，实测而非推断：改成 `return body()` 后五条测试仍然 pass 5 fail 0。原因是 `const { CONTRACT_VERSION } = require(...)` 在模块加载那一刻取值，每次读版本都落在 body 的同步前缀里，早于任何 await 也早于 finally；外层 `await` 又因 promise 同化仍会等到 body 结束。留着它是给将来「在 await 之后才读版本」的测试用的。此刻硬要杀它只能专门造一条依赖还原时机的测试——那是为了杀变异而写测试，方向反了。写进 `excluded`"
        - "【2026-08-29 浏览器验收覆盖不到这条改动】验收跑的是 `core_transport=in_process`，而 `InProcessCoreClient` 直接调 `surface.dispatch`、根本不构造信封，所以 209 项全过**不构成** HTTP 传输已验证的证据。远端那条路另探：起真内核 + Web 牌桌设 `TOKENGAME_COMMAND_ORIGIN`，确认 `core_transport=http` 且过 HTTP 建房 200；双向验证——把版本从客户端摘掉会红成 `contract_version_missing`。探针在 `artifacts/`（已 gitignore），不入库、不计入门禁。远端模式跑不了整套 209 项：`run-table-core.cjs` 不接受牌堆种子，确定性发牌那几条断言只对自带内核成立，没有为了让它通过去弱化那些断言"
        - "【2026-08-28 仍未验证】真实宿主 Gate 5（事件驱动主动唤醒）未通过，四真人 UAT 未做。本轮全部证据来自自动化，不能代替实机门禁；主动唤醒不得写成已验证"
      claim_limits:
        - 尚未证明当前 Codex 桌面会渲染插件 MCP UI
        - 安装后的新能力应在新聊天或新 CLI 会话使用；旧会话热激活不作为产品承诺
        - 已证明 UserPromptSubmit 原始入口、同步预公开、Stop 最终回答与重入保护的真宿主最小路径；尚未覆盖所有取消、并发、hosted tool 与跨平台组合
        - 本地跨进程 IPC、幂等、失败关闭和 MCP 补交已经在真宿主受控探针中执行；尚未证明生产 OAuth、真实断线重放或多人并发安全
        - 当前本地事件不能作为远端可验证的 Codex 来源证明
        - 当前可以声称 Codex 插件宿主聚焦探针通过，不能声称完整产品集成、Codex 桌面原生牌桌 UI 或生产就绪
        - 当前可以声称本地四人牌桌垂直切片已实现并通过 AI 验收，不能据此声称用户已经接受、四个真实 Codex 会话已经绑定或完整 MVP 已完成
        - 当前可以声称宿主中立权威内核已实现、新牌桌 UI 与之形成单栈闭环、四个隔离浏览器上下文的多人回路已闭合且自动化测试与变异测试通过；不能声称任一真实宿主已接入——桌面侧走的是确定性 fake 适配器，`SEAT_AI` 背后没有真实模型
        - 浏览器验收的稳定性结论以全新克隆为准。工作树连续三次全绿之后，全新克隆第一次仍暴露出读页竞态与五条空断言；只在工作树跑通不能声称稳定
        - "`SAME_VISIBLE_TASK_SPIKE_V1` 未执行。无点击主动唤醒在两个宿主上都未验证，不得由自动化测试或源码推断代替"
        - Codex 与 Claude 的真实宿主 Gate 5 均未通过；本会话在终端 Claude Code 中，没有 Claude Desktop / Cowork 界面，跑不了实机门禁
        - "`PLAYABILITY_GATE_V1` 的自动化层与四真人试玩层均未执行；确定性 fake SEAT_AI 的分支覆盖不能冒充真实模型闭环"
        - 尚无共享 HostAdapter 合同；Claude 侧适配器未开始，不能声称双宿主已接同一内核
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
  freshness: current
  refreshed_at: 2026-08-28
  refresh_basis:
    - docs/CODEX-IMPLEMENTATION-REVIEW-20260828.md
    - docs/CLAUDE-REVIEW-RESPONSE-20260828.md
    - docs/ACCEPTANCE-EVIDENCE.md#四上下文浏览器验收
    - npm_test:351_pass_0_fail_measured_2026-08-28
    - npm_test:498_pass_0_fail_measured_2026-08-28_after_reopen
    - mutation_gate:226_killed_0_survived_0_skipped_measured_2026-08-28_after_reopen
    - fresh_clone_rerun_at_2549474:498_pass_226_killed_150_browser_assertions_GATE_PASS
    - browser_acceptance:150_pass_0_fail_measured_2026-08-28_after_reopen
    - mutation_specs:f1_15,f2_18,f3_14,f4_14,f5_28,f6_14,web_host_16,vacuous_3,total_122,survivors_0
    - browser_acceptance:80_assertions_0_console_errors_exit_0_clean_clone_x3
    - npm_test:644_pass_0_fail_measured_2026-08-28_adapter_contract
    - mutation_gate:315_killed_0_survived_0_skipped_measured_2026-08-28_adapter_contract
    - browser_acceptance:201_pass_0_fail_0_console_errors_27_screenshots_hand_12_x3_runs
    - mutation_specs_added:adapter_contract_34,seat_model_adapter_14,multi_hand_verdict_41
    - docs/HOST-ADAPTER-CONTRACT.md
    - commit_range:46d5b5d..0e80395
  protected_semantic_delta: none
  semantic_reconciliation: all_current_mvp_charters_and_protected_rules_aligned
  collaboration_state: implementation_in_progress_on_confirmed_route
  execution_closure_ref: .trellis/tasks/08-26-public-ai-table-talk/prd.md#public-ai-rules-truth-persistence-result
  dependent_implementation_acceptance: kernel_revalidated_product_loop_and_host_gates_still_unverified
  route_permission:
    requested_route_ref: TG-L2-PUBLIC-AI-EXCHANGE@DEC-20260827-023
    decision: granted
    granted_scope: local_implementation_of_confirmed_l0_l2_semantics
    excluded_from_grant:
      - real_host_gate_5_pass_claims
      - click_free_proactive_wake_claims
      - user_experience_acceptance_claims
      - release_deploy_or_production_security_claims
    basis_refs:
      - PROJECT-DECISION-LOG.md#DEC-20260827-017
      - PROJECT-DECISION-LOG.md#DEC-20260827-018
      - PROJECT-DECISION-LOG.md#DEC-20260827-019
      - PROJECT-DECISION-LOG.md#DEC-20260827-020
      - PROJECT-DECISION-LOG.md#DEC-20260827-021
      - PROJECT-DECISION-LOG.md#DEC-20260827-022
      - PROJECT-DECISION-LOG.md#DEC-20260827-023
      - CLAUDE-SEMANTIC-REVIEW-20260826.md#claude-round-2-final
      - PROJECT-PLAN-TREE.md#semantic_baseline
  next_owner: primary_ai_shared_host_adapter_contract_then_claude_side_adapter

capability_inventory:
  contract: dual-ai.capability-inventory.v1
  status: initialized
  carrier: STATUS.md
  last_reconcile:
    mode: material_scope_incremental
    completed_at: 2026-08-28
    vcs_anchor: ab29e34
    anchor_relation: head_at_reconcile
    relevant_surface_digest: superseded_see_note
    working_evidence_digest: superseded_see_note
    superseded_digest: 173d600bc05a53004b17f5fe6faf6d30d514063a865965254889a3d4482fb3c0
    superseded_digest_scope: package.json + src/** + web/** + plugins/tokengame/**
    superseded_digest_note: >-
      该摘要在 2026-08-25 生成，覆盖面自那以后已被 a8763c4..ab29e34 大幅改写（先是
      room-store / seat-ai-store / table-orchestrator / action-ledger / due-work /
      command-surface / command-server / host-surface / seat-custody / run-table-core，
      本轮又新增 host/table-web-host / host/table-view-model / run-table-web / web/table/**）。
      仓库内没有生成该摘要的脚本，算法不可复现，因此不自行编造新值冒充同一算法的结果。
      本轮继续改用 Git 提交范围作为可独立复核的锚点。
    reliability: anchored_by_git_range
    git_range: a8763c4..ab29e34
    checkpoint_receipt: STATUS.md#capability_inventory
  active_count: 2
  active_capability_refs:
    - TG-L2-PLAYABLE-TABLE
    - TG-L2-PUBLIC-AI-EXCHANGE
  implemented_kernel_units:
    - TG-EU-ROOM-LIFECYCLE
    - TG-EU-SEAT-AI-EXCHANGE
    - TG-EU-HOLDEM-ADJUDICATION
    - TG-EU-ORCHESTRATION
    - TG-EU-HOST-NEUTRAL-SURFACE
    - TG-EU-SEAT-CUSTODY
    - TG-EU-REVIEW-CLOSURE-F1-F6
  implemented_product_units:
    - TG-EU-SINGLE-STACK-WEB-TABLE
  unverified_units:
    - TG-EU-HOST-ADAPTER-CONTRACT
    - TG-EU-CLAUDE-HOST-ADAPTER
    - TG-EU-PROACTIVE-WAKE-SPIKE
    - TG-EU-PLAYABILITY-GATE
  unit_index: PROJECT-PLAN-TREE.md#plan_tree
```

## 连续性边界

宿主中立 L0、共享宿主入口 L1、三个当前 MVP L2、可玩牌桌的 Ready/掉线/退出/亮牌规则，以及公开座位 AI 的默认公开、主动评估、反刷屏、并发归并、迟到、关闭降级与本地隐藏规则，均已分别由用户确认并通过内容寻址校验；旧 Codex 专属 L0/L1/会话、公开测试桌、被动问答章程及其规则转为已替代历史。当前 L0-L2 语义基线为 `confirmed`，不再存在待确认的当前 MVP 产品规则门禁。

Project Intelligence 刷新门禁已于 2026-08-28 通过：宿主中立权威内核按 D 版合同实现，Codex 实现复核 F1–F6 逐条闭合，新牌桌 UI 与同一内核形成单栈闭环。`npm test` 本轮实测 351/351（工作树与全新克隆各一次），八个变异规格全部重跑合计 122 个变异 122 杀掉 0 存活，浏览器验收 80 条断言全过、控制台错误 0、exit 0（工作树五次、全新克隆三次）。此前 F3/F4 的 14/14 属假绿并已更正，理由见 `docs/CLAUDE-REVIEW-RESPONSE-20260828.md`。旧探针栈（`EventStore` / `TableStore` / `server.cjs` / `web/app.js`）按原记录保留为已替代历史，其 Codex 桥接回归仍在测试集中，本轮未重跑该栈的 Playwright 烟测，也不把历史 23/23 冒充本轮实测。

本轮浏览器验收自身查出并修掉的缺陷记在 `PROJECT-PLAN-TREE.md#TG-EU-SINGLE-STACK-WEB-TABLE` 与 `docs/ACCEPTANCE-EVIDENCE.md`，其中两条值得单独记住：全新克隆第一次跑就暴露了工作树连续三次全绿都没暴露的读页竞态；同一份失败产物又暴露出五条在空数据上无条件通过的断言——断言在无数据时通过比没有这条断言更糟，它把缺口报成绿色。

仍未覆盖：`SAME_VISIBLE_TASK_SPIKE_V1` 未执行；Codex 与 Claude 的真实宿主 Gate 5 均未通过，无点击主动唤醒在两个宿主上都未验证；共享 HostAdapter 合同与 Claude 侧适配器未开始；`PLAYABILITY_GATE_V1` 的自动化层与四真人试玩层均未执行。座位 AI 在验收里由确定性 fake 适配器驱动，真实宿主模型能力未接入。生产认证/持久化/远程并发、隐私完备性、用户接受与发布状态同样不在现有证据内。`U-TG-LOCAL-BRIDGE-AUTH` 仍是开放的专业设计未知，阻塞发布。
