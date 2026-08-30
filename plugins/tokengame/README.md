# TokenGame 宿主插件

这是 TokenGame 的仓库本地插件包。它让宿主里的模型以**某一席玩家的 AI**身份参与本地牌桌：
读权威裁剪后的本席上下文、发布该席的公开发言。筹码动作不在这一侧——下注、Ready、确认公开
范围、亮牌都由真人在 Web 牌桌提交。

模型能发的命令由 `src/authority/host-surface.cjs` 的 `MODEL_COMMANDS` 唯一确定，`tokengame_table`
的枚举就是它。模型**不传** `seat_id`、`seat_handle` 或任何凭据：席位身份由本机协调器在命令出
宿主之前补齐。详见 `skills/tokengame/SKILL.md`，那份文件与真实 MCP schema 由
`test/plugin-doc-schema-parity.test.cjs` 自动对账。

插件不会自动全局安装，只使用回环地址。安装后的 Hook 不会自动受信任；授予任务范围信任前应先
审阅脚本。

## 本进程要的两个环境变量

模型命令经**本机协调器**出宿主，不直接打核心。所以插件这一侧需要：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `TOKENGAME_MODEL_TOKEN` | 是 | 模型命令口的令牌。由 `npm run beta` 生成并写进文件，人从那里取值填进宿主的 MCP 注册项。没有它一条模型命令都发不出去（`model_command_token_not_configured`）。 |
| `TOKENGAME_TABLE_ORIGIN` | 否 | 协调器地址。默认 `http://127.0.0.1:7802`（`src/shared/endpoints.cjs` 的约定端口），`npm run beta` 默认就监听它，所以通常不用填。 |

`TOKENGAME_COMMAND_ORIGIN` 与 `TOKENGAME_AUTHORITY_TOKEN` **不再是本进程的配置**。那两个是
协调器连核心用的；插件进程不持有权威令牌，也不持有任何席位凭据或会话令牌。

令牌是**进程级**的：持有它就能替这个协调器上所有席位发言。一个协调器 = 一台机器 = 一个人的
席位，朋友内测的形态是每人各跑一个协调器。两个人共用一台机器时，甲的宿主能替乙席说话——
要消除得给每席发一张只覆盖该席的令牌，那条路还没做。

**验证状态**：Codex 0.145.0 真宿主探针于 2026-08-26 通过，精确范围与限制见
`docs/HOST-PROBE-CHECKLIST.md`——那次探针覆盖的是命令派发这条路径，界面支持仍是未关闭的
`U-TG-CODEX-UI-SUPPORT`。Claude Desktop / Cowork 本机没有安装，探针从未开始执行
（`docs/ACCEPTANCE-EVIDENCE.md` 的 Blocked evidence）。无点击主动唤醒在任何剖面上都未验证，
合同层现在直接拒收这项声明；缺它就走可见的轮询兜底。

已测试运行时中的旧式捆绑 MCP 进程不会获得 Hook 的 `PLUGIN_DATA`，因此故障回答可以权威补交，
但 pending 文件即时归档仍是生命周期限制。

开始使用前请先读项目根目录的 `README.md` 与 `docs/MULTIPLAYER-VERTICAL-SLICE.md`。

## 历史实现：A/B/C/D 显式公开桥

早期版本以 `$tokengame public <message>` 这类前缀标记赛时提示，由同步 `UserPromptSubmit` Hook
在模型生成前登记，行动在 A/B/C/D 四个固定身份的 Web 牌桌里提交。那条路径已不是产品路径，
保留说明见 `skills/tokengame/SKILL.md` 末尾一节。
