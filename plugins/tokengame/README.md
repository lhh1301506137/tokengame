# TokenGame Codex 插件

这是 TokenGame 的仓库本地插件包。它通过 Codex Hooks 和本地 MCP 工具，把显式标记的赛时提示与当前会话最终回答同步发布到公开 AI 事件流；同一项目中的独立 Web 页面负责四人德州扑克行动和服务端权威结算。

Codex 0.145.0 真宿主探针已于 2026-08-26 通过，精确范围和限制见项目根目录 `docs/HOST-PROBE-CHECKLIST.md`。插件不会自动全局安装，只使用回环地址开发令牌。安装后的 Hook 也不会自动受信任；授予任务范围信任前应先审阅清单与脚本。

已测试运行时中的旧式捆绑 MCP 进程不会获得 Hook 的 `PLUGIN_DATA`，因此故障回答可以权威补交，但 pending 文件即时归档仍是生命周期限制。开始使用前请先阅读项目根目录的 `README.md` 和 `docs/MULTIPLAYER-VERTICAL-SLICE.md`。
