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

## 2026-08-28：宿主中立适配器合同，与打到第十手以上的自动化验收

承接上一节的复开。这一节做两件事：把宿主适配器的合同从「一份能跑的实现」变成「两份
带共享底座的合同 + 一套能真的失败的一致性套件」，然后把浏览器验收从第 4 手推到第 11 手。

提交范围 `46d5b5d..0e80395`。

### 一、两份合同，一个共享底座

`src/contract/adapter-contract.cjs` 是底座，两份合同共用：请求/成功/错误三个信封、
7 类错误映射（覆盖源码里 65 个码）、三层身份（`player_id` / `seat_handle` /
`authority_id`）、生命周期迁移、能力协商。

为什么是两份而不是一份：人类面（HostCommand/UI）与模型面（SeatModel）的权力不同。
人类面能确认公开范围、能 ready、能下注；模型面一条都不能。把它们合成一份合同意味着
权限差别只能靠运行期检查表达，而那种检查一旦漏一条就是模型拿到了下注权限。
`ADAPTER_ROLES` 按引用指向 `HUMAN_COMMANDS` / `MODEL_COMMANDS`，不拷贝——拷贝会漂移。

内核里不出现宿主专有判断。这一条由测试盯着：`test/adapter-contract.test.cjs` 扫源码
匹配 `\b(claude|codex|cowork|anthropic)\b`。

扫出来一处：`src/authority/table-store.cjs` 里有个 `name: "Codex` 的牌桌显示名。
它在一个带 `SUPERSEDED_BY_` 头标记的冻结文件里，是用户可见字符串而不是判断分支。
没有擅自改它——改用户可见语义不是我这一轮的权限。测试改成按标记豁免，并且钉住：
带标记的文件有哪两个、其中只有一个真的需要豁免、那处出现不是分支条件。
重命名列为待裁决项。

### 二、一致性套件的第一版有四个洞

`test-support/adapter-conformance.cjs` 写完之后，我拿 14 个故意坏掉的适配器变体去打它。
四个洞是这么找出来的：

1. 读命令硬编码成 `view.projection`，那是模型面独有的。于是人类面适配器跑到这条就
   直接算过，整个信封与身份检查块从来没在人类面上执行过。
2. 释放检查跑在 `handle_count: 0` 的状态上，所以一个只翻标志位、不清句柄的实现能过。
3. 释放前后比的是整份 JSON，而 `state` 每次都变，于是这条比较恒真。
4. 变体的角色从名字前缀推断，`release_keeps_tracked_ids` 因此被派到了错的角色上。

四条都不是「测试写得不够多」，是「写出来的检查跑不到」。跑不到的检查在报告里和通过
长得一模一样。修法分别是：按角色选读命令、要求实现 `seedForRelease()` 钩子、只比计数
字段、每个变体显式声明 `roles`。

### 三、谎称有主动唤醒，套件仍然全绿

这是一条真实限度，不是缺陷。套件只验内部一致性，「无点击主动唤醒」只有真实宿主实机
能证实。所以报告里加了 `unverifiable` 数组：`proactive_wake` 落在那里，带
`gate: "Gate 5"`。记成不可验证而不是失败，是因为判失败会逼真有这个能力的宿主去少声明。

`CAPABILITIES.proactive_wake` 带 `verified_on_any_host: false`。
`docs/HOST-ADAPTER-CONTRACT.md` 里有 10 步实机清单，每步标「需要用户点击？」。
第 5 步是「否——这是被测的那一步」，第 6 步要求三种结果都得记下来。

HostCommandAdapter 没有实现。它要动 `table-web-host.cjs`，而那是一张已经闭合的单栈
牌桌；两份合同拆成两份还是合成一份也该由 Codex 先裁。列为待裁决项。

### 四、变异测试又指出三处我自己的死代码

- `degradations-include-required` 存活，证明 `!capSpec.required` 恒真。删掉，
  换一条关于检查顺序的变异。这和上一轮 `sessions.has` 那次同一类。
- `classify-falls-through-to-first-class` 存活：`invalid_request` 与 `unknown` 的处置
  相同，所以替换之后覆盖检查变成恒真。补一条类名断言。
- `constructor-accepts-missing-custody` 存活：我在 `SeatModelAdapter` 里重复了
  `ModelCommandSurface` 已经做过的检查，报的还是同一个码同一个字段名。删掉重复的那份。

### 五、把验收打到第十手以上，以及五个自己造的缺陷

原先只到第 4 手。跨十手要暴露的是累积状态错误：筹码结转、按钮位轮转、手序号，
在第二手上对，在第八手上不一定还对。

新增三节：8c 连续打到第 11 手、8d 五种畸形投影、9d 有人跟的全下摊牌。
每一节都是先跑，再按跑出来的红灯改——五处红灯里有五处是我自己造的：

1. **守恒写成等式必然误报。** 结算后 `stack` 是账本值（赢的已进账）而 `pot` 仍是
   `settlement.total_pot`，相加把池算了两遍。真实运行的第 7 手上炸出 800+3=803。
   DOM 里读不到 `in_hand`，所以画面上分不清阶段。改成双边界：上界抓凭空产生，
   下界抓凭空消失，两个阶段都成立。
2. **单挑数成了「有多少人动过手」。** 两弃两跟的一手里四个人都动过，于是被算成多人局，
   而摊牌其实只有两家。第 5 轮运行凑巧出现过一次两人都动的手所以判通过，第 6 轮就红了。
   一条看牌运气的断言比没有断言更糟：它会教人重跑到绿。改成数「还在这手牌里且没弃牌」
   （底牌位有牌 = 在这手牌里），由弃牌偏好定死，两轮运行的逐手数字完全一致。
3. **全下标记挂在 `onNewStreet` 上。** 全下常把一手打在翻牌前收掉，那一手一张公共牌都
   不发，钩子一次都不触发。`playHand` 加 `onAction`。
4. **8c 的全下原本有人跟，把 dave 打到 0。** 于是第 9 节在「reload 前 dave 看得到自己
   两张底牌」上红了。那不是产品缺陷，是我这一节把下游的前置条件打掉了——筹码归零的
   席位进 sit out 且再也进不了下一手。8c 改成无人跟的全下；有人跟的摊牌另放 9d，
   破产风险按筹码大小选定：全下方取 carol 之外筹码最少的一席，跟注方取最多的一席，
   于是只有全下方可能归零，而第 10 节依赖的 carol 一律弃牌。
5. **畸形投影只有断言没有送达计数。** 路由没命中、或者改错了层（投影嵌在 `body.view`
   里而不是顶层），页面收到的就是一份完好的投影，于是「页面没停死」恒为真、整节全绿。
   加了 `delivered` 计数并判它 > 0。

### 六、崩掉的运行在证据目录里留下了上一次的通过

第 7 轮运行死在 `route.fulfill: Route is already handled` 上。路由回调里的抛出是一条
未处理的拒绝，它绕过 `main` 的 `catch`，`finally` 不跑，`result.json` 写不出来——
于是目录里留下的是第 6 轮那份。第 6 轮恰好是 `passed: false`，但如果它通过，
一次崩掉的运行在证据目录里就长得和通过一模一样。

这和上一节的 negctl6 是同一类缺陷，载体从「判定式漏了 aborted」换成「陈旧文件」。
三处修：路由回调整体包 try（吞下的错误落进 `routeErrors`，由第 13 节结账，只吞不判
等于开一个静默失败的口子）、开跑前先删 `result.json`、加 `unhandledRejection` 处理器
（写明原因、删判定文件、退出码 1）。

