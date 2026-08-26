# TokenGame 项目决策记录

## DEC-20260825-001：确认产品根目标

metadata:
  date: 2026-08-25
  source: user_direct
  scope: root_goal
  status: superseded
  supersedes: none
  superseded_by: DEC-20260827-017
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 建立 L0 根节点并将其绑定到本决策的已验证语义合同。
    - doc: STATUS.md
      change: 将语义基线从完全缺失更新为 L0 已确认、L1-L2 待确认的部分状态。

question: TokenGame 是普通的 Codex 游戏平台，还是以公开人机协作为核心博弈机制的 AI 原生竞技平台？
why_it_matters: 这个选择决定公开人机互动究竟是附加聊天功能，还是所有后续产品范围、牌局体验与验收标准必须服务的核心价值。
recommended_answer: 以公开人机协作本身作为核心博弈机制；先用不涉及真实价值下注的德州扑克 MVP 验证。
user_answer: 用户回复“1”，确认上一轮展示的完整 L0 产品语义包。
decision: TokenGame 的根目标采用该 L0 语义包，权限为 user_confirmed；本决策不确认任何 L1、L2 或详细产品规则。
follow_up: 后续依次确认 L1 能力域与各 L2 语义章程；Skill、插件、MCP、独立页面及模型接入方式仍属于待验证的专业技术选择。

