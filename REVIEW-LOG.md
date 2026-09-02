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

## 2026-08-29（承接）：能力不确定时的诚实协商，由合同强制而不是靠自觉

结论：Claude 侧适配器本体仍缺外部条件，但那一侧逼出了一条与宿主无关的真缺陷并已闭合。
`negotiate()` 此前接受任何能力声明，包括 `proactive_wake`——一项在两个宿主上都未验证的能力。
「绝不声明它」这条规则只写在每个适配器自己的 `DECLARED_CAPABILITIES` 里，而合同从不检查。

这与本轮开头那处 policy epoch 是同一个形状：**规则只在记得它的地方成立**。两份参考适配器都
恰好做对了，于是没有任何测试要求过这件事。而「恰好做对」和「被强制做对」在源码里读起来一样。

后果不是「多了一条声明」。`negotiate()` 返回的 `degradations` 是宿主决定要不要轮询的唯一依据：
声明了 `proactive_wake`，`polling` 那一条就不在清单里，于是宿主不轮询，而那个能力实际上并不
存在。表现正是 `CAPABILITIES` 那张表自己写着的那件事——牌局停在某一席上，谁都不知道是在等
模型还是已经死了。

这一轮换掉了一段**有理由的**旧设计，所以两边都得记下来。旧设计是「声明了就记 unverifiable，
报告仍判合规」，理由写在当时的注释里：判成失败会逼人为了让套件绿而少声明一项自己真有的能力。
那个顾虑是真的。它不适用于新检查，因为新检查的判据不是「你这个宿主做不到」，而是「至今没有
任何宿主验证过它」——真有一次实机 Gate 5 通过、标志翻成 `true` 之后，声明立刻合法。这道检查
会自己退休。

```yaml
review_2026_08_29_capability_honesty:
  commit: 509417d
  baseline_before: ea05b2f
  entry_point: >-
    Claude 侧适配器的可验证部分。那一侧的能力本来就不确定（本环境没有 Desktop / Cowork），
    而不确定时唯一诚实的做法是不声明——「不声明」不能靠适配器作者自觉。
  defect:
    what: negotiate 接受任何能力声明，包括 verified_on_any_host 为假的
    same_shape_as: policy epoch——规则只写在记得它的地方，权威侧不检查
    why_no_test_caught_it: 两份参考适配器都恰好做对了，而「恰好做对」与「被强制做对」在源码里读起来一样
    the_flag_had_exactly_one_reader: 一条断言它自己值为 false 的静态测试；negotiate 从不读它
  consequence_is_not_cosmetic: >-
    degradations 是宿主决定要不要轮询的唯一依据。声明了 proactive_wake 则 polling 不在清单里，
    宿主不轮询，而那个能力并不存在——牌局停在某一席上，读不出是在等模型还是已经死了。
  enforcement:
    code: capability_not_verified
    class: invalid_request
    why_that_class: 重试同一份声明不会变好，改声明才行；与身份无关
    keyed_on_field_not_name: >-
      按 verified_on_any_host 走。写死 proactive_wake 的实现在下一个未验证能力加进来时不会红，
      而它同样会被静默接受——测试里有一条静态断言禁掉写死的名字。
  self_retiring:
    criterion: 至今没有任何宿主验证过它，不是「你这个宿主做不到」
    retirement: 实机 Gate 5 通过后把标志翻成 true，声明立刻合法
    why_old_concern_does_not_apply: 没有人会因此少声明一项自己真有的能力
    reminder_in_place: test/capability-honesty.test.cjs 最后一条在翻转时提醒把断言方向一起改
  three_assertions_intentionally_reversed:
    files: [test/adapter-conformance.test.cjs, test/seat-model-adapter.test.cjs]
    old_path: 声明 proactive_wake 以到达「合规但被标注」那一格
    why_reversed: 标注在报告里，而轮询决定在宿主里——一份被标注的报告挡不住宿主不轮询
    recorded_where: 逐条理由写在各自测试的注释里，不只写在提交信息里
  suite_side_defence_kept:
    why_not_redundant: 套件不要求适配器走 contract.negotiate()
    reachable_condition: 一个自己拼 negotiation 的 rogue 适配器绕过合同的拒收
    future_condition: 标志翻真之后声明合法，而套件仍然验不了那个能力
    survivor_that_forced_this: conformance-wake-unverifiable-not-recorded
    why_it_survived: 我改掉了原来杀它的那条测试，而该分支在合同拒收之后没有到达路径
    lesson_repeated_third_time: 没有到达路径的分支与正常工作的分支读起来一模一样
  doc_updated_with_errata:
    what: docs/HOST-ADAPTER-CONTRACT.md 的 unverifiable 一节
    pinned_by_position_not_substring: >-
      那句话不许出现在现行指导里，可以出现在勘误的引文里。一刀切禁掉整个文件会让勘误读不出
      改了什么，而读不出改了什么的勘误等于没写。
  measured:
    capability_honesty_tests: 8_of_8
    red_on_old_code: 5_of_8
    new_mutation_spec: capability-honesty_8_of_8
    seat_model_adapter_mutations: 14_of_14
    adapter_conformance_tests: 57_of_57
    npm_test: 789_pass_0_fail_0_skipped
    mutation_gate: MUTATION_TOTAL_438_KILLED_438_SURVIVED_0_SKIPPED_0_GATE_PASS
    browser_acceptance: 209_pass_0_fail_0_console_errors_hand_13
  unverified_boundaries:
    - 这不是 Claude 宿主适配器本体，也没有让 Gate 5 前进一步
    - 真实 Desktop / Cowork 探针仍缺外部条件，未执行，无任何 Claude 侧实机证据
    - 两个角色的 fully_verified 仍为 false（proactive_wake 那一条永远够不到 pass）
  requires_user_acceptance: yes
```

<a id="b8-seat-model-binding"></a>

## 2026-08-30：B8 接手开发与逐席 AI 连接

当前状态：B8 本地逐席连接与授权上下文闭合；不是完整MVP或真实宿主交付。唯一完成裁决为本节的 `execution_closure`；旧章节只保留各自历史范围。

### 接手、实现与审查

用户授权为“现在分析项目现状，由你接手开发”，之后“继续”沿同一路线推进。起点为干净的
`main@bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`，B6-1 `095b4b6`、B6-2 `71ae5fa`、B7
`bbdcf2b` 已提交。本轮不是继续上一项只读观察包；没有改写
`H:/dual-observation-inbox/tokengame-b6-1-b6-2-20260830-161331.md`。

Primary 依据实际源码和 875 项基线测试接手（`UNDERSTANDING-AUDIT.md`），发现两个未被基线覆盖
的产品断点：共享协调器令牌可覆盖多席，`ai.start` 未带权威本席牌面。先冻结 `TAKEOVER-PLAN.md`
的 P1–P7，再按 Trellis 的 implement/check 分工实现。保留单一协调器和托管；不修改扑克规则、
L0–L2、不新增大厅/匹配/托管下注，不安装宿主或开放外部监听。本地提交策略仍为 `manual_closeout`。

本批实现真人逐席授权、换发与撤销，旧令牌和旧世代 ID 失效；权威在成功 `ai.start` 同次派发里
构造仅本席可见的 `model_context`；浏览器明确授权后下载私有连接文件，MCP 经文件连接本席。
刷新/短断保留权限，离桌/释放撤销；已交核心的在途请求不承诺回滚。离桌前失败不自动复活旧权限，
只允许真人新授权、所有在途离桌结束并经权威再核实后恢复。

新上下文只读审查确认并推动修复 5 项 P2：MCP 畸形 HTTP200 响应伪成功；外部单席领取502伪装
空闲；离桌前失败导致永久不能再授权；浏览器验收清理失败后的假绿；插件 README 仍指导全桌共享
令牌。另补强到期直接领取/启动的零副作用断言，以及启用逐席绑定时旧共享令牌在核心调用前被拒。
审查者没有执行测试，也没有改文件；同/未知模型身份的新上下文不算异模型外部审查。

### 实际执行记录（失败保留，不合并伪装为全过）

| 运行 | 实际结果 | 耗时/证据 |
| --- | --- | --- |
| 接手基线 `npm test` | 875/875，失败/跳过/取消均0 | 47038.9874 ms，当前会话直接执行 |
| MCP 文件接入初始 RED → GREEN | 7失败 → 7通过 | GREEN 365.0829 ms |
| 服务端初始回归 | 14项中1通过/13失败；随后修复通过 | RED 835.2642 ms，后续相关15文件254/254、3374.8023 ms |
| Root 首轮整合 | 42项中40通过/2失败；两处测试夹具调用/字段错误已修 | 16372.3021 ms；后续相关6/6、7858.8241 ms |
| MCP 畸形信封回归 | 9项7通过/2失败 → 相关24/24 | RED 400.2339 ms；GREEN 546.184 ms |
| 退出恢复/502回归 | 筛选5项2通过/3失败 → 同筛选5/5 | 273.816 ms → 305.3073 ms；最后相关9文件155/155、3224.0059 ms |
| 文档与验收判定回归 | RED 含缺辅助模块和旧 README 两个实际触发点；GREEN 18/18 | RED 报12项/9通过/3失败（含父节点）；GREEN 137.2538 ms |
| 新连接浏览器第一轮 | 32项通过，两个隔离 Chromium + 两个 MCP stdio | 17179 ms，`artifacts/b8-browser-20260830-run1/` |
| 新连接浏览器加强后 | 35项通过，控制台/意外网络错误0；三张截图已实际查看 | 7352 ms，`artifacts/b8-browser-20260830-final/result.json` |
| 首轮完整门禁 | 测试925/925；557变异中555杀掉、1存活、1未评估，**GATE=FAIL** | 测试55924.3645 ms；整轮845436 ms；`artifacts/b8-gate-20260830-run1/` |
| 四玩家第一次复验 | 第13手，209项中208通过/1失败，控制台/窗口外网络错误0 | 151672 ms；`artifacts/b8-four-player-20260830-final/result.json`（目录虽叫final，结果仍是失败） |
| 四玩家第二次复验 | 第13手，209/209；控制台/意外网络错误0，27张截图 | 151360 ms；`artifacts/b8-four-player-20260830-run2/result.json`，已查看公开范围与翻牌截图 |
| Host 到达回归与屏障修复 | 伪造Host未到达的新增断言RED 1失败；改真实HTTP后28/28；相关22条变异全部杀掉、0存活/未评估 | RED 238.1391 ms；GREEN 1284.927 ms；变异恢复后28/28、1006.5729 ms |
| 第二轮完整门禁 | 测试925/925，失败/取消/跳过/todo均0；40份规格557变异全部杀掉，0存活/未评估；**GATE=PASS，exit0** | 测试60206.7141 ms；整轮597553 ms；`artifacts/b8-gate-20260830-run2/` |

首轮变异不是“几乎通过”：`binding-origin-trusts-host-header` 存活，因为测试的 `fetch` 没把恶意
Host 送到 SUT；`pending-binding-not-reserved-from-driver` 挂起，因为断言失败时没释放人为屏障，
收尾又等未完成 HTTP。只停止了明确归属本次运行的测试子进程33072，checker 自动还原源码并把
该条记为未评估，没有把人工终止算作杀掉。现已改用 `node:http` 并同时断言恶意Host到达和返回安全origin；
9个屏障场景（10个调用点，含嵌套）增加提前结束检测及 `finally` 释放/drain，保留原断言错误。
22条相关变异已逐一完成，原挂起项与Host项均由真实 `AssertionError` 判杀，无超时强停；7个产品文件
运行前后SHA256一致。新上下文只读增量复核未发现剩余确认问题；第二轮完整门禁随后单独通过，
不是用22条专项结果代替全量门禁。

四人失败项是旧预期“底牌只有你自己可见”。它与现行合同中本席 AI 可读上下文不一致，已改为
在实际 DOM 的同一条说明里同时要求：仅本人和明确授权的本席 AI、摊牌或自愿亮牌、官方牌面公开。
新上下文审查确认这是对齐 `PROJECT-DECISION-LOG.md:1368` 与亮牌规则的测试修正，没有删去
其他跨席隔离断言；不是为了绿色而放宽权限。

浏览器使用 `git archive bbdcf2b` 导出副本叠加本批46个已冻结运行/测试文件，逐文件核对 SHA256
后运行；原目录可独占进行变异，两个过程没有共用被变异的源码。副本第一次构造遇到当前正被
变异的文件时被摘要检查拦住，未启动浏览器；补齐并全数校验后才执行。后来只同步了上述旧文案
断言。它是有明确基线的验证导出，不是新 commit，也不是已发布安装包。

### 证据边界

- 真实执行：本机 HTTP、两 MCP stdio、Chromium UI、服务端规则/隔离/故障路径。公开发言是测试
  文本，不是模型输出；未把测试次数相加当成独立样本或可靠性百分比。
- 旧 Codex CLI 0.145.0 前缀/Hook 探针只按旧 A/B/C/D 桥范围保留。当前载体是 Codex Desktop，
  这也不等于已验证本批 MCP 游戏接入、内嵌 UI 或无点击唤醒。
- Codex / Claude Desktop 新路径、持续主动唤醒、异地联机、四真人45分钟 UAT 仍未执行。
  “旧终端环境没有桌面”的记录不能继续当作当前宿主无能力的证明；Claude 当前安装状态本轮
  没有独立复验，记为 unknown。
- 无独立 lint/typecheck 配置，不把 `node --check` 叫作类型检查。第二轮完整门禁前，28个变更/新增
  JS/CJS/MJS 语法检查通过，557条变异查找串均唯一命中，15个产品运行文件与浏览器验证副本完全一致。
- 同 OS 账户可读取文件的宿主不是安全沙箱；本席令牌隔离正常插件调用，不证明模型身份、强度
  或反作弊。远端认证、持久化与重启恢复不在本批声明中。

### 可复核的版本与证据身份

基线是 `bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b` 加当前未提交B8差异。产品身份取下列15文件，
按路径字典序，对每项拼接 `路径 + NUL + 文件SHA256 + LF`，再对拼接结果取SHA256；
结果为 `bd86d7104e334c4dddad02dfbf26cba8339d21e7dc6ab35978438cff8f657f81`。
第二轮门禁前后均与浏览器验证副本逐一相同；不包含本节、其他治理文档或测试辅助文件。

```text
plugins/tokengame/.codex-plugin/plugin.json
plugins/tokengame/mcp/server.cjs
plugins/tokengame/skills/tokengame/SKILL.md
src/authority/command-surface.cjs
src/authority/host-surface.cjs
src/authority/seat-ai-store.cjs
src/authority/table-orchestrator.cjs
src/contract/adapter-contract.cjs
src/host/model-command-surface.cjs
src/host/table-web-host.cjs
src/run-beta.cjs
src/shared/endpoints.cjs
web/table/index.html
web/table/table.css
web/table/table.js
```

证据文件集用同一算法，路径为 `artifacts/b8-gate-20260830-run2/` 下41个 `.txt`（全量测试＋40份变异），
加 `artifacts/b8-browser-20260830-final/result.json` 与 `artifacts/b8-four-player-20260830-run2/result.json`，
共43文件；摘要为 `6b926ab612994998fee207bc4907d3d55c27c216ab2f677ea4d3ccec28cd581e`。
两轮门禁各自保留在独立目录，后续运行不得覆盖这两个命名快照。原始产物仍由Git忽略，不把本地路径当成已提交证据。
四人验收最后只改旧文案断言；该驱动最终SHA256为
`62cd3f742dc3d9d01f8e085bc3be5d6f203a412550afa3898f96c078a7d43c02`。

收尾结构检查第一次发现路线树的历史 `own_test_holes_found_by_mutation` 段把列表与
`first_run` 字段写在同一层，YAML无法解析；`git show HEAD` 证实基线已有此形状。仅增加
`findings` 列表键保留原内容后，STATUS、路线树与本批唯一闭环的三份当前YAML均解析通过，
并核对7项验收、6个能力维度、B8完成/父任务active和manual_closeout一致。
随后7份受保护语义合同逐一用 `semantic-contract.mjs verify-log` 重验通过。
最终门禁后只编辑治理/说明文档，没有再改变产品或测试行为。

最终28个变更脚本语法检查、`git diff --check`、15文件摘要复核通过；暂存区为空，42个受控文件
有改动，17个新增文件未跟踪。运行残留检查发现PID16608是16:37:36由Claude/bash启动的旧beta，
早于接手；没有终止这个非本轮实例或清除旧牌局，不能把它当新版服务或本轮验收残留。

### 本批唯一执行闭环

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-SEAT-MODEL-BINDING-20260830-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-EU-SEAT-MODEL-BINDING
    exact_outcome: 同一回环协调器上的真人逐席授权与撤销、仅本席权威模型上下文、私有文件MCP接入和浏览器连接界面通过本地自动化验收
    owner_ref: TAKEOVER-PLAN.md
  trigger: explicit_decision_relevant_claim
  basis:
    semantic_contract_refs:
      - node_id: TG-L0-PRODUCT
        contract_id: SC-TG-L0-ROOT-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017
        expected_digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
        binding_status: verified
      - node_id: TG-L1-HOST-ENTRY
        contract_id: SC-TG-L1-HOST-ENTRY-20260827-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018
        expected_digest: sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160
        binding_status: verified
      - node_id: TG-L1-LIVE-TABLE
        contract_id: SC-TG-L1-LIVE-TABLE-20260825-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-003
        expected_digest: sha256:69f5be696f574556edd55ca49db6853c8086674a4f21440a67d904bfdadd9f91
        binding_status: verified
      - node_id: TG-L1-PUBLIC-AI-PLAY
        contract_id: SC-TG-L1-PUBLIC-AI-20260825-A
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-004
        expected_digest: sha256:37f755856560105a5a33a2cc493200cae4ae96960f29dbbe9c7612e90fc903ae
        binding_status: verified
      - node_id: TG-L2-SESSION-LAUNCH
        contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
        expected_digest: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
        binding_status: verified
      - node_id: TG-L2-PLAYABLE-TABLE
        contract_id: SC-TG-L2-PLAYABLE-TABLE-20260827-D
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022
        expected_digest: sha256:d73e30748ac4d7a3fc814e6f44d6aa96676dc3677e0ef04f8f1298e9f84ca453
        binding_status: verified
      - node_id: TG-L2-PUBLIC-AI-EXCHANGE
        contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
        expected_digest: sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54
        binding_status: verified
    project_intelligence_ref: STATUS.md#project_intelligence
    understanding_view_ref: PROJECT-PLAN-TREE.md#TG-EU-SEAT-MODEL-BINDING
    implementation_identity:
      kind: file_set_digest
      scope: bbdcf2b基线加本节列明的15个产品运行文件；不包含治理文档或测试辅助文件
      identity: sha256:bd86d7104e334c4dddad02dfbf26cba8339d21e7dc6ab35978438cff8f657f81
      status: current
    verification_identities:
      - evidence_pointer: 本节列明的第二轮41份门禁日志与两份浏览器结果，共43文件
        identity: sha256:6b926ab612994998fee207bc4907d3d55c27c216ab2f677ea4d3ccec28cd581e
        status: current
      - evidence_pointer: artifacts/b8-gate-20260830-run2/npm-test.txt
        identity: sha256:8866e1f10a1dbbae46f3317e0803a7f5c560929649f8645ab904743c735c5e41
        status: current
      - evidence_pointer: artifacts/b8-browser-20260830-final/result.json
        identity: sha256:5ef71e4b124797d39e29619c698fd3c79ba61a128befd66789da928f065fe044
        status: current
      - evidence_pointer: artifacts/b8-four-player-20260830-run2/result.json
        identity: sha256:c8440511d2db46fac2318fc886e1bf203d349425938fb6172679d2871d35cbe4
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - {obligation_id: P1, claim_or_predicate: 两席绑定及ID世代隔离且旧共享令牌无后门, required: yes, real_condition: 同一协调器与真实权威身份的正常及越权请求}
      - {obligation_id: P2, claim_or_predicate: 仅返回本席获准底牌且私有上下文不进入公共出口, required: yes, real_condition: 同一手牌两席身份和公开时间线}
      - {obligation_id: P3, claim_or_predicate: 成功start的权威最新快照与模型命令分权, required: yes, real_condition: 真实核心派发与跨手陈旧ID}
      - {obligation_id: P4, claim_or_predicate: 换发撤销离桌到期与在途响应安全且普通恢复保留绑定, required: yes, real_condition: HTTP并发屏障及恢复和过期路径}
      - {obligation_id: P5, claim_or_predicate: 私有文件经两个MCP进程分别连接和发布且错误路径不泄密, required: yes, real_condition: 真实HTTP与stdio进程及无效配置}
      - {obligation_id: P6, claim_or_predicate: 正常浏览器连接下载状态撤销及隐私共35项检查通过, required: yes, real_condition: 两个隔离Chromium上下文和桌面窄屏}
      - {obligation_id: P7, claim_or_predicate: 本批全量测试变异和四上下文多手自动化回归通过, required: yes, real_condition: 当前产品版本全量门禁及脚本模型13手牌局}
    selected_surfaces: [static, integration, browser_smoke, focused_probe, inspection]
    observations:
      - {obligation_id: P1, evidence_type: executed, correspondence: direct, evidence_pointer: test/seat-model-binding.test.cjs与test/model-command-isolation.test.cjs；第二轮全量及对应变异日志, result: pass}
      - {obligation_id: P2, evidence_type: executed, correspondence: direct, evidence_pointer: test/model-context.test.cjs与test/seat-model-mcp-stdio.test.cjs；第二轮全量及model-context变异日志, result: pass}
      - {obligation_id: P3, evidence_type: executed, correspondence: direct, evidence_pointer: test/model-context.test.cjs及test/model-command-isolation.test.cjs；第二轮全量及对应变异日志, result: pass}
      - {obligation_id: P4, evidence_type: executed, correspondence: direct, evidence_pointer: test/seat-model-binding.test.cjs；第二轮全量及mut-seat-model-binding.json.txt, result: pass, caveat: 已送入权威的操作不承诺回滚}
      - {obligation_id: P5, evidence_type: executed, correspondence: direct, evidence_pointer: test/seat-model-mcp-stdio.test.cjs与test/mcp-model-connection.test.cjs；第二轮全量和MCP变异日志, result: pass, caveat: 真实传输但使用固定文字不是模型生成}
      - {obligation_id: P6, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b8-browser-20260830-final/result.json, result: pass, caveat: 只证明该次35项连接UI检查；三张截图已实际查看}
      - {obligation_id: P7, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b8-gate-20260830-run2/全部41日志, result: pass}
      - {obligation_id: P7, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b8-four-player-20260830-run2/result.json, result: pass, caveat: 209项及第13手是脚本模型自动化；不是四真人或真实宿主验收}
    skipped:
      - {check: 当前Codex或Claude宿主配置及真实模型调用, reason: 本批只授权本地实现和合成验证；实机接入另行授权}
      - {check: 无点击主动唤醒与四真人45分钟UAT, reason: 仍是父能力的未完成项，不在B8本地链路完成声明中}
      - {check: 独立异模型外部审查, reason: 新上下文只读审查者未参与实现但模型身份未独立核实，不冒充异模型审查}
    result: pass_with_notes
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-EU-SEAT-MODEL-BINDING
        parent_capability_id: TG-L2-PUBLIC-AI-EXCHANGE
        claim: B8本地逐席AI连接及权威上下文链路已实现并通过自动化验收
        exact_scope: 回环本机合成玩家与脚本发言；HTTP和stdio真实执行；不是宿主模型交付
        result: supported
        dimensions:
          semantic: {required: yes, status: sufficient_for_claim, evidence_type: inspection, evidence_pointer: 本节七份现行合同及TAKEOVER-PLAN.md的P1至P7, user_readable_meaning: 继承已确认公开交流和私有视图规则，未改L0至L2}
          implementation: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 15文件产品身份及真实beta入口测试, user_readable_meaning: 逐席授权和上下文走唯一协调器与权威}
          data: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: model-context与seat-model-binding测试及对应变异, user_readable_meaning: 本席牌面和最近公共聊天有隔离且世代与异常路径覆盖}
          integration: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 两MCP进程集成及35项浏览器结果, user_readable_meaning: 下载文件到本席气泡使用真实HTTP和stdio}
          verification: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 925项测试与557变异及35和209项浏览器验收, user_readable_meaning: 失败记录保留，最终同版本完整复验通过}
          operational: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: beta入口及模型降级测试和浏览器清理结果, user_readable_meaning: 本机可启动撤销和关闭，缺失模型不会冒充在线, caveat: 不包含部署持久化或真实宿主运行}
        safe_wording: 本地逐席连接和授权上下文已验证；真实宿主无点击唤醒异地联机及完整MVP仍未交付
        gaps: []
  route_boundaries:
    local: {result: supported, evidence_refs: [P1至P6的直接本地运行证据]}
    adjacent: {result: supported, evidence_refs: [925项含旧桥回归, 557条变异, 四上下文13手209项]}
    cumulative: {result: supported, evidence_refs: [未改七份受保护语义合同, 保留单协调器和唯一托管, 旧CLI路径显式标记历史, 父MVP未关闭]}
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits:
    - 不证明当前Codex或Claude Desktop真实模型已接通，不证明内嵌UI或无点击唤醒
    - 不证明四真人可玩性、异地联机、部署安全、模型身份或反作弊
    - 本席AI可能主动复述或编造手牌；语言不等于官方亮牌
    - 有效请求记录不等于持续在线；撤销不回滚已交权威的请求
    - 父L2与整个MVP继续active；后续真实宿主配置和模型调用需明确授权
  remaining_non_blocking:
    - manual_closeout策略下保留未提交diff，不暂存提交或归档整个父任务
    - 原始产物位于Git忽略目录，摘要与运行判据保存在本文件
  advance_allowed: yes
  next_owner: user_host_probe_authorization_then_codex_primary
```

<a id="b9-real-host-seat-probe"></a>

## 2026-08-30：B9 当前 Codex Desktop 单席真实接入

结论：**单席显式调用的真实模型闭环已验证**。本节只关闭 `TG-EU-REAL-HOST-SEAT-PROBE` 的这一窄范围，
不关闭完整宿主入口、主动唤醒或朋友内测 MVP。B8 自动化结论仍属于上一节，不改写成真实模型证据。

### 授权、运行与直接结果

- 授权来自 `DEC-20260830-001` 中用户明确的“同意”，不是此前裸指令“继续”。上限为两个临时游戏任务、
  六轮探针输入；实际只创建一个游戏任务、输入五轮。开发与复核代理不计入游戏探针样本数。
- 临时任务为“TokenGame 临时单席接入验证”，ID `01a052c9-5259-7a61-b26f-35731734994e`，
  全新上下文，没有复制开发任务历史。使用 `H:/tokengold/.codex/config.toml` 的项目级 stdio MCP 配置，
  仅开放 `tokengame_table`；没有安装全局插件、修改模型设置或另填模型 API。
- 真实宿主是 Codex Desktop `26.825.6671.0`，桌面捆绑后端为 `codex-cli 0.151.0-alpha.7.2`；
  PATH 中另一个 CLI 是 `0.145.0`。五轮任务记录均报告 `gpt-5.6-sol / max`，未设置覆盖参数；
  这是宿主元数据，不是提供商身份或模型强度的密码学证明。
- 两个隔离 Chromium 页面经正常建房、确认、Ready 和授权下载，连接本轮专用回环服务。
  第一次真实 `ai.start` 返回 A 的 `Kh,4c`，与 A 页面同手快照一致；未公开的 B 底牌为 `null`，
  B 的公开聊天确实进入上下文。直接工具输入/输出与隔离视图分别保存在 `native-task-evidence.json`、
  `visible-projections.json`；没有导出隐藏推理。
- 第二次生成在第4手形成 `TABLE_PUBLIC / SEAT_AI`、sequence `16`：
  “这手先稳一点，公共牌还没亮，别让气势替牌力做决定。”两页收到同一事件，A/B 座位气泡截图均已实际查看。
  为避免等待期间自动进入下一手，两名合成人类使用正常“本手后暂离”控件；没有更改30秒行动时钟。
- 真人点击撤销后，在**未删除原连接文件之前**，同一原生任务再次调用得到
  `model_command_token_rejected`；不是靠删文件制造拒绝。随后真人仍可 Ready、开手及手动弃牌。
  可见任务输入/输出、页面文本/URL/机器视图及两隔离上下文的存储均未发现下载令牌；不据此声称 OS 级安全沙箱。

### 实际次数与耗时

以下是游戏任务整轮耗时，不是纯推理时延或请求延迟。九次游戏 MCP 调用可与五轮原生任务记录逐一对账。

| 轮次 | 实际结果 | 整轮耗时 |
| --- | --- | --- |
| 1 | MCP 已加载，但连接文件尚未就绪，读取失败 | 24,695 ms |
| 2 | 下载文件后，真实读取同一房间成功 | 32,238 ms |
| 3 | 真实生成，但已跨手；`resolved.reason=hand_advanced`，没有公开 | 62,996 ms |
| 4 | 新意图真实生成并公开，两页面可见 | 44,917 ms |
| 5 | 撤销后同一任务旧权限被拒 | 15,301 ms |

五轮累计180,147 ms；两次生成只有一次发布。原生游戏任务累计用量记录为 input 464,516、
cached input 423,808、output 5,089、total 469,605；缓存输入是输入的子集，不能相加。
这不是本轮全部开发用量，不代表新增计费 Token，费用 unknown。样本太少，不能给平均响应保证或可靠性百分比。
当前事实说明接入可行，但约45秒的成功轮次不足以证明实时体验合格；跨手保护正确不等于延迟问题已解决。

### 顺带修复与验证边界

真实探针附带的390px检查发现 `scrollWidth=427`：首次建房的长邀请码将“复制”按钮推到视口外。
旧35项驱动在 reload 后才测窄屏，而恢复时已不显示邀请码，因而没有覆盖这个状态。
本轮仅修改 `web/table/table.css` 的邀请码限宽/换行/按钮保宽，以及连接验收脚本；未改扑克、权威、MCP 或模型行为。
新增16项在 reload 前对390/320px分别核对复制前后几何、完整文本、点击次数、复制内容与成功反馈，
剪贴板只在测试页面中替换并恢复，没有读写用户系统剪贴板。

- 定向连接浏览器验收**一次**：51/51，6,321 ms，控制台/意外网络错误0，exit 0；其中新增16项。
  这是两个真实 stdio 进程与两隔离页面，仍使用脚本文字，不计为第二次真实宿主验证。
- 定向 Node 验证**一次**：`beta-entry`、`plugin-doc-schema-parity`、`model-binding-result` 共20/20，
  1,364.056 ms，失败/取消/跳过/todo均0。没有独立 lint/typecheck，语法检查不等于类型检查。
- 七份现行语义合同各用 `semantic-contract.mjs verify-log` 重验一次，全部匹配；未改任何合同 payload。
  部分长 `canonical_json` 在工具输出中截断，但 `verified` 与 digest 完整返回，摘要如实记录截断。
- Trellis 实施与未参与实施的新上下文检查分别完成，检查者未发现待修问题；未把它称为独立异模型外审。
  本轮没有重跑925项全量、557条变异或209项四人13手；它们是B8同日历史证据，不冒充本轮执行。

失败过程没有抹掉：原探针的19项记录含18通过、1布局失败；当前结果21项由18项原流程核对加布局回归、
清理和语义校验组成，并明确把旧失败链接到51项回归。另保留初始不合法玩家标识、文件未就绪、CLI未找到
项目配置、已有房间上再次建房等设置尝试。实际 Desktop 加载成功不能被另一个全局 CLI 的配置查询否定。
内置 Browser 在修补前两宽度未重现独立 Chromium 的溢出；修补后一次临时检查误把折叠技术说明的 `code`
也算成邀请码，属于检查器取值范围错误。收窄到实际“房间状态”区域后几何通过；当时服务已停止，
只认作已加载 CSS 的布局复核，不认作在线交互证明。完整在线复制验证由上述51项运行提供。

### Gate 5 与仍未验证的能力

本次五轮均由明确任务消息启动，没有执行“外部权威事件自动唤醒空闲任务”的实验。不得将成功公开
升级为主动唤醒通过，也不得因本次采用了提示触发就判定自动唤醒不可能。

```yaml
gate_5_runs:
  - host: codex
    host_version: 26.825.6671.0
    surface: codex_visible_task
    status: not_run
    probe_run_id: none
    source_game_event: none
    source_event_seq: none
    expected_model_evaluations: one
    observed_model_evaluations: unknown
    terminal_result: unknown
    user_click_required: unknown
    new_user_prompt_required: unknown
    same_visible_context_proven: unknown
    direct_evidence_refs: []
    caveats: [B9仅显式消息触发；同一原生任务的证据不构成事件驱动证据]
  - host: claude
    host_version: unknown
    surface: unknown
    status: not_run
    probe_run_id: none
    source_game_event: none
    source_event_seq: none
    expected_model_evaluations: one
    observed_model_evaluations: unknown
    terminal_result: unknown
    user_click_required: unknown
    new_user_prompt_required: unknown
    same_visible_context_proven: unknown
    direct_evidence_refs: []
    caveats: [本轮未检查Claude安装或执行Claude实机探针]