负控实测：注入一条未处理拒绝 → 退出码 1、`result.json` 不留下、stderr 写明原因。

### 七、判定式抽到 .cjs，否则等于没有测试

8c / 8d / 9d 的判定原本写在 `.mjs` 里，而 `.mjs` 的逻辑单元测试装不进来。上一节的
「中止却判通过」正是这么漏过去的，所以这次先抽：`chipConservation`、
`degradationVerdict`、`handCoverage` 三个纯函数进 `test-support/acceptance-result.cjs`，
`.mjs` 调用它们。`test/multi-hand-verdict.test.cjs` 39 条，
`test-support/mutations/multi-hand-verdict.json` 41 条变异全部杀掉。

三条负控确认这些测试真的会红：等式式上界（旧写法）→ 2 红；不查送达次数 → 2 红；
全下只看动作不看画面标记 → 2 红。

一条变异第一次存活：`coverage-target-uses-loose-compare`（`reached < target` 放宽成
`reached < target - 1`）。原因是我的测试只有「差得远」那一组（到第 6 手），
而它在两种写法下都判失败。补了边界组：到第 9 手不算达标，刚好第 10 手算达标。

两条变异第一次存活是因为查找串在文件里出现两次，而我的断言只判「存在」：删掉其中
一处仍然被另一处满足。改成数出现次数。

### 八、边池：如实记为覆盖缺口

浏览器层证不了。投影只给 `pot_total`（`src/host/table-view-model.cjs:456`），
引擎算出来的 `pots` 分层根本没进 `tokengame.table-view.v1`，DOM 里没有边池可读。
没有写一条读 `undefined` 的断言——那种断言永远为真。分层由
`test/holdem-engine.test.cjs`「三个不同深度的 all-in 形成主池和两层边池」与
`test/cross-hand-stacks.test.cjs`「all-in 与边池结算后的 stack 跨手延续」在单元层钉住。
是否把分层投影出去供 UI 显示，列为待裁决项。

9d 补上了这条缺口的另一半：有人跟的全下确实走到摊牌、确实把一席打到 0，
而「筹码归零的席位不带着 0 筹码进下一手」这条 F1 第一次在浏览器层被验过。

### 全新克隆复跑（108c334）

门禁与浏览器验收都不依赖本机状态。方法：`git clone --no-hardlinks` 到临时目录，
不跑 `npm install`（本仓库 `package.json` 既无 `dependencies` 也无 `devDependencies`）。

| 项 | 结果 |
| --- | --- |
| `npm test` | 644/644 通过、0 失败、0 跳过 |
| `npm run gate` | `MUTATION_TOTAL=315 KILLED=315 SURVIVED=0 SKIPPED=0` / `GATE=PASS` |
| 浏览器验收 | 201 条断言全过、控制台错误 0、到第 12 手、27 张截图、exit 0 |
| `result.json` | `passed: true`、`steps_ran: 201`、`aborted: null` |
| 凭据原文 | 无（`invite_code` 等键后无长值；「已脱敏」标记出现 1 次） |
| 行尾抽查 | `multi-hand-verdict.test.cjs`、`multi-hand-verdict.json`、`acceptance-result.cjs`、`adapter-contract.cjs`、`HOST-ADAPTER-CONTRACT.md` 均 `i/lf w/lf` |

一处顺带确认了 9d 的设计成立：全新克隆那一轮里 carol 当了**跟注方**（395，桌上最多），
bob（89）全下、bob 归零。carol 覆盖得住 bob 的 89，所以她当跟注方不承担归零风险——
风险按筹码大小落在全下方身上这一点，与谁坐哪个位子无关。

### 又一处用户可见字符串，同样不擅自改

`plugins/tokengame/.codex-plugin/plugin.json` 的 `interface.longDescription` 写着
「牌局行动仍由独立四人 Web 牌桌裁决」。这句话不对，而且错在一个安全边界上：
裁决在权威内核（`src/authority/`），Web 牌桌只是 UI，它拿不到权威原始事件、拿不到席位凭据。
整套 F1–F6 的设计前提就是「裁决只在权威侧」，而这句描述把裁决说成在 UI 侧。
「四人」也已经不准确，牌桌不再固定四席。

没有改它，理由与 `src/authority/table-store.cjs` 那个牌桌显示名一致：这是用户可见的
市场描述文案，改它属于改用户可见语义，不在本轮权限内。列为待裁决项，并把「错在哪、
为什么这个错值得单独说」记在这里，避免它作为一句读起来通顺的话继续留着。

```yaml
review:
  unit: TG-EU-HOST-ADAPTER-CONTRACT
  date: 2026-08-28
  acceptance_label: ai_generated_acceptance
  commit_range: 46d5b5d..0e80395
  measured:
    npm_test: 644_pass_0_fail_0_skipped
    mutation_gate: 315_killed_0_survived_0_skipped_GATE_PASS
    browser_acceptance: 201_pass_0_fail_0_console_errors_27_screenshots_hand_12
    browser_acceptance_consecutive_clean_runs: 3
    new_mutation_specs:
      adapter-contract: 34_of_34
      seat-model-adapter: 14_of_14
      multi-hand-verdict: 41_of_41
  negative_controls:
    conformance_suite_holes_found_by_broken_variants: 4
    acceptance_verdict_equality_bound: 2_red
    acceptance_delivery_count_removed: 2_red
    acceptance_allin_tag_ignored: 2_red
    unhandled_rejection_injected: exit_1_no_result_json_reason_on_stderr
  defect_classes:
    unreachable_check_reads_as_pass: 4
    dead_condition_proven_by_surviving_mutation: 3
    test_fault_not_product_fault: 4
    stale_evidence_file_reads_as_pass: 1
    vacuous_assertion_no_delivery_proof: 1
    deal_dependent_assertion: 1
    my_section_broke_downstream_preconditions: 1
  host_neutrality:
    core_scanned_for_host_specific_branches: yes
    exempted_by_superseded_marker: [src/authority/event-store.cjs, src/authority/table-store.cjs]
    exemption_actually_needed_by: [src/authority/table-store.cjs]
    occurrence_is_branch_condition: no
  deferred_to_user:
    - host_command_adapter_implementation_requires_touching_closed_single_stack_host
    - whether_two_contracts_or_one_is_the_right_split
    - rename_codex_table_display_name_in_superseded_table_store
    - project_side_pot_layers_into_table_view_v1_for_ui
    - whether_all_of_test_support_enters_routine_mutation_scope
    - plugin_long_description_says_web_table_adjudicates_but_authority_does
  still_unverified:
    - real_host_gate_5_proactive_wake
    - four_human_uat
    - side_pot_layering_in_browser_layer
  fresh_clone_rerun:
    commit: 108c334
    method: git clone --no-hardlinks 到临时目录，无 npm install（本仓库无任何依赖）
    npm_test: 644_pass_0_fail_0_skipped
    mutation_gate: 315_killed_0_survived_0_skipped_GATE_PASS
    browser_acceptance: 201_pass_0_fail_0_console_errors_27_screenshots_hand_12
    result_json: passed_true_steps_201_aborted_null
    result_json_free_of_credential_literals: yes
    eol_check: 五个新文件均 i/lf w/lf
  not_covered:
    - four_player_smoke_every_candidates_frozen_stack
    - old_probe_stack_playwright_rerun
  requires_user_acceptance: yes
```

