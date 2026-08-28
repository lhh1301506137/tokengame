# 审查记录

## 2026-08-25：首次框架初始化

- 审查范围：仅检查项目控制面与后续开发就绪条件。
- 已观察事实：项目目录中存在两个创意输入文本；初始化前不存在项目级 Dual 路由、状态、审查记录、质量信号、Trellis 配置或产品代码。
- 框架决策：采用 `Adaptive（v2.01-A）` 运行配置与 `standard` 项目采用档；暂不创建 Trellis。
- 决策依据：项目预期涉及插件接入、实时多人状态、权限与公开信息边界，值得使用持续治理；但当前没有经确认的产品语义基线，重型执行编排尚无可靠任务边界。
- 本次未执行：未解释创意文本的产品含义，未建立架构，未生成产品代码，未安装依赖，未访问网络。
- 当前阻塞：产品语义基线状态为 `absent`，需由独立的 `$dual-ai-semantic-alignment new_baseline` 流程建立候选并交由用户确认。
- 审查结论：初始化控制面可验收；产品开发尚不可启动。
- 后续复核点：语义基线确认后，重新判断技术栈、首个纵向切片及是否启用 Trellis。

## 验证证据

- 项目路由：由框架维护脚本创建，需通过同一脚本的 `--check` 检查。
- 治理语言：需由实际字节语言验证器检查 `STATUS.md`、`AGENTS.md`、本文件和 `QUALITY-SIGNALS.md`。
- 幂等性：初始化完成后，路由检查不应再产生修改。

## 2026-08-25：新项目语义基线闭合

- 对齐模式：`new_baseline`。
- 已确认范围：一个 L0 根目标、三个 L1 能力域、三个当前 MVP L2 章程和三项受保护产品规则。
- 当前合同：七个当前 L0-L2 合同均通过决策记录唯一性与摘要校验。
- 历史保留：两个 L2 章程初始合同保留为已替代历史；当前引用已切换到包含产品规则的后继合同。
- 指针闭合：`STATUS.md` 与 `PROJECT-PLAN-TREE.md` 已指向当前合同和下一专业责任人，没有待确认语义指针。
- 当前结论：语义基线为 `confirmed`；这只证明产品含义已经确认，不证明 Codex 接入技术可行、产品已经实现、可运行或可发布。
- 下一专业工作：刷新 Project Intelligence，核实 Codex 接入能力和限制，推导架构与首个可验证纵向切片。

## 2026-08-25：Codex 接入架构核验与产物门失败

- 已核实：Codex 插件可包含 Skill、Hook 与 MCP；Hook 可获得当前模型、专用用户提示、回合标识和最终助手消息，但不提供推理强度字段。
- 架构结论：采用插件分发、显式游戏范围 Hook、MCP/实时服务和独立 Web 牌桌；内嵌 MCP UI 仅作为待验证增强。
- 现实限制：新安装插件通常要求新聊天或新 CLI 会话；自定义 `/tokengame` 不是公开扩展合同，稳定入口使用 `$tokengame` 或插件提及。
- 产物校验：初检发现中文方向字段格式不符合合同；完成唯一一次允许修复后，复核仍因人类简报主题与机器合同主题不一致而失败。
- 停止边界：按照理解产物实际字节门规则，TG-L3-CODEX-BRIDGE-SPIKE 保持阻断；未创建产品代码、未安装依赖、未启动服务。

## 2026-08-25：最高推理强度同会话架构复审

- 审查类型：`same_session_self`；运行时精确模型标识未核实，推理强度由用户明确切换为最高。该复审提高覆盖深度，但不算独立第二审查者。
- 审查范围：既有 TokenGame 产品推理、Codex 插件与 Hook 接入、MCP 鉴权、公开事件顺序、隐私边界、来源标注、UI 承载和首个验证切片。
- 语义结论：已确认的 L0–L2 产品语义与受保护规则没有矛盾，判定为 `acceptable_evolution`；不需要重新要求用户确认产品基线。
- 初始裁决：对 DEC-20260825-010 为 `REQUEST_CHANGES`。核心缺口是旧方案把 Hook 传输和 MCP/远端鉴权混为一层，并低估了模型从同一会话私密上下文向公开回答复述信息的风险。
- 修订决策：以 DEC-20260825-011 替代旧架构，加入捆绑本地 stdio MCP 桥、同步失败关闭的提示预发布、服务端原子请求额度、专用游戏任务、结构化不可信对手输入、显式回答发布回退和不可伪造来源证明的限制。
- 来源证明边界：当前会话确实生成该回合回答，Hook 也可观察模型标识；但用户控制本地插件，因此远端不能把本地事件宣传成平台签名的 Codex 证明。
- 外部审查：未触发。理由是当前只批准一个本地、可逆、无真实数据的聚焦探针，不宣称生产鉴权、隐私完备或发布就绪；在形成首个实质实现单元后再判断是否需要独立审查。
- 反事实门槛：若真实 Codex 探针不能在生成前原子公开提示、Stop 回调出现无法约束的错配/乱序、插件无法捆绑本地桥，或普通提示产生任何桥接/网络流量，则修订路线改为不通过并重新选型。
- 仍未核实：`$`/`@` 入口在 UserPromptSubmit 中的原始表示、Stop 的取消与重连行为、Codex 内嵌 MCP UI、生产 OAuth、本地事件来源证明以及完整多人并发。
- 修订后裁决：文档层面为 `APPROVE_WITH_NOTES`，只允许进入 TG-L3-CODEX-BRIDGE-SPIKE 聚焦探针；完整 MVP 和生产发布仍不获批准。
- 理解工件 R2：生成人类简报、AI 工作合同、证据附录、生成上下文与实际字节收据，主题统一为“TokenGame Codex 会话桥接、隐私边界与公开事件协议”。
- 首次工件校验：因 v4 外部生成上下文与旧式 `expected_*` 参数同时传入而返回 `LEGACY_CONTEXT_FORBIDDEN`；这是校验调用合同错误，不是投影内容错误。
- 唯一修复：移除遗留预期列表参数，将收据记录为一次修复；未修改冻结的 Plan Tree、生成上下文或三份投影内容。
- 复核结果：`pass`。实际哈希、人类方向、人类项目位置、AI 合同、影响隔离、导航、操作策略、owner reads、project route reads、投影绑定、权限、未知项完整性均通过；`generation_context_validated=true`，`projection_binding_validated=true`。
- 恢复结果：旧 R1 失败门已由 R2 实际字节合同恢复。路线从“理解产物阻断”改为允许进入聚焦探针，但 TG-L3 仍是首个未验证点，产品代码、依赖和服务仍未创建。

## 2026-08-25：Codex 桥接本地聚焦探针实施审查