```

还缺第二个真实模型席位、完整插件安装/游戏自由文本自动公开、内嵌牌桌、异地连接与四真人45分钟验收。
旧 CLI Hook/补交证据只按旧桥成立。本次项目 MCP 配置路径另有官方说明支持，但通过结论来自上述实测，
不是文档推导：[OpenAI MCP 配置](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)。
若未来 Gate 5 实测失败且影响已确认主动交流结果，必须回语义确认；不能自行改成被动问答交付。

### 清理与证据身份

已撤销权限，移除本轮新建的 `H:/tokengold/.codex/config.toml` 与 `.tokengame-private/b9-20260830/seat-a.json`。
删配置前SHA256仍为 `78a8d127e953a56fb163d76740d0442de005c67e1c4727e958c8dc1fcb73a5db`，连接文件也与原下载一致。
清理本轮三个MCP子进程20144/29500/34504，关闭隔离浏览器并重置内置Browser视口；专用探针与布局实例的
62489/65451/59217端口均无监听。旧beta PID16608（16:37:36、父PID6720）继续运行，没有重启或终止。
测试任务保留为闲置可复核记录，但已无游戏连接。没有暂存、提交、推送、部署或归档父任务。

实现基线仍是 `bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b` 加未提交差异。按
`SHA256(sorted(相对路径 + NUL + 文件SHA256 + LF))`，原生运行时48文件（package.json、src/**、web/**、
plugins/tokengame/**）摘要为 `186921ec44a7fa9c9cbc279c0cf9b449eba041b9cbb1f914b7e165e78f0a3be3`；
修补后是 `bb7c107606884f88b64e101d1caef6618cf934b7e274eac9017599fb26687e6b`。
两者只差 `web/table/table.css`，47个文件字节相同；真实模型证据绑定修补前版本，修补后由定向 UI 回归承接，
不能宣称修补后重新运行过模型。25份冻结原始证据清单在 `artifacts/b9-real-host-20260830/evidence-identities.json`，
同算法摘要 `fdf3cc423576ab81ec8f2f1d5efa3f76675b87d7eddc1619124a2d04691c60ac`。
这些原始产物被Git忽略；本节保留结果、身份与限制，不把本地文件路径说成已提交证据。

### 本批唯一执行闭环

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-REAL-HOST-SEAT-PROBE-20260830-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-EU-REAL-HOST-SEAT-PROBE
    exact_outcome: 当前Codex Desktop一席原生模型经明确消息触发完成本席上下文、真实生成、同桌气泡与撤销拒绝的本机探针
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-REAL-HOST-SEAT-PROBE
  trigger: explicit_decision_relevant_claim
  basis:
    semantic_contract_refs:
      - {node_id: TG-L0-PRODUCT, contract_id: SC-TG-L0-ROOT-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017, expected_digest: 'sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6', binding_status: verified}
      - {node_id: TG-L1-HOST-ENTRY, contract_id: SC-TG-L1-HOST-ENTRY-20260827-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018, expected_digest: 'sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160', binding_status: verified}
      - {node_id: TG-L1-LIVE-TABLE, contract_id: SC-TG-L1-LIVE-TABLE-20260825-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-003, expected_digest: 'sha256:69f5be696f574556edd55ca49db6853c8086674a4f21440a67d904bfdadd9f91', binding_status: verified}
      - {node_id: TG-L1-PUBLIC-AI-PLAY, contract_id: SC-TG-L1-PUBLIC-AI-20260825-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-004, expected_digest: 'sha256:37f755856560105a5a33a2cc493200cae4ae96960f29dbbe9c7612e90fc903ae', binding_status: verified}
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PLAYABLE-TABLE, contract_id: SC-TG-L2-PLAYABLE-TABLE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022, expected_digest: 'sha256:d73e30748ac4d7a3fc814e6f44d6aa96676dc3677e0ef04f8f1298e9f84ca453', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    project_intelligence_ref: STATUS.md#project_intelligence
    understanding_view_ref: PROJECT-PLAN-TREE.md#TG-EU-REAL-HOST-SEAT-PROBE
    implementation_identity:
      kind: file_set_digest
      scope: 本节列明48文件；修补前实机证据与仅CSS变更后的51项回归联合覆盖，不包含治理文件
      identity: sha256:bb7c107606884f88b64e101d1caef6618cf934b7e274eac9017599fb26687e6b
      status: current
    verification_identities:
      - {evidence_pointer: artifacts/b9-real-host-20260830/evidence-identities.json列明的25文件集合, identity: 'sha256:fdf3cc423576ab81ec8f2f1d5efa3f76675b87d7eddc1619124a2d04691c60ac', status: current}
      - {evidence_pointer: artifacts/b9-real-host-20260830/native-task-evidence.json, identity: 'sha256:5e57cad725afcb79669ff7ac7fe3bc73cd0e6b09d8144539eeab3a6bf2f922e4', status: current}
      - {evidence_pointer: artifacts/b9-real-host-20260830/result.json, identity: 'sha256:48d88e5e7656f1832a35bd8411a07727fa03cd45c1d1b13861aad8d0e95f2d24', status: current}
      - {evidence_pointer: artifacts/b9-invite-fix-20260830/result.json, identity: 'sha256:52069244bfc894f21b5d1a7bf65e84f6845fc9563035751aa779d1b3d41396da', status: current}
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - {obligation_id: B9-A, claim_or_predicate: 经明确授权加载项目MCP且使用当前游戏任务原生模型, required: yes, real_condition: 新Codex Desktop游戏任务及正常浏览器逐席下载}
      - {obligation_id: B9-B, claim_or_predicate: 模型获准本席真实牌面与公共聊天且未获对手暗牌, required: yes, real_condition: 同一手真实ai.start及两隔离页面对照}
      - {obligation_id: B9-C, claim_or_predicate: 真实生成成为两页同一公开座位AI事件且跨手输出丢弃, required: yes, real_condition: 两次原生生成及真实权威resolve和两页渲染}
      - {obligation_id: B9-D, claim_or_predicate: 先撤销再用原文件调用被拒且真人仍能操作, required: yes, real_condition: 同一原生任务再次调用和正常真人控件}
      - {obligation_id: B9-E, claim_or_predicate: 本轮发现的邀请码窄屏缺陷修复且定向回归通过, required: yes, real_condition: 首次建房邀请码显示时两宽度复制前后完整交互}
      - {obligation_id: B9-F, claim_or_predicate: 本轮临时权限文件配置服务已清理且不动旧演示, required: yes, real_condition: 撤销记录及确切文件进程端口归属核验}
    selected_surfaces: [focused_probe, integration, browser_smoke, inspection]
    observations:
      - {obligation_id: B9-A, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b9-real-host-20260830/native-task-evidence.json, result: pass}
      - {obligation_id: B9-B, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b9-real-host-20260830/visible-projections.json, result: pass}
      - {obligation_id: B9-B, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b9-real-host-20260830/native-task-evidence.json, result: pass}
      - {obligation_id: B9-C, evidence_type: executed, correspondence: direct, evidence_pointer: 'artifacts/b9-real-host-20260830/result.json#/published_speech', result: pass, caveat: 一次发布一次跨手丢弃；约45秒成功轮次不代表实时性能合格}
      - {obligation_id: B9-C, evidence_type: executed, correspondence: direct, evidence_pointer: 'artifacts/b9-real-host-20260830/result.json#/checks_current/10', result: pass, caveat: 两页同一发言的实际核对；另有03和04截图}
      - {obligation_id: B9-D, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b9-real-host-20260830/native-task-evidence.json, result: pass}
      - {obligation_id: B9-D, evidence_type: executed, correspondence: direct, evidence_pointer: 'artifacts/b9-real-host-20260830/result.json#/checks_current/17', result: pass}
      - {obligation_id: B9-E, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b9-invite-fix-20260830/result.json, result: pass, caveat: 51项是脚本模型回归；原失败仍在B9原始记录中}
      - {obligation_id: B9-F, evidence_type: executed, correspondence: direct, evidence_pointer: 'artifacts/b9-real-host-20260830/result.json#/cleanup', result: pass}
    skipped:
      - {check: Gate5无点击主动唤醒及第二真实席Claude异地四真人验收, reason: 不在本次单席显式调用的完成范围；父能力保持未交付}
      - {check: 再次全量925测试557变异与209四人13手, reason: 本轮只改邀请码CSS和定向验收；20项Node及51项浏览器定向复验，不把B8数字记成本轮}
    result: pass_with_notes
  capability_claim:
    overall_result: supported
    claims:
      - capability_id: TG-EU-REAL-HOST-SEAT-PROBE
        parent_capability_id: TG-L3-MULTIPLAYER-VERTICAL-SLICE
        claim: 当前Codex Desktop单席原生模型显式生成与撤销闭环已实测
        exact_scope: 一原生游戏任务与本机两合成人类页面；不要求或声称持续自主唤醒和完整插件入口
        result: supported
        dimensions:
          semantic: {required: yes, status: sufficient_for_claim, evidence_type: inspection, evidence_pointer: 七份合同校验与DEC-20260830-001, user_readable_meaning: 原公开规则未改；只关闭明确授权的接入探针}
          implementation: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 两份48文件身份及51项回归, user_readable_meaning: 原生任务使用同一MCP协调器权威路径；后续只改CSS}
          data: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: native-task-evidence.json与visible-projections.json, user_readable_meaning: 本席底牌及公共聊天直接到模型；对手暗牌未进入该上下文}
          integration: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 原生九次MCP调用与sequence16两页截图, user_readable_meaning: 非固定脚本文字的一次真实模型发言进入同桌座位气泡}
          verification: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: B9原始失败记录及当前21项核对20项Node与51项浏览器结果, user_readable_meaning: 失败未被抹掉；原生与脚本回归范围分开}
          operational: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 原生撤销拒绝及cleanup, user_readable_meaning: 本机探针可撤销并安全收尾；没有继续后台调用, caveat: 不含自动唤醒长时服务或异地部署}
        safe_wording: 单席显式调用已验证；响应时延和主动唤醒仍是下一优先级，完整MVP未完成
        gaps: []
  route_boundaries:
    local: {result: supported, evidence_refs: [B9-A至B9-F直接证据]}
    adjacent: {result: supported, evidence_refs: [同桌隔离与跨手丢弃, 撤销后真人操作, 20项Node及51项连接浏览器回归]}
    cumulative: {result: supported, evidence_refs: [七份合同未变, 四真人与Gate5仍未关闭, B8和旧CLI保持历史范围, 旧演示与手工提交边界保留]}
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits: [不证明无点击主动唤醒或低延迟, 不证明第二真实席Claude或跨宿主, 不证明完整插件安装内嵌UI与自由输入默认公开, 不证明四真人异地联机或完整MVP]
  remaining_non_blocking: [未提交差异按manual_closeout保留, 忽略目录原始产物未进入Git, 空临时目录无凭据]
  advance_allowed: yes
  next_owner: codex_primary_proactive_wake_design_then_bounded_real_probe
```

<a id="b10-queue-wake-probe-preparation"></a>

## 2026-08-30：B10 同任务 queue 候选的本地准备

本节仅记录候选研究与本地测试支持，独立复核、定向回归与关键变异已完成；不关闭主动唤醒节点。
真实 queue 发送、原生任务输入和模型调用均为 0，Codex 与 Claude 的 Gate 5 均保持 `not_run`。

### 候选、授权与测量边界

本轮用户要求“继续”，沿同一已确认路线进行本地研究与可逆实现；技术选择记为
`DEC-20260830-002`。B9 的临时实机窗口已执行并清理，不把它延伸为无限后台调用权限。
已向用户提出下一次有限窗口：复用原临时验证任务、临时恢复本地连接，最多三次任务输入，
其中自动队列通知最多一次。未获回答前只做本地测试，不修改宿主配置、不实际发 queue。