## 2026-08-29：把模型可见凭据边界关到失败关闭，把浏览器门禁的偶发 403 修到根因

两个闭环，两个原子提交：`287f083`（凭据边界）与 `5235bf5`（浏览器门禁）。

这一节和前几节是同一个主题的延续。前几节找到的是产品里、验收机器里、证据存储里
「永远不会红的检查」；这一节找到的是安全边界里的，以及**证据本身看不见一整类失败**。

### 一、三个模型可见出口，各自净化，于是各自有漏

`SeatModelAdapter` 有三条通往模型的出口：成功的 `result`、核心错误的 `details`、
本地拒绝的 `details`。三条各自调净化，于是成功路径漏了 `recovery_credential`。

用合成凭据复现，18 项里 5 过 13 失败。除了回显，还有一条更重的：
`adapter.surface.custody` 可以从公开属性一路取到句柄与凭据映射——也就是说
「适配器不把凭据交出去」成立，而「谁都拿不到托管」不成立。

修法是把三条出口收到同一个 `#guarded` 上，命中秘密时**失败关闭**返 `credential_leak`，
不是打码之后继续。打码继续等于把一次真实的泄漏降级成一条没人看的日志。

顺序是载荷，不是风格：先 `assertNoLeak` 再 `sanitizeResult`。反过来的话
`sanitizeResult` 会先把 `recovery_credential` 剥掉，扫描什么都找不到，于是上游的缺陷
被静默修好——而下一次上游换个字段名泄漏时，这里同样什么都不报。

能力收窄用真正的 JS 私有字段（`#custody` / `#dispatch` / `#surface` / `#issued`），
不是 `inspectableState` 里「选择不展示」。私有字段从外部取不到：点号取不到，
`Reflect.ownKeys` 取不到，`Object.keys` 取不到，`JSON.stringify` 也带不出来。
「选择不展示」只是当前这一版没展示。

### 二、把一次成功的拦截读成了泄漏

字段名扫描原先不带位置，于是 `seat_identity_not_model_supplied` 被判成泄漏——
那是一条**成功的拦截**，它的 `details.field` 的**值**恰好是 `"recovery_credential"`。

这个假阳性值得单独写一段，因为它的危险不在误报本身：一个把成功拦截报成泄漏的扫描，
会引下一个人去「修」那份报告，而最省事的修法是把那条拦截的 `details` 删掉——
于是真正丢掉的是拦截的可诊断性。扫描收窄到键位（`"field":` 这种形式），值扫描不变。

### 三、本地拒绝出口没有可构造的行为负例，就这么写

`ModelSurfaceError.details` 只有三种形状（`{field}`、`{command, field}`、`{command}`），
`field` 全是 `MODEL_FORBIDDEN_PARAMS` 里的字面量，`command` 在到达 `#surface.call`
之前已经被拦。所以这条出口今天没有能构造出来的行为负例。

三种做法：假装可达（写一个绕过产品路径的测试）、留一个存活的变异、或者如实记。
选第三种：加一条静态门禁存在性断言，把「这比行为断言弱」写进测试正文与变异规格的
`excluded`。静态断言的代价是改写成等价形式会误红——写清楚比装作没有更好。

### 四、只测适配器，等于把「谁该有托管」换成「适配器不交出去」

`surface-*-public-again` 那几条变异先是存活了。原因是我的对象图搜索从 `adapter` 起步，
而那几条变异重新暴露的是 `ModelCommandSurface` 上的属性，那个对象由
`plugins/tokengame/mcp/server.cjs:32` 直接持有。

补一条从直接构造出发的图搜索。这处失误的一般形式值得记：只测「我的门把东西关住了」，
测不出「这东西本来就不该在任何人手里」。

### 五、控制台证据看不见一整类失败

B.1 原本要的只是给证据加字段。加的过程中发现的是另一件事：

**4xx 不产生 `requestfailed` 事件。** `fetch` 拿到 403 是「成功收到了响应」，
浏览器不为它打控制台日志。于是「四个上下文控制台错误合计为 0」这句话对
「请求发出去了但被拒」这一整类失败完全免疫——不是漏了几条，是结构上看不见。

所以新增的判据是 `response` 事件上的「窗口外非 2xx/3xx 必须为 0」，
配一条反面：断网窗口内必须记到过网络失败，否则说明掐路由没生效，而那会让整节
在正常网络下跑——通过了也什么都没证明。

豁免一律按语义。`net::ERR_ABORTED` 的含义是**发起方撤回**，它与
`ERR_CONNECTION_REFUSED` / `ERR_CONNECTION_RESET` / `ERR_TIMED_OUT` /
`ERR_NAME_NOT_RESOLVED` / `ERR_NETWORK_CHANGED` 是不相交的两组，再收窄到客户端
设计上会撤回的那两条路径。`badResponses` 一条都不豁免。按「403」这种文本白名单
过滤会顺手滤掉真实缺陷，而 409 这种文本恰好也是真实幂等缺陷的样子。

### 六、那个偶发 403 有三个来源

目标只说了一个。测出来是三个，而且分属两类：

**测试窗口竞态。** 证据原先在响应到达时刻分类，而窗口在那之前已经关了。改为按
**发出时刻**分类——Playwright 的请求对象在 `request` / `requestfailed` / `response`
之间保持同一身份，所以用 `WeakMap` 记发出时的阶段与窗口状态。跨阶段的事件数目单独
报出来：它们不算失败，但必须可见，否则下一个人看到偶发 403 只能猜是哪一类。

**产品竞态之一，离桌。** `await act("seat.leave")` 期间 700 毫秒的 interval 会照常
飞出一次轮询，它带的凭据正是这次离桌要作废的那一份。

**产品竞态之二，掉线。** 严格更坏。轮询带着 `connection_id`，而那条请求同时是心跳；
`table-web-host.cjs` 的 `touchConnection` 对一个已被摘掉的连接 id 会**重新建连**
（那是拔网线场景要的行为，理由写在那个方法上）。所以 await 期间飞出去的那一跳
不是打一条 403 就完了——它把刚刚的掉线撤销了，同桌看到掉线标记闪一下就没，
保留窗根本没开始走。

第三条用响应围栏挡不住：请求已经到了服务端，连接已经重建，丢掉响应改变不了这件事。
只有顺序能修。两条都改成「先 `stopPolling()` 再发请求」，并给 `stopPolling` 加上
中止在飞的那一次——`clearInterval` 拦得住「下一次」，拦不住「这一次」。

用 2.5 秒慢响应把窗口撑开做双向验证：旧客户端 1 条 403 + 1 条控制台错误，新客户端 0 条。

### 七、我自己的第一版修法制造了噪声

第一版我在 `refresh` 里也中止上一次轮询。看起来更严格，实际是错的：验收里冒出
两条 `/api/view` 的 `ERR_ABORTED`。

一条已经发出的轮询同时是心跳，让它自然完成对服务端有用；中止它只换来一条
`ERR_ABORTED`，而噪声会淹掉真的网络失败——而「窗口外网络失败为 0」正是新加的判据。
重叠由 await 之后那道围栏处理，代价为零。中止只保留在 `stopPolling`，
那里的请求对服务端有副作用。两半都写进 `test/poll-lifecycle-race.test.cjs`。

### 八、确定性发牌解决了漂移，没解决覆盖

