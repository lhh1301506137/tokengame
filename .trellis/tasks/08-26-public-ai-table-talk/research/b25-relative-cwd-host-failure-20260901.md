# B25 Codex Desktop 相对 `cwd` 运行时失败事实包（2026-09-01）

## 范围与授权

- 本批承接 `DEC-20260901-001` 已授权的一次项目配置迁移及一次用户手动 Codex 重启。
- 原生验收上限保持为回环、固定当前游戏任务、最多 1 次通知；不创建任务、不改模型或推理、不接第二 AI、不远程监听、不部署。
- 工具未就绪时不得消耗唯一通知。新的配置改写或第二次宿主重启不在既有授权内。

## 宿主重启与配置识别

- `H:/tokengold/.codex/config.toml` 的写入时刻为 `2026-09-01 22:17:10.846 +08:00`。
- 本批只读进程事实显示最新 Codex 进程创建于 `22:23:40.558`，最新 ChatGPT 进程创建于 `22:23:49.649`，均晚于配置写入；因此不能再把“用户是否真的重启”写为 unknown。
- `codex mcp list --json` 能列出已启用的 `tokengame_project`，命令为 `node`、参数为 `src/run-project-mcp.cjs`，`transport.cwd` 为相对值 `tokengame`。
- 这只证明 CLI 读取并识别配置，不证明 Codex Desktop 已成功启动服务器或把工具注入当前任务。

## 同一任务的直接对照

- 本批重启后、beta 启动前后，当前任务均不存在 `tokengame_project` 的 `tokengame_table` 工具；直接能力检查结果为 `undefined`。
- 当前任务的既有会话记录显示：在 B23 相对化迁移之前，同一任务使用绝对仓库 `cwd` 时曾实际调用 `mcp__tokengame_project__tokengame_table`；一次 `view.projection` 得到 `model_connection_unavailable`。该失败码反而直接证明当时工具面已加载，只是活动连接槽尚不可用。
- 因而本批不是“任务换了”“没有重启”或“只差连接文件”；可复现差异是受管 `cwd` 从已实测可用的绝对仓库路径改为相对项目路径。

## 第二次入口与真实页面流

- 在仓库根重跑 `npm run codex:play -- "H:\\tokengold"`，配置未变化，入口成功启动 `http://127.0.0.1:7802`。
- 启动横幅为进程内内核、无模型 adapter、`managed_wake=available`、`proactive_wake_verified=false`、回环监听；启动本身没有发送通知。
- 两份隔离 Chromium 页面完成：A 建临时房并确认公开范围，B 以邀请码加入并确认公开范围；均未 Ready、未开手、未发公开消息。
- A 打开“连接我的会话 AI”，确认本席 AI 可读取自己的底牌和公开牌局/聊天并公开发言，但不能下注、准备或亮牌；随后下载并激活一次本席连接文件。
- 页面直接显示发送器固定当前游戏任务且不公开 UUID；最多通知次数为 1、最长 60 秒。截图为 `output/playwright/.playwright-cli/page-2026-09-01T14-38-01-665Z.png`，已由主线程实际目检。
- 激活后当前任务仍无 `tokengame_table`，所以没有开启通知窗口，也没有让两席 Ready。最终实际消耗为 0 通知、0 原生模型回合、0 queue、0 权威 `ai.start`/`ai.resolve`。

## 清理

- 已先在页面执行服务端“撤销 AI 连接”，再运行 `npm run connection:clear`；本地活动槽不存在。
- 两个 Playwright 浏览器均正常关闭；beta 收到 SIGINT 后报告端口释放和定时器停止，外层 PTY 退出 1，不能冒充 beta 自然 exit 0。
- 7802 已确认无监听。
- 本批新增一份 166 字节、已撤权、未读取、未删除的下载文件，保留在 Git 忽略的 Playwright 输出目录；删除仍由真人处理。

## 裁决与下一步

B25 裁决为 `codex_desktop_relative_mcp_cwd_runtime_load_failed_before_notification`。对当前 Codex Desktop
载体而言，“相对 `cwd` 可被 CLI 列出”不能充当“项目 MCP 工具可加载”的证据；B23 的相对化技术假设已被
本批直接反证。`proactive_wake_verified` 保持 `false`，`TG-EU-PROACTIVE-WAKE-SPIKE` 与
`TG-EU-PLAYABILITY-GATE` 继续开放。

源码生成器现已恢复 canonical 绝对仓库 `cwd`，同时保持稳定 CLI/UI 输出去敏；旧相对受管块迁移及块外
字节保留已有回归。实现红20/23后绿34/34、定向变异1/1；独立复核修正文档边界后最终24/24、同一变异
1/1，语法与范围检查通过。代码修复本身不等于当前宿主已恢复；真正改写
`H:/tokengold/.codex/config.toml` 并进行第二次手动重启需要新的明确授权。
