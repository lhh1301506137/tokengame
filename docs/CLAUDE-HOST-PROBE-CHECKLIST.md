# Claude 宿主 Hook + MCP Apps 共存探针清单

状态：`planned_not_executed`

日期：2026-08-27（Asia/Shanghai）

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

## 判定矩阵

| 检查 | 通过条件 | 失败含义 |
|---|---|---|
| C1 Chat 负对照 | UI 可用、Hook 不运行 | F8 的宿主前提需要重查 |
| C2 Cowork Hook | `UserPromptSubmit` 与 `Stop` 各恰好一次 | Cowork 不能承担主输入捕获回路 |
| C3 Cowork MCP App | 同一会话内 UI 可渲染并交互 | F8-bis 的 UI 顾虑成立 |
| C4 同 surface 共存 | 完成 C2/C3 时未切换 surface | 不能把两个分别成功的实验拼成一个产品能力 |
| C5 稳定关联 | 能用宿主字段或显式协议绑定 session/room/seat | 只能展示 UI，不能安全路由公开消息 |
| C6 exactly-once | 正常、重复、重连、超时均只有一个终态 | 不得进入真实桌聊实现 |
| C7 失败关闭 | 无可靠绑定时不公开、不误配座位 | 隐私与完整性门禁失败 |

## 对 D1 的影响

- C1–C7 全部通过：Claude Cowork 的“宿主输入 + 内嵌 UI”技术候选成立；D1 仍是产品选择，不由技术替用户裁决。
- Cowork Hook 通过、MCP App 失败：不能声称同一 Cowork surface 完整可行；需比较外部 Web UI、无内嵌 UI 的 Cowork，或普通 Chat 的内嵌输入方案。
- Cowork MCP App 通过、Hook 失败：共享内嵌聊天框仍可行，但 Claude 主输入捕获不可行。
- 两者共存但 C5/C6/C7 失败：只能证明组件共存，不能作为 TokenGame 入口架构依据。

## 证据与清理

每次运行至少保存：

- Claude Desktop 版本、surface（Chat/Cowork）、插件与 connector 版本；
- 去敏后的 Hook 事件、MCP 请求和 UI 交互序列；
- 每个判定项的直接观察、失败原因和未验证项；
- fixture 源码提交、运行配置摘要、证据文件 SHA-256；
- 卸载、凭据撤销、端点关闭和临时数据清理结果。

若该运行用于语义/架构裁决，把签收所需的最小证据集写入受版本控制的 `evidence/accepted/<run-id>/` 与 manifest；可重复生成的大体积原始输出继续留在忽略目录，不能只在 Plan Tree 中留下一个会随重跑失效的本地路径。