- 实施范围：只实现 TG-L3 的本地回环子切片，包括仓库内插件 Skill、同步 UserPromptSubmit/Stop/PreToolUse Hooks、stdio MCP、本地桥、伪权威事件服务与独立 Web 观察页；未实现完整扑克、真实多人服务、生产鉴权或部署。
- 依赖与安装：产品运行代码仅使用 Node.js 标准库，没有新增第三方项目依赖。插件只存在于 `plugins/tokengame`，未写入 Codex 全局配置、缓存或 marketplace。
- 自动化结果：`npm test` 共 9 项通过。直接执行了普通 Prompt/Stop 零桥流量、公开提示先写事件、最终回答配对、一次请求额度、幂等、截止/关闭拒绝、桥断失败关闭、PreToolUse、MCP stdio 与 UI/HTTP 合同。
- 浏览器结果：技能提供的 Playwright 客户端真实点击关闭和重开窗口；随后真实运行 Hook 子进程，权威事件流按序出现 prompt 与 answer。1440×980 全页检查控制台错误为 0。
- 缺陷与修复：首次点击发现 UI 会按截止时间显示关闭，但服务端只在写操作时结算超时，造成状态分叉。修复为公开状态读取也原子结算过期窗口，并加入“关闭事件只产生一次”的回归测试。
- 来源与隐私边界：普通内容由 Hook 本地解析后直接返回，不进行 IPC；公开内容只含显式提示与最终回答。PreToolUse 是降低泄漏概率的护栏，不覆盖所有 hosted tools，也不能替代专用无秘密游戏任务。
- 能力裁决：本地协议、实现与观察 UI 有直接执行证据；真实 Codex Desktop 插件宿主没有加载，集成、宿主验证与操作生命周期仍不充分。`EC-TG-CODEX-BRIDGE-SPIKE-20260825-A` 因此为 `partial / evidence_pending / advance_allowed: no`。
- CLI 现实：Codex CLI 0.145.0 只有经 marketplace 添加并安装插件的路径，没有临时 `--plugin-dir`。该步骤会改变用户 Codex 本地配置和缓存，超过当前连续执行的关键风险边界，未自动执行。
- Trellis 判断：当前剩余工作是一次受控宿主风险探针，初始化 Trellis 不会降低该风险；建议在宿主探针通过、进入首个多人状态纵向切片前初始化。
- 下一责任人：用户决定是否授权在无秘密专用任务中创建本地 marketplace、安装/信任并在验证后卸载插件；获准后由 Primary AI 按 `docs/HOST-PROBE-CHECKLIST.md` 执行。

## 2026-08-26：Codex 真宿主探针与 R4 回执恢复

- 授权范围：依据 DEC-20260826-012，只在无秘密专用任务中安装仓库本地插件、运行合成文本探针并完整卸载；未接触生产服务、真实秘密、个人数据或公开发布。
- 宿主结果：Codex 0.145.0 真宿主直接通过公开提示预登记、最终回答配对、普通内容零桥流量、重复/关窗拒绝、PreToolUse、MCP 状态调用和桥故障回答补交。
- 运行时修复：桥故障会引发 Stop 重入并用说明文本覆盖原回答；加入 `stop_hook_active` 保护后，原始回答保持不变，自动化与真宿主复测均通过。
- 自动化结果：最终 `npm test` 为 11/11，通过 Stop 重入与 MCP 显式补交新增回归；独立 Web 浏览器证据继续有效。
- 生命周期说明：旧式捆绑 MCP 没有自动获得 Hook 的 `PLUGIN_DATA`，所以补交后的 pending 即时归档仍待统一；Codex exec 刷新还需要产品级 MCP 子进程正常回收策略。
- 清理结果：插件、测试 marketplace、专用信任配置、插件缓存、插件数据、43110/43111 监听和本次 TokenGame MCP 子进程均清理为零。
- R3 状态：第二次验证调用仍携带旧式 expected-context 参数，未获得投影绑定通过；该失败属于调用合同，不是宿主功能反证，R3 没有被提升为当前有效回执。
- R4 恢复：从当前 Plan Tree、Project Intelligence 和宿主证据重新冻结 R4。首次调用确认 `--expected-runtime-profile*` 也属于旧式上下文参数；唯一复检移除全部 `--expected-*` 参数后通过。
- R4 证据：`generation_context_validated=true`、`project_route_reads_validated=true`、`projection_binding_validated=true`；人类方向/项目位置、AI 合同、影响与范围隔离、操作策略、owner reads、路线权限和未知项完整性全部为 `pass`。
- 路线结论：桥接与宿主节点保持 `pass_with_notes / closed / advance_allowed: yes`；剩余生命周期缺口与首个多人牌桌纵向切片已证明隔离，允许下一步初始化 Trellis。

## 2026-08-26：Trellis 初始化与多人切片规划

- 本机前提：已存在全局 `@mindfoldhq/trellis 0.5.8`，因此没有联网安装新开发框架；Codex `hooks` 稳定特性当前为启用。
- 初始化动作：在项目内执行 Codex 模式、单仓库、保留已有文件的 Trellis 初始化；开发者身份沿用 Git 配置 `lhh1301506137`。生成 `.trellis/` 与项目级 `.codex/`，已有 Dual `AGENTS.md` 被明确跳过而未覆盖。
- Hook 边界：项目级 Hook 文件已经生成，但本会话没有验证用户是否完成一次性 `/hooks` 审查；当前通过显式 `TRELLIS_CONTEXT_ID` 正常完成任务绑定，不把自动面包屑写成已实测通过。
- 规范引导：从 `web/`、`src/`、插件 Hook 和测试提炼目录、组件、Hook、状态、类型与质量规范；明确当前为原生 JavaScript、服务端权威、逐边界运行时校验且没有 lint/typecheck。一次性引导任务已归档到 `.trellis/tasks/archive/2026-08/00-bootstrap-guidelines`。
- 新任务：创建 `.trellis/tasks/08-26-multiplayer-vertical-slice`，状态为 `planning`；初始 PRD 继承 `TG-L2-PLAYABLE-TABLE`、亮牌受保护规则和现有宿主证据，没有改写 L0-L2 产品语义。
- 技术研究：WHATWG、Node.js、boardgame.io、PokerKit、pokersolver 与 npm 元数据共同支持首切片采用“独立纯扑克领域状态机 + 表级权威包装 + 逐玩家投影 + HTTP POST/SSE”。boardgame.io 迁移面过大；最贴合的完整 Node 扑克包发布历史过短且缺少清晰 repository 元数据，未经源码审计不进入权威层。
- 当前停止点：尚未写多人牌局代码。唯一需要用户裁决的高价值产品偏好是固定测试桌参与者数量及其他席位的客户端形态；确认后再收敛 PRD 和进入实施准备。

## 2026-08-26：TG-L3 四人牌桌垂直切片正式自审