9d 的破产分支取决于摊牌，于是断言项数在 200/201 之间跳。加了种子（sfc32 + 拒绝采样）
之后两次运行名单完全一致，看起来就完了。

但落在了**没有覆盖**的那一支：种子正好让全下方赢（95→194），
于是脚本报一条「这一手没有人归零，破产路径本轮未走到」然后通过。

**稳定缺失比随机缺失更坏。** 随机缺失下一次运行还有机会暴露；稳定缺失不会再暴露，
而报告上写着「确定性发牌，两次名单一致」——读证据的人会认为覆盖是稳的。

所以 9d 改成重复「短码全下、大码跟、其余弃」直到真有一席归零，预算用尽就红，
不再留「本轮未走到」这种恒真收尾。失败全部收集到循环外一次性判定，
断言条数与循环了几轮无关——循环里直接 `check()` 的话，项数会随「第几轮打出破产」
变化，那正是这一节要消除的漂移换了个来源。

顺带修掉代码与注释不符的一处：注释写「carol 一律弃牌」，而 `richest` 没排除她，
实测里她成了跟注方。现在跟注方从「除全下方之外」里选，并显式检查覆盖得住全下方——
覆盖不住时这一手可能把跟注方也打到 0，而下游三节各自依赖 carol / bob / dave 还在席，
那会让失败出现在与根因无关的地方。

### 九、种子不是后门，而这话要用结构说

种子只改洗牌顺序：不放宽任何一条命令的授权，也不多给任何人一张牌的可见性——
底牌可见性由权威的 `view.hand` 按席位裁决，与牌是怎么洗出来的无关。

真正的风险是把种子带进真实对局。所以约束全在「谁能开」：只在自带内核时读、
只允许回环监听、启动时必须如实报告指纹（绝不报原文，原文进日志之后任何读到日志的人
都能预测发牌）。外加一条源码断言：入口不出现 `stackedDeck` / `requireSeatCredential` /
`SEAT_AUTHORIZED` / `recovery_credential` / `seat_handle`。

验收脚本断言的是**服务端确认了**种子生效，不是本脚本设过环境变量。设过与生效是两件事。

### 十、变异测试第三次指出我的断言不成立

三处，都不是审读发现的：

**六面骰查不出取模。** 「拒绝采样退化成取模」这条变异在原有的均匀性断言下存活。
算一下就知道为什么：2^32 对 6 的取模偏差约 1.4e-9，比那条 5% 容差小九个数量级。
换上界到 3×2^30——拒绝采样下最低段占 1/3，取模下占 1/2——实测 33.3% 对 50.0%。

**detail 里的同一个三元。** 四条 `xxxFailures` 断言原先只查串在文件里出现过，
而每条 `check` 的 detail 里也有一个 `xxxFailures.length === 0 ? ... : ...`，
于是把条件位换成 `true` 仍然满足：收集照做、判定没了，而这件事没有任何语法迹象。
改为断言 `check` 的**条件位**。

**`post` 收下 signal 却不传给 fetch。** 这是本轮最危险的一条：所有中止代码看上去
都还在——`abort()` 调得到、不报错、控制器确实置成已中止，只是那个句柄跟在飞的请求
毫无关系。补一条三段断言：参数上解构出 signal、fetch 选项里出现 signal、
函数体里不能再声明同名变量把参数遮掉（少了第三条，「签名还接着、值被丢掉」照样满足）。

### 十一、两条杀不掉的变异，实测之后如实记

去掉 sfc32 的 12 次预热丢弃、把四个 FNV 起点改成同一个——两条都杀不掉。
这次是量出来的，不是推断的：相邻种子 1–64 各洗第一副牌，三项指标与基线无法区分
（互不相同 64/64 对 64/64 对 64/64；前八张同位同牌 1.85% / 1.81% / 1.97%，
随机期望 1.92%；第一张用到的牌面 39 / 40 / 39 共 52）。

原因是 `seedToState` 那轮额外搅拌已经承担了实际的去相关，两者是第二道防线。
留着代码（sfc32 参考实现的通行做法，且 `seedToState` 若日后简化就重新有用），
但不为它们编一个阈值——那样的断言只会在改动无关代码时红。数字写进 `excluded`。

同样记在 `excluded` 的还有一条更大的代价：`poll-lifecycle-race` 十条里多数只由
源码断言杀。`web/table/table.js` 是 classic script，没有任何测试能 require 它，
而 Playwright 层要复现这些竞态需要 2.5 秒慢响应那种人为窗口（探针做的正是这件事，
但探针不是回归测试）。源码断言查的是代码长什么样，不是它做了什么。

### B.4 稳定性门禁

工作树连跑 3 次 + 全新无硬链接克隆连跑 3 次，六次全部 EXIT=0、各 209 项全过、
到第 13 手。名单用 `artifacts/drift-diff.cjs` 逐条比对多重集，不是只比条数——
只比条数的话，两条断言一进一出会看起来一致。破产分支六次都走到（第 2 轮归零 bob）。

克隆里 `git ls-files --eol` 全部 `i/lf w/lf`，尽管本机 `core.autocrlf=true`；
`src` / `test` / `web` / `test-support` 与源仓字节一致。

```yaml
review:
  unit: TG-EU-SINGLE-STACK-WEB-TABLE
  date: 2026-08-29
  acceptance_label: ai_generated_acceptance
  commits:
    credential_boundary: 287f083
    browser_gate: 5235bf5
  measured:
    npm_test: 698_pass_0_fail_0_skipped
    mutation_gate: 358_killed_0_survived_0_skipped_GATE_PASS
    browser_acceptance: 209_pass_0_fail_0_console_errors_0_out_of_window_network_failures_hand_13
    browser_acceptance_consecutive_clean_runs_working_tree: 3
    browser_acceptance_consecutive_clean_runs_fresh_clone: 3
    step_name_multiset_identical_across_all_six_runs: yes
    bust_branch_reached_in_all_six_runs: yes
    new_mutation_specs:
      credential-boundary: 19_of_19
      deterministic-deck: 9_of_9
      poll-lifecycle-race: 10_of_10
    extended_mutation_specs:
      multi-hand-verdict: 41_to_46
  negative_controls:
    credential_boundary_reproduced_on_old_code: 18_items_5_pass_13_fail
    object_graph_search_nodes: 55
    object_graph_paths_to_custody_via_adapter: none
    object_graph_control_group_still_extractable: yes
    leave_403_old_client: 1_403_plus_1_console_error
    leave_403_new_client: 0
    poll_lifecycle_tests_on_old_client: 2_pass_6_fail
    poll_lifecycle_tests_on_new_client: 10_pass
    modulo_bias_probe: rejection_33.3_percent_vs_modulo_50.0_percent
  defect_classes:
    per_exit_sanitisation_left_one_exit_unguarded: 1
    capability_reachable_via_public_property: 1
    false_positive_that_invites_deleting_the_report: 1
    tested_my_gate_not_the_capability_owner: 1
    evidence_structurally_blind_to_a_failure_class: 1
    classified_evidence_at_arrival_not_at_issue: 1
    lifecycle_race_response_fence_cannot_fix: 1
    my_own_fix_generated_noise_that_masks_real_failures: 1
    determinism_stabilised_a_missing_branch: 1
    assertion_matched_text_in_detail_not_in_condition: 1
    tolerance_nine_orders_too_loose_to_detect: 1
    comment_contradicted_code_selection: 1
  no_behavioural_negative_available:
    - model_local_rejection_exit
    - sfc32_warmup_discard
    - four_distinct_fnv_offsets
  honest_costs:
    - client_facts_pinned_by_source_assertions_only_classic_script_unloadable
    - static_gate_presence_assertion_weaker_than_behavioural
    - stderr_human_readable_seed_warning_has_no_regression_guard
  fresh_clone_rerun:
    commit: 5235bf5
    method: git clone --no-hardlinks，无 npm install（本仓库零依赖）
    npm_test: not_rerun_in_clone_this_round
    browser_acceptance: 209_pass_x3_all_exit_0
    eol_check: 全部 i/lf w/lf，尽管本机 core.autocrlf=true
    byte_identical_to_source: src/ test/ web/ test-support/
  still_unverified:
    - real_host_gate_5_proactive_wake
    - four_human_uat
    - side_pot_layering_in_browser_layer
  not_covered:
    - four_player_smoke_every_candidates_frozen_stack
    - old_probe_stack_playwright_rerun
    - npm_test_inside_fresh_clone_this_round
  deferred_to_user:
    - host_command_adapter_implementation_requires_touching_closed_single_stack_host
    - whether_two_contracts_or_one_is_the_right_split
    - plugin_long_description_says_web_table_adjudicates_but_authority_does
    - policy_epoch_must_be_enforced_authority_side_not_ui_only
  requires_user_acceptance: yes
```

