# Codex 真宿主探针记录

日期：2026-08-26（Asia/Shanghai）  
宿主：`codex-cli 0.145.0`，与 Codex 桌面共享插件安装与信任机制  
隔离目录：`H:\tokengold\tokengame-host-probe`

本探针已按 DEC-20260826-012 授权执行并完成卸载。它验证的是 Codex 插件宿主生命周期，不等于验证 Codex 桌面原生牌桌 UI。

## 隔离与安装

- 使用无秘密、无业务代码的专用目录和合成文本。
- 从仓库内 `.agents/plugins/marketplace.json` 添加本地 marketplace，并安装 `tokengame@tokengame-host-probe`。
- 审阅插件清单、Hook 脚本和 MCP 声明后，仅对专用任务使用一次性 `--dangerously-bypass-hook-trust`。默认不信任路径也单独执行并记录。
- 真宿主首次没有加载 Hook。补充 `.codex-plugin/plugin.json` 的显式 `hooks` 字段，并把 Windows Hook 命令改为通过 `PLUGIN_ROOT` 解析脚本后，宿主成功加载。

## 已执行验收

| 场景 | 结果 | 直接观察 |
|---|---|---|
| 公开提示 | 通过 | `$tokengame public 请只回复：HOST_PROBE_OK` 先产生 `AI_PROMPT_PUBLISHED`，随后模型最终消息 `HOST_PROBE_OK` 只产生一个 `AI_ANSWER_PUBLISHED`；请求、窗口与回合绑定一致。 |
| 生成期间工具限制 | 通过 | 模型尝试读取 TokenGame Skill 时，`PreToolUse` 在公开回答完成前拒绝该本地工具调用。 |
| 普通提示与 Stop | 通过 | 普通提示输出 `PRIVATE_HOST_OK`；桥的 `received` 与权威事件数均不增加。 |
| 同一窗口第二次公开请求 | 通过 | Hook 在模型生成前阻止；只有桥的 prompt 路由计数增加，权威事件与回答事件不增加。 |
| 已关闭窗口公开请求 | 通过 | Hook 在模型生成前阻止；权威流只有 reset/open/close，不产生 AI prompt。 |
| MCP 发现与调用 | 通过 | 真宿主发现并调用 `mcp__tokengame__tokengame_probe_status`，返回 `tokengame.local-probe.v1`，桥收到一次 `GET /v1/status`。非交互首次调用因审批取消，不属于 MCP 启动失败。 |
| 默认 Hook 信任 | 通过，符合预期 | 不使用一次性信任绕过时，公开文本正常由模型回答，但 Hook 不运行、桥与权威事件不变；说明安装并不等于自动信任 Hook。 |
| Stop 重入 | 发现缺陷并修复 | 桥故障时 Stop 的二次解释回调曾覆盖原始回答；加入 `stop_hook_active` 保护后，pending 保留原始 `ORIGINAL_OUTAGE_ANSWER`，回归测试覆盖。 |
| 桥故障与 MCP 补交 | 通过，带说明 | prompt 已公开后停止桥，原始回答保留在 pending；恢复桥后由真宿主调用 `publish_ai_answer`，权威流写入同一请求的 `AI_ANSWER_PUBLISHED`，无重复事件。 |
| 卸载与残留核对 | 通过 | 插件和测试 marketplace 已移除，专用信任配置、插件缓存、插件数据、端口和本次产生的 MCP 子进程均清理。 |

相关原始输出保留在 `H:\tokengold\tokengame-host-probe\*-last.txt`；权威事件与桥统计已在执行时逐项核对。

## 修复后边界

- Hook 得到 `PLUGIN_ROOT` 和 `PLUGIN_DATA`；在本次 0.145.0 宿主中，旧式捆绑 stdio MCP 进程没有自动得到 Hook 的 `PLUGIN_DATA`。因此 MCP 补交能完成权威事件闭环，但不能立即把 Hook pending 移入 terminal。该文件会被后续权威终态回调或卸载清理，不影响服务端幂等；生产实现仍应统一状态所有权。
- Codex `exec` 的插件刷新在本机留下了若干本次启动的 MCP 子进程，导致首次卸载时缓存被占用。按父进程、命令行和创建时间精确识别并终止本次进程后，卸载成功；旧的同名/相似进程未被触碰。这是宿主生命周期运维风险，后续需要正常退出与健康回收策略。
- 添加当前文档要求的显式 `hooks` 字段后，本地 plugin-creator 校验器误报该字段不被接受；真实 0.145.0 宿主运行结果和官方插件清单文档支持该字段。该已知校验缺口见 [openai/codex#27141](https://github.com/openai/codex/issues/27141)。
- 未验证 hosted tool 是否受 `PreToolUse` 控制，也未验证 Codex 桌面内嵌 MCP UI；首版仍使用独立 Web 牌桌。

## 清理核对

最终检查结果：TokenGame 安装数 `0`、测试 marketplace 数 `0`、专用信任配置命中 `0`、插件缓存不存在、插件数据不存在、43110/43111 监听数 `0`、本次 TokenGame MCP 残留进程数 `0`。测试生成的 pending/cache/data 已删除，不能恢复；仓库内 marketplace 定义和隔离证据目录有意保留，供复核与再次安装。

## 结论

宿主级入口、同步 prompt 预公开、Stop 回答配对、普通内容零桥流量、失败关闭、显式 MCP 回退、信任默认值和可逆卸载均已直接执行。TG-L3/TG-L4 可关闭为 `pass_with_notes`；仍不能外推为完整多人牌桌、生产认证、跨平台进程管理、隐私完备证明或 Codex 桌面原生 UI 已完成。