- 审查范围：把 `TG-L3-MULTIPLAYER-VERTICAL-SLICE` 作为一个跨领域状态机、桌级身份/投影、HTTP/SSE、浏览器 UI、规则测试和运行文档的完整垂直切片审查；没有把单个文件或内部子步骤拆成多个虚假闭环。
- 运行时身份：`same_session_self`，由当前 Codex Primary 在实现完成后另起检查阶段复读 PRD、规则研究、Trellis 规范、核心代码、接口测试、四玩家浏览器结果和截图。它是 `ai_generated` 正式自审，不是独立外部审查，也不是用户验收。
- 自审中发现并修复：重置请求在成功换手后无法按同一幂等键重放；全员 all-in 自动发完公共牌后仍保留翻牌前 `current_bet/round_commitment`；A 可在牌局进行中误触重置；摊牌/自愿亮牌后隐私提示仍按“仅本人可见”静态描述；Trellis 前端规范仍描述旧观察探针。每项均完成一次修复与针对性复验。
- 最终自动化：所有 `.cjs/.js/.mjs` 通过 `node --check`；`npm test` 23/23 通过；Trellis `implement.jsonl` 9 项、`check.jsonl` 6 项校验通过。项目没有 ESLint、TypeScript 或 typecheck，未把不存在的检查写成通过。
- 最终 UI：四个隔离 Chromium context 经真实页面完成 16 动作 checkdown、四人 all-in、最小加注后三人弃牌和赢家自愿亮牌；四视图公共状态一致、隐藏信息隔离、控制台/页面错误为 0。三个最终截图均已人工检查。
- 最终运行：最新代码以 `npm run table` 同时启动 43110 权威服务和 43111 本地桥；权威/桥健康均为 true，观察者四席底牌可见数为 0；`Ctrl+C` 后两个端口监听清零。
- 方向检查：实现仍是成熟无限注德州扑克 + TokenGame 公开 AI 边界，没有自创牌局规则、把业务判断放进 UI、接入第二套模型 API、引入真钱/生产认证或承诺 Codex 内嵌 UI；与用户确认的当前切片方向一致。
- 外部审查：未调用。该切片只处理本机合成身份与不可兑现筹码，直接规则、接口、四上下文和启停证据充足，未触发高影响生产鉴权/数据/发布边界；结论记为 `self_review_sufficient`。若下一步进入真实账号、远程多人或持久化，必须重新判断独立审查。
- 反事实：若任一未授权底牌出现在玩家/API/SSE/错误中，固定边池不守恒，短额 all-in 错误重开，旧 Codex 11 项回归失败，四个浏览器视图公共状态分叉，或最新启停留下端口，本裁决立即失效并改为 `REQUEST_CHANGES`。
- 未验证：生产凭据、TLS/公网、多进程并发、数据库/重启恢复、长时间内存增长、反串谋/内容治理、四个真实 Codex 会话分别绑定四个席位，以及 Codex Desktop 内嵌牌桌。
- 治理语言实际字节门回执：`.trellis/tasks/08-26-multiplayer-vertical-slice/governance-language-receipt.json`。
- 自审裁决：`APPROVE_WITH_NOTES`。精确的本地四人牌桌切片已实现并通过 AI 验收；TokenGame 完整 MVP、生产可用性和用户最终接受均未据此成立。

### 当前执行闭环

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-MULTIPLAYER-VERTICAL-SLICE-20260826-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-L3-MULTIPLAYER-VERTICAL-SLICE
    exact_outcome: 本机固定 A/B/C/D 四身份可经独立 Web UI 完成一手服务端权威无限注德州扑克，并保持逐玩家底牌隔离、标准结算和现有 Codex 桥接回归
    owner_ref: .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
  trigger: explicit_decision_relevant_claim
  basis:
    semantic_contract_refs:
      - node_id: TG-L2-PLAYABLE-TABLE
        contract_id: SC-TG-L2-PLAYABLE-TABLE-20260825-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-008
        expected_digest: sha256:57a19dc3c4e0d22fa2f6c10467ed40bcaaacb745c2c2148f6c16050842d1c482
        binding_status: verified
    implementation_identity:
      kind: file_set_digest
      scope: 扑克领域、桌级权威、HTTP/SSE、Web UI、相关 Node/浏览器测试
      identity: sha256:11655c09e7e7c165233ce1397f95fd5a0348788c4b1166ac33aeaa3b3b84a361
      status: current
    verification_identities:
      - evidence_pointer: npm test
        identity: node-test:23_pass_0_fail
        status: current
      - evidence_pointer: artifacts/four-player-smoke/result.json
        identity: sha256:ca27c5e8f05305c74ed889af16308ec98ec3127c66fe47ac9a5316934ae6ee7d
        status: current
      - evidence_pointer: 最新 npm run table 启动/健康/停止检查
        identity: authority_ok=true;bridge_ok=true;observer_hole_cards=0;ports_clear=true
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - obligation_id: rules_and_settlement
        claim_or_predicate: 成熟无限注规则、短额 all-in、主池/边池、平池奇数筹码、摊牌和筹码守恒正确
        required: yes
        real_condition: 确定牌序和多筹码深度动作序列
      - obligation_id: identity_and_privacy
        claim_or_predicate: 四个身份共享公共状态但只能读取各自允许的底牌
        required: yes
        real_condition: HTTP、SSE、错误与四个隔离浏览器上下文
      - obligation_id: authority_and_failure
        claim_or_predicate: 越权、非法金额、陈旧/重复/截止请求失败安全，超时不追加筹码
        required: yes
        real_condition: 注入服务端时钟和真实接口
      - obligation_id: playable_ui
        claim_or_predicate: 用户能从 Web UI 完成摊牌、all-in、弃牌获胜、自愿亮牌和下一手
        required: yes
        real_condition: 四个独立 Chromium context
      - obligation_id: bridge_regression
        claim_or_predicate: 现有 Codex 公开 AI 桥合同不回归
        required: yes
        real_condition: 原有 11 项 Hook/MCP/HTTP 自动化
      - obligation_id: local_operations
        claim_or_predicate: 最新代码可启动、可观察并能正常停止且不留监听端口
        required: yes
        real_condition: 默认本机端口与 Ctrl+C
    selected_surfaces: [static, integration, browser_smoke, ai_uat, focused_probe, inspection]
    observations:
      - obligation_id: rules_and_settlement
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/holdem-engine.test.cjs；npm test 23/23
        result: pass
      - obligation_id: identity_and_privacy
        evidence_type: executed
        correspondence: direct
        evidence_pointer: test/mcp-and-http.test.cjs；artifacts/four-player-smoke/result.json
        result: pass
      - obligation_id: authority_and_failure
        evidence_type: executed
        correspondence: direct
        evidence_pointer: 权威边界与注入时钟回归测试
        result: pass
      - obligation_id: playable_ui
        evidence_type: executed
        correspondence: direct
        evidence_pointer: 四玩家三场浏览器流程与三张最终截图
        result: pass
      - obligation_id: bridge_regression
        evidence_type: executed
        correspondence: direct
        evidence_pointer: npm test 中原有 11 项 Codex 回归
        result: pass
      - obligation_id: local_operations
        evidence_type: executed
        correspondence: direct
        evidence_pointer: npm run table 健康检查与端口清理输出
        result: pass
    skipped:
      - check: 独立外部模型审查
        reason: 本地低风险合成切片具有直接确定性与浏览器证据；生产边界另立审查门
      - check: 用户最终体验接受
        reason: AI UAT 不能替代用户接受，交由下一责任人
    result: pass_with_notes
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-L3-MULTIPLAYER-VERTICAL-SLICE
        parent_capability_id: TG-L2-PLAYABLE-TABLE
        claim: 本地四人牌桌垂直切片已实现并通过 AI 验收
        exact_scope: 单进程、单固定桌、合成测试身份/筹码、独立本地 Web UI 与既有 Codex 公开 AI 桥边界
        result: supported
        dimensions:
          semantic: {required: yes, status: sufficient_for_claim, evidence_type: inspection, evidence_pointer: 已确认 PRD 与 L2 合同, user_readable_meaning: 范围和非目标明确且未漂移}
          implementation: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 当前文件集与真实入口运行, user_readable_meaning: 活跃代码实现了完整切片}
          data: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 固定牌序、多筹码深度和随机运行牌堆, user_readable_meaning: 切片承诺的合成数据与边界状态已覆盖}
          integration: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 四 context UI→HTTP→TableStore→HoldemHand→投影, user_readable_meaning: 前后端真实路径闭环}
          verification: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 23 项自动化与四玩家浏览器烟测, user_readable_meaning: 必要正常与失败路径有直接证据}
          operational: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 最新启停/健康/端口清理, user_readable_meaning: 本地切片可运行并可恢复到无残留状态}
        safe_wording: 本地四人牌桌垂直切片已实现并通过 AI 验收；不代表完整 MVP、生产就绪或用户已接受
        gaps: []
  route_boundaries:
    local:
      result: supported
      evidence_refs: [23项自动化, 四玩家UI烟测]
    adjacent:
      result: supported
      evidence_refs: [HTTP/SSE逐玩家投影, 现有Codex桥11项回归]
    cumulative:
      result: supported
      evidence_refs: [已确认TG-L2合同, 本地启停证据, 明确生产非目标]
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits:
    - 不是生产认证、持久化、远程并发、合规或真钱系统证据
    - 不是四个真实 Codex 会话绑定或 Codex 内嵌 UI 证据
    - AI UAT 和正式自审均不等于用户接受或独立外部审查
  remaining_non_blocking:
    - 项目没有 Git 仓库，Trellis 无法执行提交后归档，任务载体暂保留 in_progress
    - 等待用户按本地 walkthrough 体验并决定是否接受该切片
  advance_allowed: yes
  next_owner: user_acceptance_then_primary_route_selection