## 2026-08-29（承接）：把请求信封接到真实路径，把合同版本号收成一处

### 这一轮改的是「只在测试里成立的合同」

前几轮找出的是「永远不会红的检查」，逐层往外：产品里、验收机械里、证据存储里、
安全边界里。这一轮换了个方向——不是检查不会红，而是**合同只在纯函数测试里成立**。

`requestEnvelope` 有完整实现、有测试、被文档写成协议的一部分，唯一的问题是
**零个非测试调用方**。两个真实传输各自 `JSON.stringify({ command, params })`，
线上从来没有过 `contract_version`。这类缺陷的隐蔽处在于：所有断言都是真的，
helper 真的会构造正确的信封，测试真的在验它——只是没人用它。

二选一里选接线不选删除，理由是版本号存在要回答的那句话。响应带版本、请求不带，
意味着服务端没有任何办法察觉一个跑在别的合同上的客户端。E 阶段马上要来第二个适配器，
那时这件事从「文档不准」变成「跨版本调试只能靠猜」。

缺版本也拒，不当成「旧客户端」放行：放行等于让这条检查对任何从不带版本的客户端
永远不会红——正好是前几轮一直在拆的那个形状。

### 单一来源：源码断言钉不住，行为测试钉得住

变异首轮 12 条里 4 条存活，全是一类：把常量抄成两份、或让传输自己拼
`contract_version: 1`。这类写法**此刻什么都不坏**——两个数相等、形状也对、
既有断言全绿。危险全在将来：下一次改版本号的人只会改一侧。

顺手的答案是加一条源码断言，查 `require("../shared/contract-version.cjs")` 那行在不在。
那钉的是文本：改成 `const CONTRACT_VERSION = 1;` 之后再把那行 require 留在文件里
（哪怕不用），断言照样绿。

改成把那唯一的来源换掉，看五处是否都跟着变。它测的是「值从哪儿来」，
所以两类写法都会红，而正确的单一来源会过。逐条验过归因：四条变异各自被对应那条
断言杀掉，不是被别的测试连带杀掉——这一步不能省，前几轮出过「杀是真的、
归因是错的」。

MCP 那侧 `coreRequest` 没有导出、也不收注入的 fetch。没有为可测性给产品加导出：
它按 `TOKENGAME_COMMAND_ORIGIN` 决定打给谁，指向一个只负责记账的假核心就能看见
落地字节。产品面不该为了被测而变宽。

### 自己的测试里也有同一类问题

写完发现 fake 版本号写死成 99/98/97：等版本号真的涨上去撞上其中一个，那条测试会在
「fake 等于真值」的情况下继续全绿，而它要区分的恰恰是这两者。改成由真值加偏移算出。

`await body()` 那条相反——实测杀不掉，且原因是结构性的而非疏漏：
`const { X } = require(...)` 在加载那一刻取值，所有读版本都落在同步前缀里。
没有为了让它变成「被覆盖」去造一条依赖还原时机的测试，那是为了杀变异而写测试。
按前几轮 RNG 那两条的同一处理：连测得的数字一起写进 `excluded`。

### 浏览器验收覆盖不到本轮改动，如实记下

209 项全过，但 `core_transport=in_process`——而 `InProcessCoreClient` 直接调
`surface.dispatch`，根本不构造信封。所以这份验收对本轮改的 HTTP 传输**零覆盖**，
写成「浏览器验收通过所以传输没问题」就是把无关证据当成相关证据。

远端那条另探：起真内核、Web 牌桌设 `TOKENGAME_COMMAND_ORIGIN`，确认
`core_transport=http` 且过 HTTP 建房 200，再双向验证——把版本从客户端摘掉，
探针红成 `contract_version_missing`。探针留在 `artifacts/`（已 gitignore），
不入库也不计入门禁：它要起两个真进程、占两个端口，属于验收级不是单元级。

远端模式跑不了整套 209 项：`run-table-core.cjs` 不接受牌堆种子，确定性发牌那几条
断言只对自带内核成立。**没有为了让远端模式通过去弱化那些断言**——那会把上一轮
刚补上的确定性覆盖拆掉。

```yaml
review:
  date: 2026-08-29
  commit: e6397c3
  scope: C_contract_truth
  closed:
    - id: C1_wording
      change: 措辞_两份合同_to_一套协议两个权限剖面
      structural_change: none
      note: ADAPTER_ROLES 本来就按对象身份引用，没有拷贝；关闭的是说法与结构不符
    - id: C2_request_envelope
      decision: wire_in_not_delete
      why: 响应带版本请求不带，服务端无法察觉跨版本客户端；E 阶段第二个适配器在即
      call_sites_before: 0_non_test
      call_sites_after: [HttpCoreClient, mcp_coreRequest, core_entry_probe, remote_player]
      gate_position: after_token_before_dispatch
      missing_version: rejected_not_tolerated
      constant_moved_to: src/shared/contract-version.cjs
      why_not_authority_requires_contract: would_invert_dependency_direction
      why_not_copy: same_reason_C1_forbids_copying_command_lists
    - id: C3_gateway_vs_runtime
      seat_model_adapter: reference_impl_zero_run_path_construction_sites
      evaluate_wired_into: driveOnce
      only_evaluate_impl: scripted_adapter_hardcoded_simulated_true
      pinned_bidirectionally: test/adapter-integration-truth.test.cjs
      doc_ban_scoped_to: status_table_not_whole_file
  measured:
    npm_test: 714_pass_0_fail_0_skipped
    mutation_gate: MUTATION_TOTAL=370 KILLED=370 SURVIVED=0 SKIPPED=0 GATE=PASS
    new_mutation_spec: request-envelope_12_of_12
    request_envelope_first_run: 8_killed_4_survived
    survivor_class: correct_today_drifts_tomorrow
    survivors_killed_by: test/contract-version-single-source.test.cjs
    attribution_verified_one_by_one: yes
    new_test_files:
      - test/adapter-integration-truth.test.cjs_6_of_6
      - test/contract-version-single-source.test.cjs_5_of_5
    browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
    remote_transport_probe: 4_of_4_and_reddens_when_version_dropped
  own_defects_found_by_mutation_not_by_reading:
    - hardcoded_fake_version_would_collide_with_real_version_someday
    - four_survivors_showed_source_assertion_would_have_been_the_weak_answer
  known_costs_recorded_with_numbers:
    - id: single-source-helper-drops-await
      measured: pass_5_fail_0_with_await_removed
      reason: require_destructuring_captures_value_at_load_all_reads_in_sync_prefix
      refused: writing_a_test_that_depends_on_restore_timing_just_to_kill_it
  unverified_boundaries:
    - browser_acceptance_runs_in_process_transport_so_covers_nothing_of_this_change
    - remote_mode_cannot_run_full_209_no_deck_seed_in_run_table_core
    - gate_5_proactive_wake_still_unverified
  refused_to_weaken:
    - deterministic_deck_assertions_to_make_remote_mode_pass
    - product_export_added_just_to_make_mcp_transport_testable
  next:
    - D_conformance_suite_check_id_and_status_enum
    - D_add_request_envelope_check_to_conformance_suite_same_file_rewrite
    - E_host_command_reference_adapter
    - governance_policy_epoch_authority_side
    - governance_plugin_json_says_web_table_adjudicates
  requires_user_acceptance: yes
```