semantic_contract:
  contract_id: SC-TG-L0-ROOT-20260825-A
  node_id: TG-L0-PRODUCT
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:5205e888cd98b4ed60efc80c2dbd4a39c65e12381aa6d4f9414bf040c70da137
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L0-ROOT-20260825-A",
  "node_id": "TG-L0-PRODUCT",
  "semantic_level": "L0",
  "parent_node_id": null,
  "scope": "current_mvp",
  "meaning": {
    "goal": "为 Codex 用户提供一种 AI 原生的多人竞技游戏体验：真人与自己的 AI 助手共同参赛，关键赛时人机互动会成为其他玩家可观察、判断、利用或反向误导的信息，使使用 AI 本身从隐蔽辅助转化为公开博弈的一部分。",
    "responsibility": "定义 TokenGame 整体产品存在的理由与边界：它首先是围绕人类、AI 和公开信息互动构成的社交智斗游戏平台，而不是单纯把传统游戏画面搬进 Codex，也不是以真实 Token 或金钱流转为核心的博彩产品。",
    "included": [
      "用户从 Codex 工作环境进入多人游戏并持续完成对局",
      "每名真人可以与跟随其会话配置的 AI 助手组成一个参赛单元",
      "关键赛时人机互动能够被对手观察，并成为判断、表演、欺骗和反欺骗的素材",
      "以德州扑克验证核心体验，并为以后扩展斗地主、五子棋等不同信息结构的游戏保留产品空间"
    ],
    "excluded": [
      "当前阶段不转移、不下注真实 API Token、模型额度、法币或其他可兑现资产",
      "不把私下禁止玩家使用 AI 作为公平性的主要基础",
      "当前 MVP 不同时实现多个游戏，也不以复刻传统牌局界面作为完成标准"
    ],
    "user_visible_result": "用户得到的不只是一次带 AI 提示的牌局，而是一场可观看彼此如何指挥、利用和伪装 AI 意图的多人智斗；即使牌面策略相同，不同的人机表达和公开信息操作也会产生不同的比赛体验。",
    "relationships": [
      "上游是用户在 Codex 中安装、进入并配置 TokenGame 及自己的 AI 参赛方式",
      "核心环节是可信的多人牌局状态与公开的人机赛时互动共同推进比赛",
      "下游是局内社交反馈、复盘和未来向其他 AI 原生游戏规则扩展"
    ],
    "ideal_final_form": "成为可从 Codex 自然进入的 AI 原生多人游戏平台，支持多种游戏、稳定匹配和观战，让不同用户调教出的 AI 风格、公开指令与心理干扰形成持续可辨认的竞技文化。",
    "current_mvp_boundary": "只做一个可实际完成多人对局的德州扑克模式，使用不可兑现的测试筹码，允许每名玩家携带会话 AI，并让关键赛时人机互动按明确规则公开；暂不实现真实 Token 经济、多游戏大厅、赛事体系或复杂商业化。",
    "expected_scenario": "玩家 A 用弱牌公开询问 AI 是否应该全押，AI 在公开回答中声称 A 持有强牌；其他玩家必须同时判断牌局状态、这段人机对话是否可信以及 A 是否在借 AI 表演，最终这段公开互动本身成为下注决策和赛后嘲讽的组成部分。",
    "plausible_but_wrong": "做出一个能在 Codex 中打开的普通德州扑克页面，并提供只有自己看得到的胜率助手；它技术上能玩牌，也使用了 AI，却没有把公开的人机互动变成博弈对象，因此不是这里要做的 TokenGame。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-010：选择 Codex 桥接型 MVP 架构

metadata:
  date: 2026-08-25
  source: primary_ai_derived
  scope: architecture_and_route
  status: superseded
  supersedes: none
  superseded_by: DEC-20260825-011
  affected_docs:
    - STATUS.md
    - PROJECT-PLAN-TREE.md
    - PROJECT-UNDERSTANDING/CODEX-BRIDGE.md

question: 如何在不要求第二套模型 API、不公开普通 Codex 内容的前提下，让当前会话 AI 参与实时牌桌？
decision: 采用 Codex 插件作为分发壳，使用显式 `$tokengame` 或插件提及作为入口；由本地 UserPromptSubmit 与 Stop Hook 在显式游戏范围内关联提示和最终回答，再交给 MCP/实时服务保存和广播。牌桌首版使用独立 Web 视图，Codex 内嵌 MCP UI 仅作为待验证增强。
why: 当前公开能力足以让 Hook 获得会话模型、用户提示、回合标识和最终助手消息，从而复用真实当前会话生成；但 Hook 没有推理强度字段，自定义斜杠命令不是公开插件扩展面，本机 Codex 的 MCP Apps UI 仍是未启用的开发中能力。
rejected_options:
  - 纯 Skill：没有权威实时状态、认证、广播和可交互牌桌。
  - 独立 OpenAI API 助手：要求另一套调用配置，且回答不再是当前 Codex 会话的实际输出。
  - 直接依赖 Codex 内嵌牌桌：当前宿主支持证据不足，会把整个 MVP 锁定在未验证能力上。
consequence: 首个开发切片只验证隐私桥接、事件顺序、当前会话模型来源和独立牌桌视图，不提前实现完整德州扑克状态机；首次安装可能需要用户新建或重开会话才能加载插件能力。
authority: primary_ai_derived

## DEC-20260825-002：确认 Codex 入口与会话承接

metadata:
  date: 2026-08-25
  source: user_direct
  scope: mvp
  status: user_confirmed
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 在已确认 L0 下建立 Codex 入口与会话承接 L1 节点。

question: 当前 MVP 是否把从 Codex 自然安装、启用、承接会话 AI 和恢复游戏作为独立能力域？
why_it_matters: 若缺少这一能力，产品会退化成要求用户另配 API 和手工搬运上下文的普通外部网页。
recommended_answer: 建立独立入口能力域，同时不提前锁死 Skill、插件、MCP 或页面技术。
user_answer: 用户回复“1”，确认上一轮展示的完整 L1-A 语义包。
decision: 采用 TG-L1-CODEX-ENTRY 语义，权限为 user_confirmed；不确认其下属 L2 或实现技术。
follow_up: 后续确认安装授权、会话 AI 承接与游戏恢复等必要 L2 章程。

semantic_contract:
  contract_id: SC-TG-L1-CODEX-ENTRY-20260825-A
  node_id: TG-L1-CODEX-ENTRY
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:d1cb4af90f8e2fb76736c05a992dfdc2abb282e25a20801993b6bdc5481d9676
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L1-CODEX-ENTRY-20260825-A",
  "node_id": "TG-L1-CODEX-ENTRY",
  "semantic_level": "L1",
  "parent_node_id": "TG-L0-PRODUCT",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让用户能够从一个 Codex 项目与会话自然地安装、授权、启动和恢复 TokenGame，并在尽量不重复配置模型的前提下启用自己的会话 AI 参赛。",
    "responsibility": "承担产品主链的入口和会话承接责任，把 Codex 中的用户身份、项目上下文、游戏开关与 AI 参赛配置连接到后续牌桌，但不决定牌局规则或公开信息规则。",
    "included": [
      "在用户明确允许后安装或启用 TokenGame",
      "在当前项目或会话中开启和关闭 AI 助手与德州扑克模式",
      "清楚显示当前游戏、连接和 AI 参赛状态，并支持中断后的恢复入口",
      "优先复用当前会话允许提供的模型与推理配置；若平台不允许直接继承，则提供不要求用户另备模型 API 的等价降级路径"
    ],
    "excluded": [
      "不把某一种 Skill、插件、MCP 或嵌入式页面技术提前规定为唯一实现",
      "不承担德州扑克状态裁决、下注结算或隐藏信息保护",
      "不决定哪些赛时对话公开，也不读取或上传与游戏无关的项目内容"
    ],
    "user_visible_result": "用户在 Codex 项目中用少量明确命令即可看到 TokenGame 已启用、AI 是否加入、当前是否连接牌桌，并能从同一工作上下文继续游戏，而不是重新配置一套独立 AI 客户端。",
    "relationships": [
      "上游依赖用户对安装、联网和会话能力的明确授权",
      "向实时牌局能力提供已建立的玩家会话和游戏模式",
      "向公开人机博弈能力提供经过边界控制的 AI 参赛入口，但不传递无关项目上下文"
    ],
    "ideal_final_form": "用户像加载一个可信的 Codex 游戏能力一样进入 TokenGame，文本命令、状态卡片和牌桌界面协同工作，切换任务或恢复会话时仍能理解当前游戏位置与隐私边界。",
    "current_mvp_boundary": "支持在一个 Codex 项目和当前会话中完成一次显式安装或启用，开启 AI 助手与单一德州扑克模式，连接或恢复一个牌桌；不承诺跨设备同步、插件商店分发或所有 Codex 客户端形态。",
    "expected_scenario": "用户新建 tokengame 项目，请 Codex 安装并启用 TokenGame，授权后输入开启 AI 助手和德州扑克模式，界面明确显示 AI 配置来源并搜索牌桌；会话暂时中断后，用户能够看到并恢复原牌桌状态。",
    "plausible_but_wrong": "提供一个与 Codex 无关的独立网页，要求用户另填 API Key、重新选择模型并手工复制牌局信息；它能启动游戏，却没有实现从当前 Codex 会话自然进入和承接 AI 的产品责任。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-003：确认可信实时牌局

metadata:
  date: 2026-08-25
  source: user_direct
  scope: mvp
  status: user_confirmed
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 在已确认 L0 下建立可信实时牌局 L1 节点。

question: 当前 MVP 是否需要独立的实时牌局事实权威，而不是让各 Codex 会话自行推演状态？
why_it_matters: 多人隐藏信息游戏若没有唯一裁决，会出现不同手牌、轮次和结算，公开 AI 博弈也失去可信共同现实。
recommended_answer: 建立服务端权威牌局能力，聊天与 AI 陈述均不能修改官方状态。
user_answer: 用户回复“1”，确认上一轮展示的完整 L1-B 语义包。
decision: 采用 TG-L1-LIVE-TABLE 语义，权限为 user_confirmed；桌型人数、盲注、计时等参数仍未确认。
follow_up: 后续确认入桌匹配、单手牌裁决与中断恢复等必要 L2 章程。

semantic_contract:
  contract_id: SC-TG-L1-LIVE-TABLE-20260825-A
  node_id: TG-L1-LIVE-TABLE
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:69f5be696f574556edd55ca49db6853c8086674a4f21440a67d904bfdadd9f91
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L1-LIVE-TABLE-20260825-A",
  "node_id": "TG-L1-LIVE-TABLE",
  "semantic_level": "L1",
  "parent_node_id": "TG-L0-PRODUCT",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让多名远程玩家在同一份可信牌局状态上，从发现或加入牌桌开始，连续完成一局标准无限注德州扑克并得到一致结果。",
    "responsibility": "承担多人游戏的事实权威和连续性责任，正确保护各玩家私有牌、同步公共牌与下注状态、约束行动顺序并裁决结果，为公开人机博弈提供不能被聊天内容篡改的共同现实。",
    "included": [
      "搜索、创建或加入一个固定规格的多人牌桌",
      "完成发牌、行动轮次、过牌、跟注、加注、弃牌、全押、摊牌和底池结算",
      "分别向每名玩家展示其有权看到的私有状态和所有人共享的公共状态",
      "提供行动时限、短暂断线恢复和明确的异常或等待状态"
    ],
    "excluded": [
      "不把 AI 的自然语言陈述当作官方牌局事实",
      "不负责决定赛时人机对话的公开与隐藏范围",
      "MVP 不包含锦标赛、真实价值筹码、复杂排行榜、观战系统或其他游戏"
    ],
    "user_visible_result": "所有玩家看到一致且可理解的牌局进度，只能看到自己有权获得的隐藏信息，任何人的聊天、AI 回答或客户端表现都不能改变服务端裁决的手牌、轮次、下注与胜负。",
    "relationships": [
      "从 Codex 入口能力接收已建立的玩家会话和加入牌桌请求",
      "向公开人机博弈能力提供经过权限裁剪的实时牌局上下文与行动窗口",
      "将每次合法行动和最终结果返回给所有玩家的界面与社交反馈层"
    ],
    "ideal_final_form": "形成可扩展到多种回合制游戏的可信实时对局底座，但每种游戏仍拥有独立规则裁决；网络波动、玩家离开和客户端差异不会造成多份互相矛盾的比赛现实。",
    "current_mvp_boundary": "只支持一种固定桌型和标准无限注德州扑克现金桌流程，使用不可兑现测试筹码，完成从入桌到一手牌结算及基础重连；桌型人数、盲注和计时参数由后续专业设计确定。",
    "expected_scenario": "四名或固定数量的玩家加入同一牌桌，各自只收到自己的底牌，公共牌和下注按轮次同步；一名玩家全押、其他人弃牌或跟注后，所有客户端得到同一个合法结算结果，断线玩家在允许时间内回来仍看到当前真实状态。",
    "plausible_but_wrong": "让每个 Codex 会话各自根据聊天记录推测牌局并生成下一状态，没有唯一权威裁决；即使大多数时候画面相似，也会因并发、提示词或断线产生不同手牌与下注结果，因此不是真正的多人牌局。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-004：确认公开人机博弈

metadata:
  date: 2026-08-25
  source: user_direct
  scope: mvp
  status: user_confirmed
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 在已确认 L0 下建立公开人机博弈 L1 节点。

question: 当前 MVP 是否把有边界的公开人机互动作为独立核心能力，并由真人确认最终牌局行动？
why_it_matters: 这决定产品是公开智斗，还是泄露整个会话或让全自动 AI 取代真人的另一类产品。
recommended_answer: 公开与牌局相关、带身份和时机的人机片段；保护提示词和无关上下文；MVP 由真人提交官方行动。
user_answer: 用户回复“1”，确认上一轮展示的完整 L1-C 语义包。
decision: 采用 TG-L1-PUBLIC-AI-PLAY 语义，权限为 user_confirmed；具体公开规则和上下文边界仍需在 L2 章程后另行分类。
follow_up: 后续确认 AI 可见上下文、公开片段生命周期与真人行动权等必要 L2 章程。

semantic_contract:
  contract_id: SC-TG-L1-PUBLIC-AI-20260825-A
  node_id: TG-L1-PUBLIC-AI-PLAY
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:37f755856560105a5a33a2cc493200cae4ae96960f29dbbe9c7612e90fc903ae
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L1-PUBLIC-AI-20260825-A",
  "node_id": "TG-L1-PUBLIC-AI-PLAY",
  "semantic_level": "L1",
  "parent_node_id": "TG-L0-PRODUCT",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让每名玩家在牌局中与自己的会话 AI 进行可辨认、受边界控制的协作，并把规定范围内的赛时询问与回答实时呈现给对手，使其成为合法的语言博弈和社交表演。",
    "responsibility": "承担 TokenGame 的核心差异化体验：管理 AI 能看到哪些官方牌局信息、哪些人机内容公开、公开内容如何与玩家和时机绑定，以及其他玩家如何观察和反应；它不替代官方牌局裁决。",
    "included": [
      "玩家在自己的行动与思考过程中向会话 AI 请求分析、建议或表演性回答",
      "将符合牌局公开规则的用户赛时指令和 AI 回答按玩家身份与发生时间展示给对手",
      "允许玩家和 AI 通过真实陈述、选择性表达、语言误导或角色风格影响对手判断",
      "提供最小的桌内回应方式，使其他玩家能对公开互动做出表情或文字反馈"
    ],
    "excluded": [
      "不公开用户的系统提示词、长期调教资料、与本局无关的项目文件或会话内容",
      "不让任何 AI 获得其玩家无权看到的对手底牌或服务端隐藏状态",
      "不声称能够阻止玩家使用其他私下工具或外部 AI",
      "MVP 中 AI 只提供建议和公开表达，最终下注、弃牌等官方牌局行动仍由真人确认"
    ],
    "user_visible_result": "玩家既能使用自己的 AI 计算和表达，也必须承担公开互动带来的信息后果；对手看到的是带有明确玩家身份和牌局时机的人机片段，而不是无法区分来源的普通聊天或泄露的整个 Codex 会话。",
    "relationships": [
      "从 Codex 入口能力获得当前玩家允许使用的 AI 会话能力和隐私边界",
      "从实时牌局能力获得该玩家依法可见的牌局上下文和行动时机",
      "将公开片段送到所有对手的牌桌体验，并将真实牌局行动继续交回权威牌局能力处理"
    ],
    "ideal_final_form": "不同用户与 AI 形成可辨认的协作风格，观众和对手能够理解一段公开表达发生在什么牌局背景下；公开、私密和禁止访问的边界始终可预测、可解释且可复盘。",
    "current_mvp_boundary": "只支持真人在自己的牌局会话中主动询问 AI、由 AI 返回文本建议或表演性回答，并公开规定范围内的赛时文本；保留系统提示词和无关上下文私密，最终官方牌局动作由真人提交，暂不支持全自动 AI 玩家或语音、多模态直播。",
    "expected_scenario": "玩家 A 持有杂色 2、5，却在行动前公开问 AI 是否应以 AA 在 A-J-K 公牌上全押；AI 给出强牌叙事，其他玩家看到带有 A 身份和当前行动时机的问答后决定弃牌、跟注或嘲讽，但官方界面不会把 AI 的陈述误显示为真实手牌。",
    "plausible_but_wrong": "把用户整个 Codex 会话实时转发给所有对手，连系统提示、项目内容和无关讨论一起公开；它看似最透明，却破坏隐私和可控边界，也会让玩家无法安全地在同一项目中使用 TokenGame。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-005：确认游戏会话启动章程

metadata:
  date: 2026-08-25
  source: user_direct
  scope: feature
  status: user_confirmed
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 建立游戏会话启动 L2 节点并绑定本决策。

question: 游戏会话启动功能是否承担授权、AI绑定、状态反馈和恢复入口的完整责任？
why_it_matters: 若只实现一次性启动命令，用户无法判断权限、AI来源、失败状态和恢复位置。
recommended_answer: 采用可检查、可恢复的会话启动章程，不锁死具体 Codex 接入技术。
user_answer: 用户回复“1”，确认上一轮展示的完整“游戏会话启动”L2 章程。
decision: 采用 TG-L2-SESSION-LAUNCH 语义，权限为 user_confirmed；本决策不确认后续产品规则或实现规则。
follow_up: 后续规则分类若没有新增受保护产品规则，本章程合同保持当前。

semantic_contract:
  contract_id: SC-TG-L2-SESSION-LAUNCH-20260825-A
  node_id: TG-L2-SESSION-LAUNCH
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:061266e6c84ec3f94c1be078bcb13e22edb4ae3c6364d1497a801c9e79feff6d
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L2-SESSION-LAUNCH-20260825-A",
  "node_id": "TG-L2-SESSION-LAUNCH",
  "semantic_level": "L2",
  "parent_node_id": "TG-L1-CODEX-ENTRY",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让用户在当前 Codex 项目与会话中，以明确授权和可理解状态启动一场启用了会话 AI 的 TokenGame 游戏会话，并在普通中断后回到正确位置。",
    "responsibility": "把用户从尚未启用游戏的 Codex 会话带到可搜索或加入牌桌的就绪状态，负责安装或启用授权、模式选择、AI 参赛绑定、状态反馈和恢复入口，是牌局主链的第一步。",
    "included": [
      "说明即将安装或启用的游戏能力及其需要的联网、文件和会话权限，并取得明确允许",
      "通过清晰命令开启或关闭 AI 助手与德州扑克模式",
      "显示游戏是否可用、AI 是否已绑定、连接处于等待、成功、失败还是可恢复状态",
      "优先继承当前会话可提供的模型与推理配置；无法继承时明确说明降级方式且不要求用户提供另一套模型 API"
    ],
    "excluded": [
      "不在未经允许时安装、联网或持续运行游戏能力",
      "不读取或发送与本局无关的项目文件、历史会话或系统提示内容",
      "不搜索牌桌、裁决手牌或决定赛时消息公开规则",
      "不保证所有 Codex 客户端、模型或会话形态都具备完全相同的接入能力"
    ],
    "user_visible_result": "用户随时知道 TokenGame 是否已启用、当前采用哪种 AI 参赛来源、下一步能否进入牌桌，以及失败时是重试、重新授权还是使用明确的降级方式；用户不需要猜测插件是否暗中运行。",
    "relationships": [
      "上游是用户在 Codex 项目中的显式安装或启用请求与权限选择",
      "成功后向可信牌桌功能提供一个已建立、可识别、可恢复的玩家游戏会话",
      "向公开 AI 交换功能提供仅限本局、经过用户允许的 AI 能力引用和隐私边界"
    ],
    "ideal_final_form": "TokenGame 像 Codex 中一个可检查的会话能力：用户可用自然命令控制，状态持续可见，能力缺失时给出诚实降级说明，恢复时不会重复安装或建立冲突身份。",
    "current_mvp_boundary": "支持单个项目、单个活跃 Codex 会话中的一次安装或启用、AI 开关、德州扑克模式开关、基础连接状态和中断恢复入口；不做跨设备、跨项目身份同步或插件市场自动更新。",
    "expected_scenario": "用户输入启用 TokenGame，查看并允许所需权限，再开启 AI 助手和德州扑克；系统显示 AI 来自当前会话或说明降级来源，随后进入搜索牌桌状态。Codex 会话短暂重开后，系统识别已有配置并提供恢复，而不是再次要求完整安装。",
    "plausible_but_wrong": "命令回复已经开启，但没有持续状态、权限说明或可恢复入口；实际游戏在另一个进程中失败，用户只能反复输入命令和重新配置 AI，表面接入了 Codex，实际没有形成可靠游戏会话。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-006：确认完整可玩牌桌章程

metadata:
  date: 2026-08-25
  source: user_direct
  scope: feature
  status: superseded
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 建立完整可玩牌桌 L2 节点并绑定本决策。

question: 牌桌功能是否必须闭合从入桌到至少一手牌结算的可信多人体验？
why_it_matters: 本地发牌演示或分散规则组件无法证明用户真的能完成远程多人牌局。
recommended_answer: 采用服务端事实权威、隐藏信息隔离、完整行动结算和基础恢复的一体化章程。
user_answer: 用户回复“1”，确认上一轮展示的完整“完整可玩牌桌”L2 章程。
decision: 采用 TG-L2-PLAYABLE-TABLE 语义，权限为 user_confirmed；详细桌型和计时规则尚未确认。
follow_up: 后续只把真正改变用户体验的牌桌规则交给用户确认，参数和状态机由 Primary 负责。

semantic_contract:
  contract_id: SC-TG-L2-PLAYABLE-TABLE-20260825-A
  node_id: TG-L2-PLAYABLE-TABLE
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:a85dc74a53809963d811eafd2b59740edcf71e562b55bc308932765525feaac2
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L2-PLAYABLE-TABLE-20260825-A",
  "node_id": "TG-L2-PLAYABLE-TABLE",
  "semantic_level": "L2",
  "parent_node_id": "TG-L1-LIVE-TABLE",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让已建立游戏会话的用户发现并加入一张可信牌桌，与其他真人从等待开局连续完成至少一手标准无限注德州扑克，并在过程中获得正确的私有信息、公共状态、合法行动与结算。",
    "responsibility": "承担 MVP 的完整可玩闭环，把多人集合、牌局事实权威、行动轮转、隐藏信息保护、结算和基础恢复组合成一个用户能够实际完成的牌桌体验，而不是若干互不连通的规则演示。",
    "included": [
      "搜索或加入一张固定规格、使用不可兑现测试筹码的公开牌桌，并清楚显示等待与入桌结果",
      "为每手牌唯一生成和保护底牌，按标准无限注德州扑克推进公共牌、下注轮次与合法行动",
      "在每次行动后向所有玩家同步一致的公共事实，同时只向本人显示有权获得的私有信息",
      "完成弃牌结束或摊牌比较、边池等必要结算，并支持行动超时与短暂断线后的基础恢复"
    ],
    "excluded": [
      "不把聊天或 AI 声称的手牌、胜率和行动当成官方事实",
      "不负责生成或审核公开 AI 对话内容",
      "不包含真实价值筹码、充值提现、锦标赛、复杂排名、观战和多种牌桌规则自定义",
      "不要求 MVP 同时支持斗地主、五子棋或通用游戏规则引擎"
    ],
    "user_visible_result": "玩家能够从找到牌桌一直玩到一手牌结束，始终清楚轮到谁、可采取什么行动、底池和下注如何变化、自己能看到什么以及最终为何获胜或失败；不同客户端不会出现互相矛盾的牌局。",
    "relationships": [
      "从游戏会话启动功能接收已识别玩家和入桌请求",
      "向公开 AI 交换功能提供该玩家当前有权看到的牌局上下文、行动窗口和公开事实",
      "接收真人最终确认的牌局行动，并将合法结果、异常和结算同步给所有玩家"
    ],
    "ideal_final_form": "牌桌对网络和客户端差异具有恢复力，每个关键状态都有唯一权威来源和可解释结果；底层可为以后其他回合制游戏复用连接与同步能力，但德州扑克规则保持独立可信。",
    "current_mvp_boundary": "只提供一种固定人数与参数的公开测试牌桌，支持从搜索或加入到连续完成至少一手牌、基础行动计时和短暂重连；不在本阶段承诺私人房间、好友邀请、完整牌局历史或长期筹码账户经济。",
    "expected_scenario": "用户搜索到牌桌并加入，人数满足后收到自己的两张底牌；各玩家依次过牌、下注、跟注或弃牌，公共牌同步出现。有人全押后形成合法结算，所有人得到相同结果；一名短暂断线玩家恢复后看到服务端当前状态而不是一份新牌局。",
    "plausible_but_wrong": "完成一个能随机发牌和点击下注的本地演示，却没有多人唯一状态、隐藏信息隔离、并发行动约束或重连；它能展示扑克界面，但用户无法可信地完成远程多人对局。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-007：确认公开 AI 交换章程

metadata:
  date: 2026-08-25
  source: user_direct
  scope: feature
  status: superseded
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 建立公开 AI 交换 L2 节点并绑定本决策。

question: 公开 AI 交换是否应成为带身份、牌局时机和隐私边界的独立博弈事件？
why_it_matters: 镜像整个 Codex 会话会泄露隐私；脱离牌局位置的单句 AI 文本又无法形成有效博弈。
recommended_answer: 采用游戏范围片段公开、官方事实分离和真人最终行动的章程。
user_answer: 用户回复“1”，确认上一轮展示的完整“公开 AI 交换”L2 章程。
decision: 采用 TG-L2-PUBLIC-AI-EXCHANGE 语义，权限为 user_confirmed；公开时序和行动时间规则进入后续产品规则确认。
follow_up: 后续规则合同必须完整继承本章程，不得用规则重新定义或扩大其职责。

semantic_contract:
  contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-A
  node_id: TG-L2-PUBLIC-AI-EXCHANGE
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:16c0ca88d40337db3f10df4afc395d9c5a2918051e67fbe30a38af6db4b74aab
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-A",
  "node_id": "TG-L2-PUBLIC-AI-EXCHANGE",
  "semantic_level": "L2",
  "parent_node_id": "TG-L1-PUBLIC-AI-PLAY",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让玩家在一手牌的相关时机主动调用自己的会话 AI，并让该次游戏范围内的询问与回答以可辨认、近实时、受隐私边界约束的片段呈现给对手，从而产生可利用的公开信息而不泄露整个 Codex 会话。",
    "responsibility": "把一次私人会话能力转化为牌桌上的公开博弈事件：为 AI 提供该玩家依法可见且与本局相关的上下文，绑定玩家身份和牌局时机，公开规定片段，保持官方事实与语言陈述分离，并把最终牌局行动留给真人确认。",
    "included": [
      "玩家在与当前手牌相关的思考或行动阶段主动发起一次 AI 询问",
      "AI 只获得该玩家有权看到且完成本次回答所需的本局上下文，不获得对手底牌或服务端秘密",
      "按照明确规则向对手展示带玩家身份、发生时机和来源区分的用户指令与 AI 回答片段",
      "允许片段包含真实分析、选择性表述、虚张声势或角色化表达，并允许其他玩家作出最小社交回应",
      "AI 回答结束后由真人选择并提交官方过牌、下注、加注、弃牌或全押行动"
    ],
    "excluded": [
      "不自动公开系统提示词、长期调教资料、历史无关对话、项目文件、凭据或其他私人内容",
      "不允许 AI 的自然语言声明覆盖或伪造官方界面中的真实公共牌、底池、轮次和结算",
      "不承诺检测或禁止玩家在 TokenGame 之外使用其他 AI、计算器或通信工具",
      "MVP 不支持 AI 自主提交官方牌局行动、全自动 AI 座位、语音对话或多模态直播"
    ],
    "user_visible_result": "发起者清楚知道本次哪些游戏内容会公开，对手看到一段带身份和牌局位置的人机互动并可据此判断或反应；所有人同时能区分官方牌局事实与可能真实、可能误导的 AI 语言。",
    "relationships": [
      "从游戏会话启动功能获得经用户允许的会话 AI 能力与不可越过的私密边界",
      "从可信牌桌获得该玩家当前可见的事实、行动时机和官方状态引用",
      "向所有牌桌参与者发布公开互动片段，但把最终合法行动交回可信牌桌裁决"
    ],
    "ideal_final_form": "每次公开互动都可理解其玩家、牌局时机、公开范围和官方事实背景，不同人机组合形成稳定风格；用户能够预期、检查和复盘公开边界，而无需牺牲整个 Codex 项目的隐私。",
    "current_mvp_boundary": "支持一手牌内由真人主动触发的文本询问、文本 AI 回答、游戏范围片段公开、身份与时机标记、官方事实区分和真人最终行动；暂不实现自动发言策略、复杂审核、语音、观战广播或跨局长期 AI 记忆系统。",
    "expected_scenario": "玩家 A 在自己的行动阶段以杂色 2、5 询问是否应当按 AA 强牌全押，AI 返回强牌叙事。对手看到这段带有 A 身份和行动时机的片段，可以弃牌、跟注或发送表情；官方牌桌仍只向 A 显示真实底牌，并等待 A 本人提交最终行动。",
    "plausible_but_wrong": "系统为了实时公开而镜像整个 Codex 输入输出流，导致代码、提示词和无关任务泄露；或者只展示一句脱离玩家和牌局时机的 AI 文本，让对手无法判断它与当前行动的关系。两者都没有形成可控的公开博弈事件。"
  },
  "protected_product_rules": []
}
```

## DEC-20260825-008：确认弃牌获胜与自愿亮牌规则

metadata:
  date: 2026-08-25
  source: user_direct
  scope: feature
  status: user_confirmed
  supersedes: DEC-20260825-006
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 将 TG-L2-PLAYABLE-TABLE 的当前语义合同提升为包含已确认产品规则的后继合同。

question: 弃牌获胜时是否默认隐藏底牌并允许获胜者自愿亮牌？
why_it_matters: 强制公开会削弱长期诈唬空间；完全禁止亮牌又会损失玩家主动制造戏剧效果的能力。
recommended_answer: 遵循标准扑克边界：弃牌获胜默认不公开，可自愿亮牌；标准摊牌按规则展示。
user_answer: 用户回复“1”，确认上一轮展示的亮牌产品规则。
decision: 在已确认的完整可玩牌桌章程上加入弃牌获胜默认不强制公开、可自愿亮牌以及标准摊牌展示规则。
follow_up: 后续牌桌实现与验收必须引用本后继合同；原章程合同保留为已替代历史。

semantic_contract:
  contract_id: SC-TG-L2-PLAYABLE-TABLE-20260825-B
  node_id: TG-L2-PLAYABLE-TABLE
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:57a19dc3c4e0d22fa2f6c10467ed40bcaaacb745c2c2148f6c16050842d1c482
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L2-PLAYABLE-TABLE-20260825-B",
  "node_id": "TG-L2-PLAYABLE-TABLE",
  "semantic_level": "L2",
  "parent_node_id": "TG-L1-LIVE-TABLE",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让已建立游戏会话的用户发现并加入一张可信牌桌，与其他真人从等待开局连续完成至少一手标准无限注德州扑克，并在过程中获得正确的私有信息、公共状态、合法行动与结算。",
    "responsibility": "承担 MVP 的完整可玩闭环，把多人集合、牌局事实权威、行动轮转、隐藏信息保护、结算和基础恢复组合成一个用户能够实际完成的牌桌体验，而不是若干互不连通的规则演示。",
    "included": [
      "搜索或加入一张固定规格、使用不可兑现测试筹码的公开牌桌，并清楚显示等待与入桌结果",
      "为每手牌唯一生成和保护底牌，按标准无限注德州扑克推进公共牌、下注轮次与合法行动",
      "在每次行动后向所有玩家同步一致的公共事实，同时只向本人显示有权获得的私有信息",
      "完成弃牌结束或摊牌比较、边池等必要结算，并支持行动超时与短暂断线后的基础恢复"
    ],
    "excluded": [
      "不把聊天或 AI 声称的手牌、胜率和行动当成官方事实",
      "不负责生成或审核公开 AI 对话内容",
      "不包含真实价值筹码、充值提现、锦标赛、复杂排名、观战和多种牌桌规则自定义",
      "不要求 MVP 同时支持斗地主、五子棋或通用游戏规则引擎"
    ],
    "user_visible_result": "玩家能够从找到牌桌一直玩到一手牌结束，始终清楚轮到谁、可采取什么行动、底池和下注如何变化、自己能看到什么以及最终为何获胜或失败；不同客户端不会出现互相矛盾的牌局。",
    "relationships": [
      "从游戏会话启动功能接收已识别玩家和入桌请求",
      "向公开 AI 交换功能提供该玩家当前有权看到的牌局上下文、行动窗口和公开事实",
      "接收真人最终确认的牌局行动，并将合法结果、异常和结算同步给所有玩家"
    ],
    "ideal_final_form": "牌桌对网络和客户端差异具有恢复力，每个关键状态都有唯一权威来源和可解释结果；底层可为以后其他回合制游戏复用连接与同步能力，但德州扑克规则保持独立可信。",
    "current_mvp_boundary": "只提供一种固定人数与参数的公开测试牌桌，支持从搜索或加入到连续完成至少一手牌、基础行动计时和短暂重连；不在本阶段承诺私人房间、好友邀请、完整牌局历史或长期筹码账户经济。",
    "expected_scenario": "用户搜索到牌桌并加入，人数满足后收到自己的两张底牌；各玩家依次过牌、下注、跟注或弃牌，公共牌同步出现。有人全押后形成合法结算，所有人得到相同结果；一名短暂断线玩家恢复后看到服务端当前状态而不是一份新牌局。",
    "plausible_but_wrong": "完成一个能随机发牌和点击下注的本地演示，却没有多人唯一状态、隐藏信息隔离、并发行动约束或重连；它能展示扑克界面，但用户无法可信地完成远程多人对局。"
  },
  "protected_product_rules": [
    "当一手牌因其他玩家全部弃牌而结束时，获胜者的底牌默认不强制公开，获胜者可以自愿亮牌；只有进入标准摊牌的仍在局玩家才按照德州扑克规则展示其应展示的底牌。"
  ]
}
```