```

### AI 模拟验收

```yaml
ai_simulated_acceptance:
  acceptance_label: ai_generated_acceptance
  claim_evidence_mapping: executed
  goal_checked: 玩家以独立身份进入同一桌，按成熟德扑动作完成一手牌并看到正确私有/公共信息与结算
  personas_or_paths:
    - 四名普通测试玩家的完整 checkdown
    - 四名玩家 preflop all-in
    - 加注者面对三人弃牌后选择公开底牌
  steps_run:
    - 分别打开 A/B/C/D 专属链接并核对初始底牌隔离
    - 经每个身份自己的 UI 连续提交 16 个动作直到摊牌
    - 开始下一手，经 UI 完成一次四人 all-in 自动 runout
    - 再开始一手，输入最小加注额、三人弃牌并由赢家点击自愿亮牌
    - 检查四个状态摘要、三张截图及所有控制台/页面错误
  result: pass_with_notes
  issues_found:
    - 初次 Canvas 公共牌参数错误
    - 事件栏撑高桌面且未发公共牌显示为牌背
    - all-in 自动 runout 后仍显示旧街下注额
    - 已公开底牌后的隐私说明不够精确
  fixes_made:
    - 修正绘牌参数和公共牌空槽
    - 固定桌面比例并让事件区独立滚动
    - 在下注轮结束时归零当前街状态
    - 根据真实可见底牌动态说明隐私范围
  user_walkthrough:
    - step: 运行 npm run table，分别在隔离窗口打开终端输出的 A/B/C/D 链接
      expected_result: 四个窗口处于同一手牌，每个窗口只看见自己的两张底牌
      if_it_fails: 不继续游戏，保留页面错误与终端输出并反馈
    - step: 在红色高亮的当前行动者窗口使用跟注/过牌推进一手
      expected_result: 只有服务端允许的按钮可用，公共牌和行动者在四窗同步
      if_it_fails: 记录发生分叉的手牌 ID、REV 和玩家身份
    - step: 完成河牌行动
      expected_result: 所有仍在局玩家底牌公开，赢家与筹码由服务端结算
      if_it_fails: 保留四个窗口截图，不点击开始新手牌
    - step: 由 A 点击开始新测试手牌，再测试 all-in 或加注/弃牌
      expected_result: 新手牌 ID 与庄位变化；弃牌获胜者默认不亮牌，可自行点击亮牌
      if_it_fails: 反馈按钮是否禁用、错误提示和当前 REV
    - step: 回到终端按 Ctrl+C
      expected_result: 牌桌和本地桥同时停止
      if_it_fails: 反馈仍在运行的端口或进程信息
  requires_user_acceptance: yes