## 2026-08-29（承接）：一致性报告从「一串名字」改成可对账的结构

### 「跳过」和「通过」长得一样，这一次的载体是数组长度

旧报告是一个 `checks` 数组加一个 `failures` 数组。跳过一段检查的后果是数组短几条，
而没有人数。上一轮那条 `assert.ok(report.checks.length >= 18)` 是唯一的防线，
它挡得住整段消失，挡不住某一条被跳过——而单条被跳过恰恰是更常见的形状。

改法是把必需项**先登记再对账**：按角色列出必需的 check_id，跑完逐条比对，
漏记、重记、记了不属于本角色的都是硬失败。这样「没跑到」在报告里是一条
带 `status: not_run` 的记录，不是数组里少一项。

结构问题一并进 `failures` 而不是只留在 `report_integrity` 里。只放后者的话，
一个只看 `failures` 的调用方会把一份缺了十条的报告读成通过——那正是要拆的形状，
换个字段名重新长出来。

### 要 check_id 的直接理由，不是「id 比名字规范」

名字里带插值：`越界命令 ${outOfFace} 被本地拒绝` 在两个角色下是两个字符串。
所以按名字断言就得按角色分支，跨报告也对不上账。

更要紧的是变体测试的归因。断言 `failures.length > 0` 只能证明有东西红了，
证明不了红的是该红的那一条。`out_of_face_passthrough` 就是活例：它把
`assertUsable` 整个清空，于是连带破坏了释放语义，被「释放后不能再发命令」抓住——
越界那一条其实一次都没红过，而报告读起来是「套件抓住了这项破坏」。

现在每个变体声明 `expect`，测试断言那些 check_id 确实在 fail 列表里。
同一处再加一条完整性断言：缺条时 `expect` 里的 id 当然也找不到，
但原因是没记而不是没红，两者必须分得开。

### passed 拆成两个，且不留同名字段

旧的 `passed = failures.length === 0` 在 `unverifiable` 非空时仍然是 true。
于是一份「Gate 5 根本没验」的报告，最显眼的那个字段写着通过。

拆成 `conformance_passed`（实现遵守了合同）与 `fully_verified`（合同的每一条都真的验过）。
刻意**不再导出一个叫 passed 的字段**：留一个兼容别名等于留一条最省事的读法，
而所有调用方都会走那条。改名迫使每个调用点说出自己要的是哪一个——这次改动里
三处调用点各自做了这个选择，没有一处是机械替换。

`proactive_wake_actually_works` 恒定登记，且刻意没有 pass 分支：声明了记 unverifiable，
没声明记 not_run。套件永远不该产出一条读起来像「主动唤醒验过了」的记录，
哪怕适配器根本没声明这个能力。

### 四条变异没有任何适配器能触发

漏记、重记、结构问题不进 failures、未登记 id 被悄悄接受——这四种是**套件自己**的
缺陷形状，没有任何适配器实现能让它们发生。所以「套件抓得住 BROKEN 变体」那一批
测不到这里。

为它们写了一个直接对着记账器构造的测试文件，并为此导出 `createLedger`。
这不是为可测性给产品开口子：`test-support/adapter-conformance.cjs` 整体是测试机械。
同一轮里我拒绝了给 `plugins/tokengame/mcp/server.cjs` 加导出，因为那是产品面——
两处的判断依据是同一条，落点不同。

### 又在自己刚写的检查里找出两处不会红

请求载荷那条原先比序列化后的字符串。而 `JSON.stringify` 在**两侧**都会丢掉函数属性，
所以 `{a:1, f(){}}` 和它的往返结果序列化出来完全相同，那条断言恒成立。
变异 `unserializable_dispatch_params` 指出来的，不是审读发现的。改为比键的数目。

紧接着补的那条逐个比成员的断言随即成了新的永不会红项：JSON 往返只丢键、
不新增也不改名，所以等长子集必然是同一集合，数目那条已经先拦下了。
删掉，而不是留着代码再配一条 `excluded`——留着的话下一个读代码的人会以为它在守什么。

### 请求信封在适配器层的落点由结构决定，不由计划决定

C 阶段的计划写着「D 里把请求信封检查加进一致性套件」。实际结构不允许照字面做：
适配器交给传输的是 `dispatch(command, params)` 两个位置参数，里面没有信封；
信封由传输构造。硬要在适配器层查信封，只能要求实现暴露它并不拥有的东西。

落成的是 `dispatch_payload_envelope_ready`：验「交下去的载荷构不构得出合规信封」——
命令非空且在本角色命令面里、参数是可序列化的普通对象、真的拿 `requestEnvelope`
构一遍且三个字段对得上。这一条抓得住两种真实缺陷：适配器改写命令、
参数带方法导致传输那一跳静默丢字段。两者都各配了一个 BROKEN 变体。