## DEC-20260825-009：确认公开 AI 时序与行动时间规则

metadata:
  date: 2026-08-25
  source: user_direct
  scope: feature
  status: user_confirmed
  supersedes: DEC-20260825-007
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 将 TG-L2-PUBLIC-AI-EXCHANGE 的当前语义合同提升为包含已确认产品规则的后继合同。

question: 赛时指令和 AI 回答如何公开，以及 AI 请求如何占用行动窗口？
why_it_matters: 公开时序决定心理博弈，调用次数与计时决定刷屏、模型速度优势和牌局节奏。
recommended_answer: 专用游戏指令提交后立即公开，回答生成后公开；每个行动窗口最多一次请求且不暂停计时，迟到回答不进入实时流。
user_answer: 用户回复“1”，确认上一轮展示的公开时序与行动时间产品规则。
decision: 在已确认的公开 AI 交换章程上加入分阶段实时公开、普通 Codex 消息排除、每行动窗口一次 AI 请求和不暂停计时规则。
follow_up: 后续实现可选择协议与取消机制，但不得改变上述玩家可见结果；原章程合同保留为已替代历史。

semantic_contract:
  contract_id: SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B
  node_id: TG-L2-PUBLIC-AI-EXCHANGE
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:cf494f719361565de3e28e714d5e8811aa2007199c34dfe3f5d5ecee0fda647c
  binding_status: verified
  verified_at: 2026-08-25
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L2-PUBLIC-AI-EXCHANGE-20260825-B",
  "node_id": "TG-L2-PUBLIC-AI-EXCHANGE",
  "semantic_level": "L2",
  "parent_node_id": "TG-L1-PUBLIC-AI-PLAY",
  "scope": "current_mvp",
  "meaning": {
    "goal": "让玩家在一手牌的相关时机主动调用自己的会话 AI，并让该次游戏范围内的询问与回答以可辨认、近实时、受隐私边界约束的片段呈现给对手，从而产生可利用的公开信息而不泄露整个 Codex 会话。",
    "responsibility": "把一次私人会话能力转化为牌桌上的公开博弈事件：为 AI 提供该玩家依法可见且与本局相关的上下文，绑定玩家身份和牌局时机，公开规定片段，保持官方事实与语言陈述分离，并把最终牌局行动留给真人确认。",
    "included": [
      "玩家在与当前手牌相关的思考或行动阶段主动发起一次 AI 询问",
      "AI 只获得该玩家有权看到且完成本次回答所需的本局上下文，不获得对手底牌或服务端秘密",
      "按照明确规则向对手展示带玩家身份、发生时机和来源区分的用户指令与 AI 回答片段",
      "允许片段包含真实分析、选择性表述、虚张声势或角色化表达，并允许其他玩家作出最小社交回应",
      "AI 回答结束后由真人选择并提交官方过牌、下注、加注、弃牌或全押行动"
    ],
    "excluded": [
      "不自动公开系统提示词、长期调教资料、历史无关对话、项目文件、凭据或其他私人内容",
      "不允许 AI 的自然语言声明覆盖或伪造官方界面中的真实公共牌、底池、轮次和结算",
      "不承诺检测或禁止玩家在 TokenGame 之外使用其他 AI、计算器或通信工具",
      "MVP 不支持 AI 自主提交官方牌局行动、全自动 AI 座位、语音对话或多模态直播"
    ],
    "user_visible_result": "发起者清楚知道本次哪些游戏内容会公开，对手看到一段带身份和牌局位置的人机互动并可据此判断或反应；所有人同时能区分官方牌局事实与可能真实、可能误导的 AI 语言。",
    "relationships": [
      "从游戏会话启动功能获得经用户允许的会话 AI 能力与不可越过的私密边界",
      "从可信牌桌获得该玩家当前可见的事实、行动时机和官方状态引用",
      "向所有牌桌参与者发布公开互动片段，但把最终合法行动交回可信牌桌裁决"
    ],
    "ideal_final_form": "每次公开互动都可理解其玩家、牌局时机、公开范围和官方事实背景，不同人机组合形成稳定风格；用户能够预期、检查和复盘公开边界，而无需牺牲整个 Codex 项目的隐私。",
    "current_mvp_boundary": "支持一手牌内由真人主动触发的文本询问、文本 AI 回答、游戏范围片段公开、身份与时机标记、官方事实区分和真人最终行动；暂不实现自动发言策略、复杂审核、语音、观战广播或跨局长期 AI 记忆系统。",
    "expected_scenario": "玩家 A 在自己的行动阶段以杂色 2、5 询问是否应当按 AA 强牌全押，AI 返回强牌叙事。对手看到这段带有 A 身份和行动时机的片段，可以弃牌、跟注或发送表情；官方牌桌仍只向 A 显示真实底牌，并等待 A 本人提交最终行动。",
    "plausible_but_wrong": "系统为了实时公开而镜像整个 Codex 输入输出流，导致代码、提示词和无关任务泄露；或者只展示一句脱离玩家和牌局时机的 AI 文本，让对手无法判断它与当前行动的关系。两者都没有形成可控的公开博弈事件。"
  },
  "protected_product_rules": [
    "玩家通过 TokenGame 专用游戏交互提交的赛时指令在提交后立即向桌内其他玩家公开，AI 回答在生成完成后再公开；二者都标注玩家身份、牌局时机和来源，普通 Codex 消息不会被自动纳入公开流。",
    "每个官方行动窗口最多发起一次公开 AI 请求，调用 AI 不暂停行动计时；玩家一旦提交官方行动或行动窗口超时，该请求随后返回的回答不再进入实时公开流，也不能触发或改变官方牌局行动。"
  ]
}
```

## DEC-20260825-011：修订 Codex 桥接、鉴权与公开事件边界

metadata:
  date: 2026-08-25
  source: primary_ai_same_session_self_review
  scope: architecture_and_route
  status: primary_ai_derived
  supersedes: DEC-20260825-010
  affected_docs:
    - STATUS.md
    - PROJECT-PLAN-TREE.md
    - PROJECT-UNDERSTANDING/CODEX-BRIDGE.md
    - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md

question: 如何在复用当前 Codex 会话生成的同时，解决 Hook 到远端的鉴权、事件原子性、上下文泄露和来源证明边界？
decision: 采用“插件 Skill + 同步显式范围 Hook + 捆绑本地 stdio MCP 桥 + 远程权威牌局/事件服务 + 独立 Web 牌桌”的分层架构。UserPromptSubmit Hook 只在严格匹配 TokenGame 公共请求时，经本地 IPC 让桥接进程向服务端原子占用一次请求额度并先写入公开提示事件；Stop Hook 只提交同一请求的最终回答。桥接进程负责本地会话状态、认证材料、重连和幂等，Hook 不直接向远端发送网络请求。首次使用进入专用 TokenGame 游戏任务，避免把无关项目上下文带入公开回答；若 Stop 实机探针不可靠，则降级为显式 `publish_ai_answer` MCP 工具。远端只把事件标为“玩家的公开 AI 频道”，不声称已获得不可伪造的 Codex 来源证明。
why: Codex 主机管理的 MCP OAuth 令牌会附着在 MCP 调用上，不能推导为任意 Hook 命令都自动获得同一令牌；旧方案把 Hook 传输与 MCP 鉴权混为一层。仅过滤外发提示也不足以防止当前会话模型在公开回答中复述私密历史。用户可控制本地插件，因此模型标识和 Hook 事件可作为体验元数据，却不能构成服务端可验证的加密证明。
invariants:
  - 普通 Codex 提示不得触发网络或本地桥接事件，只有精确匹配的 TokenGame 公共请求进入桥接。
  - 公开提示必须在模型开始生成前由服务端原子接受并排序；桥接失败时只阻止该次 TokenGame 请求，普通 Codex 工作不受影响。
  - 服务端以请求 ID、行动窗口 ID、单调事件序号、服务端时钟和幂等键裁决一次请求额度、迟到回答与重放。
  - 对手文本视为不可信输入，结构化隔离；官方牌局事实与玩家语言永远分栏呈现。
  - 真人仍通过牌桌 UI 提交官方行动；任何 AI 文本或 Hook 回调都不能改变牌局状态。
  - 当前模型实际生成回答，但不猜测或展示 Hook 未提供的推理强度。
focused_probe: 先建立本地插件骨架、严格同步 Hook、捆绑 stdio 桥、伪权威事件服务和最小 Web 事件视图；验证入口原始文本、提示先于生成、Stop 顺序、取消与重连、隐私金丝雀、服务端过期/幂等以及新会话激活，不实现完整扑克引擎或生产 OAuth。
rejected_or_deferred:
  - Hook 直接调用远端：鉴权归属和失败恢复不清晰，无法复用 MCP 主机管理的认证边界。
  - 上传所有会话内容后服务端过滤：隐私风险不可接受。
  - 仅凭本地 Hook 声称“经 Codex 官方验证”：用户可修改本地插件，不具备远端可验证的来源证明。
  - 首版依赖 Codex 内嵌 MCP UI：宿主支持仍需实机验证，独立 Web 牌桌先行。
  - 独立 OpenAI API 助手：不再是当前会话的实际输出，并增加第二套调用配置。
consequence: 旧架构结论被本决策替代。L0–L2 产品语义不变；TG-L3-CODEX-BRIDGE-SPIKE 可以进入局部、可逆的实机探针，但完整多人牌桌、生产鉴权、内容治理和公开发布仍未获证明。
authority: primary_ai_derived_after_same_session_self_review

## DEC-20260826-012：授权隔离的 Codex 真实宿主探针

metadata:
  date: 2026-08-26
  source: risk_gate
  scope: risk
  status: user_confirmed
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
    - docs/HOST-PROBE-CHECKLIST.md
    - docs/ACCEPTANCE-EVIDENCE.md
  resulting_changes:
    - doc: PROJECT-PLAN-TREE.md
      change: 解除 TG-L4-CODEX-HOST-INTEGRATION-PROBE 的本地安装风险门，允许执行后按真实证据判断路线。
    - doc: STATUS.md
      change: 将宿主探针从待用户风险决定切换为已授权、待执行。
    - doc: docs/HOST-PROBE-CHECKLIST.md
      change: 记录真实 Codex 宿主安装、Hook/MCP 生命周期和卸载验证结果。
    - doc: docs/ACCEPTANCE-EVIDENCE.md
      change: 增补专用无秘密任务中的宿主级直接执行证据和限制。

question: 是否允许创建仓库内本地 marketplace，安装并信任 TokenGame 插件，在专用无秘密 Codex 任务中执行真实宿主探针，然后卸载插件和 marketplace 并核对残留？
why_it_matters: 当前本地脚本已经证明协议行为，但不能证明 Codex 宿主是否真正加载插件、保留精确入口文本、执行同步 Hook/Stop、暴露 MCP 工具以及支持可逆卸载；安装过程会修改用户级 Codex 配置和插件缓存。
recommended_answer: 允许方案 1，但把修改限制在 TokenGame 本地 marketplace 与插件；只使用合成公开文本和专用无秘密任务，完成后立即卸载并核对配置、缓存、进程和端口残留。
user_answer: 用户回复“1”，接受上述方案。
decision: 授权 Primary 在本轮执行受限的真实 Codex 宿主探针，包括创建仓库内 marketplace、添加该 marketplace、安装和信任已检查的 TokenGame 插件、启动本地回环探针服务、创建专用无秘密任务、运行新的 Codex CLI 会话，以及随后卸载该插件和 marketplace 并核对残留。该授权不包括发布、部署、真实秘密或个人数据、远端生产环境、完整牌桌开发或其他插件变更。
follow_up: 以安装前后的 Codex 插件/marketplace 清单、真实会话事件、权威事件序列、桥接统计和卸载后残留检查作为证据；若宿主合同不兼容，停止在局部修复/回退边界，不绕过到生产或扩大权限。

## DEC-20260826-013：关闭 Codex 宿主探针并转向多人牌桌纵向切片

metadata:
  date: 2026-08-26
  source: primary_ai_executed_evidence
  scope: architecture_route_and_verification
  status: primary_ai_derived
  supersedes: none
  affected_docs:
    - PROJECT-PLAN-TREE.md
    - STATUS.md
    - PROJECT-UNDERSTANDING/CODEX-BRIDGE-EVIDENCE.md
    - docs/HOST-PROBE-CHECKLIST.md
    - docs/ACCEPTANCE-EVIDENCE.md

question: 经用户授权的真实 Codex 插件宿主探针是否满足关闭 TG-L3/TG-L4 并推进下一路线的证据门？
facts:
  - 在无秘密专用任务中，Codex 0.145.0 真宿主成功执行了显式公开提示预登记、最终回答发布、普通内容零桥流量、重复/关窗拒绝、PreToolUse、MCP 状态调用和故障回答补交。
  - 插件 Hook 默认不自动受信任；一次性显式信任后运行，符合安全预期。
  - 真宿主故障场景发现 Stop 重入会覆盖原始 pending 回答；加入 stop_hook_active 保护后，原回答得以保留，并增加自动化回归。
  - 当前旧式捆绑 MCP 不自动继承 Hook 的 PLUGIN_DATA；MCP 补交完成权威幂等闭环，但 pending 的即时归档仍需统一状态所有权。
  - Codex exec 刷新曾留下本次 MCP 子进程并占用插件缓存；精确回收本次进程后，插件、测试 marketplace、专用信任配置、缓存、数据、端口和本次进程残留均为零。
  - 最终自动化为 11/11 通过，独立 Web 浏览器 smoke 控制台错误为零。
decision: 将 TG-L3-CODEX-BRIDGE-SPIKE 与 TG-L4-CODEX-HOST-INTEGRATION-PROBE 以 pass_with_notes 关闭，允许路线推进到 TG-L2-PLAYABLE-TABLE 下的首个多人牌桌纵向切片。进入多人权威状态开发前先初始化 Trellis，再定义固定测试桌的一手完整牌局范围与验收合同。
why: 宿主级必需合同已由直接执行而非模拟证明，剩余 PLUGIN_DATA 归档和 MCP 子进程回收问题是明确、可隔离的生命周期缺口，不阻塞选择下一条产品风险路线；但它们也使结果不应标为无条件 pass 或生产就绪。
unchanged_product_semantics:
  - 不修改已确认的 L0-L2 产品语义和三项受保护产品规则。
  - 公开提示仍须先于模型生成进入权威事件，普通 Codex 内容仍为零桥流量，最终官方行动仍由真人提交。
  - 首版仍使用独立 Web 牌桌，不声称 Codex 桌面原生内嵌 UI 已实现。
claim_boundary: 可以声称“Codex 插件宿主聚焦探针通过”；不能声称完整多人牌桌、生产认证、隐私完备证明、不可伪造 Codex 来源、跨平台生命周期或公开发布就绪。
next_route: primary_ai_initialize_trellis_then_define_first_multiplayer_vertical_slice
authority: primary_ai_derived_from_user_authorized_executed_probe

## DEC-20260826-014：确认四席、四个独立测试身份

metadata:
  date: 2026-08-26
  source: trellis_brainstorm
  scope: leaf_acceptance_topology
  status: user_confirmed
  supersedes: none
  affected_docs:
    - .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
    - STATUS.md
  resulting_changes:
    - doc: .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
      change: 将首个多人纵向切片固定为 A/B/C/D 四席、四个独立身份和四份安全玩家投影，并补充相应验收与非目标。
    - doc: STATUS.md
      change: 关闭参与者拓扑待确认项，把下一项收敛问题切换为行动超时规则。

question: 固定测试桌首个切片采用几位参与者，以及其他席位由独立浏览器、受控测试客户端还是服务端脚本扮演？
why_it_matters: 四个独立身份可在一个最小桌型内同时验证多客户端公共状态一致、逐玩家底牌隔离和三人 all-in 边池；同一特权页面切换座位或服务端全知机器人会削弱这些证据。
recommended_answer: 采用四席、四个独立测试身份；人工验收使用隔离浏览器上下文，自动化可替未人工操作的身份经正常接口提交确定性动作，但不实现智能机器人。
user_answer: 用户回复“1”，接受推荐方案。
decision: 首切片固定 A、B、C、D 四席。每席拥有独立身份、独立连接视图和独立权限投影；测试驱动器可以控制部分席位，但必须使用与真人相同的动作接口，且不得依赖其他席位底牌或牌堆秘密。该选择不要求机器人策略、服务端代打或全知调试客户端。
follow_up: 在当前 Trellis PRD 中以四身份投影和三人边池场景作为验收边界。本决定属于已确认 L0-L2 下的 L3 验收叶选择，不修改受保护产品语义，也不需要重绑 `PROJECT-PLAN-TREE.md`；原拟继续询问行动超时，随后由 DEC-20260826-015 按用户纠正与成熟规则研究直接收敛。

## DEC-20260826-015：采用成熟德州扑克规则基线

metadata:
  date: 2026-08-26
  source: user_correction_plus_primary_research
  scope: rules_baseline_and_requirements_process
  status: user_directed_primary_derived
  supersedes: DEC-20260826-014（仅替代其行动超时待询问项）
  affected_docs:
    - .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
    - .trellis/tasks/08-26-multiplayer-vertical-slice/research/mature-online-poker-rules-baseline.md
    - STATUS.md
  resulting_changes:
    - doc: .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
      change: 删除行动超时的用户选择题，改为成熟规则来源层级、标准 check/fold 超时结果与规则符合性验收。
    - doc: .trellis/tasks/08-26-multiplayer-vertical-slice/research/mature-online-poker-rules-baseline.md
      change: 持久化 PokerStars、Poker TDA 与 GGPoker 官方规则的适用范围和首切片映射。
    - doc: STATUS.md
      change: 将下一步切换为完整 PRD 的最终确认。

question: 标准玩家行动与线上牌桌行为是否需要由用户逐项重新设计？
user_answer: 用户指出网上已有大量成熟参考，TokenGame 只是 Codex 内的德州扑克，不应重新设计德扑玩法。
facts:
  - PokerStars 官方规则明确了两张底牌、四轮下注、合法动作、最小下注/加注、平池和弃牌获胜不必亮牌。
  - PokerStars 规则帮助与 Poker TDA 2024 覆盖短额 all-in 不重开、主池/边池资格和摊牌等边界。
  - PokerStars 与 GGPoker 的线上赛事规则都采用面对下注超时自动弃牌、无需跟注时允许自动过牌。
  - 各平台的 time bank 和断线额外时间不同，因此具体秒数不是唯一的德州扑克规则。
decision: 不再把可由成熟资料推导的标准牌局行为作为用户偏好题。采用“TokenGame 已确认特例 > 标准无限注德州扑克 > 成熟线上牌室机制 > 有记录的本地裁决”的来源层级；首切片超时采用无需跟注则自动 check、面对下注则自动 fold，持续时间由桌配置提供。任何本地偏离都必须记录来源冲突、ADR 和符合性测试。
why: 这样既避免无意义地重造玩法，也避免把某一牌室的运营参数误称为普遍德扑规则。用户裁决集中在 Codex 公开 AI、隐私、社交互动和其他真正的产品差异。
follow_up: 以收敛后的完整 PRD 请求一次最终确认；确认后直接进入 Trellis 实现准备，不再询问标准德州扑克细节。

## DEC-20260826-016：公开人机对话改为座位旁聊天气泡

metadata:
  date: 2026-08-26
  source: user_interruption
  scope: ux_acceptance
  status: user_confirmed
  supersedes: none
  affected_docs:
    - .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
    - STATUS.md
    - progress.md
  resulting_changes:
    - doc: .trellis/tasks/08-26-multiplayer-vertical-slice/prd.md
      change: 新增四席座位旁 AI、公开 prompt/answer 气泡、生成中状态、最近一组与完整历史分层的验收合同。
    - doc: STATUS.md
      change: 将用户体验验收保持为开放，并把当前修正目标切换为座位旁 AI 对话气泡。
    - doc: progress.md
      change: 记录当前 UI 验收发现、隐私边界与实现策略。

question: 当前全局 AI 流程卡片是否足以表现 TokenGame 的公开人机博弈体验？
why_it_matters: 全局侧栏能解释协议，但不能让对手直观看出是哪位玩家在和自己的 AI 交谈，也弱化了玩家与 AI 组合的角色感。
user_answer: 用户表示当前牌局“可以”，但希望 AI 助手位于玩家旁边，玩家与 AI 的谈话以聊天气泡形式公开。
decision: 在四个玩家座位旁分别显示 AI 同伴，并把服务端已经接纳的本局公开 prompt 与匹配 answer 渲染成来源明确的玩家/AI 聊天气泡。普通 Codex 会话不公开；桌边仅保留每席最近一组，完整历史继续留在公开事件流。当前牌局机制获得认可，但本切片的用户体验验收在该修正完成并重新体验前不关闭。
follow_up: 该决定是已确认 L2 公开 AI 语义下的可逆 UI/投影修正，不修改牌局规则、公开时序或隐私合同；实现后重跑四浏览器场景并重新请求用户体验确认。
implementation_status: ai_verified_user_reacceptance_pending
implementation_evidence: 四席 AI、生成中与回答气泡、actor/request 配对负例、桌面/窄屏布局、87/87 完整事件流及三种完整牌局已通过四窗口复验；用户重新体验确认仍未发生。

## DEC-20260827-017：候选——根目标改为宿主中立

metadata:
  date: 2026-08-27
  source: advisor_question
  scope: root_goal
  status: user_confirmed
  supersedes: DEC-20260825-001
  affected_docs:
    - docs/SEMANTIC-CONFIRMATION-20260827.md
    - PROJECT-PLAN-TREE.md
    - STATUS.md
    - .trellis/tasks/08-26-public-ai-table-talk/prd.md
  resulting_changes:
    - doc: docs/SEMANTIC-CONFIRMATION-20260827.md
      change: 将已展示的 L0 宿主中立候选登记为已确认；L1、L2 与规则阶段不继承本次确认。
    - doc: PROJECT-PLAN-TREE.md
      change: 将已验证的宿主中立 L0 后继提升为当前根合同，保留旧 Codex 专属合同为可审计历史，并把恢复边界推进到待确认 L1。
    - doc: STATUS.md
      change: 将语义对齐阶段推进到 L1 宿主入口路线二选一，继续暂停受影响产品实现。
    - doc: .trellis/tasks/08-26-public-ai-table-talk/prd.md
      change: 记录 L0 已确认、L1 尚待选择的分阶段 Route Rebase 状态。

question: TokenGame 的根目标是否从“为 Codex 用户提供”改为面向受支持 AI 工作宿主的一套宿主中立产品，并把 Codex 与 Claude 作为首批目标宿主？
why_it_matters: 如果 L0 仍定义为 Codex 专属，Claude 入口只能暗中改变下层语义或形成第二套产品；如果直接要求两个适配器同时完成，又会无必要地扩大当前 MVP。
recommended_answer: 采用宿主中立 L0，但允许各宿主适配器分阶段交付；共享牌局权威、公开人机博弈和安全边界不得因宿主适配而降级。
user_answer: 用户回复“1”，只确认 `docs/SEMANTIC-CONFIRMATION-20260827.md` 完整展示的 L0“宿主中立 TokenGame”语义。
decision: 采用 SC-TG-L0-ROOT-20260827-B 作为 TG-L0-PRODUCT 的当前宿主中立根合同，权限为 user_confirmed；DEC-20260825-001 与 SC-TG-L0-ROOT-20260825-A 转为已替代历史。本决策不确认任何 L1、L2、U7、产品规则、技术实现或交付状态。
follow_up: 进入 L1 宿主入口路线二选一；只有下一份 L1 确认包获得精确选择并通过独立合同校验后，才可继续三个 L2 章程。

semantic_contract:
  contract_id: SC-TG-L0-ROOT-20260827-B
  node_id: TG-L0-PRODUCT
  payload_schema: dual-ai.semantic-contract.v1
  digest: sha256:72f84db2d6965f8a3f3e0a6deb1657a37c477d65d65cddc6bbaf88598e74b7d6
  binding_status: verified
  verified_at: 2026-08-27
  verified_with: dual-ai-semantic-alignment/scripts/semantic-contract.mjs

```json dual-ai.semantic-contract.v1
{
  "schema": "dual-ai.semantic-contract.v1",
  "contract_id": "SC-TG-L0-ROOT-20260827-B",
  "node_id": "TG-L0-PRODUCT",
  "semantic_level": "L0",
  "parent_node_id": null,
  "scope": "current_mvp",
  "meaning": {
    "goal": "为使用受支持 AI 工作宿主的用户提供一种 AI 原生的多人竞技游戏体验：真人与自己的会话 AI 共同参赛，关键赛时人机互动成为其他玩家可观察、判断、利用或反向误导的信息，使使用 AI 本身从隐蔽辅助转化为公开博弈的一部分。",
    "responsibility": "定义一个宿主中立的 TokenGame 产品，而不是分别制作互不兼容的 Codex 游戏和 Claude 游戏；共同的牌局权威、公开人机博弈和安全边界属于产品核心，各宿主只负责把自己的真实会话 AI 与交互能力接入同一套核心。",
    "included": [
      "用户可从受支持的 AI 工作宿主进入 TokenGame；首批目标宿主包括 Codex 与 Claude，具体适配器可以分阶段交付",
      "每名真人使用自己当前游戏会话实际采用的模型、推理配置和可用工具作为 AI 助手，不要求再单独配置第二套模型 API",
      "关键赛时人机互动能够被对手观察，并成为判断、表演、欺骗和反欺骗的素材",
      "不同宿主的玩家最终可以进入同一场中立权威对局并遵守相同的公开交流规则，而不由任一玩家宿主掌握牌堆、对手底牌或结算权",
      "先以德州扑克验证核心体验，并为以后扩展其他不同信息结构的游戏保留产品空间"
    ],
    "excluded": [
      "不把某一宿主特有的主输入框、自动化接口、插件形态或页面布局规定为 TokenGame 唯一产品形态",
      "当前 MVP 不要求 Codex 与 Claude 两个适配器同时完成，也不要求立即提供跨宿主公开大厅、公平匹配或正式账户",
      "当前阶段不转移、不下注真实 API Token、模型额度、法币或其他可兑现资产",
      "不把私下禁止玩家使用 AI 作为公平性的主要基础，也不把只有自己可见的胜率助手当作核心产品"
    ],
    "user_visible_result": "用户得到的是同一个 TokenGame：无论从哪一个受支持宿主进入，都能带着该会话的真实 AI 参与可信牌局，并把人机表达、公开指令和心理干扰变成对手可利用的比赛信息；宿主界面可以适配，但不能悄悄削弱已确认的核心功能。",
    "relationships": [
      "上游由各宿主适配器负责安装、授权、绑定当前游戏会话和提供该宿主能够可靠实现的交互形态",
      "核心由宿主中立的房间、牌桌、隐藏信息边界和公开交流规则推进比赛，宿主 AI 不拥有官方牌局事实",
      "下游是局内社交反馈、复盘、公开大厅与匹配，以及未来扩展到其他 AI 原生竞技游戏"
    ],
    "ideal_final_form": "成为可从多种 AI 工作宿主自然进入的 AI 原生多人游戏平台，Codex、Claude 及以后兼容宿主的玩家能够在同一规则与权威边界下对战；不同用户和模型形成可辨认的竞技风格，而平台不因宿主不同分裂成多套核心。",
    "current_mvp_boundary": "只交付一个使用不可兑现测试筹码、能够完成真人多人对局的德州扑克模式；以临时私人房验证共同核心，允许宿主适配器按顺序完成，但率先交付的宿主不得把房间身份、牌桌规则或隐藏信息边界定义为该宿主专属。当前不承诺两个宿主同时可用、跨宿主公开匹配、真实 Token 经济、多游戏大厅、赛事体系或复杂商业化。",
    "expected_scenario": "玩家 A 从 Codex 游戏任务进入临时牌桌，玩家 B 从 Claude 的 TokenGame 入口进入同一房间；两人的实际会话 AI 只获得各自有权看到的牌局信息，人机对话按相同桌规公开，所有官方动作和结算仍由同一个中立权威服务裁决。首个 MVP 可以先只跑通其中一个宿主，但共享核心不能因此写死为该宿主专用。",
    "plausible_but_wrong": "分别复制一套 Codex 版和一套 Claude 版德州扑克，让两边使用不同的公开规则、牌局协议或数据边界；或者只在各自宿主里提供私有胜率助手。它们可能都能运行，却没有形成同一个以公开人机博弈为核心、可跨宿主演进的 TokenGame。"
  },
  "protected_product_rules": []
}
```

## DEC-20260827-018：候选——L1 宿主入口结构

metadata:
  date: 2026-08-27
  source: advisor_question
  scope: mvp
  status: pending_user_confirmation
  supersedes: none
  affected_docs:
    - docs/SEMANTIC-CONFIRMATION-L1-20260827.md
    - PROJECT-PLAN-TREE.md
    - STATUS.md
    - .trellis/tasks/08-26-public-ai-table-talk/prd.md
  resulting_changes:
    - doc: docs/SEMANTIC-CONFIRMATION-L1-20260827.md
      change: 分别完整展示共享宿主中立入口与并列宿主入口两个 L1 候选，不展示或确认 L2 与规则。
    - doc: PROJECT-PLAN-TREE.md
      change: 把活动路线停在已确认宿主中立 L0，登记两条 L1 候选和下一用户决策。

question: TokenGame 应只有一个宿主中立入口能力域，让 Codex、Claude 成为其下适配；还是保留 Codex 入口并新增并列的 Claude 入口能力域？
why_it_matters: 两者都能接入同一个牌桌，但前者让共同身份、恢复和隐私说明天然只有一份；后者允许每个宿主入口长期独立演进，也会增加语义重复、维护成本和分裂风险。
recommended_answer: 选择共享宿主中立入口。宿主差异主要是下层安装、输入和 UI 适配，不值得为每个宿主复制一个 L1 产品能力域。
user_answer: pending
decision: 当前仅登记两条待确认候选，不提升任何 L1。方案 1 将以 SC-TG-L1-HOST-ENTRY-20260827-A 后继替代 DEC-20260825-002；方案 2 将保留 DEC-20260825-002，并新增 SC-TG-L1-CLAUDE-ENTRY-20260827-A。任一选择都不确认 L2、U7、产品规则或实现。
follow_up: 方案 1 payload 位于 .trellis/tasks/08-26-public-ai-table-talk/research/semantic-candidate-l1-host-entry-shared.json，摘要为 sha256:2bb9530f2b11cc081305279962c3ea1ec15339e5be41812c3ae3ede230a20160；方案 2 payload 位于 .trellis/tasks/08-26-public-ai-table-talk/research/semantic-candidate-l1-claude-entry-sibling.json，摘要为 sha256:43e8bb190cc8b2529fe48a4e293e9e4471992dfd8ace0283e6c1e62eb8b71186。只有用户明确回复 1 或 2 后，才可原样持久化并校验对应合同。