```

## 2026-08-26：座位旁 AI 公开气泡复核

- 复核范围：在不改变德扑规则、公开时序或普通 Codex 零公开边界的前提下，为 A/B/C/D 四席加入座位旁 AI 同伴，并把每席最近一组合法公开 prompt/answer 表现为玩家与 AI 聊天气泡。
- 检查身份：先由独立 `trellis-implement` 子代理实现，再由独立 `trellis-check` 子代理对照 PRD、前端规范、DOM/Canvas 布局和四窗口 smoke 审查并可直接修复；主代理随后复读改动并重跑最终验证。这是同一任务内的独立代理检查，不是外部安全审计或用户验收。
- 检查修复 1：孤立或未知来源的 `AI_ANSWER_PUBLISHED` 原本不会生成座位气泡，却会误把右侧全局 Model/Answer 点亮；现 `renderAiPhases()` 只跟随最新合法逐座位会话。
- 检查修复 2：公开事件计数可达 87，但 DOM 原本只渲染最后 80 条；现事件流完整渲染，四个视图均断言 `rendered=announced=87`。
- 负例覆盖：未知 actor、普通事件、孤立 answer、错席 answer、重复请求、旧回答晚到、A/B 独立配对和 HTML/事件属性注入均通过；座位气泡只由合法 `actor + request_id` 配对建立，文本只经 `textContent`。
- 布局覆盖：桌面气泡与公共牌、四个玩家状态、行动区几何不相交；560px 视口无横向溢出，AI 区域位于牌桌后、行动区前。生成中、回答、窄屏和完整摊牌截图均由实现代理、检查代理与主代理分别人工检查。
- 最终自动化：`node --check web/app.js` 与 `node --check test-support/four-player-smoke.mjs` 通过；`npm test` 23/23；主代理四窗口 Playwright 自然退出 0，checkdown 16 动作、四人 all-in、加注弃牌/自愿亮牌继续通过，`console_errors=[]`。项目仍未配置 lint、TypeScript 或 typecheck，未把不存在的检查写成通过。
- Canvas 回归：Develop Web Game 通用客户端完成一次观察者 Canvas 截图与机器状态采集；`seat_ai_companions` 含 A/B/C/D 且牌桌 Canvas 未受 DOM 气泡层破坏，终止后 43110/43111 监听为 0。
- 边界：当前真实桥只端到端产生 A / `ai:a`；B 的通用投影由权威事件注入验证，不代表 B/C/D 已分别绑定真实 Codex 会话。未执行真实屏幕阅读器测试，也未证明生产认证、远程并发、内容治理或 Codex 内嵌 UI。
- 计划树：未修改；SHA256 保持 `E165A77DBDA25BB8C1AFF4A6480F62952A828701D7B2142E8DC57B4404A2C44B`。
- 裁决：`APPROVE_WITH_NOTES`。座位旁 AI 公开气泡的精确本地 UX 切片已通过 AI 检查和四视图验收；用户重新体验确认仍是下一道门，不能写成“用户已接受”。

```yaml
seat_ai_bubble_acceptance:
  acceptance_label: ai_generated_acceptance
  result: pass_with_notes
  evidence:
    unit_and_integration: npm_test_23_of_23
    browser_contexts: [a, b, c, d]
    public_ai_projection: generating_then_answered
    event_feed: 87_of_87_rendered
    console_errors: 0
    screenshots:
      - artifacts/four-player-smoke/ai-prompt-pending.png
      - artifacts/four-player-smoke/ai-answer-published.png
      - artifacts/four-player-smoke/ai-answer-narrow.png
  requires_user_acceptance: yes
```

## 2026-08-28：宿主中立单栈牌桌产品闭环复核

- 复核范围：`TG-EU-SINGLE-STACK-WEB-TABLE`。把 UI 从旧探针栈切到同一份宿主中立权威内核，形成一套栈的本地产品闭环。不改动已确认的 L0–L2 与七条公开交流规则，不改动牌局裁决。
- 单栈判定：新 UI 在 `web/table/`，只认 `/api/view` 的 `tokengame.table-view.v1` 契约，经 `src/host/table-web-host.cjs` 协调器连内核，入口 `npm run web`。旧探针栈 `web/app.js` 与 `npm run authority` / `table` 原样保留为已替代历史证据，不再是产品路径，两套牌桌不并行维护。
- 权威边界：UI 不读权威原始事件，也拿不到任何秘密。浏览器手里只有会话令牌，席位凭据留在协调器进程内存里，不经浏览器往返；视图与动作两个出口都做凭据形状键与自由文本的双向泄漏扫描，扫到即 500，按本进程缺陷处理。合法按钮由权威给的 `legal_actions` 生成，页面不自己推断合法性。
- 自动化：`npm test` 实测 351/351 pass、0 fail，全新克隆一次、工作树一次。`test/table-web-host.test.cjs` 15/15。变异规格 `test-support/mutations/web-host-boundary.json` 16 条全杀、0 存活 0 未评估。项目仍未配置 lint、TypeScript 或 typecheck，未把不存在的检查写成通过。
- 浏览器验收：`test-support/table-web-acceptance.mjs` 四个隔离 Chromium context，80 条断言全过，控制台错误 0，连续打到第 3 手。全新克隆连跑三次、工作树连跑四次同结果。所有动作都通过 Web UI 与正常玩家接口完成，没有特权客户端，也没有直接往内核发命令的后门。
- 底牌隔离三重覆盖：自己两张明牌、别人三席各两张暗牌、每人底牌拿去另外三人整页 `body.innerHTML` 搜索 24 次 0 命中。第三重刻意放在任何摊牌之前——摊牌后别人的底牌本该出现在我的页面上，那时再搜会把正确行为报成泄漏。
- 浏览器发现而 351 个单元测试与代码复核都没发现的缺陷四个，每个都先复现为失败再修：`[hidden]` 被类选择器上的 `display` 盖掉（三个元素受影响，其中 `scope-gate` 是全屏遮罩，吃掉后续所有点击，症状只是「点不动我准备好了」）；离桌后轮询不停每 700ms 一条 403；公共牌从未被观察过（74 条断言全绿而 `board` 一直是 0）；只等建房者一页就读四页导致的读页竞争。
- 第四条同时暴露五条断言在空数据上空过：三页一张牌都没渲染时，`every()` 与 `Set` 去重让「只看到别人的暗牌」「八张底牌互不相同」「没有任何一方的底牌出现在别人的整页 DOM 里」照样通过，最后那条只搜了 24 次里的 6 次。去掉逐页等待、只留断言加固后，同一缺陷从 3 条失败变成 8 条，加固承重得到确认。断言在无数据时通过比没有这条断言更糟，它把缺口报成绿色。
- 承重性反向验证：把 `[hidden]` 规则与离桌收摊改回原样各跑一次，确认断言真的会失败。其中一处得到否定结论——离桌处的 `returnToEntry` 改回后两条命名断言仍通过，只有控制台错误那条抓住了它；真正承重的是 `refresh()` 里的终态会话码守卫，调用点那处是双保险。这一条如实记下，不写成两处都承重。
- 证据自审：每张截图附页面状态指纹并两两交叉核对，状态不同而字节相同即判失败。`result.json` 无条件落盘，包括脚本中途抛错的情况——先前一次异常终止只留下「通过 77，失败 3」一行而没有失败项，诊断只能靠重跑。
- 模型适配器边界：`test-support/scripted-model-adapter.cjs` 按查表返回固定文本，不推理、不访问模型，`simulated: true` 硬编码不可覆盖，视图显示「（模拟）」，每张截图都自证不是真实宿主能力。本节证据不构成真实宿主无点击主动唤醒已通过的证据；Codex 当前任务与 Claude Cowork 两侧的主动唤醒均未验证。
- 计划树：已修改。`TG-EU-SINGLE-STACK-WEB-TABLE` 由 `planned` 改为 `completed` 并补齐实现引用、验证、提交与边界；可靠边界前移到 `TG-EU-SINGLE-STACK-WEB-TABLE@eef01e9`；下一叶改为 `TG-EU-HOST-ADAPTER-CONTRACT`；`TG-EU-PLAYABILITY-GATE` 的阻塞原因改为只剩尖峰与门禁自身两层。新 SHA256 为 `336B7709DFBFABDB93F6C4B8D5CFB22EDF8865999E4B56DCEF38455EB9C83DC0`（`Get-FileHash`、Python `hashlib`、Node `crypto` 三者一致）。
- 边界：本节不证明真实宿主适配器、无点击主动唤醒、四真人试玩签字、`PLAYABILITY_GATE_V1` 自动化层（要求至少 10 手与故障矩阵、隐私金丝雀，本次只到第 3 手）、生产鉴权或远程部署。本机桥接鉴权仍是未闭合未知项 `U-TG-LOCAL-BRIDGE-AUTH`，不属本单元设计范围。
- 裁决：`APPROVE_WITH_NOTES`。本地单栈产品闭环已成立并有可独立重跑的证据；产品闭环成立不等于 MVP 可玩已通过，可玩性门禁两层都还没跑。

```yaml
single_stack_web_table_acceptance:
  acceptance_label: ai_generated_acceptance
  result: pass_with_notes
  evidence:
    unit_and_integration: npm_test_351_of_351
    web_host_tests: 15_of_15
    mutation_spec: web_host_boundary_16_killed_0_survived
    browser_contexts: [alice, bob, carol, dave]
    assertions: 80_of_80
    console_errors: 0
    hands_played: 3
    hole_card_cross_search: 24_searches_0_hits
    clean_clone_runs: 3
    worktree_runs: 4
    model_adapter: scripted_simulated_true
    artifacts:
      - artifacts/table-web-acceptance/result.json
      - artifacts/table-web-acceptance/
  not_proven:
    - real_host_adapter
    - clickless_proactive_wake
    - playability_gate_automated_layer
    - four_human_playtest_signoff
    - production_auth_or_remote_deployment
  requires_user_acceptance: yes