```yaml
review:
  date: 2026-08-29
  commit: 31537dc
  scope: D_conformance_suite
  closed:
    - id: D1_check_id_and_status
      statuses: [pass, fail, not_run, unverifiable]
      required_checks_registered_per_role: true
      integrity_checks: [missing, duplicated, unknown]
      integrity_also_in_failures: true
      why: 只留在 report_integrity 里的话，只看 failures 的调用方仍会读成通过
      early_return_now_marks_rest_not_run: [no_factory, construct_threw]
      why_check_id_not_name: 名字里带插值，跨角色是两个字符串，跨报告对不上账
    - id: D2_conformance_passed_vs_fully_verified
      conformance_passed: no_fail_and_integrity_ok
      fully_verified: conformance_passed_and_no_unverifiable_and_no_not_run
      passed_field_removed: true
      why_no_alias: 留同名别名等于留一条最省事的读法，所有调用方都会走那条
      proactive_wake_check: 恒定登记且无 pass 分支（声明→unverifiable，未声明→not_run）
      fully_verified_both_roles: false
    - id: D3_broken_variants_assert_check_id
      every_variant_declares_expect: 16
      new_variants: [rewrites_dispatch_command, unserializable_dispatch_params]
      why: out_of_face_passthrough 曾被下游检查抓住，越界那条其实是空的
    - id: C2_leftover_request_envelope_in_conformance
      landed_as: dispatch_payload_envelope_ready
      why_not_literal_envelope: adapter 交的是 (command, params) 两个位置参数，信封在传输层
      needs_caller_hook: observeDispatch，缺了记 not_run
      refused: 给适配器加导出或后门以便查信封
  measured:
    npm_test: 734_pass_0_fail_0_skipped
    mutation_gate: MUTATION_TOTAL=385 KILLED=385 SURVIVED=0 SKIPPED=0 GATE=PASS
    new_mutation_spec: conformance-report_15_of_15
    conformance_report_first_run: 5_killed_10_survived
    repaired_stale_finds: [adapter-contract_8_entries, seat-model-adapter_1_entry]
    new_test_file: test/conformance-report-integrity.test.cjs_8_of_8
    adapter_conformance_tests: 55
    browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
  own_defects_found_by_mutation_not_by_reading:
    - 请求载荷检查比序列化字符串，而两侧都丢函数属性，断言恒成立
    - 补上的逐个比成员断言随即成为永不会红项，删掉而非配 excluded
    - rewrites_dispatch_command 起初改写成 room.create，那在真人面里合法，于是那一侧抓不到
  four_mutations_no_adapter_can_trigger:
    - integrity-ignores-missing
    - integrity-ignores-duplicates
    - integrity-not-in-failures
    - unknown-check-id-tolerated
    killed_by: test/conformance-report-integrity.test.cjs（直接对记账器构造）
    required_export: createLedger
    why_acceptable: adapter-conformance.cjs 整体是测试机械；同轮拒绝了给 MCP server 加导出，判断依据同一条
  unverified_boundaries:
    - gate_5_proactive_wake_still_unverified
    - fully_verified_false_for_both_roles_by_construction
  next:
    - E_host_command_reference_adapter_with_characterization_tests
    - E_claude_host_adapter_browser_free_parts
    - governance_policy_epoch_authority_side
    - governance_plugin_json_says_web_table_adjudicates
  requires_user_acceptance: yes
```

## 2026-08-29（承接）：把实质性改变写成 policy epoch 由权威侧强制，并修正入口文案的裁决者

结论：两项治理真值闭合。公开范围同意的实质性判据此前只在界面上成立——`limits_version`
写进了确认记录却从不被 `requireConfirmedScope` 检查，绕过界面直接打命令的调用方在额度实质
放宽之后仍握着旧同意继续发言。`plugin.json` 的入口文案则把裁决权说成 Web 牌桌。两件事的共同
形状是「承诺写在一处、执行在另一处，而两处不对账」。

同意门只在界面上成立等于没有同意门。这不是措辞问题：`src/host/table-view-model.cjs` 里那一维
判定得完全正确，`test/scope-reconfirmation.test.cjs` 也一直是绿的，因为它测的正是界面那一层。
权威侧那半从来没有被任何测试要求过。

`policy epoch` 把六个公开范围字段加绑房、桌规合成一个串，gate 与投影同一处推导，比较点只有
一处。合成之前是逐维比对，而逐维比对漏掉了一维——将来加第七维时，「加了但某处没比」这个
形状会重现，合成之后它没有地方重现。

「实质」是显式清单而不是「任意配置变化」。`version` 与 `bubbleDisplayMs` 列进
`POLICY_EXCLUDED_FIELDS` 并各自写了理由，而不是简单地不提它们：把 `version` 算进去会让任何
版本号变动都让既有确认失效，同意门被刷成噪音；`bubbleDisplayMs` 只改本地屏幕上停留多久。
`playerRollingWindowMs` 反过来算实质——窗时长与条数合起来才是速率，只看条数会漏掉「条数不变
而窗缩短」这一路提速。

这一轮反转了一条既有断言，而那是裁决不是回归。`test/scope-reconfirmation.test.cjs` 开头本就
把「权威侧要不要按版本串强制」记成待裁决项，并写明按版本串强制会让一次非实质的版本号变动也让
既有确认失效。裁决是不强制。反转的断言在提交信息、STATUS 与计划树里都标成了有意改动。

```yaml
review_2026_08_29_governance_closure:
  commit: 4456a4c
  baseline_before: b517cec
  governance_item_1_policy_epoch:
    defect: limits 那一维只在 src/host/table-view-model.cjs 生效，权威侧从不比对
    consequence: 绕过界面的调用方在额度实质放宽之后仍握旧同意继续发言
    why_tests_were_green: 既有测试测的正是界面那一层，权威侧那半从未被任何测试要求
    fix: src/authority/policy-epoch.cjs，六个公开范围字段加绑房桌规合成一串，gate 与投影同一处推导
    materiality_is_explicit_not_any_config_change:
      excluded_with_reasons: [version, bubbleDisplayMs]
      why_version_excluded: 算进去则任意版本号变动都让既有确认失效，同意门被刷成噪音
      why_rolling_window_included: 窗时长与条数合起来才是速率，只看条数会漏掉窗缩短那一路
    decided_reversal_not_regression:
      file: test/scope-reconfirmation.test.cjs
      was: 版本串变化即要求重新确认
      now: 版本串变化本身不算实质，实质性由 epoch 表达
      authority: 该文件开头记录的待裁决项，本轮裁决为不按版本串强制
  connected_defect_found_by_wiring_not_by_reading:
    what: projection() 读 roomState() 顶层的 room_binding_id，而那些字段收在 .room 里
    symptom: 投影报的 epoch 恒为 binding:-|rules:-，界面每次渲染都要求重新确认、理由永远 new_room_binding
    why_silent: 权威侧照常放行，没有任何错误日志；玩家看到一个点了也不消失的同意门
    why_unit_tests_missed_it: policy-epoch 那组直接拿真值调权威，两侧都对
    found_by: 把 epoch 接进视图层之后 scope-reconfirmation 的既有断言变红
    new_assertion: 投影 epoch 与 gate epoch 同值，且两段都不是空壳（三段全缺也是合法字符串）
  fallback_pinned_at_its_own_condition:
    kept: 三字段旧路径，作为权威不报 epoch 时的退路
    problem_after_wiring: epoch 分支优先，于是退路在生产路径上不可达，退路里的取值错误没有可观察后果
    survivor_that_exposed_it: host-reports-lifecycle-version
    why_it_survived: 不是因为它无害，而是因为没有测试站在它会造成伤害的那个条件上
    new_test: 摘掉投影里的 policy_epoch，站在「内核不报这个字段」那个条件上
    rejected_alternative: 直接删掉退路——那是在一条可能对更旧内核有意义的路径上改行为
  governance_item_2_entry_copy:
    was: 牌局行动仍由独立四人 Web 牌桌裁决
    now: 牌局行动由宿主中立的权威内核裁决，Web 牌桌只是真人操作它的界面之一
    why_it_matters: 读者据此以为换一个界面就换了一个裁决者，于是「两个宿主是不是同一场牌局」的答案在装机页上是错的
    charter_reference: L2 点名要防的「不同房间命名空间或独立玩家身份」
    previously_unwatched: 装机前唯一的说明此前没有任何检查看着它
  own_defect_found_by_mutation_not_by_reading:
    - 我自己写的 /真人的决定|由真人/ 松散选项被「通常由真人操作」满足
    - 后果是一道硬边界被读成一个习惯做法，而「通常」意味着存在例外，这里没有例外
    - 变异 soften-human-decision 从这个缺口活着出去；改为另外要求「发不出」并禁掉限定词
    - 同类修正：缺字段占位符那条原先比「有值 vs 缺字段」，而真正的相撞是「缺字段 vs 显式空值」
  stale_mutation_finds_repaired:
    file: test-support/mutations/f3-public-scope-consent.json
    count: 3
    F3-04: 逐维比已换成比 epoch，改成「只比 epoch 的一部分」——掉绑房那一段
    F3-05: 改成拒绝时不说哪一维变了，并把 test 指向断言 details.reason 的那个文件
    F3-13: 原替换让对象字面量收不了口（INVALID 而非存活），改成整块替换
  measured:
    target_tests:
      policy-epoch: 18_of_18
      plugin-entry-copy: 5_of_5
      scope-reconfirmation: 14_of_14
    red_on_old_code: {policy-epoch: 3, plugin-entry-copy: 3, scope-reconfirmation: 2}
    npm_test: 756_pass_0_fail_0_skipped
    mutation_gate: MUTATION_TOTAL_410_KILLED_410_SURVIVED_0_SKIPPED_0_GATE_PASS
    gate_first_run: 406_killed_1_survived_3_unevaluated_GATE_FAIL
    new_mutation_specs: {policy-epoch: 16_of_16, plugin-entry-copy: 9_of_9}
    browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
  unverified_boundaries:
    - 验收里那三条重新确认改写的是 /api/view 响应体，检验客户端渲染而非 epoch 判定本身
    - epoch 端到端对得上的证据是同意门在确认后确实收起（修复前会永不收起），不是直接断言 epoch 值的浏览器步骤
    - gate_5_proactive_wake_still_unverified
    - 门禁通过后出现过一次孤立失败（755 过 1 失败），随后连续六轮 756/756；那一轮没抓到用例名，故不指认为已知抖动
  next:
    - E_host_command_reference_adapter_with_characterization_tests
    - E_claude_host_adapter_browser_free_parts
  requires_user_acceptance: yes
```

