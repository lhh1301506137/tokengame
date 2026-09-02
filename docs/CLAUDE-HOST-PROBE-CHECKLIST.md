# Claude 宿主 Hook + MCP Apps 共存探针清单

状态：Claude各门禁仍未执行；Codex的B14固定版本单席queue探针已满足Gate5的直接观察条件，但Gate9清理仍`blocked`，不能据此作架构/产品完成裁决。B10跨手丢弃、B12接入失败保留历史身份。

日期：2026-08-27（Asia/Shanghai）

最新执行记录及状态收尾：2026-08-31。

对应问题：`CLAUDE-SEMANTIC-REVIEW-20260826.md` 的 F8 / F8-bis

用途：只验证 Claude 宿主能力交集，不验证完整 TokenGame、牌局正确性或产品验收。

## 已由官方文档确定的边界

1. [Use plugins in Claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude) 明确说明：插件可用于 Claude Chat、Claude Desktop Chat 与 Cowork，但 Hooks 和 sub-agents 只在 Cowork 运行，在 Chat 中会显示为灰色。
2. [Use interactive connectors in Claude](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude) 明确把 interactive connectors（MCP Apps）列为 Claude、Claude Desktop 与 Cowork 可用能力。
3. [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) 说明自定义 remote connector 可用于 Claude、Claude Desktop 与 Cowork；Cowork 的连接流量经 Anthropic 云端，因此服务必须公网可达。
4. [When to use desktop and web connectors](https://support.claude.com/en/articles/11725091-when-to-use-desktop-and-web-connectors) 区分本地 Desktop Extension 与跨 surface 的 remote connector。

据此，待验证的候选交集不是“普通 Chat + 本地 `.mcpb` + Hook”，而是：

```text
Claude Cowork
  + Claude plugin（UserPromptSubmit / Stop Hooks）
  + remote interactive MCP connector（MCP App UI）
```

官方能力列表只能证明组件被宣称可用，不能证明自定义 TokenGame 插件在同一 Cowork 会话中具备可靠的房间/座位关联、正确的回合触发和 exactly-once 发布。

## 探针前提

- 使用一次性测试插件、一次性测试房间和合成文本；不得使用真实牌局、聊天记录或凭据。
- remote MCP fixture 只暴露一个无副作用探针工具和一个最小交互 UI，不接入生产 TokenGame 服务。
- 为每次运行生成随机 `probe_run_id` 与 `probe_nonce`；日志只保留该 nonce、事件类型、时间和宿主明确提供的关联字段，不记录其他会话内容。
- 公网端点必须启用 HTTPS、最小认证、速率限制和短期日志；不得把本地权威服务或开发目录直接暴露到公网。
- 安装前记录现有 Claude 插件/连接器状态；结束后卸载探针插件、撤销连接器、密钥和公网端点。
- 涉及创建公网端点、安装 Claude 插件或修改 Claude 设置时，必须先取得用户对该次实机探针的明确授权。

## 最小 fixture

### Claude plugin

- `UserPromptSubmit`：只在提示包含本次 `probe_nonce` 时记录 `PROMPT_HOOK_SEEN`。
- `Stop`：只对同一探针运行记录 `STOP_HOOK_SEEN`，不得改写模型回答。
- 日志写入插件自己的临时数据目录；每行包含 `probe_run_id`、事件、单调序号与宿主实际提供的会话字段。
- 若宿主未提供稳定会话标识，原样记录“缺失”，不得自行把窗口标题、文本相似度或时间邻近当作可靠绑定。

### Remote interactive MCP connector

- 一个 `open_probe_app` 工具，返回最小 MCP App UI。
- UI 显示 `probe_run_id`，提供一次按钮点击并产生 `APP_INTERACTION_SEEN`。
- 服务记录 MCP 请求中宿主实际提供的连接/会话元数据；不得假定这些字段必然存在。
- 同一个 `probe_nonce` 的工具调用和 UI 点击均使用幂等键，便于检测重复调用。

## 执行场景

### A. 普通 Claude Desktop Chat（负对照）

1. 在全新 Chat 中启用探针 connector，调用 `open_probe_app`。
2. 确认 MCP App 能内联渲染，按钮点击只产生一次 `APP_INTERACTION_SEEN`。
3. 发送含 `probe_nonce` 的合成提示。
4. 确认插件界面将 Hook 标为不可用于 Chat，且日志中没有 `PROMPT_HOOK_SEEN` / `STOP_HOOK_SEEN`。

预期：UI 通过、Hook 不运行。若 Hook 实际运行，应保存宿主版本与直接证据并重新评估 F8，不能把异常结果静默当成实现便利。

### B. Claude Cowork（能力共存）

1. 新建一次性 Cowork 会话；确认探针 plugin 与 remote connector 均在该会话可用。
2. 在 Cowork 主输入区发送唯一的 `probe_nonce`。
3. 确认 `UserPromptSubmit` 恰好记录一次 `PROMPT_HOOK_SEEN`。
4. 不切换到 Chat 或外部浏览器，在同一 Cowork 会话调用 `open_probe_app` 并点击按钮。
5. 确认 UI 可见、可交互，且服务端恰好记录一次工具调用和一次 UI 交互。
6. 让该合成回合正常结束，确认 `STOP_HOOK_SEEN` 恰好一次，且模型答案未被 Hook 二次改写。
7. 对比 Hook 与 connector 真实提供的关联字段；记录能否建立可验证的 `Cowork session -> TokenGame room -> seat` 绑定。

### C. 最小 TokenGame 回路（仅 B 全部通过后）

1. `UserPromptSubmit` 只把含本次 nonce 的合成公开消息提交到隔离权威 fixture。
2. 权威 fixture 返回一个包含 `request_id`、`source_event_seq` 和 `context_revision` 的测试事件。
3. 同一 Cowork 会话中的 MCP App 显示该事件，并只允许一次幂等确认。
4. 模型回合结束后，`Stop` 只配对同一个 `request_id`；重复 Hook、刷新 UI、重连和超时均不得产生第二条终态。
5. 关闭 fixture 后重试一次，确认失败关闭：不得把未绑定或无法确认去向的文本公开。

场景 C 只证明宿主缝可行，不确认 F1a/F1b/F1c 的最终产品规则；请求额度、迟到发布和默认公开范围仍以用户确认后的后继合同为准。

## 九项门禁与未执行状态

本表是执行记录的唯一状态入口。初始状态全部为 `not_run`；没有原始证据与结果记录时，不得把文档推论、组件分别可用或其他宿主的结果填写为通过。

| 门禁 | 宿主 / surface | 通过条件 | 当前状态 | 失败处置 |
|---|---|---|---|---|
| Gate 1 · Chat 负对照 | Claude Desktop Chat | MCP App 可用，插件 Hook 明确不运行 | `not_run` | 重查 F8 的宿主能力前提 |
| Gate 2 · Cowork Hook | Claude Cowork | `UserPromptSubmit` 与 `Stop` 各恰好一次，且不改写回答 | `not_run` | Cowork 不能承担主输入捕获回路 |
| Gate 3 · Remote connector | Claude Cowork | 公网 remote MCP 可认证、调用并撤销，不依赖本地 `.mcpb` 假设 | `not_run` | 改用有证据的 connector 形态，不得冒充已接通 |
| Gate 4a · Cowork MCP App | Claude Cowork | 同一会话内 UI 可渲染并完成一次交互 | `not_run` | F8-bis 的 UI 顾虑成立 |
| Gate 4b · 同 surface 共存 | Claude Cowork | Gate 2 与 Gate 4a 在同一会话完成，期间不切换到 Chat 或外部浏览器 | `not_run` | 不能把两个分别成功的实验拼成一个产品能力 |
| Gate 5 · 事件驱动主动唤醒 | Codex 与 Claude 分别记录 | 牌局事件在无新玩家提示的情况下恰好启动一次真实模型评估，并产生 `silent` 或 `public_speech` 终态 | Codex B14限定探针`pass`、B20牌局内样本`fail`；Claude `not_run` | 单项通过不等于产品交付；失败后被动回答只能作为待重新确认的降级候选 |
| Gate 6 · 稳定关联 | 目标真实宿主 | 能用宿主字段或显式协议绑定 session / room / seat / binding generation | `not_run` | 只能展示 UI，不能安全路由公开消息 |
| Gate 7 · Exactly-once | 目标真实宿主 | 正常、重复、重连、取消和超时均只有一个权威终态 | `not_run` | 不得进入真实桌聊实现 |
| Gate 8 · 失败关闭 | 目标真实宿主 | 无可靠绑定、服务故障或凭据失效时不公开、不误配座位、不双跑 AI | `not_run` | 隐私与完整性门禁失败 |
| Gate 9 · 证据与清理 | 两个目标宿主 | 证据可复核，插件、connector、凭据、端点和临时数据按授权清理 | Codex B14 `blocked`、B20 `partial`；Claude `not_run` | 运行不能用于架构或产品结论 |

### Gate 5 逐宿主记录

Codex历史实测见 [B10 实机探针](../REVIEW-LOG.md#b10-native-queue-wake-probe)：一次同任务自动唤醒已观察，`user_click_required: no`、`new_user_prompt_required: no`。B12补读原任务工具输出，确认一次ai.start、一次ai.resolve，权威返回hand_advanced，回答跨手丢弃；当时没有成功公开或silent，不能判pass。B12新授权窗口的两次只读准备未发现新MCP，queue和游戏评估均为0，本窗口Gate5为not_run，点击/新提示要求不作测量；详见 [B12记录](../REVIEW-LOG.md#b12-native-receipts-window)。

B14明确席位权限后，原任务1次只读MCP准备成功，3个不同来源各经一次queue启动一次真实评估并成功公开，A无额外点击或提示；三条因果链分别完整保存，不靠拼接历史或queue退出码判定。前两例为等待区，以下单列第3例进行中手牌的记录；完整样本及唯一本批裁决见[B14](../REVIEW-LOG.md#b14-native-public-replies)。

B17随后验证B16连续窗口，但三批4次原任务输入/1次queue只得到第一批readiness的1次MCP调用；第一批专用外壳过早退出，修正后同一既有任务又没有重新启动项目MCP。全程0次`ai.start`、0次`ai.resolve`、0条AI公开，不能形成新的Gate 5通过样本，也不撤销B14限定样本本身。该结果只把连续产品阻塞收窄到宿主工具激活/生命周期边界；精确缓存规则unknown，详见[B17](../REVIEW-LOG.md#b17-native-managed-wake-carrier-boundary)。

B18稳定项目入口解除上述工具重激活载体阻塞；B19在等待区连续两次达到尝试/接收/权威结清
2/2/2，两次均`user_click_required: no`、`new_user_prompt_required: no`并公开。B20首次把有界窗口放进
真实行动期：原生任务同样无需点击或新提示而启动一次，但窗口以尝试1/接收1/结清0、
`wake_start_failed`停止，生命周期记录为0次评估开始、0个turn、0个终态。刻意发送的B消息晚于任务
启动，不是该次queue来源；更早的具体扑克来源unknown。B20因此是失败样本，不是新的Gate 5通过，
也不撤销B14固定版本单席限定样本；B19/B20详见[B19](../REVIEW-LOG.md#b19-stable-managed-wake-native)
与[B20](../REVIEW-LOG.md#b20-hand-active-managed-wake-diagnostic)。

B25在一次已确认的Codex重启后发现：CLI配置列表可识别相对`cwd`的项目服务器，但当前任务没有加载
`tokengame_table`；同一任务旧canonical绝对仓库`cwd`曾实际加载该工具。真实固定目标页面已观察，
但就绪失败时没有开启通知窗口，实际0通知/模型/queue。因此本批Gate 5为`not_run`，
`user_click_required`与`new_user_prompt_required`均为`unknown`，不能用0通知推断主动能力失败或通过；
它只证伪相对`cwd`这一Codex Desktop载体配置。生成器的绝对路径修复尚未迁移或经第二次重启验证，
详见[B25](../REVIEW-LOG.md#b25-relative-cwd-host-failure)。

```yaml
gate_5_run:
  status: pass
  probe_run_id: 2a88e350-cb7d-453b-a742-f13999fcdddb
  host: codex
  host_version: Desktop_26.825.6671.0_local_package_path_and_codex_cli_0.151.0-alpha.7.2
  surface: codex_visible_task
  source_game_event: sae-feee4783-e05d-49ca-9125-e19792ee163c
  source_event_seq: 12
  expected_model_evaluations: one
  observed_model_evaluations: 1
  terminal_result: public_speech
  user_click_required: no
  new_user_prompt_required: no
  same_visible_context_proven: 同一原游戏任务01a052c9-5259-7a61-b26f-35731734994e，无新游戏任务；不代表应用前台焦点全程录像。
  direct_evidence_refs:
    - evidence/probes/b14-codex-queue-native-20260831/native-tools.json
    - evidence/probes/b14-codex-queue-native-20260831/authority-lifecycle.jsonl
    - evidence/probes/b14-codex-queue-native-20260831/browser-observations.json
  caveats:
    - 第1手同手preflop到flop迟到公开，原生样本当时UI漏标，修复另以脚本UI验证。
    - 来源到公开43660ms不是纯推理耗时、实时SLA或长期稳定性。
    - 单次本地queue桥默认关闭，不是完整连续产品入口。
    - Gate9清理blocked，本记录不能用于架构或产品完成裁决，默认能力声明不改。

claude_gate_5_current:
  status: not_run
  host: claude
  host_version: unknown
  surface: unknown
  observed_model_evaluations: unknown
  terminal_result: unknown
  user_click_required: unknown
  new_user_prompt_required: unknown
  same_visible_context_proven: unknown
  direct_evidence_refs: []
```

Gate9本批缺口：权限已撤销且旧连接被拒，临时配置、beta及页面已关闭，捕获完整；但失效私有文件删除与宿主管理MCP终止命令被工具策略拒绝，未尝试替代路径。因此不进入`evidence/accepted/`，最小可复核事实放在`evidence/probes/b14-codex-queue-native-20260831/`并附manifest，未提交。

后续本地 beta 窗口可按[本地 AI 终态记录](./AI-LIFECYCLE-RECEIPTS.md)另行启用去敏记录，用于确认权威接受的评估开始及可观察终态。它不能证明模型身份、用户点击情况或被拒的 MCP 请求次数；记录不完整时仍是 unknown。不得拿 B11 脚本测试改写上述 B10 结果，也不得沿用已用尽的实机调用授权。

Codex接入准备须另分三层：磁盘配置被读取、独立MCP客户端可用、原游戏任务真正加载并暴露工具。前两层不能替代第三层。B13只读检查本机`0.151.0-alpha.7.2`生成协议发现`mcpServerStatus/list`可带`threadId`并返回`runtimeStatus`，但接口存在不等于已读到实际实例。B14通过原任务真实发现并成功调用游戏MCP证明当批可用，而非拿配置、独立stdio或`null`状态替代；后续新批次仍需实际就绪检查。

[此前核对的官方App Server文档](https://developers.openai.com/codex/app-server#api-overview)说明`config/mcpServer/reload`会为已加载任务排队刷新；当时本机协议中该请求无单任务参数。不能把它称为“只刷新这个游戏任务”，也不能由请求成功推断工具已可用。涉及其他任务的刷新须先说明影响并取得授权；准备失败就停止后续queue，不靠重复模型输入探测连接。B13/B14没有执行全局刷新或宿主重启；B14新批次成功并不能确定B12当时的工具发现失败根因。

Gate 5 必须为 Codex 与 Claude 各保存一份记录，不能用一侧结果外推另一侧。每次运行复制下面字段并填写真实观察：

```yaml
gate_5_run:
  status: not_run | pass | fail | blocked
  probe_run_id:
  host: codex | claude
  host_version:
  surface: codex_visible_task | claude_chat | claude_cowork | other
  source_game_event:
  source_event_seq:
  expected_model_evaluations: one
  observed_model_evaluations:
  terminal_result: silent | public_speech | none | duplicate | unknown
  user_click_required: yes | no | unknown
  new_user_prompt_required: yes | no | unknown
  same_visible_context_proven:
  direct_evidence_refs: []
  caveats: []
```

`user_click_required: no`、`new_user_prompt_required: no`、恰好一次真实模型评估以及唯一合法终态同时有直接证据，才支持“事件驱动主动发言”。如果需要用户点击或补发提示，只能证明被动/半主动交互，Gate 5 对主动 AI 判为失败。该失败不是可由实现层自行吸收的 UI 差异：先交付被动回答必须回到受影响的 L2/产品规则确认，不能静默宣称与主动 AI 功能等价。

## 对 D1 的影响

- Gate 1–9 全部通过：Claude Cowork 的“宿主输入 + 内嵌 UI + 主动 AI”技术候选成立；这仍是宿主能力证据，不自动确认产品语义。
- Cowork Hook 通过、MCP App 失败：不能声称同一 Cowork surface 完整可行；需比较外部 Web UI、无内嵌 UI 的 Cowork，或普通 Chat 的内嵌输入方案。
- Cowork MCP App 通过、Hook 失败：共享内嵌聊天框仍可行，但 Claude 主输入捕获不可行。
- 两者共存但 Gate 5–8 任一失败：只能证明组件共存，不能声称主动公开 AI 闭环已经成立。

## 证据与清理

每次运行至少保存：

- Claude Desktop 版本、surface（Chat/Cowork）、插件与 connector 版本；
- 去敏后的 Hook 事件、MCP 请求和 UI 交互序列；
- 每个判定项的直接观察、失败原因和未验证项；
- fixture 源码提交、运行配置摘要、证据文件 SHA-256；
- 卸载、凭据撤销、端点关闭和临时数据清理结果。

若该运行用于语义/架构裁决，把签收所需的最小证据集写入受版本控制的 `evidence/accepted/<run-id>/` 与 manifest；可重复生成的大体积原始输出继续留在忽略目录，不能只在 Plan Tree 中留下一个会随重跑失效的本地路径。