当前 Desktop 附带的 CLI `0.151.0-alpha.7.2` 实际存在 `queue --thread --message`；
[OpenAI 更新记录](https://learn.chatgpt.com/docs/changelog) 的2026-08-20 CLI 0.149.0条目说明队列和空闲唤醒。
这个日期早于旧2026-08-27研究，属于补上旧候选遗漏，不是“刚发布的新功能”。文档和帮助输出只支持候选，
不能证明当前 Windows Desktop 会消费同一任务的消息。原始命令、版本、SHA-256及正文读取边界保存在
`artifacts/b10-wake-probe-20260830/static-preflight.json` 和 `documentation-evidence.json`。

B9只复算过滤后的既有日志，详见当前任务 `research/b10-b9-latency-breakdown-20260830.md`：
成功样本从玩家来源事件到权威公开33.460秒，公开后到最终可见回执11.556秒；整轮记录44.917秒的起止口径不同。
take/start已合并到同一执行单元，共享95ms包络，不能再算一次减少模型往返的收益。
公开发生在行动截止后3.822秒，`late=false`只反映没有跨街，不能证明实时合格。
纯推理、独立MCP span和浏览器首次显示时间均unknown；没有用未过滤rollout补齐或另跑模型。

### 实现边界与可达验证

新增范围仅为 `test-support/codex-queue-wake-probe.cjs`、它的测试和变异规格（初版6条，复核后8条），
没有更改B8/B9产品运行代码、默认启动、插件工具或主动能力声明。
默认不开启；严格 `live:true` 后先固定逐席授权，真实读取公开基线并发出最小ready信号，
只对指定席位的新真人事件领取一次待办；身份、来源、数量、截止或协议失败即停止。
固定通知只含控制文字与校验后的两个编号，不携带聊天正文、底牌、令牌或路径。
探针不start/resolve、不生成台词、不执行扑克操作，也不覆盖模型、强度或权限设置。

真实本地正例不是纯mock：两席HTTP加入同一协调器，B正常发言，A探针经MCP领取；
确认探针MCP已经close后，再启动两个新的MCP进程。B使用A待办被拒，A能直接start/resolve，
公共时间线恰好一条真人和一条脚本AI发言，B的独立待办仍在。另有OFF、领取前/后撤销及来源变化负例。
这证明本地映射和逐席边界，不是真实模型或Desktop消费证据。

领取后再读公开时间线不是AI ON/OFF原子锁，剩余换绑、关闭、换手和30秒claim租约仍由原生
`ai.start`检查。停止监听器不能保证撤回已接收消息或取消模型回合。`elapsed_ms`含清理，
事件→领取→queue阶段时间戳本批未观测；不把一个整段数值当作每个阶段的耗时。

### 实际执行记录

| 执行 | 实际结果 | 计时口径 | 原始产物 |
| --- | --- | --- | --- |
| 实现首轮定向测试 | 102项：96通过、6失败，exit1 | Node 778.2472ms | implement-test-01.json |
| 修正夹具后第二轮 | 102/102，exit0 | Node 1809.4078ms | implement-test-02.json |
| 两轮变异后最终基线 | 102/102，exit0 | Node 1919.4052ms | implement-test-03.json |
| 实现第一轮变异 | 6/6杀掉，0存活/未评估，exit0 | 完整耗时unknown；初次工具等待不等于完整命令耗时 | implement-mutation-01.json |
| 实现第二轮变异 | 6/6杀掉，0存活/未评估，exit0 | 完整命令13843.8616ms | implement-mutation-02.json |
| 主代理既有相邻回归 | 89/89，exit0 | Node 5340.5689ms，进程墙钟5418ms | primary-adjacent-01.json |
| 独立复核初始基线 | 102/102，exit0 | Node 2250.9992ms | check-test-01.json |
| 独立复核新增负例红测 | 12项执行、12失败，exit1 | Node 213.4588ms | check-test-02-red.json |
| 独立复核修复后全文件 | 115/115，exit0 | Node 2791.0961ms | check-test-03-green.json |
| 独立复核补平台分支可达性 | 117/117，exit0 | Node 2353.2759ms | check-test-04-portable-green.json |
| 主代理最终独占变异 | 8/8杀掉，0存活/未评估，exit0 | 完整命令23179.1827ms | primary-mutation-01.json |
| 主代理新验证副本 | 117/117，exit0；52个文件逐项校验后复制 | Node 4787.5109ms，进程墙钟5148ms | primary-clean-snapshot-01.json |

上述文件均位于 `artifacts/b10-wake-probe-20260830/`，被Git忽略，并非已提交产物。
两轮初版变异命令各包含一次基线及六次变异，最终主代理命令包含一次基线及八次变异；
不把这些预期失败算作额外回归缺陷，
也不把重复运行的102项累加成几百项不同功能。没有重跑B8全量925/557或13手浏览器验收；
本轮不改页面，没有新增浏览器或真人验收。项目无lint/type-check脚本，二者不适用。

实现首轮6个失败来自两处测试夹具：错误JSON-RPC回复发在initialize请求之前；五个集成用例
共用的开局准备没有先用due-work tick挂倒计时。修正后保留全部用例，失败输出未覆盖。
独立复核新增12项负例先在原实现上全部变红：8项Windows无盘符根相对路径被
`path.isAbsolute`接受；4项末次MCP合法响应后已经观察到协议错误、child error/close或输出超限，
仍会发队列通知。已要求Windows路径带盘符，并在MCP await后、ready和queue前检查已观察到的失败。
补一个发送前状态检查后115项全过；主代理再指出Windows条件变异在其他系统恒不可达，复核补两个隔离VM
纯函数用例执行同一源码的Windows/POSIX分支，最终117项通过。没有删/跳过变异或改变路径政策。
上述过程不是Gate5的实机失败；VM也不是跨平台实机验证。独立复核没有运行变异，留给主代理独占复验。
主代理随后实跑全部8条，全部杀掉、0存活/未评估，三文件与复核后的SHA-256一致，确认变异已还原。
新验证副本仅含48个既有运行文件、三个B10文件及既有MCP测试客户端；不含旧配置、私有连接或.git。
117项在该副本中再次通过，副本目录已经核实归属并清理。它是哈希核验的文件副本，不是新提交或完整仓库检出验收。

### 最终身份与清理

`final-integrity.json`核对了运行文件集合和逐项字节：48文件仍为B9窄屏修补后的
`bb7c107606884f88b64e101d1caef6618cf934b7e274eac9017599fb26687e6b`；
25份B9冻结证据仍为 `fdf3cc423576ab81ec8f2f1d5efa3f76675b87d7eddc1619124a2d04691c60ac`。
本轮三个探针文件的集合摘要为 `c71612d1e91aa824a5331208791169182ce3b03b99e50ba157a18b68eefdcc4c`，
每项与独立复核身份匹配。七份现行语义合同的逐项验证均exit0，完整回执在 `semantic-bindings.json`。
算法均为本节既述的相对路径、NUL、文件SHA-256和LF排序拼接后再SHA-256，不用文件名代替内容身份。

23:05:03（UTC+8）的进程/文件检查记录：本探针及游戏MCP进程0，B10临时测试目录0，
项目宿主配置及B9私有连接文件均不存在。旧beta PID16608及其16:37:36的创建身份仍在，未终止或重启。
Git HEAD仍为 `bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`，暂存路径0；没有提交、部署或归档。
原始证据的23文件清单见 `artifacts/b10-wake-probe-20260830/evidence-identities.json`，集合摘要
`bd3ddf4bead416b804afb75470a0aeae2160341703d0664022a6d5e99a84bc09`。
该清单不自引用，也不包含随后执行的文档结构/语言检查；全部仍为本地忽略产物。

文档结构检查首次直接解析全部历史片段时，发现本文件两段旧YAML不能解析（检查时起始行为1332、1508）。
两段完整文本均与Git HEAD相同，不是本轮引入，保留原貌；失败及逐段对照记录在
`governance-structure-01-fence-failure.json`。本轮新增或变更的结构片段仍须强制解析，旧问题单列，
不能因此报告整个历史文档结构全绿。该检查问题不等于游戏测试或宿主探针失败。

尚未验证：当前Desktop是否自动消费、是否需每事件点击或新提示、同一任务模型/强度继承、唯一真实评估
及响应时延；另一个真实席位、完整插件入口、内嵌UI、Claude、异地联机和四真人45分钟体验仍在原有缺口中。
若真实Gate5失败且影响已确认主动交流结果，按U7回语义对齐，不自行降低为被动问答。

### 本地验证证据切片

以下只闭合本地探针验证记录，不裁决主动唤醒能力、不控制父节点完成或路线推进。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-QUEUE-WAKE-LOCAL-EVIDENCE-20260830-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE/local-queue-probe
    exact_outcome: 默认关闭的单次queue测试支持完成本地定向验证；不含真实宿主自动唤醒
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - {node_id: TG-L0-PRODUCT, contract_id: SC-TG-L0-ROOT-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-017, expected_digest: 'sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6', binding_status: verified}
      - {node_id: TG-L1-HOST-ENTRY, contract_id: SC-TG-L1-HOST-ENTRY-20260827-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-018, expected_digest: 'sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160', binding_status: verified}
      - {node_id: TG-L1-LIVE-TABLE, contract_id: SC-TG-L1-LIVE-TABLE-20260825-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-003, expected_digest: 'sha256:69f5be696f574556edd55ca49db6853c8086674a4f21440a67d904bfdadd9f91', binding_status: verified}
      - {node_id: TG-L1-PUBLIC-AI-PLAY, contract_id: SC-TG-L1-PUBLIC-AI-20260825-A, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260825-004, expected_digest: 'sha256:37f755856560105a5a33a2cc493200cae4ae96960f29dbbe9c7612e90fc903ae', binding_status: verified}
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PLAYABLE-TABLE, contract_id: SC-TG-L2-PLAYABLE-TABLE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022, expected_digest: 'sha256:d73e30748ac4d7a3fc814e6f44d6aa96676dc3677e0ef04f8f1298e9f84ca453', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    implementation_identity:
      kind: file_set_digest
      scope: test-support/codex-queue-wake-probe.cjs及其test文件和mutation规格；48个产品运行文件保持B9修补后身份
      identity: sha256:c71612d1e91aa824a5331208791169182ce3b03b99e50ba157a18b68eefdcc4c
      status: current
    verification_identities:
      - evidence_pointer: artifacts/b10-wake-probe-20260830/evidence-identities.json列明的23文件集合
        identity: sha256:bd3ddf4bead416b804afb75470a0aeae2160341703d0664022a6d5e99a84bc09
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - {obligation_id: B10-1, claim_or_predicate: 默认关闭与无合格事件零领取零队列, required: yes, real_condition: 默认入口及历史错席AI事件负例}
      - {obligation_id: B10-2, claim_or_predicate: 只取最新合格事件且最多一次发送不重复重放, required: yes, real_condition: 多事件和重复调用同一实例}
      - {obligation_id: B10-3, claim_or_predicate: 待办来源身份协议或权限异常失败关闭, required: yes, real_condition: 负例先到达校验及末次回复后已观察到的MCP故障}
      - {obligation_id: B10-4, claim_or_predicate: await前后取消截止与发送不明不重试, required: yes, real_condition: 受控异步屏障及有限I/O输出预算}
      - {obligation_id: B10-5, claim_or_predicate: 固定安全参数及净化通知不覆盖模型权限, required: yes, real_condition: 参数和通知字节断言及路径平台分支}
      - {obligation_id: B10-6, claim_or_predicate: 同一协调器逐席领取后新接收进程可沿原入口解析, required: yes, real_condition: 真实本地HTTP和MCP加脚本接收端；不是原生模型}
      - {obligation_id: B10-7, claim_or_predicate: 清理失败不能报成功且既有运行和原始证据不改写, required: yes, real_condition: 清理故障负例与最终文件身份进程目录核验}
    selected_surfaces: [static, integration, focused_probe, inspection]
    observations:
      - {obligation_id: B10-1, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-clean-snapshot-01.json, result: pass}
      - {obligation_id: B10-2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-clean-snapshot-01.json, result: pass}
      - {obligation_id: B10-3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-mutation-01.json, result: pass}
      - {obligation_id: B10-4, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-clean-snapshot-01.json, result: pass}
      - {obligation_id: B10-5, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-mutation-01.json, result: pass, caveat: 平台VM只证明同源码分支可达；不是其他系统实机}
      - {obligation_id: B10-6, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-clean-snapshot-01.json, result: pass, caveat: 五个本地集成场景与脚本发言；没有Desktop消费证据}
      - {obligation_id: B10-7, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/final-integrity.json, result: pass}
      - {obligation_id: B10-7, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-wake-probe-20260830/primary-mutation-01.json, result: pass}
    skipped:
      - {check: Codex及Claude真实Gate5和模型时延, reason: 本地切片不覆盖；前次临时窗口已关闭，新窗口授权未获答复}
      - {check: B8全量925测试557变异及13手浏览器真人验收, reason: 未改变产品运行文件；执行89项相邻回归及本探针定向验证，不扩充历史成绩}
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits: [只闭合本地验证记录不关闭主动唤醒节点, queue退出0不等于任务已消费, 两宿主Gate5仍not_run, 不证明跨平台实机或实时体验]
  remaining_non_blocking: [原始产物被Git忽略, manual_closeout下保留未提交差异]
  next_owner: user_bounded_native_probe_authorization_then_codex_primary
```

<a id="b12-native-receipts-window"></a>

## 2026-08-31：B12 有限实机接入受阻与B10历史补证

结论：**本次真实接入验证未通过，主动AI节点不关闭。** 两次原生准备回合均找不到新MCP，未运行queue或游戏评估。
当前窗口Gate5为not_run，累计Codex仍blocked、Claude仍not_run。Primary独立于执行步骤作一次自查，结论为
`REQUEST_CHANGES`：下一窗口前先解决原任务工具就绪及可核对的关停；不是要求重做扑克规则或改变产品语义。

### 授权、执行与停止

- 用户“同意验证”对应DEC-20260831-001；上限3次输入含1次queue，复用原任务，不覆盖模型/强度，不新建任务或另配模型API。
- 启动前main@bbdcf2b，工作树77个既有改动、暂存区空。B11最终12份源码与清单匹配；本轮只改事实文档和忽略的取证产物。
- 实际启动src/run-beta.cjs，回环64300，进程内权威，无模型适配器，启用独占新事件文件。两隔离Chromium页面正常建房/加入并同意范围，仅A下载本席连接；没有点击Ready。
- 输入1只查找新工具并准备读取投影，14.829秒后报告未找到，未调用游戏工具；页面仍awaiting_host。随后观察到匹配MCP进程，保留原失败后，以输入2做唯一复查；8.535秒后同样停止。
- 两次输入合计23.364秒，均为任务整轮时间。原生游戏MCP调用0、queue0、来源消息0、AI评估0。第3次未使用且不结转；没有按原计划继续开手、跟注、发言或采样180秒。
- CLI在原任务cwd H:/tokengold可读到enabled的同一配置；在其下方独立Git项目目录查询却找不到，二者不混作同一环境。CLI注册和进程存在仍不等于原任务已发现工具。
- 不再使用模型，只以已有stdio客户端和同一私有文件做一次view.projection，握手/工具清单/读取成功，页面随后反映host_seen。这是独立客户端的请求，不是原任务成功，不能覆盖前两次失败。
- 真人界面撤销后，以旧令牌做一次本地只读HTTP请求，返回403/model_command_token_rejected。3张实际截图已查看：授权等待、接入受阻、撤销；无控制台/意外网络错误。6个本轮人工命名断言为4通过、2接入失败，不把它们称为整套浏览器验收。

原任务本回合的配置记录为gpt-5.6-sol、max；这是载体记录的配置，不是提供商真实性证明，provider仍unknown。
实际角色为Primary自查，`ai_generated`、`same_session_self`，不是新外部模型审计或用户验收。
代码上下文采用固定文件集及rg/direct-read；本轮无产品实现、无索引重建、无新的语义或路线设计。
Trellis规范复核结论：已有质量规范已经要求缺回执保持unknown，未改接口或基础设施合同，不再复制一份新规范；这次PTY实测限制仅补入使用说明。

### B10现已能确认的历史事实

本次read_thread能返回B10的4个游戏工具条目（准备读取、一次start、一次resolve、撤销读取），但仍不包含权威返回正文。
随后只读原测试任务对应rollout的可见工具输出，另存去敏摘录及原始行号/行SHA256，排除隐藏推理、配置指令、底牌与模型上下文：

- 第138行：ai.start成功，turn-9218e7ab-75ef-47e1-bf99-935addaa5a96，hand_index=1、street=preflop、THINKING。
- 第142行：同一turn_id的ai.resolve返回ok=true，resolved.reason=hand_advanced，started_hand_index=1、current_hand_index=2、decision=public_speech。
- 因而B10实际是“回答跨手被权威丢弃”，不是silent，也不是模型没尝试回答。ok=true/工具completed不等于公开成功。
- 这项迟到证据修正当前原因判断；B10当时的unknown描述和冻结产物不改写。B10没有成功公开或silent，仍不足以通过原Gate5。
- 工具输出时间戳不是权威事件内部时间，不能倒算纯推理时长或补成B11来源→终态记录；本次未生成新的游戏模型性能样本。

### 载体与清理问题单列

| 直接观察 | 当前事实与边界 |
| --- | --- |
| 原任务两轮找不到新MCP；同配置的CLI注册及独立stdio可用 | 失败在原生任务工具发现/加载表面，具体缓存/刷新根因unknown；不直接归因Dual或扑克内核 |
| PTY发送Ctrl+C后外层shell退出1，beta45800与64300端口消失 | 事件文件仅有首行，stderr为空，没有footer或关闭回执；信号是否到达Node处理器unknown，write ACK/close/run_complete均unknown |
| 离线汇总执行两次 | 第一次经PowerShell工具显示外层退出1；第二次直接execFileSync获得原生退出2、partial、missing_footer；两次均0事件/0回合，不能把空日志写成AI通过 |
| 私有文件删除命令在执行前被工具策略拒绝 | H:/tokengold/.codex/tokengame-b12-private-lpTGXX/a.json仍保留，权限已撤销；未使用另一通道绕过删除策略 |
| 配置已删除，浏览器关闭，独立诊断MCP已stop | 宿主管理的匹配MCP进程仍可见；一次精确进程清理命令未留下可用回执，后续仍见匹配进程，未反复杀进程或重启Codex |
| 旧beta16608/父6720/原创建时间一致 | 未终止或重启该旧实例；本轮cleanup为partial，不声称所有资源已清理 |

以上不等于发现了产品扑克逻辑缺陷，也不证明所有正常终端的Ctrl+C都会失败。新的实机窗口应先验证工具发现与关停通道，
需要重启宿主或影响其他任务时另行说明边界；本次不通过降低模型强度、延长扑克时钟、影子AI或追加输入补绿。

### 证据与未执行项

本轮16份冻结证据见artifacts/b12-real-wake-20260831/evidence-identities.json，集合摘要
`sha256:1ba8f4123a84d17b91533228680b30341b86acdae14476ac14378d0141f8c2b6`；由Git忽略，不是已提交产物。
result.json记录尝试和失败；native-visible-evidence.json保存B10权威返回/B12发现失败；local-mcp-read-only.json、
cleanup-observation.json及两份summary命令记录各自表面。新证据中本次私有模型令牌精确扫描0命中。

B11源码12文件摘要e23cd31c…、B11的86份冻结证据和B10实机13份冻结证据均核对一致。
本轮没有重跑Node产品回归、变异、四人13手、四真人45分钟、Claude或异地联机；没有暂存、提交、推送、部署或归档任务。
语言与最终完整性检查另存本轮目录，不列入上述先冻结的16文件集合。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B12-NATIVE-RECEIPTS-20260831-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE-B12
    exact_outcome: 在一次有限原生窗口以新回执验证事件触发到唯一合法终态并完成可核对清理
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs: []
    implementation_identity:
      kind: file_set_digest
      scope: B11最终12份源码测试与变异文件
      identity: sha256:e23cd31c7f53cea826d626a202ded4670ebac75beecca782ea01ff17f9cbde21
      status: current
    verification_identities:
      - evidence_pointer: artifacts/b12-real-wake-20260831/evidence-identities.json
        identity: sha256:1ba8f4123a84d17b91533228680b30341b86acdae14476ac14378d0141f8c2b6
        status: current
    freshness: current
  acceptance:
    derivation_timing: not_applicable_evidence_only
    obligations:
      - {obligation_id: B12-AUTH, claim_or_predicate: 实际输入不超过3且queue不超过1, required: yes, real_condition: 复用原生测试任务的当前窗口}
      - {obligation_id: B12-READY, claim_or_predicate: 原游戏任务可以通过新本席MCP读取投影, required: yes, real_condition: 原任务真实工具发现与一次只读调用}
      - {obligation_id: B12-WAKE, claim_or_predicate: 无玩家新提示或AI点击时一次评估产生唯一成功公开或silent, required: yes, real_condition: 正常扑克时钟与一个真实公开来源事件}
      - {obligation_id: B12-REVOKE, claim_or_predicate: 真人撤销后旧令牌被拒, required: yes, real_condition: 正常控件撤销及一次本地只读HTTP复核}
      - {obligation_id: B12-CLOSE, claim_or_predicate: 临时资源已清理且日志收尾有可核对回执, required: yes, real_condition: 本次Windows PTY及宿主管理MCP的实际关闭}
    selected_surfaces: [inspection, focused_probe, integration, browser_smoke]
    observations:
      - {obligation_id: B12-AUTH, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/result.json#/task_inputs, result: pass, caveat: 实际2次原生输入}
      - {obligation_id: B12-AUTH, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/result.json#/queue_attempts, result: pass, caveat: 实际0次queue}
      - {obligation_id: B12-READY, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/native-visible-evidence.json#/b12, result: fail, caveat: 两轮均未发现工具，独立stdio成功不能覆盖}
      - {obligation_id: B12-WAKE, evidence_type: not_run, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/result.json#/queue_attempts, result: not_run}
      - {obligation_id: B12-REVOKE, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/result.json#/revocation/old_token_direct_read_only, result: pass}
      - {obligation_id: B12-CLOSE, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b12-real-wake-20260831/result.json#/cleanup, result: fail, caveat: 私有文件和匹配MCP仍留存且无footer及关闭回执}
    skipped:
      - {check: 一次真实queue及双席发言采样, reason: 原生工具未就绪，第二次准备失败即停止}
      - {check: 第三次模型输入, reason: 窗口停止，未使用额度不结转}
      - {check: 产品回归变异及多人真人验收, reason: 产品源码未修改，此次仅真实连接取证}
    result: fail
  semantic_delta: none
  state: blocked
  claim_limits: [不关闭主动AI节点, B12没有游戏评估样本, B10补证不是新性能样本, 不证明提供商真实性, 不证明完整插件或Claude, 清理仅partial]
  remaining_non_blocking: [证据被Git忽略, 维持manual_closeout]
  next_owner: codex_primary_native_mcp_readiness_and_cleanup
```

<a id="b10-native-queue-wake-probe"></a>

## 2026-08-30 实测 / 2026-08-31 收尾：B10 一次原生同任务 queue 验证

结论：一次真实queue确实自动启动了原Codex任务，无需A补发提示或点击；但没有AI公开消息，
原生回合工具明细不可见，无法直接判定唯一合法终态。Codex Gate5记为`blocked`，Claude仍`not_run`。
不关闭`TG-EU-PROACTIVE-WAKE-SPIKE`，不翻转`proactive_wake`能力声明，也不把本轮与B9显式发言样本拼成主动闭环。

原理解是“queue可能只接受消息、未必唤醒Desktop”；实际已经观察到同一任务自动运行和牌桌THINKING。
新的缺口是终态可审计性与端到端时延，不再是“完全没有Desktop消费证据”。下一步先做同路线本地诊断，
不为了通过探针放慢扑克时钟、覆盖用户模型设置或改成独立后台AI。

### 授权、环境与实际次数

用户原话“同意验证”对应`DEC-20260830-003`。复用任务`01a052c9-5259-7a61-b26f-35731734994e`
（`TokenGame 临时单席接入验证`），没有创建新任务。实测使用两隔离Chromium页面、一份A本席授权、
原产品`npm run beta`入口的回环实例`127.0.0.1:49307`；没有模型适配器或脚本AI代答。
运行ID为`51a14346-0dc4-4974-8aa8-2e1bbbaba08a`。配置仅临时写入`H:/tokengold/.codex/config.toml`，
没有全局安装、远端监听、模型/强度覆盖、第二API或部署。

安装的Desktop包版本为`26.825.6671.0`，在收尾进程检查时直接读取；CLI为`0.151.0-alpha.7.2`，
本轮执行前核对SHA-256为`bfd4c3b971477a559eadaeae8b1e41382ccb7656bd0104970cf5c6c581f2da7d`。
原任务的本轮实际provider/model/reasoning元数据未被读取接口返回，均为unknown；只能确认发送时没有覆盖项，
不能复制B9的模型标签作为本轮运行身份。

| 实际输入 | 结果 | 原生任务整轮耗时 |
| --- | --- | --- |
| 1：显式只读连接准备 | 任务完成；A页面由等待连接变为已收到本席宿主请求，无公开消息 | 21.461秒 |
| 2：唯一真实queue通知 | 任务自行启动并完成；一次THINKING转移，最终无AI公开消息 | 49.009秒 |
| 3：撤销后的显式只读检查 | 任务完成，但工具响应不可见；不宣称已经读到原生拒绝码 | 16.888秒 |

总计3次任务输入，只有1次queue；三次整轮duration合计87.358秒，不是来源到响应延迟。
探针自身exit0，领取1次、queue1次、公开时间线读取182次，完整运行50.672秒包含来源事件前等待与清理。
它保留`gate5_status:not_run`、`native_wake_status:native_woken_unknown`，这是该工具自身取证边界，
不能改写为pass；本节用独立宿主及牌桌观察补充事实。未重跑一次真实唤醒，也未重跑B8/B10产品测试或变异。

### 可观测时序与未观测部分

B通过正常公开发言控件发送唯一文本：“A，你家AI睡着了吗？你这气势挺足，牌可别吹过头。”
权威公开序号6，时间`1788104929354`ms。A从该事件到自动回合完成无新点击或提示；准备和后续撤销是分开的阶段。

| 相对来源事件 | 直接观察 |
| --- | --- |
| 约2秒内 | 同一任务新增自动回合；宿主startedAt只精确到秒，不能当作毫秒级queue阶段计时 |
| +20.667秒 | A投影首次观察到THINKING，仍是第1手 |
| +33.261秒 | 投影首次观察到第2手，A仍THINKING |
| +38.867秒 | 投影首次观察到A回到IDLE，公开消息仍只有B玩家文本 |
| 原生整轮49.009秒结束 | 任务空闲，无错误状态；这不是纯模型推理耗时，也不是公开发言完成时刻 |

投影为约700ms轮询，以上是首次观察时间，不是内部精确转换时刻。来源到AI公开时间不适用，因为本轮没有公开。
只观察到一次THINKING不等于已取得精确`ai.start`/`ai.resolve`调用计数；纯推理、独立工具span和终态码均unknown。
跨手后IDLE且没有公开与`hand_advanced`丢弃相符；`src/authority/seat-ai-store.cjs`确实有该保护，
但没有原生resolve回执，所以这里是推断，不把它写成已确认的丢弃原因，更不把IDLE当成silent成功。

双页采样保留1200份后达到上限，尾点`1788105299318`ms晚于自动回合完成；后续清理靠独立回执而非缺失的采样尾段。
收尾截图出现第12/13手只是正常超时继续开手，不等于又跑了一次B8四人209项/13手验收。
桌面A、窄屏B与撤销截图已实际查看：只有自己底牌可见，对手牌背；390px页面scrollWidth=390，
纵向内容1188px，正常滚动。没有AI气泡，未声称AI气泡视觉通过。已监听的pageerror和console error为0，
不从只保存HTTP200的投影采样推出所有网络请求都成功。

### Gate5逐宿主记录

```yaml
gate_5_run:
  status: blocked
  probe_run_id: 51a14346-0dc4-4974-8aa8-2e1bbbaba08a
  host: codex
  host_version: Desktop_26.825.6671.0_CLI_0.151.0-alpha.7.2
  surface: codex_visible_task
  source_game_event: B_PLAYER_PUBLIC_SPEECH
  source_event_seq: 6
  expected_model_evaluations: one
  observed_model_evaluations: 一次THINKING转移；精确调用数unknown
  terminal_result: unknown
  user_click_required: no
  new_user_prompt_required: no
  same_visible_context_proven: 同一task_id与cwd已核对；不证明内嵌UI
  direct_evidence_refs:
    - artifacts/b10-real-wake-20260830/carrier-receipts.json
    - artifacts/b10-real-wake-20260830/result.json#/observed_transitions
    - artifacts/b10-real-wake-20260830/result.json#/post_native_turn_views
  caveats: [任务items为空, 没有AI公开消息, 不能由IDLE推断合法沉默, 仅一次合成双席样本]
```

```yaml
gate_5_run:
  status: not_run
  probe_run_id: none
  host: claude
  host_version: unknown
  surface: unknown
  source_game_event: none
  source_event_seq: unknown
  expected_model_evaluations: one
  observed_model_evaluations: not_run
  terminal_result: unknown
  user_click_required: unknown
  new_user_prompt_required: unknown
  same_visible_context_proven: unknown
  direct_evidence_refs: []
  caveats: [本轮未操作Claude宿主]
```

### 撤销、清理与载体问题

A通过正常“撤销AI连接”按钮成功撤销，UI恢复“尚未绑定本席AI”。随后第3个原生任务回合完成，
但其工具码同样unknown。主代理另外做一次不调模型的只读HTTP请求，使用原令牌得到
`403/model_command_token_rejected`；这是直接服务器拒绝证据，不冒充原生工具回执。

临时连接文件及配置已删除，可重新授权生成；本轮MCP PID45120按PID、创建时间、父进程和命令行核对后停止，
服务PID29252经所属终端SIGINT退出，日志明确端口释放与定时器停止，退出码1按人工中断原样保留。
双浏览器上下文已关闭，49307连接明确ECONNREFUSED。2026-08-31 00:01:32（UTC+8）复核仅余原beta
PID16608，创建于8月30日16:37:36、父PID6720；未停止或重启。临时原生任务保留为空闲，没有游戏连接。
精确“全部清理完成”的单一时刻unknown，使用独立最终核对时间，不拿浏览器关闭时间代替全部清理时间。

载体取证问题单列：`wait_threads`提供自动回合开始、结束和49.009秒duration，但助手消息与tool marker为null；
`read_thread`对三个完成回合均返回`items:[]`。未读取原始隐藏推理、未补发第四次消息来填空。
准备阶段get_context参数不支持、Playwright ESM入口不兼容和私有父目录不存在，均经本机实际支持入口恢复；
收尾两次文档patch上下文匹配失败没有落盘，修正为实际整行后完成。它们不是产品测试失败或Dual质量归因。

### 身份、证据与自查

48个产品文件仍为`bb7c107606884f88b64e101d1caef6618cf934b7e274eac9017599fb26687e6b`，
3个探针文件仍为`c71612d1e91aa824a5331208791169182ce3b03b99e50ba157a18b68eefdcc4c`。
25份B9证据与23份B10本地准备证据逐项未变；7份现行语义绑定本轮重新机械校验均exit0。
本次13份冻结证据的集合摘要为`a61c3f1178fe5401293158d53fc9c7108e394f449fd6b9b4a72f86f91a651b29`，
逐项清单见`artifacts/b10-real-wake-20260830/evidence-identities.json`。算法为排序拼接
`相对路径 + NUL + 文件SHA256 + LF`后SHA256；清单不自引用，不含随后治理检查。
证据仍被Git忽略，不声称已提交；文本产物扫描未含临时模型令牌。Git仍为`bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`，暂存为空。

主代理按执行前`qa-plan.md`复核收据与截图，`ai_generated`、`same_session_self`；事实记录自查为
`APPROVE_WITH_NOTES`，不是Gate5通过或真人验收。未新增产品实现、未提升能力声明，外部审查记为
`self_review_sufficient`。12个环境/权限/清理/身份辅助断言通过，不能覆盖未取得的合法终态和精确调用数。
能改变本次门禁结论的证据是同一来源的一次真实start及唯一silent/public_speech原始终态；目前不存在。
下一轮先补最小可审计回执与时延诊断；若最终要放弃主动结果改交付被动问答，仍须按U7回受影响L2/规则确认。

### 本次证据切片（不关闭父节点）

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-NATIVE-QUEUE-EVIDENCE-20260830-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE/native-queue-probe-20260830
    exact_outcome: 一次合成来源事件自动唤醒原Codex任务并获得唯一合法AI终态的有界验证
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    implementation_identity:
      kind: file_set_digest
      scope: B10三个探针文件；产品48文件另在final-integrity.json逐项绑定
      identity: sha256:c71612d1e91aa824a5331208791169182ce3b03b99e50ba157a18b68eefdcc4c
      status: current
    verification_identities:
      - evidence_pointer: artifacts/b10-real-wake-20260830/evidence-identities.json中的13文件集合
        identity: sha256:a61c3f1178fe5401293158d53fc9c7108e394f449fd6b9b4a72f86f91a651b29
        status: current
    freshness: current
  acceptance:
    derivation_timing: legacy_or_existing_state_reconstructed
    obligations:
      - {obligation_id: B10-N1, claim_or_predicate: 新真人事件自动唤醒同一任务且不需本席新点击或提示, required: yes, real_condition: 双页正常控件与一次真实queue}
      - {obligation_id: B10-N2, claim_or_predicate: 恰好一次真实评估且取得唯一silent或public_speech终态, required: yes, real_condition: 当前原生任务与真实模型通道}
      - {obligation_id: B10-N3, claim_or_predicate: 正常撤销后旧模型令牌被服务器拒绝且临时资源清理, required: yes, real_condition: 玩家撤销控件与原令牌只读HTTP和进程端口检查}
      - {obligation_id: B10-N4, claim_or_predicate: 遵守3次任务输入及1次queue上限且不改运行代码, required: yes, real_condition: 原始调度收据与冻结文件逐项核对}
    selected_surfaces: [focused_probe, integration, browser_smoke, inspection]
    observations:
      - {obligation_id: B10-N1, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-real-wake-20260830/result.json#/wake_observation_window, result: pass, caveat: 对应任务原始收据另存carrier-receipts.json；不含内嵌UI验证}
      - {obligation_id: B10-N2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-real-wake-20260830/result.json#/gate_5_codex, result: blocked, caveat: 一次THINKING只证明观察到启动，items为空且AI公开消息0，合法终态unknown}
      - {obligation_id: B10-N3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-real-wake-20260830/result.json#/old_token_direct_read_only_check, result: pass, caveat: 清理另见同文件cleanup与cleanup-process-receipt.json；不冒充原生撤销工具回执}
      - {obligation_id: B10-N4, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b10-real-wake-20260830/result.json#/evidence_validation, result: pass, caveat: 文件字节逐项见final-integrity.json}
    skipped:
      - {check: Claude与第二真实席及持续多事件调度, reason: 不在本次单任务一次queue窗口范围}
      - {check: 产品全量测试和变异, reason: 本轮未改运行代码，逐项核对既有身份，不重复累计旧成绩}
      - {check: 四真人45分钟和异地联机, reason: 只有本机两隔离页面，不是朋友验收}
    result: blocked
  semantic_delta: none
  state: blocked
  claim_limits: [只证明一次同任务自动唤醒, 不能确认合法终态或精确调用数, 不证明实时性或完整主动AI, 不关闭父节点, 不将回合工具明细缺失归因为模型或Dual]
  remaining_non_blocking: [证据由Git忽略且未提交, 原临时任务保留为空闲]
  next_owner: codex_primary_local_terminal_evidence_and_latency_diagnostics
```

<a id="b11-ai-lifecycle-receipts"></a>

## 2026-08-31：B11 本地 AI 生命周期回执与时序分析

结论：本地取证切片 `APPROVE_WITH_NOTES`。已经能从同一个进程内权威记录来源、评估开始和实际终态，
并离线检验完整性、计算有证据的阶段时差。**没有新真实模型样本，没有证明时延改善，也没有关闭主动AI节点。**
Codex Gate5保持B10的`blocked`，Claude保持`not_run`；B10缺失的合法终态与精确调用数仍为unknown。

### 授权到实现的实际路径

用户在B10收尾后说“继续”，本批按同一已确认路线做L3/L4本地开发。执行前冻结R1–R8验收矩阵及Primary计划，
见任务`research/b11-ai-lifecycle-receipts-20260831.md`、本批`qa-plan.md`和两份验收计划身份记录。
起点仍为`main@bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`，69个既有脏文件、暂存为空；没有重建项目或撤销既有修改。
DEC-20260830-003已关闭，本批真实游戏任务输入、queue、模型调用、新建游戏任务均为0。

按项目Trellis约定，由实现者负责代码，新上下文检查者复核并修复，Primary另做反例、全量、浏览器和变异验证。
两者均继承当前载体设置，没有指定另一模型，实际provider/model/effort未独立核实；这是独立上下文检查，
不是异模型或外部人工审计。Primary最后按既定验收矩阵自查，标记`ai_generated`、`same_session_self`，不替代用户验收。

实际修改包括：

- `src/host/ai-lifecycle-receipts.cjs`：默认关闭，仅订阅已有`SeatAiStore.onEvent`，不新增权威事件。
  `TOKENGAME_AI_RECEIPT_FILE`显式启用；`wx`独占创建，单次最多10000条、8MiB、待写128条/256KiB，
  留出收尾空间；只允许降低上限。运行内HMAC关联引用，密钥不落盘，不保存聊天、回答、手牌、昵称、凭据或原始自由ID。
- `src/run-beta.cjs`：CLI和可调用`startBeta`共用入口，进程内权威接入记录器；远程内核启用记录时在监听前拒绝。
  正常启动、失败和关闭均清理本批资源。记录模式输出去敏收尾回执，写入或关闭失败非零退出，不改变扑克时钟、租约或配额。
- `test-support/summarize-ai-receipts.cjs`：只处理有界白名单输入；验证计数、顺序、必带字段、回合身份及手数/街道，
  先校验所有链再给出结果，防止某条坏链仍留下另一条“完整”数字。来源未观察、无终态与非法输入分别报告，不由IDLE推导沉默。
- 三份新测试、一份20项变异规格、beta环境隔离，以及集中错误分类/真实出码扫描和两份旧规格的同步。
  集成失败后才将分类与模板纳入修复归属，追加说明保留在research，未倒写为开发前已经决定的范围。

`capture_complete`仅描述捕获内容，`write_acknowledged`与`close_succeeded`描述各自I/O回执，
`run_complete`要求三者成功。最后写入报错但可能已生效时，进程内容状态为unknown；读到完整文件不能证明写入返回成功、
资源关闭成功或数据已耐久落盘。离线汇总始终将writer/close状态记为unknown，必须与同一`run_ref`的运行收尾对照。

### 发现、失败与修复（不把历史失败改成通过）

| 来源 | 当时实际结果 | 修复与后续证据 |
| --- | --- | --- |
| Primary关闭失败反例 | 已写完整文件，初版内存`capture_complete:false`而磁盘为true，原判定失败 | 分开内容、写回执、关回执；真实文件close及footer-write生效后抛EIO，两例各9项断言通过，各11ms |
| 实现者第2轮 | 51通过、1失败 | HTTP测试漏了`hand.evaluate_start`便推进时钟，只修夹具；后续beta8项及定向54项通过 |
| Primary首个全量副本 | 1094通过、1失败，59.293秒 | 新远程记录错误未分类；集中注册11个错误，并让`receiptError`字面量/三元分支进入真实扫描 |
| 新上下文检查者红测 | 31通过、16失败 | 13个链完整性/时序/身份反例及3个分类/扫描问题；修后47/47，相邻212/212 |
| 两处分类数组旧变异 | 加入错误码后原整段查找串失配 | 保留旧15项语义并同步锚点；Primary随后15/15实际杀掉 |
| 两处beta入口旧变异 | `const host`与`process.env`旧查找串在重构后0匹配 | 保留14项，只同步2项；确认默认端口空闲后，单独基线及2项变异均实跑通过 |

Primary最初全仓锚点审计比较的是“实现后副本”，其`became_unreachable:[]`不能证明旧模板在开发前就失效。
最终用与开发前基线SHA一致的旧规格和`before/src/run-beta.cjs`证明两项原先各匹配一次，明确归为本批重构影响。
检查者的原11文件`check-final-06.json`保持不变；模板增补另存`check-final-08.json`的12文件清单。
模板更新晚于最终全量起跑，只补到验证副本中的该JSON，另存`primary-copy-template-amendment-01.json`，不倒改原副本清单。

### 实际验证次数、耗时与覆盖

原始stdout/stderr、完整命令、退出码、来源及逐次台账均在`artifacts/b11-ai-receipts-20260831/`。
`verification-ledger.json`列出13次独立Node测试命令：实现者6次、检查者4次、Primary3次；它们有重复子集和故意红测，
不能相加为独立覆盖。4条变异命令内部还各自执行绿色基线及逐项故意失败，另列而非藏进13次。

| 执行者/记录 | 结果 | 记录的耗时 |
| --- | --- | --- |
| 实现者01/02/03/05/06/07 | 42；51通过1失败；8；54；87；86通过 | 1.408 / 2.424 / 1.403 / 2.860 / 3.063 / 2.458秒，child elapsed |
| 检查者baseline/red/green/adjacent | 54；31通过16失败；47；212通过 | 2.470 / 1.308 / 1.145 / 5.958秒，exec wall |
| Primary full-copy-01 | 1094通过、1失败 | wall 59.293秒；Node 59167.6996ms |
| Primary full-copy-02 | 1110/1110，0失败 | wall 58.991秒；Node 58892.7042ms |
| Primary beta-default-01 | 不带过滤的7/7 | wall 1.384秒；Node 1290.4137ms |
| B11定向变异 | 20杀掉，0存活/未评估 | 32.344秒 |
| 错误分类既有变异 | 15杀掉，0存活/未评估 | 8.722秒 |
| 两项beta旧模板变异 | 各1杀掉，0存活/未评估 | 3.106秒、3.168秒 |
| 两席连接浏览器第1/2轮 | 每轮51/51，errors空 | driver 6.318 / 6.467秒；命令wall 6.421 / 6.576秒 |
| 技能浏览器客户端 | 建房/公开范围页面状态成功，exit0 | 命令wall 3.307秒；没有AI回合 |

两个全量命令均显式使用`--test-skip-pattern=默认端口`。Node过滤后报告`skipped:0`，不代表没有排除。
默认端口7802在只读确认空闲、旧beta身份未变后单独补验；7项中有6项重复，不合成1117项独立覆盖。
实现者早期负向`--test-name-pattern`未真正排除固定端口，该轮87项实际包含它；这一隔离偏差保留，不能写成全程只用port0。

最终变异共37项实际执行、全部杀掉、0存活/未评估，四条命令合计47.340秒；仅在隔离副本串行运行。
367个副本文件在计入上述唯一模板修正后逐项恢复一致。全仓585项锚点静态检查均唯一匹配，**没有重跑585项完整变异门禁**。
9个产品/测试CJS语法检查通过；项目未配置lint/type-check，不伪造其通过记录。不同层级耗时及重叠执行不合计成现实经过时间。

最终浏览器使用两个Chromium上下文和两个本地MCP进程，检查建房、逐席授权、正常AI气泡、刷新、撤销及390/320px页面。
五张最终截图已实际查看；对手底牌保持牌背，邀请码与复制按钮可见，撤销后真人控件保留。320px发言按钮呈两行文字，
仍可见，属于后续窄屏体验打磨项，本批未改UI。此为固定脚本发言，不是真实模型、宿主内嵌UI或四人13手验收。
最终52个运行/脚本文件与全量副本身份一致，见`primary-browser-identity-02.json`。

另实际启动一次CLI beta并用技能客户端建房，落下首尾回执，离线CLI exit0、97ms，但记录中AI回合数为0。
真实PTY的Ctrl+C释放本批端口，工具exit1及终端重排原样保留；收尾片段可见，却不能严格解析为一行完整JSON，因此该项为unknown。
可解析的正常/写失败/关闭失败CLI回执由pipe集成测试另证；其预加载器触发`process.emit("SIGTERM")`，不冒充操作系统信号。
最终汇总器另对相同的两份I/O故障文件重读，5ms通过；这是旧文件复算，不是又执行两次I/O故障或真实模型。

载体/工具问题单列：PTY重排与人工中断exit1影响收尾输出解析，不直接归因模型或Dual。
收尾证据组装曾误读不存在的`before`规格快照，随后一次REPL变量未定义、一次台账表达式语法失败；均未运行产品测试，
改用已核对基线SHA的副本和可复跑台账脚本完成，未将这些工具失败混入产品测试数或改写原始结果。

### 身份、资源与文档收口

B11最终12个源/测试/规格文件集合摘要为
`e23cd31c7f53cea826d626a202ded4670ebac75beecca782ea01ff17f9cbde21`，见`final-source-identity.json`。
原48个运行文件中，只有`run-beta.cjs`和`adapter-contract.cjs`按本批目的修改，另46个未变；新记录器单列，
不能沿用旧48文件的集合摘要代表新版。B10探针3文件、B9证据25文件、B10本地23文件和实机13文件均逐项未变。
现行语义决定/PRD/合同来源字节未改，本批复用既有7份验证，不声称又跑过7次语义验证。

本批86份冻结证据集合摘要为`131bc48caca38bc1761026ef0381e326935abeac3c3799c595903eb694e2bf9b`，
逐项见`evidence-identities.json`。算法为按项目相对路径排序后拼接`path + NUL + raw SHA256 + LF`再SHA256。
清单不自引用，不含随后治理检查；两个验证副本目录通过独立清单及修改/还原回执绑定，不重复纳入。
原始产物由Git忽略；摘要写入受控文档不等于产物已提交。代码冻结及范围保留见`final-integrity.json`，
后续文档一致性检查单独保存，不改变此前快照。

02:01:40（UTC+8）只读复核：只余旧beta16608（父6720、8月30日16:37:36创建），未停止或重启；
本批已知端口60448和单独补验7802无监听，两次浏览器私有下载目录均不存在，临时父项目宿主配置没有恢复。
浏览器/测试本批子进程已自行清理；保留两个无宿主配置的验证副本作为复核材料。没有提交、暂存、推送、部署或任务归档。
使用说明写入`docs/AI-LIFECYCLE-RECEIPTS.md`；README、宿主清单、STATUS、计划树、进度及交接同步到这一边界。

文档结构检查读取24个YAML块：22个有效，两处无效块位于旧REVIEW-LOG的1332/1508行，与HEAD逐字一致，
本批没有修改或新增无效块；新的本地收口谓词均通过。语言检查首次因Primary把`--write-receipt`误当输出路径而在正文检查前阻断，
不代表正文语言失败；按脚本实际接口改为传已写文件路径，最终结果另存治理回执，不改写首次结果。

### 尚未证明与下一步

本地事件间隔不是纯模型推理耗时；engine等未被同ID观察到的来源仍为unknown，OFF或校验异常摘除但不发终态时，
只能写“未观察到终态”。文件也不认证模型身份、强度、用户是否点击或失败MCP次数，不是防篡改账本。
不能凭空补B10的终态；可改变Gate5结论的证据仍是新授权窗口内同一来源的一次真实start和唯一合法终态。

建议下一步另开一次明确有限窗口：最多3次游戏任务输入、其中1次queue；复用原闲置任务和新逐席权限，启用新回执，
不覆盖会话模型/强度、不加第二API、不暂停或延长扑克时钟，结束即撤销并清理。当前“继续”不包含这个追加授权。
即使取得合法终态，持续可玩时延、第二真实席、完整输入/内嵌UI、Claude、异地安全与四真人45分钟仍须各自证明。
若实测否定已确认的主动交流结果而要改交被动问答，仍须按U7回受影响语义/规则确认，不能以探针完成绕过。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-AI-LIFECYCLE-RECEIPTS-20260831-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE/local-lifecycle-receipts-20260831
    exact_outcome: 默认关闭的本地权威事件记录、分项收尾与离线完整性和时序分析
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    implementation_identity:
      kind: file_set_digest
      scope: final-source-identity.json列出的12个源码测试与变异文件
      identity: sha256:e23cd31c7f53cea826d626a202ded4670ebac75beecca782ea01ff17f9cbde21
      status: current
    verification_identities:
      - evidence_pointer: artifacts/b11-ai-receipts-20260831/evidence-identities.json中的86文件集合
        identity: sha256:131bc48caca38bc1761026ef0381e326935abeac3c3799c595903eb694e2bf9b
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - {obligation_id: B11-R1, claim_or_predicate: 默认关闭与配置失败无隐式副作用且不覆盖旧文件, required: yes, real_condition: 默认入口和远程配置冲突及启动失败负例}
      - {obligation_id: B11-R2, claim_or_predicate: 真实权威来源开始和公开或沉默事件被正确关联, required: yes, real_condition: 实际本地权威HTTP命令加脚本终态}
      - {obligation_id: B11-R3, claim_or_predicate: 跨手OFF回收及迟到结果不伪装合法沉默, required: yes, real_condition: 权威转移与缺终态反例}
      - {obligation_id: B11-R4, claim_or_predicate: 去除payload及自由ID与错误中的秘密且保留关联, required: yes, real_condition: 合成哨兵落盘和stdout及stderr检查}
      - {obligation_id: B11-R5, claim_or_predicate: 文件队列有界且内容与I/O回执分别报告, required: yes, real_condition: 达限和真实文件生效后故障及重复关闭}
      - {obligation_id: B11-R6, claim_or_predicate: 畸形截断冲突或缺记录不产生伪成功或时差, required: yes, real_condition: 有完整计数的坏链及缺来源和缺终态负例}
      - {obligation_id: B11-R7, claim_or_predicate: beta实际入口确实接入回执且可正常清理, required: yes, real_condition: startBeta与真实CLI子进程及HTTP集成}
      - {obligation_id: B11-R8, claim_or_predicate: 受影响相邻行为无回归且变异实际可执行, required: yes, real_condition: 校验副本全量和37变异以及两页MCP浏览器}
    selected_surfaces: [static, integration, focused_probe, browser_smoke, inspection]
    observations:
      - {obligation_id: B11-R1, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-full-copy-02.json, result: pass}
      - {obligation_id: B11-R2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-full-copy-02.json, result: pass, caveat: 脚本命令不是真实模型}
      - {obligation_id: B11-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-mutations-b11-01.json, result: pass}
      - {obligation_id: B11-R4, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-mutations-b11-01.json, result: pass}
      - {obligation_id: B11-R5, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-io-final-reanalysis-01.json, result: pass, caveat: 直接I/O原始实跑见primary-io-retest-01；最终分析重读相同文件}
      - {obligation_id: B11-R5, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-full-copy-02.json, result: pass, caveat: 达限及CLI正常写失败关闭失败路径}
      - {obligation_id: B11-R6, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-mutations-b11-01.json, result: pass}
      - {obligation_id: B11-R7, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/primary-full-copy-02.json, result: pass, caveat: HTTP脚本终态与CLI分层；PTY严格JSON收尾解析仍unknown}
      - {obligation_id: B11-R8, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/verification-ledger.json, result: pass, caveat: 1110全量过滤1项默认端口后另跑7项；37实际变异不是585全量变异}
      - {obligation_id: B11-R8, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b11-ai-receipts-20260831/binding-browser-02/result.json, result: pass, caveat: 51项脚本浏览器；非原生UI或13手验收}
    skipped:
      - {check: 新的真实Codex或Claude及queue模型调用, reason: 原3次输入窗口已关闭，本批无追加授权}
      - {check: 全部585项变异门禁, reason: 实跑本批20项及受影响17项，其余只静态核对锚点}
      - {check: 四人13手和四真人45分钟及异地联机, reason: 未变扑克运行规则，本批仅局部记录和相邻连接UI}
      - {check: lint和type-check, reason: 项目未配置}
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits: [只关闭本地取证切片不关闭主动AI父节点, 不追认B10终态, 无新真实模型性能样本, 文件完整不等于写入关闭或Gate5通过, Claude仍not_run]
  remaining_non_blocking: [原始证据被Git忽略, manual_closeout保留未提交修改, 320px发言按钮两行排版可后续打磨]
  next_owner: user_bounded_native_probe_authorization_then_codex_primary
```

<a id="b13-host-readiness-shutdown"></a>

## 2026-08-31：B13 本地受控关停与宿主就绪诊断

结论：本地关停切片 `APPROVE_WITH_NOTES`。真正的Node子进程现在可经专用父子IPC收尾，
并分别报告捕获内容、写入/关闭回执、输出完整性与实际退出。最终46项定向/相邻测试、9条实际变异、
主线程26项整合通过。**没有验证原游戏任务的新MCP接入；没有新增真实模型、queue或原生游戏输入。**
Codex Gate5保持blocked，Claude保持not_run，不关闭主动AI父节点或完整MVP。

### 授权、范围与实现路径

用户在B12停止后说“继续”，本批仅恢复已确认路线的本地诊断与修复，不继承DEC-20260831-001未用的第三次输入。
开发前`qa-plan.md`冻结五项判据；`baseline.json`绑定`main@bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`、
367份文件、77个既有脏路径及空暂存。L0–L2、扑克规则、行动时钟、权威来源、模型/真人权限与UI均未扩展。

按项目Trellis执行约定，实现上下文负责关停代码；Primary同步检查宿主源码和实际加载边界；
新上下文`b13_shutdown_check`在冻结检查包上构造反例、自修复并完成回归；Primary最后整合、实际运行变异并作本裁决。
本批不是新插件入口、后台常驻AI或第二套模型API。

- `src/run-beta.cjs`仅接受继承的Node IPC通道中的精确`{schema:"tokengame.beta-control.v1",command:"shutdown"}`，
  多余字段和非法消息不触发关停；信号/IPC处理器在异步启动前注册。复用原`startBeta.close()`的同一Promise，无HTTP关停接口。
- `test-support/beta-process.cjs`只启动和控制自身子进程；默认回环随机端口、无回执捕获，显式启用才建文件。
  启动默认10秒、关停8秒有界等待；失败时最多再等2秒确认自身强制退出，强制结束不算graceful。
  正常成功必须实际收到exit及stdout/stderr各自end/close；不假设它们的先后顺序，不只等待ChildProcess.close。
- 子进程输出等待write callback及必要的drain；异常输出或父通道丢失必须非零退出。
  footer落盘后再出错不追写旧文件；记录器`run_complete:true`不能覆盖晚到的进程/通道失败。
  控制器独立记输出错误与截断，不能被先发生的其他错误原因遮蔽。
- 原beta I/O故障测试从`process.emit("SIGTERM")`改为真实fork/IPC；新增逐流顺序、超时、非法消息、
  启动期断连、非空捕获正常/异常退出等反例。新增六条关停变异，另修两处旧变异锚点，保留原检查目的。

### 宿主诊断：静态能力不是原任务就绪

本机MSIX为26.825.6671.0，ASAR包内版本26.825.51511；实际CLI为0.151.0-alpha.7.2，
Node为v24.13.1。CLI路径/哈希、相关安装源码片段及生成schema分别保存在本批`host-diagnostic-observation.json`、
`host-source-inspection.json`、`host-schema/`。实际只有8条help查询、1次schema生成和只读版本/日志检查；无运行时RPC或reload。

配置目录可见、独立stdio初始化成功、原游戏任务实际工具就绪是三个层次。生成schema支持
`mcpServerStatus/list`携带`threadId`并返回`runtimeStatus`；正确服务器、目标工具及connected状态仍需在该任务实例中证实，
null只表示unknown。本批没有找到并实际验证该运行时读取通道，不能把协议存在写成实例已连接。

安装源码中目录查询封装未传threadId，UI目录缓存为5分钟；这只是目录层实现观察，不足以解释B12失败。
`config/mcpServer/reload`参数无threadId；[官方接口说明](https://developers.openai.com/codex/app-server#api-overview)
描述的是刷新已加载任务，不能承诺只影响游戏任务，因此未调用。两个相邻桌面日志未找到目标服务器名，
也不能据此断言MCP从未启动。Windows不支持所查询的daemon生命周期命令，未启动替代服务；
随包CLI访问被系统拒绝后未绕过，改查当前实际运行的CLI。B12确切根因仍unknown。

### 正式检查发现及逐项处置

三项均按`contract_misread → actionable → trade_off → noise`逐项判断为`actionable`，没有误读合同、
待用户接受的折衷或噪声项；均已改产物并以实际红绿回执闭合，不靠审查者信心或汇总分数抵消缺陷。

| 发现 | 实际反例及处置 | 修改目标与后续证据 |
| --- | --- | --- |
| F1：开始关停后吞掉父通道丢失 | HTTP关闭中和footer落盘后两例均错误exit0；独立记非预期断连，立即非零，捕获关闭前采用最新异常原因 | run-beta；`check/red-01.json`前两例失败，green及final通过；对应变异杀掉 |
| F2：首个失败原因掩盖输出截断 | 先断连再超限，实际截断却output_complete=true；分离输出失败状态与首因 | beta-process；`check/red-01.json`第三例失败，green及final通过；对应变异杀掉 |
| F3：最后检查之后的输出错误 | Primary提出时序线索，检查者真实fork注入IPC断开阶段stdout错误，原stop错误返回graceful；处理器立即设置非零退出码 | run-beta；`check/red-late-output-01.json`失败，green及final通过；对应变异杀掉 |

实现早期也有明确失败：首轮1项关停用例超时，由控制器强制结束且不报graceful；后来19项中17过2失败，
问题是父断连后实际exit和双流结束均可观察，却没有ChildProcess.close。修为分别等待这些可观察结果。
诊断第一尝试相对require错误，未创建beta；第二尝试成功取到本机反例，不能外推为所有Node版本的普遍行为。

检查者`coverage-01`另有4过1失败，是新增测试误写`AI_EVALUATION_STARTED`，实际事件名为
`SEAT_AI_EVALUATION_STARTED`。只纠正测试夹具，保留精确数量断言，不改权威行为，不算生产缺陷。
两个旧变异字符串因本批入口/退出码改动失配，Primary同步锚点后实际执行；不是把“跑不到”算通过。

### 验证次数、耗时及证据对应

本批原始记录在`artifacts/b13-host-readiness-shutdown-20260831/`；`verification-ledger.json`从已有文件提取，
没有为生成台账再运行产品。共11条显式node:test命令（实现4、检查7），两次诊断脚本尝试、两次Primary整合，
另有三条变异驱动，各含自己的绿色基线和逐项故意失败。不同层次、重叠用例及调度等待不相加为独立覆盖或总开发耗时。

| 回执/阶段 | 实际结果 | 耗时口径 |
| --- | --- | --- |
| implementation red-01 / green-01 | 0过1失败 / 1过 | Node 1775.2391 / 322.1588ms |
| implementation targeted-02 / green-03 | 17过2失败 / 38过 | Node 32165.3478 / 10058.5609ms |
| check baseline / red / green | 38过 / 0过3失败 / 3过 | Node 9880.8122 / 526.9031 / 524.7307ms |
| check red-late-output / green-late-output | 0过1失败 / 1过 | Node 252.9972 / 267.5400ms |
| check coverage / final | 4过1夹具失败 / 46过 | Node 1010.4174 / 10460.5787ms |
| Primary整合R6kXTj / UbUZEc | 各26/26；前者检查前版本，后者最终版本 | 脚本216.0046 / 197.6686ms |
| Primary shutdown / entry-copy / receipt-entry变异 | 6 / 1 / 2条全部杀掉，0存活/未评估 | 驱动57674.4792 / 18192.4477 / 14336.6678ms |

最终测试命令为`H:/NODE/node.exe --test --test-concurrency=1 test/beta-shutdown.test.cjs test/beta-ai-receipts.test.cjs test/beta-entry.test.cjs test/error-code-registry.test.cjs`。
46项无失败、取消、跳过，也没有筛掉默认端口用例；红测等名称筛选轮的skipped=0不代表未选用例执行过。
检查者四份CJS语法检查报告exit0；lint/typecheck未配置，不写成pass。

Primary最终整合是真实本地HTTP、两席授权、一个真人来源、一次脚本AI开始/公开终态，再重复stop并核对
唯一footer、唯一关闭回执、同一run_ref、非空捕获、去敏哨兵及双流/exit。自身子进程41936实际exit0、
57280端口关闭，非强制结束；尚未Ready开手，手数0。197.6686ms不是模型推理速度，更不是扑克可玩性。

Primary在370文件哈希绑定的隔离副本内执行9条变异，全部杀掉，副本逐项恢复一致。
全仓591条锚点/测试文件只做静态可达性核对；没有执行591条全量门禁。未重跑全量测试、浏览器、
四人13手、真实PTY Ctrl+C、真人45分钟、Claude或原任务MCP。旧PTY失败不因新的IPC路径通过而消失。

### Primary终审、身份与反事实

本次终审为`ai_generated`、`same_session_self`，在实现/检查完成后单独检查最终差异、运行入口、测试与原始回执，
并以最终代码整合和实际变异补强。检查包摘要为`c54914e69fb09dccd34a4586987c6e14298448cf94c83ab7769fda806f1a94f3`；
八份初始文件和规定规范化算法均由检查者复算匹配，见`check-input-algorithm.md`及`check/final-identity.json`。
检查上下文未收到实现者对话/自评；实际provider/model/effort仍unknown，没有模型覆盖，不宣称异模型或外部人工独立性。
F3保留Primary线索来源。检查者只报告缺陷和局部验证，最终范围/路线裁决仍由Primary负责。

方向反查：这一步对应B12暴露的明确关停缺陷，属于可逆本地运行修复，而非把偏好的IPC方案升级成产品硬约束。
不会继续堆关停测试来回避真正的宿主就绪缺口，也不会把新schema、脚本AI或历史CLI证据当成当前Desktop主动AI。
没有新的L0–L2变更、高风险部署或跨域架构锁定；无需再采购同边界外部审查，理由为`already_reviewed_same_boundary`。

可改变本批准的证据：在本批最终字节和约定Node环境上，真实父子进程仍能在截断、晚到I/O错误或意外断连后报告正常退出，
或正常收尾缺同一run_ref/实际exit/端口释放。此类反例会重新打开本地缺陷；原任务MCP失败则仍属于未验证的宿主缺口，
不能反向证明本地IPC实现错误。未验证项已逐项列上，不以审批备注接受它们为产品已交付。
Primary实际读取了红绿原始回执、最终代码身份、整合结果及九条变异日志；四次语法命令只依赖检查者落盘回执，
没有另行运行。模型身份、宿主实际runtimeStatus及载体重启原因不依赖AI自述补全，保持unknown。

### 载体中断、资源及最终索引

两次实现上下文变为pending_init，期间CLI进程身份/REPL状态变化，记录在`carrier-interruption.md`。
第一次核对后尚无实现；第二次已有38项通过及文件修改，停止重复实现，直接将现存产物交正式检查。
原因unknown，不归因Dual、模型或产品代码，不把中断时间算测试耗时。检查输入摘要曾因规范化口径产生疑问，
明确算法后复算一致，未改冻结输入清单，也未重跑一轮审查冒充新的独立证据。

08:26匹配旧游戏MCP的时点快照为空；09:23旧beta16608仍在、默认7802无监听、父目录临时MCP配置不存在，
B12失效私有文件仍在。旧beta未终止/重启，失效文件未换方式绕过策略删除；不把时点观察提升为永久清理保证。
B13受控测试只处理自身子进程；最终整合端口关闭另有直接回执。未新增游戏任务、原任务消息、queue、
MCP配置、reload或宿主重启；未暂存、提交、推送、部署或归档。

最终7份源码/测试/变异集合摘要为`8dfd0ef67c3a6af9306640b794ad2b9d02bfdb77e1df209aaf1c83f54e323a4e`，
对应`final-source-identity.json`，已核对检查者冻结文件、最终测试、整合与变异副本的相应字节。
本批49份证据集合摘要为`b0d7ff863bffb0e3a55ce008451eb561b71189f9baad94e087db359836fcc745`，
对应`evidence-identities.json`。算法是按项目相对路径排序，拼接`path + NUL + 文件SHA256十六进制文本 + LF`再SHA256；
不自引用，不含随后治理语言/最终范围核验，副本由独立文件清单和还原结果绑定，不重复加入370份文件。
B9–B12五组共163份冻结证据及清单摘要逐项一致，见`frozen-evidence-check.json`；不声称B11旧源码仍与B13相同。

操作契约写入质量规范和`docs/AI-LIFECYCLE-RECEIPTS.md`，输入就绪边界写入宿主清单；STATUS、计划树、进度和交接同步。
最后文档字节语言检查与工作区范围核验分别落`governance-language.json`和`final-integrity.json`，不覆盖此前证据。
原始证据被Git忽略，不是已提交产物。下一步先另获有界接入授权；全局reload/宿主重启等影响其他任务的动作单独确认。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-BETA-SHUTDOWN-20260831-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE/local-shutdown-readiness-20260831
    exact_outcome: 本地受控beta关停与失败诚实报告，以及宿主就绪证据的分层记录
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    implementation_identity:
      kind: file_set_digest
      scope: final-source-identity.json列出的7份源码测试与变异文件
      identity: sha256:8dfd0ef67c3a6af9306640b794ad2b9d02bfdb77e1df209aaf1c83f54e323a4e
      status: current
    verification_identities:
      - evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/evidence-identities.json中的49文件集合
        identity: sha256:b0d7ff863bffb0e3a55ce008451eb561b71189f9baad94e087db359836fcc745
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    derivation_ref: artifacts/b13-host-readiness-shutdown-20260831/qa-plan.md中的五项判据，按独立失败条件拆分如下
    obligations:
      - {obligation_id: B13-R1, claim_or_predicate: 配置与stdio和原任务运行时就绪分层且未知不写通过, required: yes, real_condition: 本机安装代码与CLI生成schema及官方接口说明}
      - {obligation_id: B13-R2, claim_or_predicate: 真实IPC关停幂等且唯一尾行关闭回执实际退出和端口释放同属本运行, required: yes, real_condition: 真正Node fork与非空HTTP脚本AI捕获}
      - {obligation_id: B13-R3, claim_or_predicate: 默认不建捕获且非法IPC不触发关停, required: yes, real_condition: 默认子进程与十类非法消息}
      - {obligation_id: B13-R4, claim_or_predicate: 父断连超时与写入关闭失败不能报告正常退出, required: yes, real_condition: 启动期和关停期断连及真实文件I/O故障}
      - {obligation_id: B13-R5, claim_or_predicate: 双流callback和drain均等待且截断或晚到输出错误不假绿, required: yes, real_condition: 逐流先后反例与先断连后超限及IPC断开阶段输出错误}
      - {obligation_id: B13-R6, claim_or_predicate: 相邻测试和受影响变异实际执行且失败与耗时分别保留, required: yes, real_condition: 四文件46测试和隔离副本9变异及逐次台账}
      - {obligation_id: B13-R7, claim_or_predicate: 仅本地已授权修改并保留既有证据和未验证宿主边界, required: yes, real_condition: 基线及冻结证据字节核对和当前恢复记录}
    selected_surfaces: [static, integration, focused_probe, inspection]
    observations:
      - {obligation_id: B13-R1, evidence_type: inspection, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/host-source-inspection.json, result: pass, caveat: 同目录生成schema及host-diagnostic-observation记录；原任务真实runtimeStatus未读取}
      - {obligation_id: B13-R2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/primary-integration-UbUZEc/result.json, result: pass, caveat: 脚本AI且未开手，不是真实模型或PTY}
      - {obligation_id: B13-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/check/final-01.json, result: pass}
      - {obligation_id: B13-R4, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/check/final-01.json, result: pass, caveat: footer后失败不重写已有文件，进程仍必须非零}
      - {obligation_id: B13-R5, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/primary-verification-iH81x6/shutdown-mutations.log, result: pass, caveat: 同版本final-01另有正常和逐流反例}
      - {obligation_id: B13-R6, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/verification-ledger.json, result: pass, caveat: 台账指向11次原始测试及三条变异驱动，不等于全量重跑}
      - {obligation_id: B13-R7, evidence_type: inspection, correspondence: direct, evidence_pointer: artifacts/b13-host-readiness-shutdown-20260831/final-integrity.json, result: pass, caveat: 冻结历史证据另见frozen-evidence-check；不读失效私有文件内容}
    skipped:
      - {check: 原任务MCP实际接入和新的真实模型或queue, reason: B12窗口已停止，无新实机授权}
      - {check: Windows PTY Ctrl+C, reason: 本批选择可核对的父子IPC路径，不追认B12终端收尾}
      - {check: 全量测试与591变异及浏览器或13手, reason: 无规则UI变更，实跑定向和相邻失败边界}
      - {check: Claude与真人45分钟和异地部署, reason: 未进入相应验收或发布范围}
      - {check: lint和typecheck, reason: 项目未配置}
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits: [只关闭本地关停与证据分层切片, 原任务MCP仍未验证, 不追认B12的PTY清理, 无新真实模型或时延证据, CodexGate5仍blocked, Claude仍not_run, 不关闭主动AI父节点]
  remaining_non_blocking: [原始证据被Git忽略, manual_closeout保留未提交修改, 已撤销私有文件不绕过工具删除策略]
  next_owner: user_bounded_native_readiness_authorization_then_codex_primary
```

<a id="b14-native-readiness-permission-boundary"></a>
## B14：持续测试授权后的具体AI权限门（2026-08-31）

本条是停止与事实记录，不是新的产品通过裁决。用户原话“允许长期测试”已记录为DEC-20260831-002，
Primary采用最多12次原任务输入、其中最多4次queue的有限批次；这些是上限，不是必须使用的配额。
没有创建新的goal、定时任务或常驻模型循环，没有新增产品语义、模型配置、API或部署。

### 实际过程与结果

- 开始冻结370份非忽略文件、80项既有脏路径、空暂存，B13七份最终源码身份匹配。具体清单见本批baseline.json。
- 只读原任务「TokenGame 临时单席接入验证」一次，状态notLoaded；未发送新输入，不能据此认定新MCP会加载成功。
- 使用B13的真实父子IPC支持，启动本批beta8200和控制器29452，地址127.0.0.1:61334。A建房并确认落座，B填加入信息后停在公开范围确认；0次Ready、0手、0条真人聊天来源。
- 准备勾选AI权限与下载连接文件时，工具明确要求用户另行确认权限对象、底牌/聊天数据范围和公开发言影响。后续只读DOM确认A未勾选、尚未绑定、下载禁用；B仍未确认落座。下载事件及等待对象未创建，私有目录为空，没有连接文件或MCP配置。
- 已单独询问：允许该原任务AI读取本席合成底牌及公共聊天、以该席AI身份公开发言并下载仅存本机的连接凭据，不含下注权限，每批结束撤销。截止收尾尚未获答；没有通过终端、HTTP、其他浏览器或其他下载方法重试被拒动作。
- 本批实际原任务输入0、queue0、游戏MCP调用0、真实AI评估0；Node测试命令和变异重跑均0。UI仅完成上述建房/加入准备，不声称通过双席牌局、真实接入或主动AI验收。

### 收尾、证据与耗时边界

两页已关闭，beta和控制器经parent_request正常退出0、非强制、输出完整；61334监听及两PID均为空。
捕获只有header/footer，observed_events=2、ignored_events=2、accepted_events=0，与stderr中唯一关闭回执同run_ref。
write_acknowledged、close_succeeded、capture_complete和run_complete均为true；这只证明本次空AI样本的本地收尾。
从09:26:28.183Z启动到09:36:11.860Z停止，服务驻留583.677秒，包含设置、工具限制处理和等待，不能当成测试执行时间或模型时延。

仅删除本批明确创建且已检查为空的私有目录。没有需要撤销的新AI凭据；临时MCP配置未创建。
B12已撤销私有文件仍存在，未读取其内容或绕过删除策略；本批启动前旧beta16608未观察到，消失原因unknown，不声称本批将其清理。

原始记录位于`artifacts/b14-native-readiness-20260831/`，被Git忽略：
baseline.json与qa-plan.md记录输入和判据；boundary-observation.json保存去敏DOM和实际动作台账；
beta-start/stop.json、beta-stdout/stderr.log及ai-lifecycle.jsonl保存原始运行回执；cleanup-observation-v2.json为有效收尾提取。
源码/工作区最终核验另见final-integrity.json，最终治理文档字节校验见governance-language.json；不重写B9–B13冻结产物。

### 工具与记录问题，独立列出

- 首次精确文本选择器未匹配带状态的连接摘要，读取可见DOM后点击实际节点成功。这是选择器错误，不是产品错误。
- Page.setDownloadBehavior不在当前受支持的原始CDP方法中；工具要求使用下载事件等待。没有尝试其他CDP方法绕过。
- 具体权限拒绝属于测试操作授权门，不是MCP、模型推理或扑克机制失败，也不直接归因Dual。
- 初次离线收尾提取只读stdout，漏掉实际位于stderr的关闭回执，形成cleanup-observation.json中的0计数。随后从同一原始日志读取两流，生成v2并明确替代旧提取；未重跑服务，旧提取保留，不将其误报为产品关停失败。

### 当前恢复边界

持续测试授权有效，具体逐席AI权限待用户确认；确认后另开有限资源批次，先核对原任务真实工具，再验证事件与终态。
B14原生接入与主动AI判据均not_run，Codex Gate5累计仍blocked、Claude仍not_run；不关闭主动AI父节点或完整MVP。
产品源码没有修改，保留既有工作区；manual_closeout下未暂存、提交、推送或部署。

<a id="b14-native-public-replies"></a>
## B14授权后：真实单席queue公开与延迟显示修复（2026-08-31，清理未完全闭合）

本条为当前唯一裁决。Codex Gate5在固定版本、单席、单次queue探针范围内有直接通过证据；
Gate9仍因资源清理被工具策略拒绝而blocked，不能据此作架构/产品完成裁决。
本地延迟映射修补通过独立检查与主线程页面回归，但不关闭`TG-EU-PROACTIVE-WAKE-SPIKE`父节点，
不翻转默认`proactive_wake`声明。Claude仍not_run，未获得真人试玩签字。

### 授权到执行：不是重复使用旧窗口

1. 用户“允许”确认DEC-20260831-003指定的本席合成底牌/公共聊天、AI公开发言与本机凭据；不授予下注、Ready或主动亮牌权。与DEC-20260831-002持续授权共同约束本批，最多12次原任务输入、其中4次queue；上限不是必须用满的配额。
2. 冻结`main@bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`、370份非忽略文件、80项既有脏路径及空暂存；独立启动回环beta。仅原任务cwd有单一临时MCP配置，经UI授权并下载本席连接文件，凭据不进入报告、对话或Git。
3. 复用原任务「TokenGame 临时单席接入验证」（`01a052c9-5259-7a61-b26f-35731734994e`）。一次原生只读准备实际发现并成功调用`mcp__tokengame_b14_authorized__tokengame_table`，不能与此前独立stdio准备或目录可见混为一谈。没有全局reload或宿主重启；这不确定B12当时失败的根因。
4. B通过正常页面发送不同的公开来源。每条来源各由一次性桥领取并queue到同一原任务；来源后A没有补提示或新点击。原任务可见工具输入/输出与权威事件分别记录，三条链各观察到一次start、一次resolve和一次成功公开。
5. 第1例首个页面采样太迟，错过10秒气泡寿命但两页历史仍在；保持原来源不重发，增加另一个等待区来源并提前采样，再进入真实时钟的第1手。这个采样调整已在下一来源前记录到qa-plan，不修改气泡寿命、模型或行动时间。
6. 牌内样本成功后停止新增原任务输入，撤销权限、移除本批临时配置，关停beta与页面；随后只做本地映射修复与脚本UI回归，没有追加真实模型、MCP或queue。

本机进程路径对应Desktop包`26.825.6671.0`，实际`codex.exe --version`输出`0.151.0-alpha.7.2`。
原任务本地turn_context记录`gpt-5.6-sol / max`，未覆盖模型或强度；这不是上游供应商/代理路由的密码学证明。
来源及工具原始记录来自同一原任务rollout的可见用户控制项与工具输入/输出，不复制隐藏推理或其他任务。
`read_thread`新回合的items仍为空，不能将API空白当作没有执行。

### 实際次数、时序与可见结果

原任务输入共4次：准备1次、queue3次；原任务游戏MCP共7次：投影1次、start3次、resolve3次。
不是3手牌、3个真实AI席位或7次模型评估。三次真实评估均公开，silent/丢弃各0，未观察到重复终态。

| 样本 | 来源→start→公开序号 | 当时范围 | 来源→start | start→公开 | 来源→公开 | 原生整轮耗时 |
|---|---|---|---:|---:|---:|---:|
| queue_01 | 5→6→7 | 等待区，hand 0 | 27,599ms | 16,258ms | 43,857ms | 45,561ms |
| queue_02 | 8→9→10 | 等待区，hand 0 | 24,061ms | 22,724ms | 46,785ms | 50,070ms |
| queue_03 | 12→13→15 | 第1手，preflop→flop | 27,405ms | 16,255ms | 43,660ms | 44,381ms |

准备整轮51,321ms。以上源事件/start/公开取自同一权威时钟；整轮取自宿主回执，起止不一样，不相减冒充纯推理。
桥自己的执行/关停用时分别30,475/589/5,091ms，包含等待来源和本地回收，不等于宿主回合完成。
桥侧另有115/3/20次时间线读取、各1次claim及1次queue尝试；两次独立stdio读（准备/撤销）各不发起模型评估。
不将这些读取量合并为真实模型次数或测试覆盖率。

queue_01只采到历史；queue_02/03分别在权威公开后263/445ms的首次采样中看到两页同文AI气泡，
这是采样上界，不是精确绘制时间。第3例自身快照有2张本席底牌、他席未公开底牌非空数0，证据不保存牌值。
当时跨街合法发布，`poker_action_effect:null`；后续无人操作的正常超时曾推进到第4手，不计额外验证样本。
没有暂停或延长扑克时钟。43.7–46.8秒源事件到公开不能证明适合实时桌聊，更不是性能SLA或长期稳定性。

### 实机发现与局部修复

第3例权威返回`late_annotation:"延迟 · 基于前一街"`及`based_on_street:"preflop"`，
但旧mapper读取不存在的`p.late`，座位气泡与时间线都没有迟到文字。这是已确认公开交流第5条的实现缺陷，
不是另设计迟到规则。旧纯映射测试手造`late:true`，所以14/14曾绿而真实producer路径仍错。

`b14_late_marker`仅修改`src/host/table-view-model.cjs`的一条映射及注释，
使用非空字符串`late_annotation`转换为既有视图布尔；不比较当前街道，不改权威、UI协议或时钟。
纠正`test/seat-speech-projection.test.cjs`假输入，新增真实CommandSurface/SeatAiStore→timeline→view集成及恢复旧mapper的窄变异。
两查看者、跨两种街道、正常/畸形标注、本地隐藏/恢复、发布后TTL边界、跨手丢弃与不操作筹码均有具体断言。

| 本地运行 | 实际结果 | Node测试耗时 | 含子进程启动总耗时 |
|---|---|---:|---:|
| 旧人工夹具基线 | 14/14，不能代表真实producer兼容 | 100.4577ms | 184.1399ms |
| 新测试、旧映射 | 20项中15通过/5失败，具体late断言失败 | 280.5823ms | 378.2411ms |
| 同字节测试、修复映射 | 20/20 | 319.7016ms | 418.3911ms |
| 窄变异 | 1 KILLED，0存活/未评估，mapper已恢复 | 不单列 | 674.7724ms |
| 恢复后相邻四文件 | 45/45 | 884.4971ms | 978.6957ms |
| 实现静态检查 | 3个CJS语法、JSON及受限tracked diff检查通过 | 不适用 | 397.0264ms |

4条显式node:test命令和1次变异驱动分开计账，不把14+20+20+45相加为独立覆盖。
测试cancelled/skipped/todo均0；没有本批全量npm test/gate，lint/typecheck未配置。
实现日志保留argv、两流、退出码、时钟和文件SHA；变异驱动内部测试不伪装成独立外层命令。

### 独立检查与主线程正式复核

`b14_late_check`在隔离上下文读取冻结包、源码、规格和原始回执，未读实现者总结。
包摘要`0e5419553c318bfd8b20db4b32abccffab6d71a91d2a435a428d5c3362fbb4b4`及四文件身份均对应；
其`audit-readonly.cjs`实际退出0，3项语法、JSON、限定diff和原始证据字节核对通过，未重复执行测试/变异。
无新增finding，无源码修补；只说明隔离上下文，provider/model为unknown，不称异模型外部审计。

主线程随后直接复核四文件diff/新测试、独立报告、原生因果链及当前合同，正式判断如下：
字段错读已修；新增测试从真实producer到两种视图，不靠手造正确payload；归属、隐藏、TTL和扑克时钟未改变。
七份现行语义合同的verify-log各实际退出0，绑定仍唯一且digest不变。
本地bug修复通过，不据此抹掉原生样本当时漏标、未知载体问题或Gate9阻塞。

主线程在修复与变异恢复后另起脚本UI，两页经正常建房/确认/Ready/合法扑克动作推进，
14项可见行为检查全通过：两端两区域迟到标记、隐藏/恢复、正常不误标、文字隔离、静默额度、
诊断状态、TTL及桌面几何等。两页各查询最后50条error/warn均为空，两张A截图已实际查看。
仅1280×720，窄屏not_run；故障状态为诊断注入，不是真实断网。脚本共4次评估、2次公开/2次silent，原生模型调用0。
两批源码身份不同，脚本UI不倒算旧原生渲染。首次UI夹具缺DueWork导致未开手，已保留失败边界并受控关闭；
修正后的run-02独立执行，驻留897.050秒包含操作/取证，不是测试CPU或模型耗时。

### 分项收尾与不能掩盖的阻塞

- 原生批次AI权限已撤销，独立MCP旧连接返回`model_command_token_rejected`；该回执没有HTTP码，不写403。
- 临时配置按身份核对后移除、两页关闭。beta37068和控制器31624经IPC正常退出0、非强制、输出完整，52231无监听。
- `run_ref:b3621f0ab5bff24f62c6a8fe86c19c57`的18条采纳事件、20条捕获记录/10,242字节、footer与唯一stderr关闭回执对应；write/close/capture/run四项为true。36分37.598秒服务驻留不是45分钟真人UAT，也不包括所有后续审查耗时。
- 本批`H:/tokengold/.codex/tokengame-b14-authorized-private-3914f461/a.json`已失效但未删除；宿主管理MCP PID35872未由root终止。精确检查后的清理命令在CreateProcess前被工具策略拒绝，没有实际删除/停止；未换Node、其他工具或路径绕过。19:28:38+08只读快照仍见同创建时间/父PID的MCP及失效文件，配置已不存在；时点身份不永久沿用。
- B12失效私有文件未读/未动；旧beta16608在本批开始前已未观察到，原因unknown，不声称本轮关闭。
- 本地修复UI两轮均独立受控关闭，run-02退出0、61392无监听、drive_errors空。这不解决前批宿主管理MCP的策略阻塞。

因此Gate9为blocked，`advance_allowed:no`仅指产品/架构完成推进；同范围本地开发仍获授权。
不得反复杀宿主子进程、重启整个Codex或无界重复生成；下一真实批次须有新判据与可说明的回收方案。

### 载体和采集问题单列

原生read_thread的空items由同一任务本地可见工具记录补证，不猜空白原因；版本/模型身份不从CLI存在推导。
Node REPL不支持本地CJS动态import、首例错过气泡采样、夹具缺DueWork、手动drive与host自动驱动相撞、
选择器误匹配两个code元素，均保留对应记录，不混为扑克、模型或Dual失败。手动drive未被当作额外评估。
清理命令策略拒绝属于操作边界，不以“权限已撤销”替代文件/进程清理完成。

### 文件身份与恢复

原生36文件运行清单`native-runtime-source-identity.json`来自启动前基线，集合摘要
`a9d1b8ab5af1cc39d1faa1f26be8885fab45e611fad6bdf0866009c9eaf71cd2`，算法为该有序files数组的JSON字节SHA256。
其中旧mapper为`dbd1c4e0f02eb4edda903dbf73671e2c8439f4ebd80c0d03b93c21bf299782ff`，
最终mapper为`8f8b8891e3aeff15b49ca0339d477158122e5e7ce043211fa49c40c632487ca5`；不改写原始运行身份。

其余集合均用排序后的相对路径`path + NUL + 文件SHA256十六进制 + LF`的UTF-8拼接再SHA256：

- 最终修复4文件：`9853fb2e953fe28bc03b4574a89592ef575f9ce8941fba40c2e92a2dab3bd4b9`，见`artifacts/b14-late-marker-fix-20260831/final-source-identity.json`。
- 授权后实机58份证据：`46d4255eb2b8e4380f793693a96752d4105edf8471a19aa5cf69ae0b51e53d4f`，见`artifacts/b14-native-readiness-authorized-20260831/evidence-identities.json`。
- 实现/独立检查/脚本UI共51份证据：`b2a0659fa2606c2dc2e420f7f13576bf390d683d7db36bf776371fe183284e2b`，见`artifacts/b14-late-marker-fix-20260831/evidence-identities.json`。
- 最小可Git复核事实包8文件（含其manifest）：`10d22f4459df7c9fbce3993233bd45b90bbf4267fc0df375ac8ff55d93634a58`，目录`evidence/probes/b14-codex-queue-native-20260831/`；包内manifest分别列其余7文件。不是`evidence/accepted`、未提交，不是平台签名或防篡改证明。

以上文件数不是测试数。集合不自引用；最后治理语言回执与范围核验另存原生目录`governance-language.json`及`final-integrity.json`，不回写冻结清单。
恢复点、README、宿主清单、STATUS和决策执行回执统一指回本条；历史第3手/第13手和未跑/已跑仍按原版本区分。
当前manual_closeout，不暂存/提交/推送/部署/归档，也不修改框架profile或冻结B6观察报告。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B14-NATIVE-PUBLIC-20260831-A
  detail_level: evidence_slice
  scope:
    scope_id: TG-EU-PROACTIVE-WAKE-SPIKE/native-public-and-late-projection-20260831
    exact_outcome: 三个来源各一次原任务真实公开的有界验证、跨街显示修复与分项收尾
    owner_ref: PROJECT-PLAN-TREE.md#TG-EU-PROACTIVE-WAKE-SPIKE
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    implementation_identity:
      kind: file_set_digest
      scope: 最终映射与三份回归规格，共四文件；原生运行前身份另在正文分项记录
      identity: sha256:9853fb2e953fe28bc03b4574a89592ef575f9ce8941fba40c2e92a2dab3bd4b9
      status: current
    verification_identities:
      - {evidence_pointer: artifacts/b14-native-readiness-authorized-20260831/evidence-identities.json, identity: 'sha256:46d4255eb2b8e4380f793693a96752d4105edf8471a19aa5cf69ae0b51e53d4f', status: current}
      - {evidence_pointer: artifacts/b14-late-marker-fix-20260831/evidence-identities.json, identity: 'sha256:b2a0659fa2606c2dc2e420f7f13576bf390d683d7db36bf776371fe183284e2b', status: current}
    freshness: current
  acceptance:
    derivation_timing: before_corresponding_probe_or_implementation
    derivation_ref: 原生qa-plan与修复派发包及browser/qa-plan分别在相应执行前记录，采样调整在下一来源前记录
    obligations:
      - {obligation_id: B14-R1, claim_or_predicate: 明确本席授权后原任务实际调用MCP成功, required: yes, real_condition: 原任务可见工具输出，不靠独立stdio替代}
      - {obligation_id: B14-R2, claim_or_predicate: 同来源无新A提示或点击且恰好一次已观察评估及合法公开, required: yes, real_condition: 不同来源各一条queue与原生工具权威及公开UI互证}
      - {obligation_id: B14-R3, claim_or_predicate: 同手跨街权威标注正确传到两端两区域且其他规则不改, required: yes, real_condition: 旧代码先红、新代码同字节绿与独立检查及脚本双页}
      - {obligation_id: B14-R4, claim_or_predicate: 次数耗时身份及未验证范围如实分开, required: yes, real_condition: 原生和脚本各自台账与冻结字节}
      - {obligation_id: B14-R5, claim_or_predicate: 撤销配置文件进程捕获及退出逐项完成, required: yes, real_condition: 同运行直接回执，不以撤销或端口消失替代全部清理}
    observations:
      - {obligation_id: B14-R1, evidence_type: executed, correspondence: direct, evidence_pointer: evidence/probes/b14-codex-queue-native-20260831/native-tools.json, result: pass}
      - {obligation_id: B14-R2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b14-native-readiness-authorized-20260831/native-observations.json, result: pass, caveat: 2例等待区1例牌内，非连续产品或重复重连故障矩阵}
      - {obligation_id: B14-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b14-late-marker-fix-20260831/evidence-identities.json, result: pass, caveat: 修复后的UI为脚本及注入时钟，不倒算原生漏标}
      - {obligation_id: B14-R4, evidence_type: inspection, correspondence: direct, evidence_pointer: 本条时序表及三组冻结清单与七合同回执, result: pass}
      - {obligation_id: B14-R5, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b14-native-readiness-authorized-20260831/cleanup-policy-blocked.json, result: blocked, caveat: 失效私有文件及宿主管理MCP尚未清理，不重试被拒动作}
    skipped:
      - {check: Claude及第二真实AI席位与完整插件入口和内嵌UI, reason: 本批限定原任务单席，不将其他路径推断为通过}
      - {check: 连续原生故障矩阵与实时SLA或异地及四真人45分钟, reason: 未进入产品或真人验收}
      - {check: 全量npm及全变异和四人13手, reason: 只修一个映射，采用真实producer与相邻测试和页面回归}
      - {check: 窄屏及lint或typecheck, reason: 本批无尺寸调整，项目未配置lint或typecheck}
    result: blocked
  semantic_delta: l3_l4_within_scope
  state: blocked
  advance_allowed: no
  claim_limits: [CodexGate5仅固定版本单席探针pass, Gate9blocked不作架构产品完成裁决, 局部显示修复通过, Claude未跑, 不改主动能力声明, 不关闭父节点]
  remaining_non_blocking: [同范围本地开发仍获授权, manual_closeout保留未提交改动, 原始大体积证据在忽略目录]
  next_owner: codex_primary_local_wake_productization_with_cleanup_block_preserved
```

<a id="b15-managed-wake-session"></a>
## B15：有界通知API与单一协调器连接（2026-08-31，本地验证通过）

本批只沿既有路线开发本地连接，不改L0–L2、扑克规则、模型与推理强度。目标是让原协调器在本人明确授权的有限窗口内，逐个发送本席待办并等待真实权威回执；不是新的模型后端、常驻第二协调器或游戏入口完成声明。设计与验收矩阵在`.trellis/tasks/08-26-public-ai-table-talk/research/b15-managed-wake-session-20260831.md`，实际API与配置说明在`docs/MANAGED-WAKE-SESSION.md`。

### 实际改动与边界

- `TableWebHost`注入默认关闭的发送器并提供真人`start/status/stop`；本人席位绑定、显式窗口确认、固定游戏任务三项分别检查。默认最多4次/10分钟，空待办不启动模型，未增加模型工具或启停UI。
- 模型面仅保留有界intent→turn阶段回执；queue ACK不等于AI完成。公开/silent/合法丢弃须有精确resolve才允许下一条；未知、失败与超时均停止，不补写silent。跨窗口未决不能靠新键/新任务绕过；任务在本协调器内不跨席复用。
- 独立发送器与旧B10探针共用原有无shell/有界进程边界，只发固定说明和编号，不附牌面、聊天、凭据或模型覆盖。HTTP取消覆盖响应体，停止/OFF/离桌/撤权/关停接入原有权限围栏，只收尾自己创建的进程。
- 主线程整合使用真实Node beta、两真人HTTP、两逐席MCP进程和两个明确替代Codex的脚本queue接收进程；开手后依次公开和沉默，核对单槽、来源关联、底牌隔离及撤销。其模型结果由脚本提交，不能算真实生成或浏览器验收。
- B12/B14失效私有文件与宿主管理MCP不动；此前清理策略阻塞仍存在。新原生任务输入、真实queue和真实模型调用均为0。没有提交、部署、归档或后台自动化。

### 当前已执行的验证

原始日志位于`artifacts/b15-managed-wake-session-20260831/`。下表是分批执行，不相加为独立覆盖量；早期失败保留。

| 检查 | 实际结果 | Node报告耗时 | 原始输出 |
| --- | --- | --- | --- |
| 传输、旧探针、HTTP取消首轮 | 156/156 | 2544.3229ms | `primary-transport-01.log` |
| 架构/错误注册表修复前 | 57通过、2失败 | 435.7809ms | `primary-contract-pre-01.log` |
| 固定任务保护加入后的传输 | 159/159 | 2363.0737ms | `primary-transport-02.log` |
| 生命周期与真人控制 | 51/51 | 1302.776ms | `worker-targeted-02.log` |
| beta/MCP双轮整合、合同及错误注册 | 64/64 | 2777.8826ms | `primary-integration-01.log` |
| 检查前全量Node | 1234/1234，0失败/跳过/取消 | 79388.8198ms | `primary-full-01.log` |
| 独立检查定向基线 | 96/96 | 2552.595ms | `check/baseline-targeted-01.log` |
| 新边界反例首轮 | 3失败、1正向通过，exit 1 | 175.6006ms | `check/regression-red-01.log` |
| 一轮修补后六组复验 | 100/100，0失败/跳过/取消 | 2689.0212ms | `check/regression-green-01.log` |
| 独立修补后全量 | 1238/1238，0失败/跳过/取消 | 68973.9729ms | `primary-full-02.log` |
| 主线程新增取消竞态回归 | 36/36 | 480.9374ms | `primary-sender-race-01.log` |
| 最终全量Node | 1239/1239，0失败/跳过/取消，exit 0 | 69362.1688ms | `primary-full-03.log`、`primary-full-03-result.json` |

早期两项合同失败分别是新增专有import不符合旧架构白名单、取消错误码尚未登记。只加入两个精确import许可，未豁免整文件；新的错误工厂和动态拒绝/超时实际进入扫描，未知接收明确不可重试。生命周期夹具早期失败另在`worker-session-*.log`和`worker-targeted-01.log`保留，最终51项不是对它们补写的成绩。

### 独立发现、补测与实际变异

独立上下文的`trellis-check`检查者给出本地`APPROVE_WITH_NOTES`，原报告保存在`check/review.md`。没有核验检查者底层模型/提供方，不称不同模型外审；第二项候选由主线程提供、检查者独立复现。两项P2在一次有界生产修补中处理：

1. 旧窗口清理/未决检查只看当前绑定世代；受信本机代码重建管理器并换绑定与目标后可绕过同席旧事实。现跨绑定保留`wake_cleanup_failed`和`wake_result_pending`。当前beta原本固定目标，不能据此称外部已能越权。另有正向回归：旧结果与清理确已确认仍可本人重开。
2. 意图预留后、调用发送器前到期，原实现误记一次发送和未知清理。现记录是否真正调用；确定零调用才归零并释放不存在的pending。已预留intent仍去重，权威claim不回滚，后续续领同intent仍拒绝，不自动重投。

检查者冻结后，主线程独占执行三套定向变异。发送器首轮实际有1项存活：旧测试在close后立即abort，未覆盖queue的race已完成而发送器await尚未恢复的时隙。新增一条确定性微任务回归；生产发送器未改，原有await后撤权检查确有必要。复跑中，删掉该检查会使这条新增测试明确失败；没有删变异或把存活改写成排除。

| 实际变异轮次 | 结果 | 整轮耗时 | 原始回执 |
| --- | --- | --- | --- |
| 发送器首轮 | 5项：4杀掉、1存活、0未评估，exit 1 | 4186.9957ms | `mutation-sender-01.json` |
| 补测后发送器 | 5/5杀掉，0存活/未评估，exit 0 | 3951.7749ms | `mutation-sender-02.json` |
| B10共享探针 | 8/8杀掉，0存活/未评估，exit 0 | 19330.9469ms | `mutation-probe-01.json` |
| 窗口/回执管理 | 18/18杀掉，0存活/未评估，exit 0 | 11002.3249ms | `mutation-session-01.json` |

最终是31个不同变异全部被识别，不把发送器两轮相加成36个覆盖点；每轮都核对源码前后哈希相同。第一轮工具调用曾被中断，但JSON实际完整、测试进程已退出，主线程核对后接续；不归为产品失败，也不借中断丢弃存活结果。静态31项锚点和检查者18项锚点不计入实际变异次数。未重跑全仓变异门禁。

全部测试日志保留原始失败与重复轮次。三次全量均未过滤默认端口或其他测试；最终多出的1项就是新增取消回归。最终退出0由工具回执直接记录，1239和耗时来自完整日志末段，不由旧记录推断。本批不跑浏览器、四人13手或真实Codex连续窗口；项目没有lint/typecheck命令，不写成这两项通过。本地测试耗时不是模型延迟或真人游玩时长。

### 最终身份与当前裁决

独立输入为`check/input-identity.json`的29文件，集合摘要`4f9cd3b7e1d1b2f5faaba50d5859a9df3a7895427c3672802fa1089915be61fd`；检查者一次修后摘要`e8f7fd9d2c7c672106fa51fc01583c761cc72bfe89f503d1ff7bfe7cc5ee3de2`，4文件改变。主线程补测后的最终摘要为`f3384f12d370fb6d181c0b1637968ce2c622c8bf0176e7c654d7ec825c248aa0`；相对独立修后仅`test/codex-queue-sender.test.cjs`改变，其余28文件逐项匹配。最终全量结束后再次核对一致，清单在`final-source-identity.json`。原检查报告不倒写为已经审过新增测试。

本条只接受B15本地连接与故障围栏的执行证据：脚本替代的AI结果不能证明真实原生模型；源代码检查与测试也不能证明模型已空闲或被撤回。起点HEAD仍为`bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`，既有脏工作树保留，没有暂存/提交/归档/部署。

当前父节点保持开放：缺启停UI与真实连续宿主的观察，B14 Gate9仍blocked，Claude与第二真实席位未跑。当前本地事实不改变默认`proactive_wake_verified: false`，不表示朋友异地可玩或MVP完成。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B15-LOCAL-MANAGED-WAKE-20260831-A
  detail_level: evidence_slice
  scope:
    scope_id: B15-LOCAL-MANAGED-WAKE
    exact_outcome: 原协调器内有界通知API及本地脚本故障边界的可复核验证，不关闭主动产品节点
    owner_ref: REVIEW-LOG.md#b15-managed-wake-session
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - node_id: TG-L2-SESSION-LAUNCH
        contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
        expected_digest: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
        binding_status: verified
      - node_id: TG-L2-PUBLIC-AI-EXCHANGE
        contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
        expected_digest: sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54
        binding_status: verified
    implementation_identity:
      kind: file_set_digest
      scope: artifacts/b15-managed-wake-session-20260831/final-source-identity.json中的29文件
      identity: sha256:f3384f12d370fb6d181c0b1637968ce2c622c8bf0176e7c654d7ec825c248aa0
      status: current
    verification_identities:
      - {evidence_pointer: artifacts/b15-managed-wake-session-20260831/primary-full-03.log, identity: sha256:db00e26eb57fdd0e763955a0a0b68e4b71a294e5bf93490e54355dc0a1102e28, status: current}
      - {evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-sender-02.json, identity: sha256:ac1c7e3aba4d44805c1ea3712085149f9119524f3835e4aa1690e789ffeba08b, status: current}
      - {evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-probe-01.json, identity: sha256:8438cd2014cd4278865e0840d120ad5672c22db309f710717db207c6e556d9e8, status: current}
      - {evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-session-01.json, identity: sha256:9b397e55359c61d698465423865a96678ca0f356dfe586d2382ca8b891a408d1, status: current}
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    selected_surfaces: [integration, focused_probe, inspection]
    obligations:
      - {obligation_id: B15-R1, claim_or_predicate: 本人有界启停与固定任务默认关闭且无跨席权限扩张, required: yes, real_condition: 实际本地HTTP及beta进程拒绝和成功路径}
      - {obligation_id: B15-R2, claim_or_predicate: 实际权威终态才放行后续通知并保留跨窗跨绑定未知围栏, required: yes, real_condition: 真实本地权威与逐席MCP加明确脚本接收端，不要求原生模型}
      - {obligation_id: B15-R3, claim_or_predicate: 关键取消清理去重断言可检测定向破坏, required: yes, real_condition: 31个独占变异实际执行且全部还原}
    observations:
      - {obligation_id: B15-R1, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b15-managed-wake-session-20260831/primary-full-03.log, result: pass}
      - {obligation_id: B15-R2, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b15-managed-wake-session-20260831/primary-full-03.log, result: pass, caveat: 仅脚本终态，本地Node不等于原生模型}
      - {obligation_id: B15-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-sender-02.json, result: pass}
      - {obligation_id: B15-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-probe-01.json, result: pass}
      - {obligation_id: B15-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b15-managed-wake-session-20260831/mutation-session-01.json, result: pass}
    skipped:
      - {check: 启停UI及浏览器和四真人试玩, reason: 本批仅本地开发接口，未改页面}
      - {check: 真实Codex连续调用与Claude和第二真实席, reason: 本批原生调用上限0，不能从脚本通过推断}
      - {check: B12及B14既有宿主资源清理, reason: 已有工具策略阻塞，禁止换方法重试}
      - {check: 全仓变异与lint或typecheck, reason: 采用受影响31项变异；项目未配置两种静态命令}
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: implementing
  claim_limits: [只接受本地连接证据, 不关闭主动AI父节点, 不翻转默认能力, 不证明实时性或真人可玩, B14清理blocked保留]
  remaining_non_blocking: [本地接口验证已完成且保持未提交, 同路线后续启停UI和有界原生验证]
  next_owner: codex_primary_local_wake_controls_UI_with_cleanup_block_preserved
```

<a id="b16-managed-wake-controls"></a>
## B16：本人有界通知控件与本地实页验证（2026-08-31～09-01）

### 范围和当前结论

用户“继续”恢复原私人房路线，本批只把 B15 有界 API 接到原牌桌的本人显式控件，不改扑克规则、AI 权限、公开输入或宿主模型合同。真实模型、原生任务输入和原生 queue 的本批预算及实际执行均为0。B14 的旧权限已撤销，不恢复旧窗口，不绕过 B12/B14 被拒绝的清理。

主线程最终裁决：B16 本地控件及故障边界 `pass_with_notes`，独立复核发现的两项 P2 已修，没有已知未修的本批阻塞。本条不关闭 `TG-EU-PROACTIVE-WAKE-SPIKE`，不把本地脚本代替原生连续运行或朋友试玩。工作合同为任务研究目录的 `b16-managed-wake-controls-20260831.md`。

### 实际实现

- 原“连接我的会话 AI”面板增加独立表单：固定游戏任务 UUID、最多通知次数、最长持续秒数、每窗确认及开启/停止/核对原请求。默认关闭，绑定本身不启动；更改参数取消勾选，运行中不创建第二请求。
- `model-wake-session` 只增加只读实际上限，`TableWebHost` 在既有 `/api/view` 返回当前本席的 `model_wake`，不暴露目标任务、其他席位窗口或凭据。页面不复制服务硬上限，不增加轮询或第二协调器。
- `wake-controls.mjs` 只维护页面请求/展示状态：固定 UUID 和不可变参数；传输未知只允许本人同键核对/重试；表达停止后绝不重放 start。会话、绑定和操作版本隔离旧命令及旧 poll。普通 `table.js` 动态加载该模块，加载失败不阻断打牌、聊天或撤权。
- 接收、权威 resolve 与原生整轮结束分开显示；resolve 包含公开、silent 或合法丢弃。停止只阻止后续通知，不撤回已接收消息；禁止迟到公开仍使用 AI OFF/撤权。原生状态保持 `unknown`，默认能力声明保持 false。
- 使用说明更新到 `docs/MANAGED-WAKE-SESSION.md`；状态规范同步请求键与展示归属，并纠正旧文档“session 只在内存”的描述：现有页面早已使用本标签页 `sessionStorage`，B16 未新增存储。

### 直接验证与证据范围

证据目录统一为 `H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/`，位于项目仓库外。最终汇总为 `final-local-check-summary-02.json`；早期 `local-check-summary.json`、第一份最终汇总及所有原始回执保留。重复轮次不相加为独立覆盖，不覆盖 B15 冻结证据。

| 实际执行 | 结果 | 实测耗时 | 原始记录 |
| --- | --- | --- | --- |
| 实现初版定向 Node | 80/80 | 943.8732ms | `implement-unit-initial.tap` |
| 相邻 Node（最后展示窄修之前） | 141/141 | 4352.6826ms | `implement-adjacent-initial.tap` |
| 展示窄修后定向 Node | 81/81 | 936.1588ms | `implement-unit-display-fix.tap` |
| 正式变异副本的真实基线 | 62/62 | Node 145.5746ms；wall 214.9422ms | `official-mutations-01/baseline.stdout.log` |
| B16 正式定向变异 | 10杀掉、0存活、0未评估，exit0 | wall 3972.2809ms | `implement-official-mutations.json` |
| 独立复核前全量 Node | 1306/1306，失败/跳过/取消均0，子进程exit0 | Node 70269.8942ms；wall 70361.513ms | `full-test.stdout.tap`、`full-test-normalized.json` |
| 主线程 Browser 首轮双页 | 20项检查通过，含正常开手、跟注/过牌到翻牌 | unknown（未记录整轮计时） | `browser-primary.json` |
| 补充 Playwright 第一轮 | 未完成，exit1，不记通过 | unknown | `playwright-01/incomplete-run.json` |
| 补充 Playwright 第二轮 | 自动29/29，但截图发现实际展示缺陷 | 7882.4487ms | `playwright-02/report.json` |
| 修后补充 Playwright 第三轮 | 30/30，意外错误0、exit0 | 7827.3082ms | `playwright-03/report.json` |
| 修后 Browser 新服务刷新 | 5项真实启停/撤销与日志检查通过 | unknown（未记录整轮计时） | `browser-final-refresh.json` |
| 指定游戏客户端键盘 smoke | 1次迭代，exit0，无错误文件，实际进入牌桌 | wall 2794.1104ms | `game-client/state-0.json`、`shot-0.png`；工具回执 `3aaa50` |
| 独立第一项修补后的定向 Node | 85/85，exit0 | 1147.0327ms | `checker-directed-green.json` |
| 启动解耦后的全量 Node（第二项围栏修补前） | 1310/1310，失败/跳过/取消均0，子进程exit0 | Node 68598.3297ms；wall 68675.4112ms | `verification-02/full-test.json` |
| 启动解耦后的 Playwright 第四轮 | 未完成，31项已执行、exit1 | 38974.235ms | `playwright-04/report.json` |
| 修正操作步骤后的 Playwright 第五轮（第二项围栏修补前） | 33/33，意外错误0、exit0 | 9692.6015ms | `playwright-05/report.json` |
| 独立第二项修补后的定向 Node | 89/89，失败/跳过/取消均0，exit0 | Node 5640.5244ms；wall 5968.1425ms | `checker-directed-fence-green.json` |
| 最终全量 Node | 1314/1314，失败/跳过/取消均0，子进程exit0 | Node 69844.1736ms；wall 69924.4733ms | `verification-03/full-test.json` |
| 最终 Playwright 第六轮 | 35/35，意外错误0、exit0，清理全部成功 | 9360.2016ms | `playwright-06/report.json` |
| 最终应用内 Browser 复看 | 原始6 true/1 false；准备按钮断言误词，另行裁决 | unknown（未记录整轮计时） | `browser-after-checker.json`、`browser-after-checker-adjudication.json` |
| 最终指定游戏客户端键盘 smoke | 1次迭代，exit0，无错误文件，实际进入牌桌 | wall 2511.7352ms | `game-client-final/state-0.json`、`shot-0.png`；工具回执 `92b63c` |
| 身份澄清后的独立只读静态核验 | 当前30项SHA匹配、9项语法均exit0；未重跑套件 | wall 671.5921ms | `checker-static-identity-addendum-20260901.json` |

主线程先用应用内 Browser 检查实际入口、确认层、控件和双端气泡。绑定由本地夹具经真实 HTTP 准备，没有重新验证私有文件下载；AI 公开和 silent 由脚本经真实权威提交，不是真实模型。首轮窄屏实际作用于 B 页（390/320px），不能说 A 页也已按该宽度测过；活动窗口的 A 页窄屏由补充 Playwright 实测，均无横向溢出。首张 full-page 截图有拼接重复，DOM 只有一个 form，后续 Browser 截图改用普通视口。

第三轮 Playwright 包含默认关闭、本人隔离、实际降低的上限、显式确认、接收与结清计数分离、忙时聊天、两页公开气泡、达到上限停止、未知请求同键重试、手动停止、AI OFF、解绑和正常第1手。截图已实际打开检查，修后未知状态不再附带上一窗口的“达到次数上限”或2/2计数。游戏客户端 smoke 仅一席、手数0，证明键盘建房/公开确认和文本状态钩子正常，不充当多手扑克验收。

第六轮保留上述链路，并真实拦住可选模块请求：刷新先恢复同席并正常公开聊天；模块迟到成功时 OFF 请求仍在途，通知控件必须保持暂停；后发撤销先完成也不能提前解除 OFF 屏障。两种窄屏分别确认6个必需控件可见、完整且无横向溢出。主线程已查看最终320px、未决OFF及游戏客户端截图；不是只读 JSON 判绿色。两次指定客户端各只有一席、手数0，不扩大其验收范围。

### 失败、修补和载体问题分开记录

1. 主线程代码检查发现，缺失 `reason` 被正则隐式转为字符串可能误过校验；增加明确类型检查及缺字段回归。没有把畸形投影当合法状态。
2. Playwright 第一轮在 `route.abort` 前移除拦截，产生 `Route is already handled!` 并使驱动退出，未形成完整报告。修为 abort 完成、页面到达 unknown 后再移除路由；保留首轮未完成事实，不归为产品失败，也不虚构已执行检查数。
3. 第二轮自动检查全绿，主线程看截图仍发现真实产品问题：新 start 结果未知，却显示上一窗口已停止的原因和计数。只修纯控制器的展示归属，内部历史安全判断和停止目标不变；补旧窗口2/2→新请求在途/未知→旧poll→停止的回归、实际页面断言及第10条变异。第三轮才覆盖这项反例。
4. 早期隔离诊断变异为8杀掉、1 ABORT；删双击门禁后，测试先 await 导致悬挂，超时不是杀掉。调整为先断言实际请求数，再等待；正式10项使用既有 `mutate-suite`/`mutate-check`、先跑真实基线、核对复制和恢复 SHA，0未评估。早期 `implement-ui-mutations.json` 保留，不写成首轮全绿。
5. 全量 Node 的子进程实际 exit0；主线程封装器误按 TAP 解析 Node 24 输出的 spec 格式与 CRLF，首份 `full-test.json` 因计数为 null 返回 false。保留原始 stdout 和首份回执，只离线重析为 `full-test-normalized.json`；没有重跑测试、覆盖原日志或把封装器失败说成产品失败。文件后缀 `.tap` 不改变其实际内容是 spec 输出的事实。
6. 游戏客户端已占用单桌夹具后，首次 Browser 刷新又建房得到 `room_already_exists`，因此未进入通知控件。另开自己的新夹具完成5项修后验证。首轮主 Browser 的第二来源在 ai.start 前合并，过早 resolve(index=1)被夹具拒绝；补充脚本拆分 begin/resolve 后再测忙时第二来源。均是已记录的夹具操作边界，不将其算成产品或 Dual 缺陷。
7. 独立 checker 确认启动 P2：原主脚本等待可选 import 后才读取旧会话；模块悬挂时恢复请求为0，模块拒绝后才变为1。原源码 VM 时序反例及4项回归先红（3失败/1通过），随后把可选初始化与原会话恢复拆成独立异步入口。85项定向、1310项全量和实际 Browser 补充验证已通过这一修改，但不能据此覆盖之后发现的相邻围栏问题。
8. 第四轮 Playwright 已证明模块挂起时恢复与聊天，但刷新后原生 details 默认收起，脚本忘记展开就点隐藏的撤销按钮，30秒超时。修为正常展开再操作，第五轮33项通过；这是测试操作错误，不用 force click 绕过。checker 另指出窄屏采样 `[].every` 空集可假绿；现先验证6个指定可见控件和数量，再验边界。
9. 启动拆分后独立 checker 又实证一个相邻 P2：模块未加载期间发出的 OFF 操作未被新控制器继承；OFF 请求未返回、旧 ON 投影有效时，迟到模块可进入 idle 并允许新确认。`checker-late-module-fence.json` 为实际红测（19.96ms、exit1），未实际发送新 start 或原生通知。现主脚本保留当前会话的在途授权票据，迟到模块继承屏障；必须所有当前操作完成才解除，旧会话回调不影响新会话。8项bootstrap先4通过/4失败（833.3527ms、exit1），再89项定向、1314项全量及35项浏览器通过；此前1310/33不算覆盖本项。
10. 最终应用内 Browser 的准备检查把预期写成 `.includes('取消准备')`，返回 false；实际截图是“撤回准备”，当前 `table.js:1085–1089` 只有本人 `READY` 才显示该词。主线程与 checker 分别亲看截图并核源码，裁为断言误词，不是产品准备失败。原回执保持6 true/1 false，另写裁决，不改成7/7、不重跑冒充新覆盖；第六轮独立的正常准备检查为通过。
11. 收尾主线程曾误把89项定向时的driver哈希 `dd41eb…` 与最终静态/全量清单的 `aa21fa…` 差异称为“静态回执内部不一致”。实际重新按原算法计算，静态回执内部一致；只是不同阶段快照，其余29项相同。89项只执行三个Node测试，不执行该driver；最终全量及第六轮页面采用最终输入。原静态报告不改写；checker 的身份补充和主线程第二份汇总纠正该推断，保留第一份汇总的错误说明，不能当产品或框架缺陷。

### 独立复核与最终身份

独立上下文的 `trellis-check` 最初接到29项输入清单 `source-manifest.json`，摘要为 `37fa21187b968eef55dc8ee8700ba6f215a66e1cf3d47aea57105dac0202a64d`。最终30项（新增bootstrap测试）以 `verification-03/source-manifest.json` 为准，摘要为 `ff5b7b21bfad2f0949de7eb9cb7de1d8b44078c9a294a2506e0906bb1e7820f4`，最终全量前后无变化。这是受影响运行/测试输入集合，不是整仓身份；不要使用名称为 `final-source` 的更早候选覆盖最终清单。纯模块、其测试与正式变异规格此后未改，10条实际变异仍对应当前字节。

冻结的 `checker-review.md`（SHA256 `7bf073a6d52cbac5fbf609a713aa20b0b63d26a019173b0e2a58a73d81ecbc50`）给出有界代码复核 PASS；身份引据的补充见 `checker-review-addendum.md` 与 `checker-static-identity-addendum-20260901.json`。checker 亲自执行89项定向、首次9项语法及本次只读补充9项语法；主线程执行全量和真实浏览器，双方不互冒认执行次数。89项快照的浏览器driver属于更早版本，其余29项与最终一致，不能称该次30项全部就是最终输入。主线程接受两项P2修复与P3断言补强后的本批结果。底层 reviewer 模型/提供方未核验，不声称不同模型外审；外部战略复核本批不另开，理由是既定 API 的同范围可逆 UI 接线，无新的宿主路线或 L0–L2 决策。

项目没有 lint/typecheck 脚本；不能把 Node 语法检查当作这两项通过。没有重新执行四人13手、四真人45分钟、原生连续窗口、第二真实AI、Claude 或异地联机。下一同范围有界批次可沿 `DEC-20260831-002/003` 的已有授权恢复，不重问相同许可；本批0预算不能据此追加原生输入，全局reload/宿主重启/新权限仍须另问。

本批自建页面已关闭，最后本地夹具分别返回 closed:true/exit0，第六轮各context/browser/fixture清理成功。`resource-cleanup.json` 在2026-09-01 00:23:48 +08:00只读核对17个已记录端口无监听、匹配辅助进程为空（2752.1946ms、exit0）；PW01未记录的端口为unknown，不从缺失报告虚构清单。旧B12/B14私人文件和宿主管理进程未动，Gate9的历史策略阻塞单列保留；不声称所有历史资源已清理。最终源码与B15允许修改范围、HEAD和空暂存核对见 `final-integrity.json`；手工收尾，没有提交、归档或部署。治理语言检查的原始机器回执为同目录 `governance-language.json`，以其中实际result为准。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B16-LOCAL-WAKE-CONTROLS-20260901-A
  detail_level: evidence_slice
  scope:
    scope_id: B16-LOCAL-WAKE-CONTROLS
    exact_outcome: 原牌桌本席显式有界启停及回执UI，经真实本地页面和脚本接收端验证，不关闭主动产品节点
    owner_ref: REVIEW-LOG.md#b16-managed-wake-controls
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - node_id: TG-L2-SESSION-LAUNCH
        contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019
        expected_digest: sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f
        binding_status: verified
      - node_id: TG-L2-PUBLIC-AI-EXCHANGE
        contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
        expected_digest: sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54
        binding_status: verified
    implementation_identity:
      kind: file_set_digest
      scope: H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/verification-03/source-manifest.json中的30输入
      identity: sha256:ff5b7b21bfad2f0949de7eb9cb7de1d8b44078c9a294a2506e0906bb1e7820f4
      status: current
    verification_identities:
      - {evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/verification-03/full-test.json', identity: 'sha256:a08c26fa63fa490b336f80ad7a90587874cbc9ecde6328aa10ba6af0eabb4afa', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/playwright-06/report.json', identity: 'sha256:54d940d12de8bc6b6cb3602bfa7b217190bf248ffab469f42ee2fcd4be4a0b83', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/implement-official-mutations.json', identity: 'sha256:e626596a4d4cbb6a868cd5d0783186058c4db6d8923b417f50de92ad3d417ba4', status: current}
    freshness: current
  acceptance:
    derivation_timing: before_current_implementation
    derivation_ref: .trellis/tasks/08-26-public-ai-table-talk/research/b16-managed-wake-controls-20260831.md
    selected_surfaces: [integration, browser, focused_probe, inspection]
    obligations:
      - {obligation_id: B16-R1, claim_or_predicate: 本人有效绑定及每窗授权才能启停且上限来自服务，投影不跨席, required: yes, real_condition: 真实HTTP投影和页面操作，发送器明确为本地脚本}
      - {obligation_id: B16-R2, claim_or_predicate: 固定请求身份与未知停止围栏有效，接收和resolve不冒充原生整轮结束, required: yes, real_condition: 回归与实际网络故障注入、定向变异}
      - {obligation_id: B16-R3, claim_or_predicate: 可选模块和交叠权限操作不阻断真人且不能重新放行旧权限, required: yes, real_condition: 原脚本先红后绿及真实页面持有模块和OFF请求}
    observations:
      - {obligation_id: B16-R1, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/verification-03/full-test.json', result: pass}
      - {obligation_id: B16-R1, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/playwright-06/report.json', result: pass}
      - {obligation_id: B16-R2, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/implement-official-mutations.json', result: pass}
      - {obligation_id: B16-R2, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/playwright-06/report.json', result: pass, caveat: 公开与silent由脚本提交，原生状态unknown}
      - {obligation_id: B16-R3, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/verification-03/full-test.json', result: pass}
      - {obligation_id: B16-R3, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b16-wake-controls-20260831-7c82d6a1/playwright-06/report.json', result: pass}
    skipped:
      - {check: 真实连续模型及queue和原任务输入, reason: 本批预算与实际均0，不从脚本推断}
      - {check: Claude和第二真实AI及朋友异地与四真人45分钟, reason: 本批只验本地控件}
      - {check: B12及B14历史清理, reason: 工具策略阻塞单列，未换方法重试}
      - {check: 全仓变异及lint或typecheck, reason: 只执行新模块10项变异；后两种命令未配置}
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: implementing
  claim_limits: [本地控件完成不等于连续原生交付, 不关闭主动AI父节点, 不翻转默认能力, 原始失败与文案误判保留, B14清理blocked保留]
  remaining_non_blocking: [同范围后续有界批次可沿既有授权, manual_closeout保持未提交]
  next_owner: codex_primary_bounded_native_continuous_preflight
```

<a id="b17-native-managed-wake-carrier-boundary"></a>
## B17：真实连续窗口与既有任务 MCP 重激活边界（2026-09-01）

### 范围与裁决

本批沿用 `DEC-20260831-002/003`，只复用原游戏任务
`01a052c9-5259-7a61-b26f-35731734994e`、回环合成牌局和本席逐窗权限；不改
模型/强度，不授予 Ready、下注或亮牌，不做全局 MCP reload、宿主重启、新任务、
远端监听、提交或部署。冻结目标是用 B16 实际页面连续结清两个不同公开来源，再由
本人停止并证明第三来源不再 queue；每批最多1次readiness和2次queue，失败即停。

最终裁决为 `blocked`，不是产品失败也不是通过：三批共4次原任务输入、1次queue，
只有第一批readiness实际调用一次游戏MCP。全程没有`ai.start`、`ai.resolve`、
`silent`或AI公开，因而不能证明连续原生路径、停止后的第三来源围栏或实时性。第一批
暴露B17测试外壳的空闲上限缺陷；修正后两批又表明该既有任务没有重新启动项目MCP。
精确的Codex宿主缓存/进程重激活规则为unknown，不将它归因于扑克内核或Dual。

### 独立检查修复与本地验证

Trellis checker在实机前发现产品内一项真实竞态：权威`ai.resolve`若先于queue ACK
完成，随后撤权/OFF清空surface，而sender Promise稍后才返回，旧实现会丢掉已结清
回执，把窗口永久误判为pending。`src/host/model-wake-session.cjs`现仅为该请求保存
`resolvedBeforeInvalidation`，并且只在sender清理成功时采用；撤权本身没有被降级，
未知/失败清理仍失败关闭。新增`test/model-wake-session.test.cjs`回归及正式变异
`wake-resolve-before-ack-lost-on-revoke`。

| 检查 | 结果 | 耗时/边界 |
| --- | --- | --- |
| `test/model-wake-session.test.cjs` | 42/42，exit0 | 287.9ms |
| `test/model-wake-control.test.cjs` | 19/19，exit0 | 566.9ms |
| 新竞态实际变异 | 1杀掉、0存活、0未评估 | 源码恢复已核对 |
| B17外壳语法及撤权生命周期 | `connection_file_removed`、exit0 | 合成临时文件，不含游戏凭据 |
| 最终全量`npm test` | 1315/1315，失败/跳过/取消均0，exit0 | 69343.9369ms |

没有重跑B16的35项浏览器、四人13手或全仓变异。最终全量比B16多1项，即上述竞态
回归；项目仍没有lint/typecheck脚本。attempt 2/3的25文件预检摘要均为
`c1608d193bb1c6da6adba46102442a3197e70ccded87882ef21f0a7c1ceb4515`，
HEAD仍为`bbdcf2b1c4968fcace96fcc1cc69f97e57c4e18b`、暂存为空；该摘要包含B17
载体脚本，不是整仓身份或提交。

### 三批原生事实

| 批次 | 原任务输入/queue | 直接观察 | 停止原因 |
| --- | --- | --- | --- |
| attempt 1 | 2 / 1 | readiness turn `01a05bab-9f60-7471-bc75-ba6ad4f570ad` 20.257秒，1次`view.projection`；第一来源后UI为1尝试/1接收/0结清 | B17外壳在最后MCP请求后90秒以`idle_limit`退出；queue turn `01a05bad-1252-7d03-96ca-4eff2f8a0805` 25.053秒但0次MCP调用，UI以`wake_result_unknown`自动停止；未发第二/第三来源 |
| attempt 2 | 1 / 0 | 新服务名；readiness turn `01a05bb5-e4ca-7d42-a3c4-b2e5169bf669` 12.163秒完成，牌桌仍等待宿主 | MCP进程从未启动，按readiness失败在queue前停止 |
| attempt 3 | 1 / 0 | 恢复attempt 1曾成功的服务名；readiness turn `01a05bb9-f207-7dc2-ae38-4008a1a4a5d2` 7.859秒完成，牌桌仍等待宿主 | MCP进程仍未启动；重复不会增加新证据，停止同类实机输入 |

attempt 1的测试外壳已从90秒空闲改为360秒空闲、480秒硬上限，并在其临时连接
文件删除后自行退出；若活跃请求卡住，SIGTERM/硬上限仍在6秒后强制结束该外壳，
不终止Codex父进程。独立生命周期脚本实测撤权退出成功。attempt 2/3因此不能再
归因于旧90秒上限；但“既有任务未重激活”仍只是观察结果，具体是注册缓存、进程
复用还是其他宿主策略unknown。

三批均从真实应用内Browser完成建房、第二席加入、公开范围确认、逐席授权和撤权。
attempt 1实际开启B16页面窗口并由B席发第一条合成公开消息；主线程亲看全页截图，
页面明确显示“未能确认权威结果”、1/1/0及唯一B席消息。attempt 2/3未通过readiness，
没有开启通知窗口或发送来源。不能把任务回合completed、queue ACK或页面host_seen
替代权威`resolve`。

### 清理与结论边界

每批都逐项确认本席连接撤销、临时`H:/tokengold/.codex/config.toml`删除、167字节
私有连接文件及其单项目录删除、两个Browser标签关闭、beta正常IPC关停、控制器/beta
PID退出和端口无监听。attempt 1的B17 MCP PID已由旧idle规则退出；attempt 2/3根本
未创建MCP进程。B12/B14历史私有目录、历史进程和已被策略拒绝的清理没有读取、删除
或重试；B14 Gate9继续单列blocked。

原始有界记录在Git忽略目录
`artifacts/b17-native-managed-wake-20260901/`，含冻结`qa-plan.md`、三个attempt结果、
预检、beta关停和去敏生命周期回执；不含私有连接内容。当前没有后台模型循环、临时
配置或有效B17权限。下一步先实现“游戏前稳定加载项目MCP、逐席连接换代不要求MCP
重启”的本地机制，再定义新批次；在没有新激活机制或另获全局reload/重启授权前，
不继续用同一readiness模式消耗原任务输入。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B17-NATIVE-CONTINUOUS-CARRIER-20260901-A
  detail_level: evidence_slice
  scope:
    scope_id: B17-NATIVE-MANAGED-WAKE-CARRIER
    exact_outcome: 本地竞态已修并通过全量；真实连续批次被既有任务MCP重激活边界挡在首轮queue/readiness，未形成任何模型终态
    owner_ref: REVIEW-LOG.md#b17-native-managed-wake-carrier-boundary
  trigger: verification_evidence
  basis:
    semantic_contract_refs:
      - node_id: TG-L2-PUBLIC-AI-EXCHANGE
        contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D
        decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023
        expected_digest: sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54
        binding_status: verified
    implementation_identity:
      kind: file_set_digest
      scope: artifacts/b17-native-managed-wake-20260901/attempt-3/preflight.json中的25输入
      identity: sha256:c1608d193bb1c6da6adba46102442a3197e70ccded87882ef21f0a7c1ceb4515
      status: current
    verification_identities:
      - {evidence_pointer: test/model-wake-session.test.cjs, identity: current_worktree, status: current}
      - {evidence_pointer: test-support/mutations/model-wake-session.json, identity: current_worktree, status: current}
      - {evidence_pointer: artifacts/b17-native-managed-wake-20260901, identity: ignored_local_evidence, status: current}
    freshness: current
  acceptance:
    derivation_timing: before_native_execution
    derivation_ref: artifacts/b17-native-managed-wake-20260901/qa-plan.md
    selected_surfaces: [focused_regression, mutation, full_node, native_task, browser_inspection, cleanup]
    obligations:
      - {obligation_id: B17-R1, claim_or_predicate: 两个不同来源依次得到精确权威终态且至少一个公开, required: yes, real_condition: 同一UI窗口与原任务真实工具回执}
      - {obligation_id: B17-R2, claim_or_predicate: 本人停止后第三来源不再queue, required: yes, real_condition: 两次终态后真实UI停止和新来源}
      - {obligation_id: B17-R3, claim_or_predicate: 逐席权限和本批宿主资源完整清理, required: yes, real_condition: 每批撤权、文件/配置/页面/进程/端口分项观察}
    observations:
      - {obligation_id: B17-R1, evidence_type: executed, correspondence: partial, evidence_pointer: artifacts/b17-native-managed-wake-20260901/attempt-1-result.json, result: blocked, caveat: 1次queue但0次start/resolve}
      - {obligation_id: B17-R2, evidence_type: not_run, correspondence: none, evidence_pointer: artifacts/b17-native-managed-wake-20260901/qa-plan.md, result: not_run, caveat: 第一来源未结清，冻结规则禁止后续来源}
      - {obligation_id: B17-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b17-native-managed-wake-20260901/attempt-1-result.json, result: pass}
      - {obligation_id: B17-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b17-native-managed-wake-20260901/attempt-2/result.json, result: pass}
      - {obligation_id: B17-R3, evidence_type: executed, correspondence: direct, evidence_pointer: artifacts/b17-native-managed-wake-20260901/attempt-3/result.json, result: pass}
    skipped:
      - {check: 第二和第三公开来源及停止后queue围栏, reason: 第一来源没有权威终态，按预先判据停止}
      - {check: Claude和第二真实AI及朋友异地与四真人45分钟, reason: 本批固定Codex单席回环载体}
      - {check: B12及B14历史清理, reason: 已有工具策略阻塞，禁止换方法重试}
      - {check: B16浏览器35项与全仓变异及lint/typecheck, reason: 当前生产修改由定向回归/变异和全量Node覆盖；后两种静态命令未配置}
    result: blocked
  semantic_delta: none
  state: implementing
  claim_limits: [B17不证明连续原生产品, 不撤销B14限定Gate5样本, 不把宿主重激活观察归因扑克或Dual, 不翻转proactive_wake, B14清理blocked保留]
  remaining_blocking: [稳定项目MCP激活与逐席连接换代, 新连续原生批次, B14历史Gate9, Claude, 第二真实席, 异地与四真人UAT]
  next_owner: codex_primary_stable_project_MCP_activation
```

## B18：稳定项目 MCP 激活与逐席连接热切换（2026-09-01）

### 问题与边界

B17每个席位/批次写一个新的MCP服务器定义，真实宿主是否重新发现它取决于任务级MCP生命周期；
既有任务在测试进程退出后没有重新激活。MCP服务器本身已经在每次工具调用时读取
`TOKENGAME_MODEL_CONNECTION_FILE`，因此本批没有再造进程刷新协议，而是把路径稳定下来：
项目服务器只加载一次，席位权限通过固定文件内容换代。

OpenAI项目MCP文档支持受信任项目内`.codex/config.toml`和stdio的`command/args/cwd`，并说明
新增服务器后Desktop/IDE需要重启；插件打包文档没有给捆绑`.mcp.json`一个可验证的“当前项目根”
占位符。因此本批选择显式真人CLI管理项目受管块，不把路径猜测埋进插件安装。参考：
<https://learn.chatgpt.com/docs/extend/mcp?surface=cli>、
<https://developers.openai.com/plugins/build/plugins>。

只读环境核对发现当前Codex保存项目是`H:/tokengold`，仓库`H:/tokengold/tokengame`只是子目录；
仓库内`.codex/config.toml`没有出现在当前任务的`codex mcp list`中。于是新增
`npm run codex:configure -- <实际项目根绝对路径>`，但本轮没有对父项目执行该命令，也没有重启宿主。

### 实现结果

- `src/shared/model-connection-file.cjs`统一16KiB上限、精确三字段schema、本机HTTP回环origin、
  32–256字符令牌、普通非符号链接文件以及不泄露路径/内容的错误。
- `src/run-project-mcp.cjs`在启动既有MCP前把连接路径固定为
  `.tokengame-private/active-model-connection.json`；MCP的`runStdio`可测试化，但工具合同不变。
- `connection:activate`先完整验证下载源，再以0600临时文件、fsync、rename发布；失败保留旧活动文件，
  不自动删除下载源。`connection:clear`幂等且只删固定槽位，同目录其他文件不动。
- Codex受管配置器位于`plugins/tokengame/codex/`，只接受包含仓库的显式项目根，保留既有TOML，
  只替换一对标记之间的服务器块；同名非受管项、坏标记、符号链接、超限文件与原子发布失败均关闭。
  项目服务器只暴露`tokengame_table`，不把旧探针作为产品默认工具。
- 页面、beta、根README、插件README和Skill统一为“首次配置并重启一次；以后激活/换发/清除不重启”。
  页面服务端撤权与本地`connection:clear`明确是两个动作；项目级隔离不宣传为密码学任务隔离。

首轮全量为1327/1328、67098.3516ms。唯一失败是Codex专有配置与说明渗入通用`src/`，违反
宿主名字射程；没有放宽扫描，而是把配置器搬入插件Codex适配层，并把通用beta改为指向当前宿主文档。
修正后定向79/79，最终全量1328/1328、66843.1965ms。

首轮`npm run gate`正确失败：638条中632杀掉、2存活、4未评估。2条刷新成功围栏变异被
catch分支里的同名字符串遮蔽；将断言窗口收窄到`view`请求返回至首次结果交付后，10/10全杀。
4条旧锚点分别属于beta构造/轮询说明和错误分类表新增项，按同一风险更新到当前代码后，相关
14/14、15/15全杀。完整第二轮重新执行，不拼接局部结果：Node1328/1328，变异638/638，
0存活/未评估，`GATE=PASS`。B18自己的项目接入与连接文件两组分别12/12、10/10。

`node test-support/model-binding-browser-acceptance.mjs`最终51/51、16786ms，实际走两席下载、
两个stdio连接、本席上下文、同桌气泡、刷新、撤权、旧文件拒绝、320/390px及无凭据泄漏；
不是原生模型证据。Skill校验首轮因Windows Python按GBK读UTF-8而崩溃，使用`python -X utf8`
后`Skill is valid!`；前者单列为载体编码问题，不改写成Skill测试失败或通过。

### 裁决

本批0真实模型输入、0queue、0父项目配置、0宿主重启。B18本地实现单元可判完成；
`TG-EU-PROACTIVE-WAKE-SPIKE`不能关闭，B17原生载体问题也不能写成已解除。下一步需要用户明确授权：
在`H:/tokengold`写TokenGame受管项目MCP块并重启一次Codex；之后以新的有界真实连续批次验证
激活→换发→清除与多来源终态。B12/B14已被策略拒绝的历史清理不重试。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B18-STABLE-PROJECT-MCP-20260901-A
  detail_level: local_implementation_slice
  scope:
    scope_id: B18-STABLE-PROJECT-MCP-ACTIVATION
    exact_outcome: 项目服务器一次加载、逐席文件热切换及显式Codex项目配置器完成本地实现和全门禁，当前父项目尚未配置或重启
    owner_ref: REVIEW-LOG.md#b18-stable-project-mcp-activation
  acceptance:
    selected_surfaces: [targeted_node, full_node, mutation_gate, browser_connection, skill_validation, host_neutrality]
    observations:
      - {check: final_node, result: pass, detail: 1328_of_1328_66843.1965ms}
      - {check: final_mutation_gate, result: pass, detail: 638_of_638_no_survivor_or_unevaluated}
      - {check: connection_browser, result: pass, detail: 51_of_51_16786ms_script_models_not_native}
      - {check: skill_validation, result: pass, detail: explicit_UTF8_mode}
      - {check: parent_project_configuration, result: not_run, caveat: H:/tokengold未写入}
      - {check: host_restart_and_native_continuous, result: not_run, caveat: 仍需明确授权}
    result: local_complete
  semantic_delta: none
  state: waiting_for_explicit_host_restart_authorization
  claim_limits: [不声称当前任务已加载新项目MCP, 不声称B17原生阻塞已解除, 不翻转proactive_wake, 不改B14_Gate9]
  remaining_blocking: [父项目受管配置, 一次宿主重启, 连续原生复验, B14历史Gate9, Claude, 第二真实席, 异地与四真人UAT]
  next_owner: user_authorization_then_codex_primary
```

### 重启后原生追加复验（2026-09-01）

用户尝试执行配置命令时因PowerShell位于`C:/Windows/System32`而得到`package.json`不存在；该次没有写入。
随后从仓库根运行同一配置器成功，受管块唯一并只暴露`tokengame_table`。真人重启Codex后，当前任务
工具清单实际出现`mcp__tokengame_project__tokengame_table`；未出现旧探针或配置命令。活动槽为空时
第一次原生`view.projection`返回`model_connection_unavailable`，区分了“服务器未加载”与“尚未授权”。

本地beta在`127.0.0.1:7802`新建两人测试房。A席经页面确认权限并下载连接文件，`connection:activate`
后同一原生工具成功返回A席投影。随后页面撤销，未清活动槽前原生调用明确返回
`model_command_token_rejected`；A席重新签发并覆盖同一路径，再次`connection:activate`报告完整换发，
没有重启Codex或MCP，下一次投影立即成功。因此B17观察到的“退出后既有任务不重新发现临时服务器”
已被稳定项目服务器绕开；这不说明任意动态MCP定义都会热加载。

B独立浏览器公开发言“A，你的AI真能听见这条公开消息吗？”。当前Codex会话实际调用一次
`ai.take_intents`领取该来源、一次`ai.start`取得A席权威上下文，再一次
`ai.resolve(public_speech)`发布27字回答。权威返回`scope=TABLE_PUBLIC`、`speaker_type=SEAT_AI`；
A与B两个隔离浏览器都找到同一句带AI标识的座位气泡。该过程共8次本批游戏MCP调用：缺槽只读、
激活只读、撤权拒绝、换发只读、take、start、resolve、清槽后只读；其中1次start、1次resolve、
1条AI公开，0 queue。它是用户“继续”显式触发的当前模型回合，不是无点击持续通知通过，也没有
第二个真实模型席、进行中手牌或可用于实时性判断的分段时钟。

浏览器最初的唯一console错误是自动请求`/favicon.ico`得到404。页面增加`data:,`空favicon并新增
源码回归；`test/entry-consent-idempotency.test.cjs`最终11/11、121.5987ms，另起干净beta后真实浏览器
为0 error/0 warning；当前最终全量1329/1329、68569.4652ms。这是独立UI质量修补，不倒写为原生MCP失败，
也不改写此前B18门禁638/638所对应的1328项基线。

收尾按顺序完成页面服务端撤权、`connection:clear`、清槽后原生`model_connection_unavailable`、
两个浏览器关闭和beta释放7802。包含精确下载删除的组合命令在执行前被工具策略拒绝，因此其中浏览器
关闭也未发生；随后只单独关闭浏览器，没有换Node、apply_patch或其他工具绕过删除。当前仅余本轮
`.playwright-cli/`下166字节已撤权下载文件，需真人手工删除；固定活动槽不存在。B12/B14历史策略
阻塞资源未读未动。未暂存、提交、推送、部署或归档。

```yaml
execution_closure_update:
  contract: dual-ai.execution-closure.v1
  supersedes_result_id: EC-TG-B18-STABLE-PROJECT-MCP-20260901-A
  result_id: EC-TG-B18-NATIVE-STABLE-PROJECT-MCP-20260901-B
  detail_level: native_explicit_integration_slice
  exact_outcome: 父项目配置与一次重启后，稳定项目MCP完成缺槽、激活、撤权拒绝、同席热换及一次双页可见的真实Codex公开
  acceptance:
    observations:
      - {check: project_tool_discovery, result: pass, detail: only_tokengame_table_after_restart}
      - {check: empty_slot_failure_closed, result: pass, detail: model_connection_unavailable}
      - {check: activation_and_projection, result: pass}
      - {check: revoked_old_connection, result: pass, detail: model_command_token_rejected}
      - {check: hot_reissue_without_restart, result: pass}
      - {check: native_public_reply, result: pass, detail: one_take_one_start_one_resolve_two_browser_bubbles}
      - {check: explicit_cleanup, result: partial, detail: server_revoked_slot_clear_browsers_closed_port_released_download_manual_delete_pending}
      - {check: favicon_console_regression, result: pass, detail: targeted_11_of_11_full_1329_of_1329_68569.4652ms_browser_0_errors_0_warnings}
    result: native_explicit_path_pass_cleanup_partial
  semantic_delta: none
  state: ready_for_bounded_managed_wake_retest
  claim_limits: [0_queue, 不声称持续主动唤醒, 不声称第二真实AI席, 不声称牌局实时性, 不改B14_Gate9]
  remaining_blocking: [本轮失效下载真人删除, 稳定入口持续通知, 第二真实AI席, Claude, 异地与四真人UAT]
  next_owner: codex_primary
```

## B19：稳定项目入口两次串行原生通知（2026-09-01）

### 设置与就绪

B19没有再创建临时MCP定义。beta发送器明确固定本机绝对`codex.exe`、工作目录`H:/tokengold`及
既有闲置任务`TokenGame 临时单席接入验证`；启动行报告`managed_wake=available`，同时保留
`proactive_wake_verified=false`。发送器安装本身没有排队。A页面重新确认本席AI权限并激活本批新连接，
B以第二个隔离浏览器加入；没有复用B18已撤权文件。

专用任务先收到一次手工只读就绪指令，要求只用`tokengame_project`的`view.projection`且不重试。
该回合13.951秒完成，宿主读取接口返回空items，因此不能把载体输出写成实际工具明细；牌桌权威状态
随后从未见宿主变为“已收到本席宿主请求”，直接证明该任务使用了本批连接。B19以权威事实放行queue，
没有从“回合完成”反推工具成功。

### 两次串行通知

本人在A页面填写发送器预先固定的任务UUID，选择最多2次、180秒并重新勾选该窗口授权。开启后页面为
0尝试/0接收/0结清。B发送第一条公开消息后，没有再向专用任务手工发言；发送器queue触发一个
28.977秒任务回合。页面达到1尝试/1接收/1权威结清，A/B两页都显示AI回答“能，这条已经自动送到我
这里；牌桌操作仍由玩家决定。”后，才发送第二条来源。

第二条触发24.405秒任务回合，最终页面为尝试2/接收2/权威结清2，并明确因通知次数上限停止；A/B两页
都显示第二条AI回答。没有第三条、重复queue或A侧补提示。第一条的实际resolve释放单槽后第二条才进入，
因此不是两个并发输入偶然各自完成。

窗口最终显示116.911秒，包含页面开启、浏览器操作、轮询、queue与模型回合，不能当作两次模型推理
时间或实时SLA。两席没有Ready，手数保持0；B19没有覆盖发牌后的扑克事件、行动倒计时或跨街迟到。
因此只裁决“稳定入口等待区两次连续通知”通过，不翻宿主能力剖面的`proactive_wake_verified`。

### 清理与代码状态

窗口按次数上限自动停止，随后页面撤销服务端权限、`connection:clear`清活动槽、两个浏览器关闭、beta
经SIGINT报告端口与定时器已停，7802无监听。专用任务状态回到idle。本批新下载与B18旧下载均为
166字节、均已撤权；删除受工具策略阻止后未绕过，留待真人手工删除。B12/B14历史阻塞资源未触碰。

B19没有修改通知生产代码。进入B19前的最终代码已经在favicon修补后完整跑过1329/1329、
68569.4652ms；本节只增加事实文档，不把前批全量重复归到B19。未暂存、提交、推送、部署或归档。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B19-STABLE-MANAGED-WAKE-NATIVE-20260901-A
  detail_level: native_bounded_waiting_room_slice
  scope:
    scope_id: B19-STABLE-MANAGED-WAKE-NATIVE
    exact_outcome: 固定Codex游戏任务在稳定项目MCP下由两个串行公开来源自动queue并各自权威结清和双页公开
    owner_ref: REVIEW-LOG.md#b19-stable-managed-wake-native
  acceptance:
    observations:
      - {check: stable_project_readiness, result: pass, detail: authority_host_seen_after_13.951s_turn_carrier_items_unknown}
      - {check: first_managed_notification, result: pass, detail: task_28.977s_attempted_1_received_1_resolved_1_two_browser_bubble}
      - {check: second_after_first_resolve, result: pass, detail: task_24.405s_final_2_2_2_two_browser_bubble}
      - {check: bounded_stop, result: pass, detail: notification_limit_reached_no_third_send}
      - {check: cleanup, result: partial, detail: revoked_slot_clear_browsers_closed_port_released_two_revoked_downloads_manual_delete_pending}
      - {check: hand_active_source, result: not_run}
      - {check: latency_segmentation, result: not_run, caveat: 116.911s_window_residency_is_not_model_latency}
    result: native_waiting_room_continuous_pass_cleanup_partial
  semantic_delta: none
  state: ready_for_hand_active_managed_wake_probe
  claim_limits: [不翻proactive_wake_verified, 不声称牌局内已通过, 不声称实时SLA, 不声称第二真实AI席]
  remaining_blocking: [牌局内连续来源, 分段时延, 两份失效下载真人删除, 第二真实AI席, Claude, 异地与四真人UAT]
  next_owner: codex_primary
```

## B20：牌局内原生通知失败与受限诊断补强（2026-09-01）

### 原生执行与停止裁决

B20复用B18稳定项目MCP和既有任务`TokenGame 临时单席接入验证`。受控beta使用随机回环端口51999，
发送器仍固定绝对`codex.exe`与`H:/tokengold`。A/B新建本地两人房，A席新授权文件经
`connection:activate`发布到固定活动槽；文件内容未被读取或展示。两席Ready后第1手进入行动期，A为
首个行动者，本人在A页面开启最多1次/120秒窗口。

A没有点击或给专用任务补提示，任务自动开始并在17.426秒后完成一次原生回合。页面在20.342秒时
以`wake_start_failed`停止，尝试1、已接收1、权威结清0；A/B两页均没有AI气泡。本地生命周期记录中
没有`SEAT_AI_EVALUATION_STARTED`、turn或任何合法终态，所以“宿主任务完成”不能当成游戏评估完成。
这次`ai.start`路径确实失败，但修补前的观察账只保留通用原因，精确业务错误码无法从现有证据恢复，
写作`unknown`。

真人未行动时原有倒计时按规则自动弃牌并续手。去敏回执依次记录第1、2、3手开始，第3手一条B公开
消息，随后第4手开始。宿主任务启动早于这条刻意发送的B消息，因此它不是本次queue的因果来源；
更早存在的具体扑克待办当前无法区分。按预设停止条件没有发第二来源、没有补提示，也没有重试本窗口。

### 观察盲区与实现边界

检查发现`ModelCommandSurface`在`ai.start`/`ai.resolve`失败时已拿到精确业务码，但观察回执和窗口只
保留`wake_start_failed`/`wake_resolve_failed`。这不是扑克或模型算法缺陷，却会让下一次原生失败仍
无法判断是intent失效、claim换代、资格变化还是其他业务拒绝。

本批实施最小诊断补强：失败观察回执只接受固定语法的稳定`error_code`，不保存`details`、异常正文、
玩家/模型自由文本或上游响应；会话投影仅在合法码存在时增加`failure_code`，页面对已知码给本人可读
说明，未知但合法的码只显示受限码值。非法形状让投影失败关闭。通用窗口终止原因、去重、不重试、
通知来源、扑克时钟、模型与推理强度均未改变，`proactive_wake_verified`也不改变。

错误码注册表的反向对账随后暴露一处可测性问题：两个通用码仍由三元式产生，静态扫描器读不到。
实现改成两个显式抛错分支，语义等价；没有通过删注册表条目或放宽检查把失败压掉。

### 验证次数、耗时与载体问题

- 相关聚焦Node最终120/120，273.9621ms。
- `model-wake-session`变异22/22、11.140秒；`table-wake-controls`变异12/12、4.305秒，均0存活、
  0未评估。
- 脚本浏览器35/35、9387.116ms。它不调用原生模型，只覆盖本人诊断投影、控件和本地公开链。
- 首轮全量1331/1332、70450.5814ms；唯一失败为上述静态扫描盲区。等价展开后最终全量
  1332/1332、68593.6824ms，0失败、0跳过、0取消。

两份变异驱动会在运行中临时改写并还原共享源码，首次误将它们并发启动，导致一份基线读到另一份的
临时变异。立即核对源码已还原，之后串行重跑得到上面的34/34。该次并发污染是测试策略/载体问题，
不计作产品失败，也不把受污染结果计入通过数。后续文档明确要求变异独占运行。

### 清理、证据与当前裁决

A页面已撤销服务端权限，`connection:clear`成功，两个浏览器关闭。beta子进程经IPC正常关闭并报告
`graceful:true`、退出0、输出完整；同一`run_ref`的footer为complete，进程侧另报告capture、write
acknowledgement与close全部成功。离线分析器只能从文件判断内容完整，对writer acknowledgement仍报
unknown；不能拿离线字段覆盖进程侧分项回执。51999与7802最终无监听。

beta子进程已经干净退出后，控制器外壳因stdin仍被引用而需要一次Ctrl+C并退出1；这是外壳生命周期
问题，不改写子进程退出0和记录器完整事实。`npm run connection:status`并不存在，本批误调用一次返回
ENOENT式脚本错误；真正需要的`connection:clear`在此之前已成功，活动槽最终不存在。

`.playwright-cli/`保留三份已撤权下载：B18、B19各166字节，B20为167字节。没有再次尝试删除或用
替代工具绕过策略边界，需真人手工处理。原始去敏记录位于
`artifacts/b20-hand-active-managed-wake-20260901/authority-lifecycle.jsonl`，受Git忽略；详细事实包为
`.trellis/tasks/08-26-public-ai-table-talk/research/b20-hand-active-managed-wake-diagnostic-20260901.md`。

B20裁决为`native_hand_active_start_failed_no_retry`。它不撤销B14固定版本单席的限定Gate 5通过，
也不是新的Gate 5通过样本。下一次应使用新授权和新窗口读取新增受限业务码，不重试本次已停止窗口；
只有权威评估开始和唯一合法终态都出现，才可把牌局内切片判为通过。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B20-HAND-ACTIVE-MANAGED-WAKE-DIAGNOSTIC-20260901-A
  detail_level: native_failure_and_local_diagnostic_closure
  scope:
    scope_id: B20-HAND-ACTIVE-MANAGED-WAKE-DIAGNOSTIC
    exact_outcome: 真实行动期内原生任务无点击自动启动一次但ai.start失败关闭；补稳定码受限诊断且未重试
    owner_ref: REVIEW-LOG.md#b20-hand-active-managed-wake-diagnostic
  acceptance:
    observations:
      - {check: native_task_wake_without_click, result: pass, detail: one_task_turn_completed_17.426s}
      - {check: authority_evaluation_and_terminal, result: fail, detail: attempted_1_received_1_resolved_0_no_start_no_turn_no_terminal}
      - {check: deliberate_public_message_causality, result: fail, detail: message_after_task_start_actual_earlier_poker_source_unknown}
      - {check: bounded_stop_no_retry, result: pass, detail: one_window_one_queue_no_resend}
      - {check: restricted_failure_diagnostic, result: pass, detail: stable_code_only_no_details_or_free_text}
      - {check: local_regression, result: pass, detail: node_1332_mutations_34_script_browser_35}
      - {check: cleanup, result: partial, detail: revoke_slot_clear_browsers_closed_beta_exit0_ports_clear_three_revoked_downloads_manual_delete_pending}
    result: native_hand_active_start_failed_no_retry_diagnostic_ready_cleanup_partial
  semantic_delta: none
  state: ready_for_new_hand_active_window_with_restricted_failure_code
  claim_limits: [不翻proactive_wake_verified, 不把任务完成当评估完成, 不倒推历史精确错误码, 不声称牌局内公开或实时SLA]
  remaining_blocking: [新窗口精确业务码, 牌局内合法终态, 分段时延, 三份失效下载真人删除, 第二真实AI席, Claude, 异地与四真人UAT]
  next_owner: codex_primary
```

<a id="b21-hand-active-managed-wake"></a>
## B21：新手早期牌局通知启动与跨手合法丢弃（2026-09-01）

### 唯一原生样本与停止裁决

B21没有重试B20已经停止且投递结果确定的窗口。受控beta使用新回环端口55148和新授权，发送器继续固定
既有专用任务`TokenGame 临时单席接入验证`、绝对`codex.exe`及`H:/tokengold`。A/B为两个新隔离浏览器；
开启前确认A席AI为`ON/IDLE`、没有pending intent或active turn。本人在两席Ready前开启最多1次/120秒窗口，
随后才Ready，且窗口开启后没有添加玩家公开消息，避免与扑克来源混淆。

第1手开始时间为`1788260043331ms`。本窗口只产生一次原生queue，没有重试或第二来源；专用任务turn
`01a05c9a-f1c6-79b0-9356-240100e19dad`完成，用时28.810秒。最终页面显示尝试/接收/权威结清
`1/1/1`，因次数上限停止；没有`failure_code`。权威评估开始于`1788260067032ms`，即第1手开始后
23.701秒，距离该手30秒行动截止只剩约6.302秒。terminal在评估开始10.781秒后出现，结果为
`silent/hand_advanced`；当时第2手已开始1.104秒，因此0条AI气泡是合法跨手丢弃的可观察结果，
不是公开成功或实时性通过。

生命周期捕获完整且无丢弃，记录1个评估开始和1个丢弃终态。离线汇总器返回`partial/exit 2`，仅因为
现有SeatAiStore捕获不记录action-window来源行，`missing: [source]`；它仍确认上述start与terminal。
所以23.701秒只能写成“第1手开始到评估开始”，不能冒充精确“来源接收到评估开始”。B20历史窗口的
受限业务码仍为unknown：B21本次start成功且没有错误码，只支持“新手早期来源可以进入评估”的新事实，
不能证明B20必然是`intent_not_found`或任何其他码。

### 实施、验证与清理边界

本批没有修改源码、测试或产品文档之外的实现，也没有重跑Node、变异或脚本浏览器套件；B20的
1332/1332、34/34和35/35仍只是B20既有记录。B21只执行一次真实原生queue与只读证据核对，不能把
任务turn完成28.810秒、整个窗口驻留或模型思考时间相互替代。

收尾已分项完成：服务端撤权、本地`connection:clear`、两页关闭、专用任务回到idle；55148、7802、
51999和16608均无监听，活动槽`.tokengame-private/active-model-connection.json`不存在。内部关停回执为
`normal_close`、`write_acknowledged=true`、`close_succeeded=true`、`run_complete=true`；但直接向承载
`npm run beta`的PTY发送Ctrl+C后外层命令返回exit 1，不能把它写成beta exit 0。浏览器控制台为0 error、
0 warning。

B21新增一份已撤权的167字节下载文件，位于
`output/playwright/b21-hand-active-managed-wake-20260901/.playwright-cli/`；没有删除或绕过既有工具策略。
加上B18、B19各166字节及B20的167字节，当前共四份等待真人手工删除。原始去敏生命周期文件位于
`artifacts/b21-hand-active-managed-wake-20260901/authority-lifecycle.jsonl`，受Git忽略；详细事实包见
`.trellis/tasks/08-26-public-ai-table-talk/research/b21-hand-active-managed-wake-20260901.md`。

### 裁决与下一叶

B21裁决为`native_hand_active_start_and_discard_observed_fast_path_latency_open_cleanup_partial`。它补上了
牌局内第1手早期窗口唯一queue的权威start与唯一合法terminal，但没有牌局内公开结果，不能关闭
`TG-EU-PROACTIVE-WAKE-SPIKE`，也不能将`proactive_wake_verified`翻为true。canonical next leaf是：先在
不改扑克30秒规则和用户宿主模型/推理强度设置的前提下，缩短原生通知fast-path prompt并做有界对比；
再根据对比数据决定继续优化传输，或向用户提出可配置行动时限。当前不直接宣布延长扑克时限。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B21-HAND-ACTIVE-MANAGED-WAKE-20260901-A
  detail_level: native_hand_active_start_terminal_and_timing_boundary
  scope:
    scope_id: B21-HAND-ACTIVE-MANAGED-WAKE
    exact_outcome: 新窗口唯一queue达到1/1/1与权威start/terminal，但因启动过晚跨手合法丢弃且0气泡
    owner_ref: REVIEW-LOG.md#b21-hand-active-managed-wake
  acceptance:
    observations:
      - {check: bounded_native_queue, result: pass, detail: exactly_one_queue_no_retry_or_second_source}
      - {check: authority_start_and_terminal, result: pass, detail: one_start_then_silent_hand_advanced}
      - {check: hand_start_to_evaluation_start, result: observed, detail: 23.701s_with_about_6.302s_left_before_action_deadline}
      - {check: evaluation_start_to_terminal, result: observed, detail: 10.781s_terminal_1.104s_after_hand2_start}
      - {check: public_ai_bubble, result: not_met, detail: zero_bubbles_on_both_pages}
      - {check: restricted_failure_code, result: not_applicable, detail: absent_because_start_succeeded_B20_history_remains_unknown}
      - {check: source_to_start_segment, result: unknown, detail: lifecycle_capture_does_not_record_action_window_source_row}
      - {check: local_regression, result: not_run, detail: no_source_change_or_test_rerun}
      - {check: cleanup, result: partial, detail: authority_slot_browsers_ports_clear_one_new_revoked_download_pending}
      - {check: beta_process_exit_code, result: unknown, detail: internal_close_complete_but_outer_PTY_command_exit_1}
    result: native_hand_active_start_and_discard_observed_fast_path_latency_open_cleanup_partial
  semantic_delta: none
  state: ready_for_native_wake_fast_path_prompt_bounded_comparison
  claim_limits: [不翻proactive_wake_verified, 不把1/1/1或合法丢弃写成牌局内公开, 不把第1手到start冒充来源到start, 不反推B20历史错误码, 不声称beta_exit0, 不声称实时SLA]
  remaining_blocking: [原生通知fast_path_prompt有界对比, 牌局内及时公开终态, 四份失效下载真人删除, 第二真实AI席, Claude, 异地与四真人UAT]
  next_owner: codex_primary
```

<a id="b22-fast-path-native"></a>
## B22：managed fast-path 与一次同手 silent 原生对照（2026-09-01）

### 实现裁决

B22只改变`noticeKind=managed`的固定`LOCAL_CONTROL`通知。两个已校验编号之后立即要求：除宿主强制的
一句极短进度外，不先分析、计划、复述通知、读取文件、查找任务、读取牌桌投影或调用任何其他工具；
第一项工具调用必须立即是已配置`tokengame_table`的`ai.start`，并使用通知中的`intent_id`。`ai.start`
拒绝即停止且不重试；成功后仍只使用返回的本席`model_context`决定一次`silent`或`public_speech`，再以
返回的`turn_id`调用一次`ai.resolve`。通知不携带玩家正文、秘密、模型/强度/权限覆盖，也不改变30秒规则、
权限、传输或生命周期。

未设置`noticeKind`的旧B10路径文本以完整字符串断言逐字不变。新fast-path断言在旧实现上使聚焦测试
37/38、唯一新测试失败（518.9436ms）；最小实现后38/38（531.6411ms）。旧B10 probe为117/117
（1950.1622ms）；发送器5/5与共享probe 8/8变异全部杀掉；两个测试文件合并155/155
（2529.7011ms），独立复核另跑155/155（1922.194ms，wall 2.271s）。这里没有运行浏览器或原生模型，
测试只能证明生成的控制文本和旧路径兼容性，不能证明宿主实际把`ai.start`作为首项工具。

### 唯一原生对照

受控beta使用新随机回环端口53952、两份隔离headed浏览器和既有专用任务。A/B都确认公开范围，A新席连接
激活；开窗前A席AI为`ON/IDLE`、无pending intent或active turn，专用任务为idle。本人在Ready前开启最多
1次/120秒窗口，再让两席Ready；窗口开启后没有添加玩家公开消息。

第一次beta启动因证据目录尚未创建而以`ai_receipt_open_failed`退出1。该失败发生在监听、浏览器、queue和
模型输入之前，来源是启动命令回执，不存在于随后成功样本的生命周期或页面产物；补建明确目录后才开始
唯一真实样本，因此它是载体准备失误，不计通知或模型样本，也没有产生重试额度。

成功批严格只有一次queue，无第二来源、补发或重试。窗口最终尝试/接收/权威结清为`1/1/1`，按
`max_notifications`停止，`failure_code=null`、`cleanup_ok=true`。任务turn
`01a05cc2-4fda-7df3-8cbd-0e9fc9fe49ff`由宿主接口记录为`startedAt=1788262633s`、24.340秒完成；queue精确
投递时刻和任务开始毫秒部分unknown。权威四个关键时点为：

| 事实 | 权威时刻 | 分段 |
| --- | ---: | ---: |
| HAND1 | `1788262631524ms` | 基准；精确action-window source行缺失 |
| `ai.start` | `1788262645233ms` | HAND1后13.709秒 |
| `silent` terminal | `1788262655050ms` | start后9.817秒 |
| HAND2 | `1788262664728ms` | terminal后9.678秒 |

本手行动截止为`1788262661526ms`，所以terminal在截止前6.476秒同手结清。按宿主任务的秒级名义时刻，
HAND1→task约1.476秒、task→start约12.233秒；这两段均受1秒粒度限制。与B21同口径的约9.7秒、约14.0秒、
23.701秒、10.781秒相比，B22名义为约1.5秒、约12.2秒、13.709秒、9.817秒；HAND→start名义缩短
9.992秒。但生命周期仍没有精确source行，任务接口只返回秒级时间且最新turn的`items=[]`，所以首项可见
工具是否为`ai.start`、有无前置其他工具都必须写unknown。该单样本不能把改善全部归因fast-path，也不能
外推为SLA或据此决定传输已无需优化。

权威决策为`silent`、`reason=null`；两页AI气泡均为0。这是同手及时合法终态，不是公开回复。最终两张截图
只证明观察时第8手和0条可见AI气泡；同次浏览器会话的只读console查询返回两页各0 error/0 warning，但
输出目录没有独立console日志，截图本身也不证明该计数。

### 清理、裁决与下一叶

收尾按服务端撤权、`connection:clear`、关闭双浏览器、停止beta执行；活动槽不存在，53952、7802、51999、
55148和16608均无监听，专用任务回到idle。beta内部回执为`normal_close`且
`write_acknowledged/close_succeeded/run_complete=true`；外层PTY因Ctrl+C退出1，不能冒充beta exit0。
B22新增一份已撤权、未读、未删的167字节下载文件；连同B18/B19各166字节、B20/B21各167字节，当前五份
等待真人处理。成功批原始去敏生命周期位于`artifacts/b22-fast-path-native-20260901/`，截图位于
`output/playwright/b22-fast-path-native-20260901/`，均受Git忽略；前置启动失败不在这些成功产物中。
详细事实包见`.trellis/tasks/08-26-public-ai-table-talk/research/b22-fast-path-native-20260901.md`。

B22裁决为`managed_fast_path_retained_native_same_hand_silent_observed_cleanup_partial`。保留fast-path；当前不延长
扑克30秒时限，也不立即重写传输。它只证明一次牌局内通知能在同手截止前得到合法terminal，不翻
`proactive_wake_verified`，不关闭完整主动AI或`TG-EU-PLAYABILITY-GATE`。canonical next leaf从反复性能探针
转向可玩MVP组合缺口：在不强迫模型固定公开的前提下，梳理并实现“朋友建房→连接各自会话AI→牌局内
玩家/AI气泡”的最小可复现验收；第二真实AI席、牌局内公开往返和四真人45分钟UAT仍开放。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B22-FAST-PATH-NATIVE-20260901-A
  detail_level: managed_prompt_regression_and_single_native_same_hand_terminal
  scope:
    scope_id: B22-FAST-PATH-NATIVE
    exact_outcome: managed固定通知加入首项ai.start约束且旧B10不变；唯一原生queue在行动截止前同手silent结清但无公开气泡
    owner_ref: REVIEW-LOG.md#b22-fast-path-native
  acceptance:
    observations:
      - {check: managed_fast_path_red_green, result: pass, detail: red_37_of_38_then_green_38_of_38}
      - {check: legacy_B10_exact_text, result: pass, detail: full_literal_assertion_in_sender_38_and_adjacent_probe_117_pass}
      - {check: focused_mutations, result: pass, detail: sender_5_of_5_and_probe_8_of_8_killed}
      - {check: merged_and_independent_review, result: pass, detail: merged_155_of_155_and_independent_155_of_155}
      - {check: bounded_native_queue, result: pass, detail: exactly_one_queue_final_1_1_1_failure_code_null}
      - {check: native_same_hand_terminal, result: pass, detail: hand_to_start_13.709s_start_to_silent_9.817s_terminal_6.476s_before_deadline}
      - {check: prompt_latency_attribution, result: unknown, detail: source_missing_task_second_precision_single_sample}
      - {check: first_tool_order, result: unknown, detail: native_turn_items_empty}
      - {check: public_AI_reply, result: not_met, detail: silent_reason_null_zero_bubbles}
      - {check: cleanup, result: partial, detail: authority_slot_browsers_ports_clear_one_new_revoked_167_byte_download_pending}
    result: managed_fast_path_retained_native_same_hand_silent_observed_cleanup_partial
  semantic_delta: none
  state: ready_for_playable_mvp_reproducible_acceptance
  claim_limits: [不翻proactive_wake_verified, 不把silent或1_1_1写成公开回复, 不声称首项工具顺序已实证, 不把9.992秒名义改善全归因prompt, 不外推SLA, 不关闭playability]
  remaining_blocking: [朋友可玩组合最小复现, 第二真实AI席, 牌局内公开往返, 五份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: codex_primary
```

<a id="b23-fixed-target-codex-play"></a>
## B23：固定任务去敏与 Codex 当前任务一键本地入口（2026-09-01）

### 固定目标合同与页面验收

服务端发送器新增非枚举的`selectThread`能力，但仍只持有一个预配置任务。调用方省略候选时只返回该固定
任务；显式候选只有精确匹配的合法ID才规范化返回，其他候选在sender选择层返回`null`。进入会话/API时，
畸形`thread_id`先以`invalid_field`拒绝，合法但外来的ID再以`wake_thread_not_authorized`拒绝；sender内部
畸形通知信封仍保持`invalid_configuration`边界。只有提供该能力的sender允许`start`省略`thread_id`；旧/自定义queue继续要求
合法UUID，不能借页面、PATH、玩家正文或任意请求改换任务。任务到席位单占、幂等、历史上限、撤权和清理
围栏均保持原合同。

牌桌轮询及start/status/stop响应删除`thread_id`，只投影无秘密布尔`target_configured`。固定目标时页面隐藏
并禁用任务UUID输入，显示“发送器已固定当前游戏任务，UUID不向页面公开”，请求体完全省略`thread_id`；
`false`或缺失时仍保留旧手填兼容路径。服务端实现聚焦184/184，初始直接变异14/14。独立复核再跑
184/184，并修复失效变异锚点及错误响应可能回显任务ID的缺口；限定变异11/11。

脚本浏览器先以旧夹具运行，并在累计7 checks时按预期失败；测试夹具显式增加`fixedTarget`后最终44/44、约11.40秒，0项
console/page error。固定模式捕获4次start请求，均无`thread_id`；旧手填兼容模式1次携带测试UUID。45个
浏览器可见响应中没有已知任务ID。截图由主线程目检为固定目标提示且无UUID；该批0原生模型、0原生queue，
端口与浏览器上下文已清理。脚本夹具只证明本地页面/API合同，不是原生宿主能力证据。

### 当前任务一键入口

新增首选命令：

```powershell
npm run codex:play -- "<当前 Codex 项目根绝对路径>"
```

入口只读取、校验并小写化`CODEX_THREAD_ID`；`CODEX_SESSION_ID`不参与比较、回退或身份，也不被读取、复制、
输出或持久化。执行顺序固定为唯一绝对项目参数的canonical/仓库包含校验→thread校验→可执行文件只读解析→
原子配置，任一前置失败均为零配置写入。显式非空`TOKENGAME_CODEX_EXECUTABLE`优先且独占，必须是绝对、
存在、非符号链接普通文件，失败不回退PATH。未显式时只支持Windows：按PATH顺序检查第一个实际存在的
`codex.exe`，若该第一候选不可信立即拒绝，不跳后项；canonical路径必须严格位于canonical
`%LOCALAPPDATA%/OpenAI/Codex/bin/<一段非空hex>/codex.exe`。不调用shell、`Get-Command`或`where`；
非Windows必须显式给出可执行文件。

受管项目MCP的`cwd`由绝对repository改为相对当前Codex项目根的路径。配置`changed=true`时入口只输出
不含路径或UUID的重启提示并成功停止，不启动beta；`changed=false`时才在同一进程调用一次`main({env})`。
注入环境从调用环境复制必要非TokenGame键，排除session与原thread键，再强制回环、现有beta约定端口、进程内内核、
无adapter、无receipt及固定的canonical executable/project/thread。调用方敌意`TOKENGAME_*`不能穿透，
`process.env`不被改写，直接`npm run beta`保持原行为。入口不覆盖模型或推理，不自动queue探测、开通知窗、
枚举任务、全局安装或远程监听。

稳定成功/失败输出及受管配置不含任务UUID、session UUID、可执行路径或绝对repository路径。这个边界不等于
操作系统账户隔离：实际短命queue子进程参数与进程元数据仍可能让同系统账户看到目标任务ID。

### 红绿账本、独立复核与裁决

入口红测因模块不存在为0/1；首轮实现后新测试9/9、直接既有项目配置5/5、专用变异9/9。独立审查随后
发现并修复三项实现缺口：beta启动失败可能在收尾时被覆盖成exit 0、受管`cwd`仍持久化绝对路径、畸形
Windows路径矩阵不足。最终一键入口9/9（约0.37秒），beta/config/lifecycle 88/88（约10.55秒），专用
变异15/15（约9.09秒）；Node语法与diff检查通过。一键入口子叶没有运行全量、监听、模型、浏览器或原生
任务；固定目标脚本浏览器已在前节单列且0原生模型/queue，真实`H:/tokengold/.codex`没有被本批修改。

B23裁决为`fixed_target_redacted_codex_current_task_one_command_ready_host_migration_pending`。它只把本机同一
任务接入从页面手填UUID及四变量降为一条当前任务命令；不证明工具已被当前宿主加载、相对`cwd`已由宿主
解析、原生queue/公开/实时性、第二真实AI席、朋友异地联机或四真人试玩。`proactive_wake_verified`保持
`false`，`TG-EU-PROACTIVE-WAKE-SPIKE`和`TG-EU-PLAYABILITY-GATE`均不关闭。

当前唯一下一步需要新授权：在目标Codex任务内运行新命令，让既有绝对`cwd`项目受管块迁为相对值；预计
首次运行只提示重启。宿主重启仍在现有授权排除项，必须由用户明确批准；重启后再运行同一命令，并只做
一次回环、固定目标、最多1次的有界原生验收。未获授权前不直接重启、远程、接第二AI或进入UAT。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B23-FIXED-TARGET-CODEX-PLAY-20260901-A
  detail_level: fixed_target_privacy_and_current_task_local_entry
  scope:
    scope_id: B23-FIXED-TARGET-CODEX-PLAY
    exact_outcome: 固定sender目标从浏览器去敏且一键入口可用当前Codex任务安全配置并同进程启动本地beta；真实宿主迁移与重启尚未执行
    owner_ref: REVIEW-LOG.md#b23-fixed-target-codex-play
  acceptance:
    observations:
      - {check: fixed_target_server_contract, result: pass, detail: focused_184_of_184_initial_mutations_14_of_14_independent_184_of_184_limited_mutations_11_of_11}
      - {check: fixed_target_browser_contract, result: pass, detail: old_fixture_failed_as_expected_at_cumulative_7_checks_then_fixed_fixture_44_of_44_11.40s_zero_console_page_errors}
      - {check: browser_thread_redaction, result: pass, detail: fixed_start_4_without_thread_id_manual_start_1_with_test_UUID_45_visible_responses_zero_known_ID}
      - {check: codex_play_red_green, result: pass, detail: missing_module_red_0_of_1_then_initial_9_of_9_existing_5_of_5_mutations_9_of_9}
      - {check: independent_entry_review, result: pass, detail: final_entry_9_of_9_0.37s_beta_config_lifecycle_88_of_88_10.55s_mutations_15_of_15_9.09s}
      - {check: native_runtime, result: not_run, detail: codex_play_subleaf_zero_listener_model_browser_native_task_and_real_project_config_unchanged_fixed_target_fixture_browser_recorded_separately}
      - {check: host_tool_reload_and_relative_cwd, result: unknown, detail: requires_project_migration_then_explicitly_authorized_host_restart}
    result: fixed_target_redacted_codex_current_task_one_command_ready_host_migration_pending
  semantic_delta: none
  state: waiting_for_project_config_migration_and_host_restart_authorization
  claim_limits: [不翻proactive_wake_verified, 不声称工具已加载或相对cwd已由宿主解析, 不声称原生queue公开实时性, 不声称系统账户不可见任务ID, 不关闭playability]
  remaining_blocking: [用户授权项目配置迁移与宿主重启, 一次固定目标有界原生验收, 第二真实AI席, 牌局内公开往返, 五份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: user_authorization_then_codex_primary_project_migration_restart_and_one_bounded_native_acceptance
```

<a id="b24-project-config-migration"></a>
## B24：项目配置相对化迁移（重启前，2026-09-01）

用户以`DEC-20260901-001`明确授权迁移`H:/tokengold/.codex/config.toml`的TokenGame托管项目块，并允许随后一次
Codex宿主重启。迁移前只读检查确认当前任务标识格式有效、Codex应用入口可解析、托管起止标记各一个，
`cwd`仍为绝对仓库路径，7802无监听。决策记录先于写入落盘。

随后在`H:/tokengold/tokengame`运行一次`npm run codex:play -- "H:\tokengold"`。命令exit 0，只输出不含
路径或UUID的重启提示，并在beta启动前停止。迁移后托管块仍唯一，`cwd = "tokengame"`；目标文件的托管块外
SHA-256前后均为`E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855`，即本文件当前没有块外
内容且没有发生块外改写。配置中未发现绝对仓库路径、任务UUID或绝对可执行路径，7802仍无监听。

本批0原生模型输入、0queue、0浏览器、0通知。配置字节迁移已通过直接检查；宿主重启、工具重载、相对
`cwd`实际解析和固定目标原生通知均尚未观察，不能以迁移成功代替运行时通过。下一步由用户手动重启Codex，
返回同一任务后重跑同一命令，再执行一次回环、固定目标、最多1次通知的有界验收。

```yaml
evidence_slice:
  scope: B24-project-config-migration-before-restart
  authorization_ref: PROJECT-DECISION-LOG.md#DEC-20260901-001
  observations:
    - {check: active_entrypoint_first_run, result: pass, evidence: npm_run_codex_play_exit_0_restart_message_beta_not_started}
    - {check: managed_relative_cwd, result: pass, evidence: cwd_equals_tokengame_single_managed_block}
    - {check: unmanaged_bytes_preserved, result: pass, evidence: outside_block_sha256_equal_before_after}
    - {check: stable_config_redaction, result: pass, evidence: no_absolute_repository_no_UUID_no_absolute_executable}
    - {check: beta_listener, result: pass, evidence: port_7802_not_listening_after_command}
    - {check: host_restart_and_tool_reload, result: not_run, evidence: waiting_for_user_manual_restart}
  claim_limit: 仅证明项目配置迁移与首次入口停止合同；不证明宿主已加载、相对cwd运行时解析或原生通知。
  next_owner: user_manual_codex_restart_then_codex_primary_one_bounded_native_acceptance
```

<a id="b25-relative-cwd-host-failure"></a>
## B25：Codex Desktop 相对 `cwd` 运行时失败与本地修复（2026-09-01）

### 重启、工具加载与同任务对照

`DEC-20260901-001`授权的一次真人手动重启已经执行。`H:/tokengold/.codex/config.toml`写于
22:17:10.846；本批只读进程事实显示新的Codex与ChatGPT进程分别创建于22:23:40.558和22:23:49.649，
均晚于配置写入，故“是否真的重启”不再是unknown。`codex mcp list --json`能列出启用的
`tokengame_project`、`node`、`src/run-project-mcp.cjs`及相对`transport.cwd = tokengame`；这只证明CLI
识别配置，不证明Desktop启动了服务器或把工具注入任务。

重启后当前任务在beta启动前后均没有`tokengame_table`。同一任务的既有会话记录则显示：B23相对化之前，
旧canonical绝对仓库`cwd`配置下曾实际调用`mcp__tokengame_project__tokengame_table`，一次
`view.projection`返回`model_connection_unavailable`；该受限错误直接证明当时工具面已加载，只是活动槽
尚未激活。因此本批排除了“没有重启”“任务不同”和“只差连接文件”，把失败收敛为当前Codex Desktop
不能可靠从相对`cwd`加载该项目MCP。配置被列出不能替代工具可调用证据。

### 固定目标真实页面与零通知停止

在仓库根第二次运行`npm run codex:play -- "H:\tokengold"`，配置未变化，入口成功启动回环beta于7802；
横幅仍为进程内内核、无adapter、`managed_wake=available`、`proactive_wake_verified=false`，启动本身不通知。
两份隔离Chromium完成A建房、B按邀请码加入及各自公开范围确认；A打开连接区，确认AI可读自己的底牌和
公开牌局/聊天并公开发言，但不能下注、准备或亮牌，随后下载并激活一次本席连接。

主线程实际目检截图`output/playwright/.playwright-cli/page-2026-09-01T14-38-01-665Z.png`：页面明确显示
发送器固定当前游戏任务、UUID不向页面公开，通知上限1次、窗口60秒。激活后当前任务仍无工具，故按
就绪停止条件没有勾选开窗、没有让两席Ready、没有公开来源或重投。实际消费为0通知、0原生模型回合、
0queue、0权威`ai.start/ai.resolve`。

清理按页面服务端撤权→`npm run connection:clear`→关闭两浏览器→SIGINT停止beta执行。撤权后页面回执
明确旧文件不能发起后续请求；本地活动槽不存在，7802无监听。beta报告端口释放和定时器停止，外层PTY
exit1只对应Ctrl+C，不能写成beta自然exit0。本批新增一份166字节、已撤权、未读、未删的下载文件；连同
历史五份等待真人处理。

### 本地修复、独立复核与裁决

生成器把受管`cwd`恢复为`resolveCodexProject`得到的canonical仓库绝对目录。旧相对受管块会原子迁移，
托管块外用户配置逐字节保持；首次变化仍只给去敏重启提示并停止，重复运行才启动beta。稳定CLI/UI输出
不回显本机路径或任务ID。文档明确绝对目录只是本机stdio启动位置、不是凭据，但会暴露本机目录布局；
真人生成的上层项目配置不得分享或提交Git。仓库跟踪的`cwd = "."`仅为可移植模板，不是运行态证据。

实现红测20/23，3个失败分别命中旧相对预期；修复后聚焦34/34，定向变异
`codex-play-config-falls-back-to-relative-cwd`为1/1 killed，Node语法通过。独立Trellis复核发现并修正四份
文档缺少目录布局/禁止分享提交警告、README把B23历史状态写成当前状态，以及新增文档断言不容忍Markdown
换行的误报。复核初轮23/24，修正后24/24（Node 629.6933ms，整体703ms）；同一变异1/1 killed
（906ms），3文件语法177ms，范围diff检查133ms。项目没有lint或type-check脚本。真实
`H:/tokengold/.codex/config.toml`未再次修改，Codex未第二次重启，服务/浏览器/模型/queue/通知均未由
修复与复核阶段启动。

B25裁决为`codex_desktop_relative_mcp_cwd_runtime_load_failed_before_notification`。这是L3/L4可逆技术纠错，
不改变已确认L0–L2语义。`proactive_wake_verified=false`，`TG-EU-PROACTIVE-WAKE-SPIKE`与
`TG-EU-PLAYABILITY-GATE`保持开放。`DEC-20260901-001`的一次迁移与一次重启已用完；把真实父项目受管块
恢复为绝对`cwd`并进行第二次手动重启必须取得新授权。获准后才重跑同一入口并继续原定最多1次的固定目标
原生验收。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B25-RELATIVE-CWD-HOST-FAILURE-20260901-A
  detail_level: host_runtime_failure_and_local_absolute_cwd_repair
  scope:
    scope_id: B25-RELATIVE-CWD-HOST-FAILURE
    exact_outcome: 已确认重启后的相对cwd服务器只被列出而未加载工具；唯一通知未使用；本地生成器恢复canonical绝对cwd并通过独立复核，真实父项目尚未修复
    owner_ref: REVIEW-LOG.md#b25-relative-cwd-host-failure
  acceptance:
    observations:
      - {check: authorized_manual_restart, result: pass, detail: config_write_22_17_10_then_new_codex_22_23_40_and_chatgpt_22_23_49}
      - {check: relative_config_discovery, result: pass, detail: codex_mcp_list_recognized_enabled_server_with_relative_tokengame_cwd}
      - {check: current_task_tool_load, result: fail, detail: tokengame_table_undefined_before_and_after_beta_while_same_task_old_absolute_cwd_had_called_tool}
      - {check: fixed_target_real_page, result: pass, detail: two_isolated_browsers_fixed_target_UUID_hidden_max_1_window_60s_screenshot_visually_checked}
      - {check: native_notification, result: not_run, detail: readiness_failed_before_window_zero_notification_model_queue_or_authority_evaluation}
      - {check: cleanup, result: pass, detail: server_revoked_local_slot_cleared_two_browsers_closed_beta_stopped_port_7802_free_one_new_revoked_166_byte_download_retained}
      - {check: local_absolute_cwd_repair, result: pass, detail: red_20_of_23_then_green_34_of_34_mutation_1_of_1_syntax_pass}
      - {check: independent_review, result: pass, detail: initial_23_of_24_doc_regex_false_negative_then_24_of_24_629.6933ms_mutation_1_of_1_906ms_syntax_177ms_scoped_diff_133ms}
      - {check: real_project_absolute_remigration_and_second_restart, result: not_run, detail: requires_new_user_authorization}
    result: relative_cwd_runtime_failed_absolute_cwd_local_repair_ready_host_remigration_restart_authorization_pending
  semantic_delta: none
  state: waiting_for_user_authorization_for_real_project_absolute_cwd_remigration_and_second_manual_restart
  claim_limits: [不翻proactive_wake_verified, 不把配置列表识别写成工具加载, 不把本地修复写成宿主恢复, 不声称通知或原生模型已运行, 不关闭playability]
  remaining_blocking: [新授权迁移真实父项目配置与第二次重启, 一次固定目标有界原生验收, 第二真实AI席, 牌局内公开往返, 六份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: user_authorization_then_codex_primary_real_config_repair_restart_and_one_bounded_native_acceptance
```

<a id="b26-absolute-cwd-real-config-migration"></a>
## B26：真实项目绝对 `cwd` 迁移完成，等待第二次手动重启（2026-09-01）

### 授权、执行与配置边界

用户通过`DEC-20260901-002`明确允许只把`H:/tokengold/.codex/config.toml`中TokenGame唯一托管块的
`cwd`恢复为`H:/tokengold/tokengame`，其他配置不变，并由用户再次手动重启Codex。迁移前只读核对：
目标为普通非链接文件，291字节，托管标记1/1，相对`cwd`存在、目标绝对`cwd`不存在，配置无任务UUID和
绝对`codex.exe`，7802无监听；完整SHA-256为
`4C48CABF471B24D7ADEFEAD8B66B78553EF2A0CD3BB526AB1E0897EFFBA5655F`，托管块外SHA-256为
`01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`。

当前任务从仓库根执行一次`npm run codex:play -- "H:\tokengold"`，exit 0且只返回去敏的“已配置、请重启”
提示。入口复用B25已验证的原子配置器，在配置变化后于beta前停止；没有再执行第二次入口，避免在尚未重启的
宿主上下文中启动验收。

迁移后目标为304字节，托管标记仍为1/1；`cwd = "H:/tokengold/tokengame"`精确存在，旧
`cwd = "tokengame"`不存在。完整SHA-256变为
`63EB0B67B285B59E30692B50795546ABD87B6D59403AD9E9183E16117D9C769E`，托管块外SHA-256仍精确为
`01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`；因此授权外配置字节没有变化。
迁移后目标绝对`cwd`只出现1次；把它替换回旧相对值可精确重构迁移前完整SHA-256，进一步证明整份配置
只存在本次授权的一个字符串差异。配置继续无任务UUID和绝对Codex可执行路径，7802无监听。没有新建外部备份；本次使用已验证的同目录临时文件、
fsync与原子rename发布，迁移前后哈希和Git内回执构成边界证据。

### 验证边界与裁决

本批不补跑Node、变异或浏览器测试；B25已经验证生成器及失败停止合同，本次只验证授权后的真实配置执行。
实际消费为0通知、0原生模型回合、0queue、0权威评估、0浏览器和0监听。Codex未由本批自动重启，
`tokengame_table`是否在第二次重启后恢复仍是`not_run`；配置字节正确不能替代宿主工具就绪证据。

B26裁决为`absolute_cwd_real_config_migrated_waiting_for_second_manual_restart`。本批完成
`DEC-20260901-002`的配置写入部分，不改变L0–L2语义，也不翻转`proactive_wake_verified=false`或
`TG-EU-PLAYABILITY-GATE`。当前唯一恢复点是用户手动重启Codex、返回同一任务并说“继续”；随后Primary先直接
核对`tokengame_table`，只有工具就绪才启动原定一次回环、固定目标、最多1次通知的有界原生验收。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B26-ABSOLUTE-CWD-REAL-CONFIG-MIGRATION-20260901-A
  detail_level: exact_real_config_migration_before_manual_restart
  scope:
    scope_id: B26-ABSOLUTE-CWD-REAL-CONFIG-MIGRATION
    exact_outcome: 真实父项目TokenGame唯一托管块已从相对cwd原子迁移为canonical绝对仓库cwd；托管块外哈希未变，入口在beta前停止
    owner_ref: REVIEW-LOG.md#b26-absolute-cwd-real-config-migration
  acceptance:
    observations:
      - {check: explicit_authorization, result: pass, detail: DEC_20260901_002_exact_managed_cwd_only_and_user_manual_restart}
      - {check: entrypoint_migration, result: pass, detail: npm_run_codex_play_exit_0_redacted_restart_message_beta_not_started}
      - {check: managed_absolute_cwd, result: pass, detail: one_begin_one_end_absolute_target_present_relative_value_absent}
      - {check: unmanaged_bytes_preserved, result: pass, detail: outside_sha256_01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B_before_and_after}
      - {check: stable_config_redaction, result: pass, detail: no_thread_UUID_no_absolute_codex_executable}
      - {check: runtime_side_effects, result: pass, detail: zero_listener_browser_notification_model_queue_or_authority_evaluation}
      - {check: second_manual_restart, result: not_run, detail: waiting_for_user}
      - {check: post_restart_table_tool_readiness, result: not_run, detail: must_be_checked_directly_after_restart}
    result: absolute_cwd_real_config_migrated_manual_restart_and_direct_tool_readiness_pending
  semantic_delta: none
  state: waiting_for_user_manual_codex_restart
  claim_limits: [不把配置迁移写成宿主重载, 不声称tokengame_table已恢复, 不声称通知或模型运行, 不关闭playability]
  remaining_blocking: [第二次真人手动Codex重启, 重启后直接工具就绪核对, 一次固定目标有界原生验收, 第二真实AI席, 牌局内公开往返, 六份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: user_manual_codex_restart_then_codex_primary_direct_tool_readiness_and_one_bounded_native_acceptance
```

<a id="b27-absolute-cwd-post-restart-fixed-target"></a>
## B27：绝对 `cwd` 重启后工具恢复；固定当前任务通知被接收但未结清（2026-09-01）

### 重启与直接工具证据

用户完成`DEC-20260901-002`内约定的第二次手动Codex重启后，当前任务的可调用工具面实际出现且只出现
`mcp__tokengame_project__tokengame_table`。在没有活动连接文件时直接调用`view.projection`，工具返回
`model_connection_unavailable`；这同时证明项目MCP已由绝对`cwd`加载、默认权限仍失败关闭。它比CLI
“能列出服务器”更强，关闭了B25/B26留下的宿主工具就绪缺口。

随后从仓库根运行`npm run codex:play -- "H:\tokengold"`。稳定配置没有再次触发迁移，入口启动回环
beta于7802，保持进程内内核、无额外模型adapter、managed wake可用及
`proactive_wake_verified=false`。两个隔离headed Chromium会话完成A建房、B加入及各自公开范围确认；
牌桌保持第0手等待区，没有Ready、开手或下注。A按具体权限确认下载并激活一份连接文件；激活后原生
`view.projection`成功，页面显示协调器收到本席宿主请求。

### 唯一通知与载体边界

A为发送器固定的当前游戏任务开启最多1次、60秒通知窗口，B只发送一条合成公开来源。窗口最终为
尝试1、已接收1、权威结清0，在60.003秒时以`max_duration`停止；原始投影同时给出
`cleanup_ok=true`、`failure_code=null`、`native_turn_state=unknown`。A/B都只看到真人来源，0条AI气泡。

当前固定目标就是正在执行本批开发的同一Codex任务。同期只读任务状态显示它始终处于本开发回合的
`inProgress`；观察窗口内没有出现可重入的新模型回合、`ai.start`、`ai.resolve`或合法终态。这里的直接
事实是“通知被运行中的任务接收，但60秒内没有权威结清”；同一活动任务的精确排队或延后执行规则仍为
`unknown`。因此不能把1/1写成主动AI成功，也不能把0结清归为扑克、模型推理或回答内容失败。按不确定发送
计数规则，该唯一额度已经消耗，没有补发；Primary也没有手工领取待办来伪造闭环。

### 页面检查、清理与裁决

Primary直接查看两份最终截图和`render_game_to_text`；A页的1/1/0、60.003秒到限与B页真人消息一致，
两页控制台均0 error、0 warning。本批没有改产品源码，也没有补跑Node、变异或脚本浏览器套件。

收尾依次执行服务端撤销、`npm run connection:clear`、撤销后原生`view.projection`再次得到
`model_connection_unavailable`、关闭两浏览器和SIGINT停止beta。beta报告端口与定时器已清，外层PTY
exit1只表示Ctrl+C；最终活动槽不存在且7802无监听。已接收通知不能撤回，但撤销与清槽使其迟到执行时
无法取得有效席位连接并公开。本批新增一份已撤权、未读、未删下载；按仓库内精确文件名模式只读计数，
累计7份、1165字节，继续由真人决定删除。

B27裁决为
`absolute_cwd_host_tool_recovered_fixed_target_notification_accepted_self_target_busy_unresolved`。
`DEC-20260901-002`现已完整执行，不再迁移配置或要求重启。B27关闭宿主加载缺口，但不关闭
`TG-EU-PROACTIVE-WAKE-SPIKE`、`TG-EU-PLAYABILITY-GATE`或翻转`proactive_wake_verified`。后续不在
正在运行的开发回合上重试同类通知；朋友组合验收应由各玩家的空闲游戏任务承接通知，并继续以权威start与
唯一terminal判定成功。详细事实包见
`.trellis/tasks/08-26-public-ai-table-talk/research/b27-absolute-cwd-post-restart-fixed-target-20260901.md`。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B27-ABSOLUTE-CWD-POST-RESTART-FIXED-TARGET-20260901-A
  detail_level: direct_host_tool_readiness_and_one_bounded_self_target_notification
  scope:
    scope_id: B27-ABSOLUTE-CWD-POST-RESTART-FIXED-TARGET
    exact_outcome: 绝对cwd重启后当前任务直接加载项目MCP；一次固定当前活动任务的通知被接收但60秒内未权威结清，随后失败关闭并完整清理本批资源
    owner_ref: REVIEW-LOG.md#b27-absolute-cwd-post-restart-fixed-target
  acceptance:
    observations:
      - {check: second_manual_restart_and_tool_load, result: pass, detail: exactly_one_tokengame_project_tool_and_unbound_view_returned_model_connection_unavailable}
      - {check: stable_codex_play_entry, result: pass, detail: loopback_in_process_beta_started_without_config_migration_or_model_override}
      - {check: two_browser_fixed_target_ui, result: pass, detail: two_isolated_headed_sessions_public_scope_fixed_target_UUID_hidden_console_0_error_0_warning}
      - {check: bounded_notification, result: partial, detail: attempted_1_queued_1_resolved_0_stopped_max_duration_60.003s_failure_code_null_native_turn_unknown}
      - {check: reentrant_native_turn, result: not_observed, detail: fixed_target_was_same_inProgress_development_task_exact_queue_scheduling_unknown}
      - {check: authority_terminal_or_public_reply, result: fail, detail: zero_start_zero_resolve_zero_AI_bubble_no_retry}
      - {check: cleanup, result: pass, detail: server_revoked_slot_cleared_post_clear_MCP_failed_closed_two_browsers_closed_beta_stopped_port_7802_free}
      - {check: regression_suites, result: not_run, detail: no_product_source_change}
    result: host_tool_recovered_notification_transport_accepted_end_to_end_unresolved_on_active_self_target
  semantic_delta: none
  state: host_config_complete_playability_and_idle_game_task_combination_acceptance_open
  claim_limits: [不把queue接收写成模型回合或主动AI通过, 不把0结清归因扑克或模型, 不翻proactive_wake_verified, 不重复同一活动任务通知, 不关闭朋友UAT]
  remaining_blocking: [空闲游戏任务上的朋友组合验收, 第二真实AI席, 牌局内真实公开往返与实时体验, 七份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: codex_primary_local_friend_uat_readiness_without_same_active_task_retry
```

<a id="b28-idle-game-task-handoff"></a>
## B28：把空闲游戏任务前提写成入口、本人确认与 Skill 合同（2026-09-02）

### 从 B27 事实到本地修补

B27 已直接证明项目工具加载恢复，但固定当前开发任务的唯一通知只到尝试/接收/权威结清 `1/1/0`；目标任务
同期仍在执行本回复。精确 queue 调度规则仍为 `unknown`，因此 B28 没有编造宿主机制或重试通知，而是修正
可控的产品缺口：启动说明此前没有阻止用户让同一游戏任务持续回复、轮询或开发，同时又期待它并发处理通知。

`src/run-beta.cjs`、固定目标 Web 说明和本人确认现在共同要求目标任务先结束当前回复并保持空闲，并明确
“已接收”不等于模型开始或权威结清。项目 Skill 进一步要求启动回复结束后把任务交还为空闲，不在同一回合
看守页面或等待对手；根 README、插件 README 与 managed wake 操作说明同步。该确认只是用户声明，不是
任务空闲遥测或技术门禁；没有增加调度器、模型 API、任务创建或后台循环，也没有改变 L0–L2 语义。

### 测试、载体与清理

新增/扩展真实 beta 启动横幅、文档/Skill 一致性和固定目标浏览器断言。聚焦 Node 首轮 19 项中 1 项因
插件 README 的同义措辞未满足精确合同而失败，统一措辞后最终 `19/19`、`1833.6463 ms`。脚本浏览器
`46/46`、`20729.272 ms`，0 browser error，四个上下文、浏览器和夹具共 6 项清理通过；Primary 直接查看
桌面固定目标页及 320 px 页，说明、本人确认和控件顺序可见且无横向溢出。完整 `npm test` 最终
`1356/1356`、0 fail，`79933.5359 ms`。本批没有运行变异门禁，项目没有 lint/type-check 脚本。
持久化恢复文档后，同一聚焦套件再跑 `19/19`、`1705.2711 ms`，UTF-8 Skill 校验再次有效；这只是
收尾一致性复核，不另计产品覆盖。

Skill 普通校验首次因 Windows Python 用 GBK 解码 UTF-8 文件而失败；同一校验器加 `python -X utf8` 后
返回 `Skill is valid!`。这是载体编码问题，不归因 Skill 或 Dual。相关 JavaScript 语法检查通过；
`git diff --check` 仅有既有 `plugin.json` 的行尾提示。最终活动槽不存在，7802 无监听；本批实际消费
0 通知、0 queue、0 原生模型回合、0 权威评估。仓库外浏览器证据位于
`H:/tokengold/.codex/b28-idle-task-guidance-20260902-a1/`。

B28 裁决为 `idle_game_task_handoff_guidance_implemented_and_locally_verified`。它关闭入口/说明没有表达空闲
任务前提的本地缺口，不关闭真实朋友组合、主动唤醒或实时性；`proactive_wake_verified=false`，
`TG-EU-PROACTIVE-WAKE-SPIKE`与`TG-EU-PLAYABILITY-GATE`继续开放。详细事实包见
`.trellis/tasks/08-26-public-ai-table-talk/research/b28-idle-game-task-handoff-20260902.md`。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B28-IDLE-GAME-TASK-HANDOFF-20260902-A
  detail_level: local_entry_ui_skill_and_docs_handoff_contract
  scope:
    scope_id: B28-IDLE-GAME-TASK-HANDOFF
    exact_outcome: 空闲游戏任务前提已进入启动横幅、固定目标页面本人确认、项目Skill和操作文档，并通过聚焦、浏览器及全量Node回归
    owner_ref: REVIEW-LOG.md#b28-idle-game-task-handoff
  acceptance:
    observations:
      - {check: beta_startup_guidance, result: pass, detail: managed_banner_requires_current_reply_end_task_idle_and_discloses_no_concurrent_settlement}
      - {check: fixed_target_web_consent, result: pass, detail: hint_and_each_window_human_acknowledgement_require_target_can_accept_new_turn}
      - {check: skill_and_docs_parity, result: pass, detail: accepted_queue_not_model_started_or_authority_settled}
      - {check: focused_node, result: pass, detail: initial_18_of_19_exact_wording_failure_then_19_of_19_1833.6463ms}
      - {check: scripted_browser, result: pass, detail: 46_of_46_20729.272ms_zero_browser_errors_six_cleanup_items_passed_desktop_and_320px_visually_checked}
      - {check: full_node, result: pass, detail: 1356_of_1356_79933.5359ms_zero_fail_cancel_skip_todo}
      - {check: skill_validator, result: pass_with_carrier_note, detail: default_GBK_decode_failed_then_same_validator_python_X_utf8_skill_valid}
      - {check: native_model_or_queue, result: not_run, detail: zero_notification_queue_native_turn_or_authority_evaluation}
      - {check: cleanup, result: pass, detail: active_slot_absent_port_7802_zero_listener_browser_fixture_cleanup_6_of_6}
    result: idle_game_task_handoff_guidance_implemented_and_locally_verified
  semantic_delta: none
  state: local_friend_uat_idle_task_instructions_ready_real_combination_acceptance_open
  claim_limits: [页面确认不是宿主空闲遥测, 不把queue接收写成模型开始或权威终态, 不翻proactive_wake_verified, 不声称朋友组合或异地联机通过]
  remaining_blocking: [空闲游戏任务上的真实朋友组合验收, 第二真实AI席, 牌局内真实公开往返与实时体验, 七份失效下载真人删除, Claude, 异地与四真人UAT]
  next_owner: user_or_codex_primary_real_idle_game_task_combination_when_explicit_task_workflow_is_available
```

<a id="b30-two-friend-remote-candidate"></a>
## B30：两好友远程私人房候选与 Web 工作区（2026-09-03）

### 授权、实现和当前边界

用户明确同意按既定计划尽快做出两好友 MVP，好友可在需要真实联通时参与，服务器与公开大厅留在后面。
本轮只在既有 2–4 席权威栈上实现两好友阶段：房主显式配置 HTTPS 根地址，双方各用本机出站连接器接入
自己的 Codex 游戏任务；外部 Web 分为私人牌桌和独立配置中心。没有增加第二个扑克权威、付费模型 API、
AI 下注、大厅或 Claude 实机支持。详细步骤与真人验收条件见 `docs/REMOTE-FRIEND-MVP.md`。

`beta:remote` 仍只绑定回环地址，公网隧道由真人另行选择和启动；Host/Forwarded 请求头不决定公共地址。
`codex:connect` 连接已有牌桌，区别于另起本地桌的 `codex:play`。项目 Skill 与两份 README 已同步这一区别，
避免好友各自开出互不相通的房间。注册成功不等于本人授权开窗，queue 接收不等于原生模型开始或权威结清。
从旧版升级时，已有 MCP 进程仍运行旧代码，即使配置没变也需真人手动重启 Codex 一次；这与后续连接
文件的热切换不同。这里只补充正确操作说明，没有实际重启宿主或改项目配置。

牌桌恢复双人优先的工作区布局：玩家与 AI 相邻、公共牌居中、本人底牌在下、右侧保留公开时间线；
配置导航复用原有连接控件与状态，不离席、不换发绑定、不续授权。桌面 1365×800 的本人底牌、合法动作、
展开的加注输入与确认按钮均经真实几何/命中检查可见；320/390 px 的导航与邀请码不横向溢出。
这是自有 TokenGame Web 页面，不是 Codex 内嵌窗口或对第三方界面源码的复用。

### 独立上下文复核与修正

按项目 Trellis 流程由独立代理上下文检查，随后由主线程整合验收；这是同一开发环境内的分工，
不是 Claude 复审，也不声称使用了已独立验证身份的不同模型。

- 原生任务 UUID 曾会进入远程请求，现改为稳定、不透明的 `target_id`；原生 ID 只传本机发送器。
  不把别名描述成密码学会话隔离，同一项目的活动槽仍只能服务一个玩家。
- poll 返回后的取消、撤权/文件换发均有发送前围栏；同一通知至多一次 queue 尝试。ACK 响应体断网可
  重试同一 ACK，不重新发送通知；已出站但未确认的清理继续标为未知，不能自动补发或报干净结束。
- URL 必须在归一化前满足根地址约束，拒绝路径、反斜杠、控制字符等；显式公共地址强制 HTTPS，
  携带令牌的 HTTP/MCP 请求不自动跟随重定向。
- 后台连接入口只有收到肯定 IPC ready 才能报接入；正常撤权退出与未就绪取消已用真实 Node 子进程覆盖，
  没有调用真实 Codex queue 或更改宿主配置。
- 新错误工厂和兜底出码进入注册表；更新旧变异锚点。两条旧鉴权变异原本会引用重构后不可见的 `body`，
  导致 `ReferenceError` 假杀，现由实际版本泄漏/命令回显断言杀掉，不扩大宿主中立导入豁免。

### 已执行验证与失败记录

以下计数互有重叠，不能相加当作产品完成度。分工回归的最终回执为：远程相关 Node `420/420`、
`10.232 s`；退出码最后修正后入口/错误码/架构 `69/69`、`1.370 s`；新 B30 10 条、旧错误码 15 条、
同步旧锚点 10 条变异均有效杀掉，合计 `35/35`、0 存活/未评估，约 `55.4 s`。一条故意隐藏就绪文本的
反例等待约 `28.6 s`，这是测试超时成本，不是模型推理耗时。对应 223 个锚点存在且唯一，13 个实现模块
语法通过；仓库无独立 lint/type-check 脚本。

UI 分工验收：Node `117/117`；managed 浏览器 `75/75`、0 error、`16638.1123 ms`，8 项清理通过；
model-binding 浏览器 `51/51`、0 error、约 `7.634 s`。主线程直接读取 managed 报告并目检桌面游戏页和
配置页，报告为 `H:/tokengold/.codex/b30-workspace-20260903-final/report.json`。这些均为本地脚本环境。

主线程新增真实产品启动入口 + 两独立浏览器 + 两个 Connector + HTTP broker/模型命令面的整合脚本，
只有本机 sender 和生成内容用明确的脚本替身。首轮错误地只创建 TableWebHost、漏接权威到期驱动，
7 项检查后等待 Ready 超时，0 浏览器错误且 7 项清理完成；该失败是验收外壳缺失，不是产品不自动发牌。
修正为复用 `startBeta` 后 `18/18`、`11972.7291 ms`；进一步补上存储内任务 ID 金丝雀，最终仍
`18/18`、`10551.8492 ms`、0 浏览器错误、7 项清理通过。两席各一次脚本发送和 ACK，双方均见两条
AI 气泡，正常下一手、刷新恢复和撤权均走普通页面入口。最终产物：
`H:/tokengold/.codex/b30-remote-friend-browser-20260903-final/report.json`，截图由主线程目检。

既有四页长程验收首轮在第 8b 节自愿亮牌前失败：110 项中 109 通过，手工弃牌仅 2 次而预期 3 次，
随后未在 8 秒内看到赢家亮牌窗口；四页控制台及意外网络错误均为 0。步骤已记录第 3 手，但中止汇总
`hands_reached=0` 来自仅在末尾更新的字段，不能当作“没有开手”。原始失败保留在
`H:/tokengold/.codex/b30-table-web-acceptance-20260903-a1/result.json`。后续把亮牌验收改为正常页面动作推进
后的全新一手，要求四席、版本 1、唯一行动者与足够的剩余时间；逐次核对三次弃牌请求被权威接受，
先完成 3 秒亮牌窗口内的断言，再截图，不延长产品行动或亮牌时限。a1 具体自动弃牌者仍为 unknown。

第二次长程 b1 跑到第 13 手，201/204、未中止、0 浏览器错误，约 415.182 秒，三个失败分别是：
滚动区未画出的子气泡矩形被算入遮挡；测气泡退出前选到已过期样本；开手后席位 797 的基线漏算了底池 3，
之后正常合计 800 被误判成凭空发筹码。该轮自愿亮牌的三次普通弃牌、四页可见、幂等重放和冲突拒绝均通过。
原始结果保留在 `H:/tokengold/.codex/b30-table-web-acceptance-20260903-b1/result.json`。
测试修正只使用浏览器实际 overflow 祖先裁剪，并保留每个有气泡席位的正面积/可读性及真实遮挡反例；
每个视口和退出观察使用新近接受的普通聊天样本；筹码沿用早先同四席、有限且为正的已核对 800 基线，
不重新取当前值作为期望、不放宽守恒断言。中止汇总只读最终可观察手数，读取失败写 unknown。
第三次长程 b2 为 209/211、到第 13 手、未中止、0 浏览器错误，472.008 秒；两条失败均来自切换窄屏、
截图之后气泡已过期的空样本，非空/可读性防线正确报红。新普通消息的接受→出现→约 11.139 秒后退出→
时间线保留已通过，筹码固定基线也通过。四上下文、浏览器和本次服务器已关闭。
原始结果为 `H:/tokengold/.codex/b30-table-web-acceptance-20260903-b2/result.json`；分工还发现最终手数采样
被误放在第 12 节而非 main finally，提前中止路径与末阶段耗时仍需修正并复验，不能把 b2 当最终版通过。
最终长程 b3 在修正后的冻结测试字节上完整通过：`215/215`、`aborted=null`、实际到第 13 手（不是已结算
13 手）、`533588 ms`，四页控制台/页面及故意故障窗口外的网络错误均为 0；16 条故意故障和 1 条客户端
主动撤回单列。四上下文、浏览器和自有服务已关闭，清理 155 ms，61007 无监听。主线程直接读取结果和时序
文件：main finally 读到 Alice/Carol 为第 13 手，已关闭的 Bob、已回入口的 Dave 为 unknown，末阶段耗时
为 5 ms。报告为 `H:/tokengold/.codex/b30-table-web-acceptance-20260903-b3/result.json`，27 张截图由分工
核对，主线程另直接目检双人游戏/配置及长程窄屏截图。此前失败均保留，不把某次失败的通过部分冒充最终版。
main 提前失败的实际 VM 路径增加 4 项回归，先 4 项全红、修后与周边合计 `107/107`、`567.0508 ms`，
并增加 3 条 finally 变异。最终 driver SHA-256 为 `8315be7f09be457f8de6f9ba834fe3387b78fd572c9b50a9d5c51e069aac0c23`。

第一次完整 `npm run gate` 在
`H:/tokengold/.codex/b30-gate-snapshot-20260903-a2` 的同字节隔离副本执行，Node 为
`1453/1453`、0 失败/取消/跳过/todo、`141854.5062 ms`；693 条变异为 689 杀掉、3 存活、1 未评估，
整轮 exit 1、`965207.6462 ms`。四项都属于验证定义问题而非产品实现失败：userinfo 旧变异被另一道等价校验继续拒绝；
multi-hand 导入锚点漏同步；Host 头旧变异改写了已不再参与输出的字段；旧手亮牌前置被后续同条件再次阻断。
没有把这次失败写成完整门禁通过，也没有删除产品防线来迁就变异。

四份规格改为真正可到达的错误，其中亮牌测试新增一页滞后、一页超前、四页同旧手三个边界。在全新 a3
同字节副本，当前四文件聚焦测试 `108/108`、`1347.0859 ms`；四份受影响规格依次为 10、46、22、5 条，
合计 `83/83` 杀掉、0 存活/未评估，四条命令墙钟合计 `45509.3535 ms`。a2 与 a3 的 65 个产品实现文件
逐文件无差异；验证代码除 `test/reveal-scenario.test.cjs` 新增三项外无差异，另只有上述四份变异定义变化。
因此当前字节的组合覆盖为 Node `1456/1456`、变异 `693/693`，但这是一份有身份约束的组合证明，
**不是**第二次完整 `npm run gate` 的 exit 0。a3 完成变异后与主树候选 452 文件逐项一致，未留下变异代码。

a2 是 452 个受控/未忽略文件、5496705 字节，逐文件 SHA-256 一致；a3 为同 452 文件、5500801 字节。
两者都没有复制 `.git`、被忽略的运行时或连接秘密。先前 a1 的 PowerShell 路径拆分调用在第一份文件复制前
失败，只留下空目录，未启动产品或测试。完整门禁、修正、身份与耗时的机器可读事实见
`.trellis/tasks/08-26-public-ai-table-talk/research/b30-local-verification-20260903.json`。不得引用 B29 的
1356/668 作为 B30 已跑成绩。

### 尚未完成与下一责任人

本批实际原生模型调用、原生 queue、公网隧道和付费服务调用均为 0。脚本 sender 的成功、真实 Node
子进程的退出、旧单席宿主样本都不能替代两台电脑的两个真实 Codex。两好友十手、两席各至少一条
牌局内同手真实公开气泡、双方可玩性反馈仍为 `not_run`，不能宣布 MVP 或实时性能通过。
`proactive_wake_verified=false`，两个父任务与主动唤醒/可玩性节点保持开放。

本轮临时私有下载由各测试自身清理，旧七份失效下载及历史宿主资源未动；没有自动隧道、模型覆盖、
宿主重启、commit 或 push。本地候选已达到真人联通测试入口，下一责任人为用户、好友与主开发者：统一候选代码版本，
按指南设置同一 HTTPS 私人房并执行真实验收；公开大厅、服务器采购与四真人扩展仍后置。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B30-TWO-FRIEND-REMOTE-20260903-A
  detail_level: material_node_closure
  scope:
    scope_id: TG-EU-PLAYABILITY-GATE
    exact_outcome: MVP-0.1两好友、两设备、两个真实Codex的十手私人房验收；B30只提供本地候选和未完成项，不关闭完整父节点。
    owner_ref: PROJECT-PLAN-TREE.md#当前恢复点
  trigger: explicit_decision_relevant_claim
  basis:
    semantic_contract_refs:
      - {node_id: TG-L2-SESSION-LAUNCH, contract_id: SC-TG-L2-SESSION-LAUNCH-20260827-B, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-019, expected_digest: 'sha256:b122280d82879e0094793b9cfffedabfb9aa0139647c704f42c2246af754f45f', binding_status: verified}
      - {node_id: TG-L2-PLAYABLE-TABLE, contract_id: SC-TG-L2-PLAYABLE-TABLE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-022, expected_digest: 'sha256:d73e30748ac4d7a3fc814e6f44d6aa96676dc3677e0ef04f8f1298e9f84ca453', binding_status: verified}
      - {node_id: TG-L2-PUBLIC-AI-EXCHANGE, contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260827-D, decision_ref: PROJECT-DECISION-LOG.md#DEC-20260827-023, expected_digest: 'sha256:584c328120d25e74fb67e6c92f48356774f9f820616c6c57f7977d40f50c1a54', binding_status: verified}
    project_intelligence_ref: STATUS.md#project_intelligence
    understanding_view_ref: PROJECT-PLAN-TREE.md#当前恢复点
    implementation_identity:
      kind: file_set_digest
      scope: package.json、src、web、plugins内65个受控或未忽略文件；按相对路径排序，逐文件原始字节SHA-256，再对JSON数组的UTF-8字节做SHA-256。
      identity: sha256:7b014e35f130f4afb70534379f6645d0041a372fdd23069f3c7936943baac445
      status: current
    verification_identities:
      - {evidence_pointer: 'H:/tokengold/.codex/b30-table-web-acceptance-20260903-b3/result.json', identity: 'sha256:4fd231f6f3b6d3a1b01f870cf33c74bc26e1b9c43c7b848f08f54d74f6620497', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b30-table-web-acceptance-20260903-b3/timing-evidence.json', identity: 'sha256:253f2e363e23aed0dddba899863b02d010b107a371e821347f5e421a1486470d', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b30-remote-friend-browser-20260903-final/report.json', identity: 'sha256:d2c25d7504a0dfd3f0f282cd9d5e084e787c0c63eb4ec3a861c00aaddcc21be4', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b30-workspace-20260903-final/report.json', identity: 'sha256:0a96b735dddf4639ad10aa39276c6b543fdc4b4b1326690ea0419ef0f67398ce', status: current}
      - {evidence_pointer: 'H:/tokengold/.codex/b30-workspace-model-binding-20260903/result.json', identity: 'sha256:b2a6e341162a9b5406be14df4199e98a7c0ad890ddd761c9b9a9b56ec8fe9b35', status: current}
      - {evidence_pointer: '.trellis/tasks/08-26-public-ai-table-talk/research/b30-local-verification-20260903.json', identity: 'sha256:8374a7d929e3e9fbade701ce7f5c74abca0308c281bf4c449711cb8d06275e96', status: current}
    freshness: unknown
    historical_inputs:
      - {kind: semantic_implementation_closure, ref: REVIEW-LOG.md#b28-idle-game-task-handoff, disposition: historical_only}
  acceptance:
    derivation_timing: before_current_implementation
    obligations:
      - {obligation_id: B30-LOCAL-REGRESSION, claim_or_predicate: 当前候选的全部Node用例与全部变异规格均有当前字节对应的通过证据，且没有未评估项或变异残留。, required: yes, real_condition: 完整门禁先固定未受影响集合，再对唯一变化的验证文件重跑全部聚焦用例与受影响变异，并逐文件核对产品、测试和还原身份。}
      - {obligation_id: B30-LOCAL-TWO-SEAT, claim_or_predicate: 产品入口启动，两独立浏览器和两个脚本Connector在同桌各自授权发言、下一手、恢复并撤权。, required: yes, real_condition: 本机真实HTTP与真实浏览器，明确脚本sender和生成替身}
      - {obligation_id: B30-WEB-WORKSPACE, claim_or_predicate: 游戏与配置工作面切换保持席位，双人桌面动作可用，窄屏不溢出。, required: yes, real_condition: 1365x800桌面及320和390px浏览器}
      - {obligation_id: B30-LONG-POKER, claim_or_predicate: 四隔离浏览器经正常动作连续多手与故障矩阵通过。, required: yes, real_condition: 当前产品的脚本模型长程浏览器验收}
      - {obligation_id: B30-REAL-FRIENDS, claim_or_predicate: 两设备经HTTPS同房十手，两席各有牌局内同手真实Codex公开气泡、无重复通知并给出真人反馈。, required: yes, real_condition: 用户和好友各自的独立电脑及空闲游戏任务}
    selected_surfaces: [static, integration, browser_smoke, focused_probe, inspection]
    observations:
      - {obligation_id: B30-LOCAL-REGRESSION, evidence_type: executed, correspondence: derived, evidence_pointer: '.trellis/tasks/08-26-public-ai-table-talk/research/b30-local-verification-20260903.json', result: pass, caveat: 第一次完整gate为1453项通过、693变异中689杀掉/3存活/1未评估并exit1；修正四项验证定义后当前聚焦108项及全部受影响83变异通过。产品65文件无变化、其余验证代码无变化，据此组成当前1456/1456与693/693；没有声称第二次完整npm run gate exit0。}
      - {obligation_id: B30-LOCAL-TWO-SEAT, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b30-remote-friend-browser-20260903-final/report.json', result: pass, caveat: 18项、10551.8492ms、0浏览器错误、7项清理；真实模型和原生queue均0。}
      - {obligation_id: B30-WEB-WORKSPACE, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b30-workspace-20260903-final/report.json', result: pass, caveat: 75项、16638.1123ms、0浏览器错误、8项清理；不是内嵌宿主UI。}
      - {obligation_id: B30-LONG-POKER, evidence_type: executed, correspondence: direct, evidence_pointer: 'H:/tokengold/.codex/b30-table-web-acceptance-20260903-b3/result.json', result: pass, caveat: 最终215项通过、到第13手、533588ms、无中止和窗口外浏览器错误；4上下文及浏览器/服务均已关闭，模型为脚本。}
      - {obligation_id: B30-REAL-FRIENDS, evidence_type: not_run, correspondence: direct, evidence_pointer: docs/REMOTE-FRIEND-MVP.md#两好友实测清单, result: not_run, caveat: 本地脚本、旧单席样本及真实Node进程均不能代替。}
    skipped:
      - {check: real_two_device_native_Codex_and_HTTPS, reason: 本轮先实现并验证本地候选，真人联通和临时入口尚未执行。}
    result: not_run
  capability_claim:
    overall_result: partial
    claims:
      - capability_id: TG-EU-PLAYABILITY-GATE
        parent_capability_id: TG-L3-MULTIPLAYER-VERTICAL-SLICE
        claim: 两好友远程私人房MVP的当前交付状态
        exact_scope: 本轮两设备、两个真实Codex、至少十手；不是四真人扩展、Claude、大厅或生产发布。
        result: partial
        dimensions:
          semantic: {required: yes, status: sufficient_for_claim, evidence_type: inspection, evidence_pointer: '.trellis/tasks/08-26-public-ai-table-talk/prd.md#mvp-0-1-two-friends', user_readable_meaning: 两好友阶段和不做范围已确认，受保护合同未改。, caveat: 不因阶段收敛关闭完整父合同。}
          implementation: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: REVIEW-LOG.md#b30-two-friend-remote-candidate, user_readable_meaning: 显式HTTPS地址、出站连接、逐席通知和两个Web工作面已实现并完成本地候选验证。, caveat: 这仍不是双机真实Codex验收。}
          data: {required: yes, status: sufficient_for_claim, evidence_type: executed, evidence_pointer: 'H:/tokengold/.codex/b30-remote-friend-browser-20260903-final/report.json', user_readable_meaning: 合成本席数据与公开气泡按席隔离，页面和存储不含原生任务ID或模型令牌。, caveat: 可信好友原型，不证明恶意房主或公共互联网安全。}
          integration: {required: yes, status: insufficient_for_claim, evidence_type: not_run, evidence_pointer: docs/REMOTE-FRIEND-MVP.md, user_readable_meaning: 双机真实HTTPS与两个原生Codex尚未组合验证。, caveat: 两浏览器和脚本发送器只能证明本地集成。}
          verification: {required: yes, status: insufficient_for_claim, evidence_type: executed, evidence_pointer: REVIEW-LOG.md#b30-two-friend-remote-candidate, user_readable_meaning: 当前本地候选的1456项Node组合覆盖、693项变异组合覆盖、双席整合和四页长程均已通过；MVP所需真人签字未齐。, caveat: 组合覆盖有逐文件身份约束，但不冒充第二次完整gate exit0，也不替代双机验收。}
          operational: {required: yes, status: insufficient_for_claim, evidence_type: not_run, evidence_pointer: docs/REMOTE-FRIEND-MVP.md#两好友实测清单, user_readable_meaning: 真实安装、连接、网络故障和可玩性反馈仍待双方执行。, caveat: 不承诺生产SLA或进程重启恢复。}
        safe_wording: 两好友候选已实现并完成本地回归与浏览器验收，已可进入双机真实联通测试；双机真实Codex十手未验收，MVP仍未完成。
        gaps: [双机HTTPS与双原生AI, 十手真人反馈与签字]
  route_boundaries:
    local: {result: supported, evidence_refs: [REVIEW-LOG.md#b30-two-friend-remote-candidate, .trellis/tasks/08-26-public-ai-table-talk/research/b30-local-verification-20260903.json]}
    adjacent: {result: partial, evidence_refs: [REVIEW-LOG.md#b30-two-friend-remote-candidate]}
    cumulative: {result: partial, evidence_refs: [docs/REMOTE-FRIEND-MVP.md, PROJECT-PLAN-TREE.md#当前恢复点]}
  semantic_delta: l3_l4_within_scope
  state: evidence_pending
  claim_limits: [本地脚本不是原生模型, queue接收不是权威结清, 旧CLI不证明当前宿主, 不翻proactive_wake_verified, 不关闭真人验收或完整父节点]
  remaining_non_blocking: [四真人扩展, Claude适配, 内嵌UI, 公开大厅与服务器采购]
  advance_allowed: no
  next_owner: user_and_friend_two_device_acceptance_with_codex_primary_support
```

<a id="b31-node22-ci-verification"></a>
## 2026-09-03 — B31：Node 22 CI 兼容与验证可信度

状态：本地修补与限定独立复核完成，代码提交 `360db26` 已推送且对应两平台 GitHub CI 成功；不关闭两好友 MVP。

发布授权补充：后续用户明确回复“commit+push”，记录在 `PROJECT-DECISION-LOG.md#DEC-20260903-001`。
本节下方保留本地冻结验证阶段的事实与机器记录，其中“待授权/未提交”指当时的快照，不否定后续授权。
本次发布前按文件哈希复核与原六次最终验证身份相同，不重复执行本地全量，也不加载或调用原生牌局工具。

### 起点、授权与不变项

前一轮已按用户授权把 B30 提交为 `4135611395b09ba077e156ce59010593232e5b7d` 并推送至
`lhh1301506137/tokengame/main`。本轮“继续”恢复同一路线的本地 CI 修补；沿用既有本地测试授权，
没有为每次 Node、WSL 或变异回归重复申请。新一批 commit/push 另待本批明确授权；没有部署、
重启宿主、创建游戏任务、修改模型设置或进行原生游戏模型/queue 调用。

直接读取的 [GitHub run 33683335693](https://github.com/lhh1301506137/tokengame/actions/runs/33683335693)
对应上述提交，两个作业均失败。实际运行时为 Node `22.23.2`、npm `10.9.8`：Windows
1455 项中 1450 通过、5 取消；Ubuntu 1447 项中 1441 通过、1 失败、5 取消。
原提交独立归档后，在本机 Windows 与 Ubuntu/WSL 的同版本 Node 上复现了相同两类错误。
官方便携 Node 包先核对官方 SHA-256 再解包使用；没有替换全局 Node、项目依赖或 CI 配置。

产品的 `src/`、`web/`、`plugins/` 与 `package.json` 共 65 文件相对 B30 未改。
本轮只调整测试、测试驱动及必要规范/记录；旧浏览器、旧 CLI 和历史单席真实宿主结果不升级为
本轮真人证据。WSL 的本机代理提示单列为载体输出，不归因为扑克或 Dual 规则失败。

### 实际发现与修补过程

1. Windows PATH 反例只模拟了 `platform`，仍让 Linux 的真实文件系统读取转换后的 Windows 路径。
   改为一致的 `path.win32` 和精确文件系统夹具，保留首候选拒绝、canonical 越界、读取错误、
   显式路径禁止回退以及当前平台的真实临时文件测试。
2. 纯 broker 单测等待 `unref()` 的计时器，却没有 HTTP server/socket 持有事件循环。
   改为注入时钟与定时器，明确推进截止、断言送达/取消/撤权/关闭清理；生产的 `unref()` 未改。
3. 原变异驱动只识别 `spec` 文本，在 Node 22 的默认管道 TAP 下报“基线未真正运行”。
   首次规格检查 exit 2、未评估任何变异，失败回执保留；驱动显式选择 reporter 并沿用当前 Node。
4. 新反例发现 `fail > 0` 同时 `cancelled > 0` 可被旧判定记为 KILLED，现保持 INVALID。
   实际变异随即暴露旧 scope 负例缺少时钟推进；只改该负例用既有 `pollToTimeout`，
   使移除撤权检查产生 `Missing expected rejection`，不再靠取消结束，也不放宽取消判定。
5. 独立复核在临时副本证明“一个断言失败、另一测试退出 17”仍可被误报 KILLED。
   仅检查文件级失败行未修好：Node 22 的该例只输出第一条断言，数量从基线 2 降为 1。
   因此采用与既有绿基线测试数对照的窄修补；不把文本驱动宣传为完整进程审计器。

### 最终验证与限定结论

最终冻结的五个代码/测试文件与运行时、命令、原始回执及阶段哈希均在
`.trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json`，
该记录 SHA-256 为 `3626a6f7db8baa61650918ae775b159be5cf26690063c22ccec4bc65e64e9a77`。
原始日志留在忽略目录 `artifacts/b31-ci-validation-20260903/`；带 `-final` 的旧目录是中间状态，
本次最终结论只用 `-verified` 六个回执，不用目录名字代替文件身份。

| 冻结代码的实际验证 | Windows Node 22.23.2 | Ubuntu/WSL Node 22.23.2 |
| --- | --- | --- |
| 主线程完整 `npm test` | 1475/1475；98100.0179ms | 1467/1467；77169.9458ms |
| 主线程入口变异 | 15/15 KILLED；8129.8736ms墙钟 | 15/15 KILLED；8314.3252ms墙钟 |
| 主线程远程变异 | 10/10 KILLED；5865.174ms墙钟 | 10/10 KILLED；5954.3218ms墙钟 |
| 独立上下文限定复核 | 29/29；6117.3493ms | 29/29；5397.5106ms |

上述命令均 exit 0；完整测试和独立回归的 fail/cancelled/skipped/todo 均 0，变异无存活或未评估。
完整测试的八项差额来自 `codex-queue-wake-probe.test.cjs` 的 Windows 条件注册（四字段×两路径），
不把缺席用例写成取消或通过。主线程直接读取25条失败原因，两平台除时长外一致、无 ReferenceError；
撤权反例现在以 `Missing expected rejection` 被杀，而不是等待被取消。

独立检查按 Trellis 的 implement→check 要求执行。初始两夹具复核22/22是历史阶段；后续27/27也未抓住
额外异常退出反例，不能用通过数量否定P2。最后一次只读修复复核针对冻结三文件，实际29项由13项驱动和
16项gate回归组成，确认原例从KILLED改为INVALID。它未参与实施，但不声明异模型/异供应商独立性。
主线程另执行全量及真实变异；两类回执来源在机器记录中分开。

全部最终执行前后，239个代码/测试文件集合SHA-256均为
`f2f4df7777274b6f9c6ab88b856135ec919a108ce2253c887694c33b5e1f6ea5`，
65个产品文件集合仍为 `8927b69b9cbf6d35814bda9c98e6aa9e80ddde7bc00a7c038408027511a0e18d`。
变异均已还原，没有更改生产逻辑、CI工作流、依赖、模型或宿主配置。

成本只报告已有回执：捕获器13次主线程命令累计墙钟573461.6865ms（约9.56分钟），
其中六次完整测试累计529551.5025ms，最终冻结身份的六次命令累计204392.3042ms。
原提交两条复现命令另计1940.5581ms。以上不等于总等待、总验证成本或账单；代理各轮耗时另列，
下载/解包、阅读、收尾与token成本没有完整计时，写unknown。保留失败不是重复计算新增产品覆盖。

本轮不重跑完整693条变异、浏览器或原生宿主：产品身份未变，重跑的是本次修改的夹具、驱动和相关集合；
不能把旧完整变异结果认证成新驱动的完整验证。修复提交的GitHub CI为not_run，本机WSL不是Actions。
真实双机、双Codex同手公开往返、十手和真人反馈仍待执行，`proactive_wake_verified=false`。
恢复文档只更新当下工程收尾指针，不重新确认L0–L2，也不关闭既有MVP父节点。

最终治理正文的语言检查实际回执位于 `artifacts/b31-governance-language-final-20260903.json`；
该指针本身不是通过声明。下一步等待本批commit/push授权，随后核对新提交的两个GitHub作业；
不在此等待期间自动启动真人局、开隧道、改宿主设置或继续功能开发。

```yaml
execution_closure:
  contract: dual-ai.execution-closure.v1
  result_id: EC-TG-B31-NODE22-LOCAL-VERIFICATION
  detail_level: evidence_slice
  scope:
    scope_id: B31_frozen_five_file_local_verification
    exact_outcome: Node22测试夹具与验证驱动的本地兼容及已知误判修复；不是MVP或GitHub验收。
    owner_ref: REVIEW-LOG.md#b31-node22-ci-verification
  trigger: verification_evidence
  basis:
    implementation_identity:
      kind: file_set_digest
      scope: 239个产品与验证文件，目录和算法见机器记录identity。
      identity: sha256:f2f4df7777274b6f9c6ab88b856135ec919a108ce2253c887694c33b5e1f6ea5
      status: current
    verification_identities:
      - evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json
        identity: sha256:3626a6f7db8baa61650918ae775b159be5cf26690063c22ccec4bc65e64e9a77
        status: current
    freshness: current
  acceptance:
    derivation_timing: before_execution
    obligations:
      - {id: B31-A1, predicate: 冻结身份在Windows与WSL的Node22全量均无失败取消。, required: yes, real_condition: 两个平台分别实际执行完整npm测试。}
      - {id: B31-A2, predicate: 相关两组变异各25条被具体行为断言杀掉并还原。, required: yes, real_condition: 真实变异只串行修改并恢复本仓库源码。}
      - {id: B31-A3, predicate: 已知异常退出截断反例不得误记KILLED。, required: yes, real_condition: 隔离真实子进程及写入还原回归，由独立上下文复核。}
      - {id: B31-A4, predicate: 产品及宿主配置不随测试兼容修补改变。, required: yes, real_condition: 比较产品文件哈希和限定差异，不进行原生模型调用。}
    selected_surfaces: [integration, focused_probe, inspection]
    observations:
      - {obligation_id: B31-A1, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/windows-full-verified, result: pass, caveat: Windows本机，不是GitHub。}
      - {obligation_id: B31-A1, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/linux-full-verified, result: pass, caveat: 本机WSL，不是GitHub。}
      - {obligation_id: B31-A2, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/windows-mutation-play-verified, result: pass, caveat: Windows入口15条。}
      - {obligation_id: B31-A2, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/windows-mutation-remote-verified, result: pass, caveat: Windows远程10条。}
      - {obligation_id: B31-A2, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/linux-mutation-play-verified, result: pass, caveat: WSL入口15条。}
      - {obligation_id: B31-A2, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/verification/current_runs/linux-mutation-remote-verified, result: pass, caveat: WSL远程10条；两组不代表完整693条。}
      - {obligation_id: B31-A3, evidence_type: executed, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/review/final_driver_review, result: pass, caveat: 独立代理执行；不覆盖所有同数量异常退出。}
      - {obligation_id: B31-A4, evidence_type: inspection, correspondence: direct, evidence_pointer: .trellis/tasks/08-26-public-ai-table-talk/research/b31-ci-verification-20260903.json#/identity, result: pass, caveat: 只确认本次变更边界，不补证真实宿主能力。}
    skipped: [完整693条变异本批未跑, 产品未改故浏览器不重跑, 新提交GitHub待推送, 真人双机十手仍待双方参与]
    result: pass_with_notes
  semantic_delta: l3_l4_within_scope
  state: closed
  claim_limits: [只闭合本地验证证据切片, 不宣布GitHub通过, 不升级原生主动AI, 不关闭MVP或父节点, 不授权本批提交推送]
  next_owner: user_for_B31_commit_push_permission_then_primary_for_GitHub_verification
```

### 后续发布回执（不改写上面的本地冻结证据）

用户以“commit+push”授权本批发布，决策为 `DEC-20260903-001`。实际代码提交是
`360db26db1ca3209a8e3d6ee9fff3e4d2d0f6f6b`，提交说明为 `fix: harden Node 22 verification for B31`。
仅暂存12个核定文件，提交和非强制推送均exit 0，`git ls-remote`确认远端main与该SHA一致，代码推送后工作树干净。
忽略的运行时、日志、私有连接及宿主配置未纳入；产品65文件仍未变，不归档MVP任务。

[GitHub run 33690705812](https://github.com/lhh1301506137/tokengame/actions/runs/33690705812)
已completed/success，两个作业均成功。直接读取日志确认项目测试运行时为Node22.23.2、npm10.9.8：
Windows `1475/1475`、92467.9119ms；Ubuntu `1467/1467`、68002.490871ms；失败、取消、跳过、todo均0。
这次是GitHub真实作业，不复用本机WSL结果。Actions自身checkout/setup-node有Node20弃用与Node24强制运行警告，
不等于项目测试改用了Node24；本次不扩展修改工作流。日志摘录、作业ID、时刻及SHA在
`.trellis/tasks/08-26-public-ai-table-talk/research/b31-publication-20260903.json`，文件SHA-256为
`92cf58bcc2dfd14c0be5137a2b62c6cc70c68caf7b89ba93a2b69ff42a3dac58`。

本轮发布不重新跑本地全量：先比较239文件冻结身份一致，再由GitHub执行对应提交的完整测试。
收集日志时一次临时Node命令有多余花括号，在调用gh前语法退出1；修正该命令后只读采集成功，未因此重跑CI或修改产品。
发布回执与恢复点由后续仅文档提交保存；其新SHA与本次代码CI分别看待，不靠回执文字让未运行的新作业自动通过。
最终收尾语言检查回执为 `artifacts/b31-publish-closeout-language-20260903.json`，以其实际结果为准。
下一产品工作是双机双原生AI十手真人验收，不继续拆分CI叶、不启动模型或公网、不把本次提交当MVP交付。