## 2026-08-29（承接）：host_command 剖面终于有了一份真实实现

结论：合同的真人侧不再只有模拟器。此前 `host_command` 那一侧的一致性套件跑的全是
`test-support/adapter-simulator.cjs`，而模拟器过了只说明套件自洽——一份只有模拟器实现的剖面，
整个就是本轮反复撞到的那类缺陷：一段永远走不到的检查。

`src/host/host-command-adapter.cjs` 与 `TableWebHost` 的关系必须先说清楚，因为它最容易被读成
「重写了牌桌」。牌桌是产品：HTTP 路由、会话表、轮询租约、驱动定时器、视图投影，已经闭合，
有 209 条浏览器验收看着。参考适配器一行都不碰它，也不起服务、不开定时器、不碰网络——一致性
套件必须能在没有核心的情况下构造它。运行路径上零个构造点，而那句话现在是一条会红的对账，
不是一句散文。

写这一层时最值得记的是**第一版做错、并且做错的方式很典型**的那一处：我在本层抄了一份
`CREDENTIAL_COMMANDS`，而托管层的 `inject` 自己就按那份清单分流。抄的动作是我自己在同一个
文件的注释里刚警告过的（「抄一份的后果是两处会漂移」），而我照样抄了——因为在写「哪些命令
要注入」这一步时，手边最顺的做法就是把清单拿过来。删掉那份副本之后，本层不再判断哪些命令要
凭据：句柄有就交上去，由 `inject` 决定用不用它。

```yaml
review_2026_08_29_host_command_adapter:
  commits: [0542c1c, b93b3d5]
  baseline_before: 010a116
  why_a_reference_implementation_at_all: >-
    让真实实现去过一致性套件，是唯一能证明「这份合同可实现」的办法。
    模拟器全绿只说明套件自洽。
  what_it_deliberately_is_not:
    - 不是 TableWebHost 的替代品，也不打算成为
    - 不起服务、不开定时器、不碰网络
    - 运行路径上零个构造点
  three_judgements_worth_keeping:
    credential_list_not_duplicated:
      first_version: 在本层抄了一份 CREDENTIAL_COMMANDS
      why_wrong: 托管层 inject 自己就按那份清单分流，两处必然漂移
      failure_shapes: [漏一条则某操作偶尔不管用, 多一条则建房第一步就失败]
      neither_reports_an_error: true
      fix: 句柄有就交上去，由 inject 决定用不用它
      note: 抄的动作是我在同一个文件的注释里刚警告过的
    never_guesses_the_handle:
      rejected: 「只有一席就用那一席」
      why: 单席上永远对，多席宿主上是替错的人行动，而单席测试永远发现不了
      precedent: 托管层那条 seat_handle_required 的注释已经把这件事写死
    human_face_does_not_sanitize:
      model_face: 必须净化，收件人是模型
      human_face: 不净化，收件人就是持有该席凭据的那个真人
      what_sanitizing_would_break: seat_handle_missing 这类诊断被摘掉，掉线恢复无从排查
      same_reasoning_for: command 不过 assertNoLeak（真人面的 command 来自宿主自己的路由表）
  characterization_tests_protect_the_closed_table:
    method: 四条命令的注入结果与 host.injected 逐字段对账
    extra_assertion: 要凭据的命令确实补上了 seat_id 与 recovery_credential
    why_that_extra_one: 对账通过不等于两边都什么也没做——两边都返回原样参数时 deepEqual 一样会过
    drift_shape_being_guarded: 有人在一侧加了「顺手补个默认值」，那种改动不会让任何现有测试红
  new_error_code:
    code: command_not_host_facing
    class: identity
    why_not_merged_with_model_side: 合成之后日志里读不出是哪一面越界，而模型面越界意味着模型可能拿到下注权限
    found_by: test/adapter-contract.test.cjs 的「每个错误码都被归类」当场抓出
  own_test_holes_found_by_mutation_not_by_reading:
    first_run: 19_total_17_killed_2_survived
    - 没有断言本地拒绝**不**推进 degraded：把它算成降级会让宿主一次伪造参数就退回轮询
    - 没有测 rememberHandle 拒空串：收下空句柄后 seat_handle_count 报了个数而句柄什么都发不出去
  a_mutation_that_cannot_work:
    attempted: 变异 test/adapter-integration-truth.test.cjs 里的断言，换成 assert.ok(true)
    why_it_can_never_be_killed: 一个测试杀不掉自己身上的削弱——削弱后的断言自己就是绿的
    replaced_by: 变异产品（给 table-web-host.cjs 加 require），由那条对账杀掉
    recorded_in: 该规格的 excluded，连同一次双向手测（加 require 后变红，撤销后 8/8 复绿，git diff 确认字节复原）
  measured:
    host_command_adapter_tests: 20_of_20
    integration_truth_tests: 8_of_8
    new_mutation_spec: host-command-adapter_20_of_20
    adapter_contract_mutations: 34_of_34
    npm_test: 778_pass_0_fail_0_skipped
    mutation_gate: MUTATION_TOTAL_430_KILLED_430_SURVIVED_0_SKIPPED_0_GATE_PASS
    browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
  unverified_boundaries:
    - 产品未改用参考适配器，运行路径上零个构造点（由一正一反两条对账钉住）
    - gate_5_proactive_wake_still_unverified；本适配器不声明 proactive_wake
    - 是否把 host_command 从 table-web-host.cjs 拆出来仍待裁决，记在计划树 not_done
  next:
    - E_claude_host_adapter_browser_free_parts
  requires_user_acceptance: yes
```