```

## 2026-08-28：交付前自查（不含新功能开发）

按用户指示，在提交 Codex 审查前做一次系统自查，只修补、不推进第四阶段。五个方向逐个实跑，结论如下。

### 一、行尾归一化：不是缺陷

工作树 283 个文件里 31 个含 CRLF，但 `git ls-files --eol` 显示入库侧全部 `i/lf`（唯一例外 `.trellis/.version` 是 `i/none`，无行尾可转）。落在 PI 哈希集内的只有 `plugins/tokengame/.codex-plugin/plugin.json` 一个，且它是 `i/lf w/mixed`——库内 LF、工作树 CRLF。因此全新克隆拿到的是 LF，PI 门禁可复现，不需要改动。

这一条差别是判定的关键：只看工作树会把它报成缺陷，只看 `git status` 又完全看不见它（git 按 `eol=lf` 归一化后比对，认为无差异）。

### 二、PI 收据：一个真实缺口，不归我修

两份收据的哈希全部自己重算，不采信收据自述值。

`CODEX-BRIDGE-RECEIPT.json` 全项通过：生成上下文 `40026d4f…1dca5`、三份投影、两个 `owner_reads` 快照都对得上。

`PUBLIC-AI-EXCHANGE-RECEIPT.json` 的生成上下文 `d06b1849…b7b4f6` 与三份投影都对，但两个 `owner_reads` 快照哈希在全仓 283 个文件里反查不到：

- `project_intelligence` → `project-intelligence.md` → `913b4580743c08f2b469be191fa5fdee749d1f4094aa661d50e8a19863bf0e3e`
- `plan_tree` → `plan-tree.md` → `5c5cbca1d001ed72fc1a9b15549a4faefbbd23e5d341bca5f84e08491bd22776`

`.dual/` 下只有 `CODEX-BRIDGE-R3-OWNERS/` 与 `CODEX-BRIDGE-R4-OWNERS/`，没有 `PUBLIC-AI-EXCHANGE-R1-OWNERS/`。同一批哈希也出现在 `.dual/PUBLIC-AI-EXCHANGE-GENERATION-CONTEXT.json` 的 `oracle_owner` / `dependency_owner` 里，`provenance: owner_derived_before_generation`，所以收据与生成上下文内部自洽——缺的是那两个快照文件从未随 `343291c` 入库。

反查方法本身用 CB-R4 的两个哈希做过阳性对照，两个都在预期路径命中，方法有效。

不伪造快照。产物由 Codex 生成（`artifact_producer_id: tokengame-public-ai-understanding-generator`），补一份我自己算的内容等于重写 Codex 的 PI 产物。验证器 `validate_understanding_artifacts.py` 属外部框架、不在仓库内，无法本地复跑确认它是否真的校验 `owner_reads`；`343291c` 声称 15 项检查全 pass。交 Codex 裁定。

### 三、空断言排查：查出并修掉一个真实缺陷

按四种危险形状扫描 `test/*.test.cjs` 与 `test-support/*.mjs`，40 个候选逐个判定。判定标准刻意不是「某条断言是否会空过」，而是「集合空了整个测试是否仍然通过」——只有后者产生假绿。

五个单元测试处实测集合非空，断言有效：`holdem-engine.test.cjs:109/110/114`（各 2 个元素 `["fold","call"]`）、`hook-integration.test.cjs:144`（3 条事件）、`room-store.test.cjs:291`（10 条事件）。探针一律照抄测试自己的 fixture 与辅助函数，不另建构造——第一次自己拼牌堆时用了 16 张，被 `invalid_deck_size` 拦下，那正说明重建 fixture 比复用更容易出错。

一个真实缺陷，已修（`472af28`）：

```js
// 修前：alice 的页面读到空表时立刻通过
return table.seats.every((seat) => seat.name !== "eve");
```

这条等待本该证明「拒绝公开范围确认后座位不残留」，而它紧跟 `eve.context.close()`，是全脚本最容易读到空表的位置。改为先要求 `seats.length === 1` 再要求没有 eve。承重性单独证过：空表输入下旧条件 `true`、新条件 `false`；两个正确状态下两者判定一致。

`vacuous-empty-collections.json` 把同一问题在单元测试上问了一遍：把牌局投影的 `seats` 换成空数组，看三条路径的测试是否仍通过。三条全部 KILLED，说明 `holdem` / `mcp` / 协调器上的 `every()` 都有别的断言兜住，无假绿。

余下候选安全的理由记在此以免重查：`command-surface.test.cjs:282/671` 前一行就是 `length > 0`；`seat-ai-store.test.cjs:274` 由 `deepEqual` 钉死 3 个元素；`table-web-acceptance.mjs` 的 620/623 由上方 `until` 保证 `aiBubbles` 非空，431 由 416-422 的 `until(seats.length === 4)` 传递性保证，712 的数组是字面量；`four-player-smoke.mjs` 随旧探针栈冻结。

### 四、文档引用：全部有效

40 份治理与规范文档里 193 个「看起来像仓库路径」的引用逐个核实存在，0 缺失。这一项做全量是因为本轮我自己写错过两处：`src/authority/holdem.cjs`（真身 `src/game/holdem.cjs`，两套栈共用）与 `seat-ai-pump.cjs`（不存在，座位 AI 驱动是 `table-web-host.cjs` 的 `driveOnce()`）。

### 五、数字声明：更新变异总数，历史数字保持原值

八个变异规格全部重跑：f1 15、f2 18、f3 14、f4 14、f5 28、f6 14、web-host-boundary 16、vacuous-empty-collections 3，合计 **122 条变异 122 杀掉 0 存活 0 未评估**。STATUS 与计划树顶部的合计已更新。

`PROJECT-PLAN-TREE.md` 里 `TG-EU-REVIEW-CLOSURE-F1-F6` 节点的 `336/336` 与 `103 变异` **不改**：那是该单元闭合时的实测值，改成 351/122 等于篡改当时实测的内容。同理，历史节里的 23/23 与 11/11 都在各自范围内，保持原样。

### 自查未覆盖

- `four-player-smoke.mjs` 的 10 处 `every()` 未逐个判定（随旧探针栈冻结，不是产品路径）。
- 未重跑旧探针栈的 Playwright 烟测。
- 第四阶段（共享 HostAdapter 合同、Claude 侧适配器）按指示未推进。

### 一个待裁定的结构问题

计划树把下一叶写成单数「HostAdapter 合同」，但仓库里事实上需要两份，它们只共享一半形状：**宿主命令适配器**（`HOST_COMMANDS` 唯一词表、席位句柄间接、错误码原样透传、凭据不出进程）与**座位模型适配器**（`evaluate({seat_id, turn_id, context})` → `{decision, text?}`、两段租约各 30 秒与 120 秒、失败落 silent 而非悬住回合、未接真实模型必须 `simulated: true`）。合成一节会让实现者以为满足其一即满足其二。是否拆分涉及已确认产品语义的表述，交用户与 Codex 裁定，我不自行改。

- 裁决：`SELF_AUDIT_COMPLETE`。查出并修掉一个真实空断言缺陷，确认一个不属我范围的 PI 收据缺口，其余四项实测无缺陷。

```yaml
pre_review_self_audit:
  acceptance_label: ai_generated_acceptance
  result: complete
  directives:
    - repair_only_no_new_development
  checks:
    line_endings:
      scanned_files: 283
      worktree_crlf: 31
      index_non_lf: 1_dot_version_i_none
      in_pi_hash_set_and_tracked: 1
      verdict: not_a_defect_fresh_clone_gets_lf
    pi_receipts:
      codex_bridge: all_hashes_verified_independently
      public_ai_exchange:
        generation_context: verified
        projections: verified
        owner_read_snapshots: missing_from_repo
        reverse_lookup_positive_control: passed
        disposition: reported_not_fabricated_codex_artifact
    vacuous_assertions:
      candidates: 40
      probed_empirically: 5
      defects_found: 1
      defects_fixed: 1
      fix_commit: 472af28
      load_bearing_proof: empty_input_old_true_new_false
    doc_references:
      docs: 40
      refs_checked: 193
      missing: 0
    numeric_claims:
      mutation_specs: 8
      mutations_total: 122
      mutations_killed: 122
      mutations_survived: 0
      historical_values_preserved: [npm_test_336, mutations_103, npm_test_23, npm_test_11]
  not_covered:
    - four_player_smoke_every_candidates_frozen_stack
    - old_probe_stack_playwright_rerun
    - phase_four_host_adapter_contract
  open_for_codex:
    - public_ai_exchange_owner_read_snapshots_absent
    - host_adapter_contract_singular_vs_two_contracts
  requires_user_acceptance: yes
```

## 2026-08-28：复开单栈牌桌，补齐合同与实现之间的真实差距

上一节把 `TG-EU-SINGLE-STACK-WEB-TABLE` 记成 completed，80 条断言全过。那份记录与当时的证据
一致，但它掩盖了五处缺口。五处的共同点值得单独说：**它们都不会红**。没有失败的测试，没有报错，
画面上也看不出异常。80 条断言之所以全过，是因为没有一条走到那些路径上。

### 五处缺口，按发现方式分类

三处是「恒假条件」——代码在，条件永远不成立，所以功能从未执行过一次：

1. **自愿亮牌**：`can_reveal` 检查 `settlement.payouts`，而权威侧不存在这个字段（真实字段是
   `winner_ids`，`payouts` 全仓搜不到）。按钮因此一次都没出现过；又因为它没出现过，客户端只传
   一个参数的缺陷从未被触发。两个缺陷互相掩盖，各自都没有失败的测试。
   恒假的条件与恒真的断言是同一类问题：都不读现实，都不会变红。

2. **换绑或改桌规之后同意门再也不出现**：`public_scope_confirmed` 算的是「这一席存在过一份
   确认」，而权威按 `(room_binding_id, table_rules_version, seat_id)` 三元组比对。玩家看到
   「已确认」而每一次 `chat.say` 都被拒为 `default_public_scope_not_confirmed`，页面上没有任何
   东西解释原因，也没有可以点的东西。

3. **入口幂等里我自己写的一层**：`entryReplay` 原本还查一次「这个会话还在不在」。变异测试
   指出它恒假——`sessions.delete` 全仓只有一处，紧跟着就是 `forgetEntryKeysFor`，中间没有
   `await`。这一处是本轮新写的代码，当场删掉，记在这里是因为它说明同一个毛病很容易再犯。

两处是「从未有人走到」——真实用户行为对应的路径根本没有实现：

4. **连接租约不存在**：`seat.disconnect` 只由「模拟掉线」按钮触发，页面上既没有 `pagehide`
   也没有 `sendBeacon`。真实关标签页、刷新、拔网线之后，权威侧那一席一直是 connected，保留窗
   永远不起算、位子永远不还，别人只看到一个「在线但永远不行动」的席位。
   补上租约时另有一处自查发现的漏洞：`touchConnection` 忽略被扫描摘掉的连接 id，于是网络恢复后
   的页面永远回不来，而它自己的视图还在更新——看起来一切正常。

5. **同意门在绑定之后**：提交表单先 POST create/join，座位建好、凭据发出、公开时间线落下
   `SEAT_BOUND`，然后才弹说明。合同要求确认在绑定之前。这一条还连着一个把它藏了很久的 DOM
   缺陷：`#scope-gate` 嵌在 `#table-main` 里，而入口页阶段 `#table-main` 带着 `hidden`，
   `[hidden]` 的 `display:none` 连同后代一起关掉。元素自己的 `hidden` 仍然是 `false`，所以
   凡是读 `el.hidden` 的检查都报「可见」——验收脚本的 `scopeGateVisible` 正是这么读的。

另有一处不属于上面两类：**畸形上游投影让整页停更**。视图模型在四条路径上抛 TypeError，而它在
协调器的请求路径上——抛错就是 `/api/view` 回 500，页面永远停在最后一帧成功的画面上。牌桌看起来
还在，只是不动了。一张空桌子能看出问题，一张不动的旧桌子看起来是真的。

### 变异测试指出的两处「测试本身的缺陷」

这一轮里变异存活两次不是因为产品有洞，而是因为我的测试没测到自己声称在测的东西：

- `input()` 里用 `??` 处理 override，于是显式传进来的 `null` 被当成「没传」而回落到默认值——
  「宿主没报版本」那一路一直在测有版本的情形。
- 「两边都缺字段」需要显式 `null` 才撞得上守卫：缺字段读出来是 `undefined`，与视图侧的
  `?? null` 不相等，所以那一路自己就不成立。

两处都改了测试而不是改产品。另有三次存活是等价变异或工具射程边界，逐条记在各变异规格的
`excluded` 里。

### 一处工具修正

变异驱动此前对非 JS 文件一律判 INVALID（`node --check` 认扩展名），于是 HTML 结构与 CSS 规则
这两类产品真的依赖的不变量永远不会被评估——报出来是「未评估」而不是「防线有洞」。已按扩展名
分流。这不是顺手改的：同意门挂在哪个 `main` 下面、`[hidden]` 的 `display:none` 有没有
`!important`，都是浏览器验收里表现为 30 秒点击超时（脚本崩溃，不是指名道姓的断言）的东西。

### 第六处缺口：证据文件自己会说谎

核对本节引用的路径时发现的，所以它不在原先那五处里。`artifacts/negctl6/result.json` 与
`negctl6c/result.json` 都写着 `"passed": true`、24 步全过、控制台错误 0。**两次运行都没有通过**
——它们是在第 25 步超时中止的。判定式当时是 `passed: failures.length === 0`，异常终止不会往
`failures` 里放任何东西，于是「中止」和「跑完且全过」在文件里完全同形。

这跟前五处是同一个缺陷类：恒为真的条件读不出任何真东西。区别只在于这一次它长在证据采集器上
而不是产品里，而后果更重——一份自称通过的负控比没有证据更糟，负控的全部价值在于它失败。

判定式原先内联在 `test-support/table-web-acceptance.mjs` 的 `finally` 里。`.mjs` 单元测试加载
不了（两个浏览器 UI 因为同样的原因被排除在变异门禁之外），所以它只能靠跑一次真浏览器才可能
发现是错的，而它恰好只在中止的那种运行里才错——那种运行本来就没人细看。已搬进
`test-support/acceptance-result.cjs`：判定改为 `failures.length === 0 && aborted === null`，
新增 `aborted`（含 message 与 stack）与 `steps_ran`。中止**不**折算成一条断言失败：
「某条断言不成立」和「后面的断言一条都没跑」是两件事，混起来会让人去查一条根本没跑过的断言。

实测中止路径：临时注入一个 throw，产物写出 `passed: false` / `steps_ran: 13` / `failures: 0`
/ message 与 stack 齐全 / 退出码 1；随后移除注入，探针产物一并删掉（它是我造的中止，不是证据）。
两份历史 `result.json` 保持原样不回改，各自旁边加 `ERRATA.md`——改成 `passed: false`
会让人以为当时就记对了。

### 第七处：产物里有凭据原文，且产物根本不在仓库里

同一次核对带出来的两件事。

`artifacts/negctl5/result.json` 里有一条真邀请码原文 `invite_code=Kep2jgEI…`（43 字）。
那次进程早没了所以它是死的，但复核的人分不出死活。修在记录路径上而不是那一个调用点：
脱敏进 `redactDetail()`，由 `ok()`/`bad()` 统一调用，否则下一条写出凭据的断言照样会漏。
凭据键下的短值（`session_token=null`）刻意不脱敏——一条断言失败时印出的往往正是那个 null，
它是根因，盖掉它等于把根因盖掉。

另一件：`.gitignore` 第 3 行忽略整个 `artifacts/`（55 MB、591 张 PNG），所以本节与下一节
引用的每一个 `artifacts/...` 路径都只存在于跑过它的那台机器上，全新克隆里一个都没有——
包括下一节早就在引的 `acc-item4-negctl2`。此前没有交代过，读起来像仓库自带证据。不改成入库
（体量之外，`result.json` 里有凭据形状的字符串，而「被忽略」和「不存在」只差一次 `git add -f`），
改成在 `docs/ACCEPTANCE-EVIDENCE.md` 里说明清楚并给出每条引用的重跑命令。产物是可重跑的
中间物，判定数字誊在文档里，那才是记录在案的证据。

一条留给 Codex 的判断：这七处里有五处是「读不出任何真东西的条件」。变异门禁能挡住产品里的
这一类，但它对采集器本身只有本轮新加的 15 条。是否要把 `test-support/` 下所有参与判定的
代码都纳入常规变异范围，我没有擅自扩大。

```yaml
reopen_review:
  unit: TG-EU-SINGLE-STACK-WEB-TABLE
  date: 2026-08-28
  acceptance_label: ai_generated_acceptance
  gaps_closed: 8
  evidence_defects_found_while_citing: 3
  measured:
    npm_test: 498_pass_0_fail
    mutation_gate: 226_killed_0_survived_0_skipped
    browser_acceptance: 150_pass_0_fail_0_console_errors
    new_mutation_specs:
      connection-lease: 16_of_16
      voluntary-reveal: 6_of_6
      entry-consent-idempotency: 11_of_11
      scope-reconfirmation: 12_of_12
      view-model-degradation: 7_of_7
      acceptance-result: 15_of_15
  historical_values_preserved: [npm_test_351, mutations_122, browser_assertions_80]
  errata_added_not_rewritten:
    - artifacts/negctl6/ERRATA.md
    - artifacts/negctl6c/ERRATA.md
  defect_classes:
    always_false_condition: 4
    never_exercised_path: 2
    unbounded_degradation: 1
    test_fault_not_product_fault: 2
    evidence_reads_as_pass_while_aborted: 1
    credential_literal_in_artifact: 1
    cited_path_absent_from_repo: 1
  tooling_fixed:
    - mutation_driver_rejected_non_js_files_as_invalid
    - acceptance_verdict_ignored_abort
    - acceptance_detail_recorded_raw_invite_code
  deferred_to_user:
    - authority_enforce_limits_version_in_require_confirmed_scope
    - whether_all_of_test_support_enters_routine_mutation_scope
  still_unverified:
    - real_host_gate_5_proactive_wake
    - four_human_uat
  fresh_clone_rerun:
    commit: 2549474
    method: git clone --no-hardlinks 到临时目录，无 npm install（本仓库无任何依赖）
    npm_test: 498_pass_0_fail
    mutation_gate: 226_killed_0_survived_0_skipped_GATE_PASS
    browser_acceptance: 150_pass_0_fail_0_console_errors_24_screenshots
    eol_check: 抽查 gate.sh / acceptance-result.cjs / table-view-model.cjs 均 i/lf w/lf
    artifacts_absent_as_documented: yes
    result_json_free_of_credential_literals: yes
  not_covered:
    - four_player_smoke_every_candidates_frozen_stack
    - old_probe_stack_playwright_rerun
  requires_user_acceptance: yes
```
