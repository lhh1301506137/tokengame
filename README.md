# TokenGame

TokenGame 是一个本地优先的德州扑克原型：**2–4 名朋友建一间私人房，用邀请码加入，按正常
无限注德州规则操作，每个人的座位旁显示他与自己宿主 AI 的公开对话。**

两个操作面属于同一局、同一席位、同一份权威状态：

- **Web 牌桌**是真人的筹码操作面。下注、Ready、确认公开范围、亮牌都在这里，由服务端维护
  唯一权威状态并逐玩家投影隐藏信息。
- **宿主对话**（Codex / Claude）是 AI 与入口控制面。该席的 AI 读权威裁剪后的本席上下文，
  发布公开发言。它**不能替真人下注**。

这仍是本地垂直切片，不是生产牌室。完整范围与证据见
[多人牌桌说明](./docs/MULTIPLAYER-VERTICAL-SLICE.md)、[验收证据](./docs/ACCEPTANCE-EVIDENCE.md)
与[宿主适配器合同](./docs/HOST-ADAPTER-CONTRACT.md)。

## 本地运行

要求 Node.js 22 或更高版本；项目没有第三方运行时依赖。默认只监听回环地址。

```powershell
npm test          # 全量单元测试
npm run gate      # 测试 + 全部变异规格（跨平台，PowerShell 与 Git Bash 同一条命令）
npm run web       # 浏览器牌桌，自带内核
```

`npm run web` 打印一行牌桌地址。建房的人在页面上创建房间、拿到邀请码转给朋友；每位朋友在
**独立浏览器上下文**里打开同一地址并用邀请码加入。不要交换带令牌的 URL。

产品形态是内核独立成进程，协调器只是它的客户端：

```powershell
npm run core                      # 权威内核
$env:TOKENGAME_COMMAND_ORIGIN='http://127.0.0.1:43120'; npm run web
```

两种形态行为一致，同一批断言对两种传输各跑一遍。

## 当前验证状态

已有自动化证据：内核规则与隐私、两进程对局、跨席读牌被拒、无人发请求也会开局、四个隔离
浏览器上下文的多人回路、宿主适配器合同与一致性套件。

**尚未验证，不得按已通过对待**：

- 任何真实宿主界面里的实机回路。Codex 界面支持是未关闭的 `U-TG-CODEX-UI-SUPPORT`；
  Claude Desktop / Cowork 本机没有安装，探针从未开始执行。
- 无点击主动唤醒（`proactive_wake`）。任何剖面都未验证，合同层现在直接拒收这项声明。
  没有它就走可见的轮询兜底。
- 四真人 45 分钟试玩签字。
- 浏览器验收用的是 `simulated: true` 的脚本适配器：它证明 UI 到权威这条链路，
  **不证明任何真实 AI 已接通**。

## 代码地图

- `src/game/`：德州扑克领域状态机、牌型比较与底池结算。
- `src/authority/`：宿主中立权威内核。房间与席位、逐玩家投影、服务端时钟、事件序号、
  幂等、发言预算与租约回收。命令面在 `command-surface.cjs`，宿主可发什么在 `host-surface.cjs`。
- `src/contract/adapter-contract.cjs`：两个宿主适配器共享的合同。一套协议、两个权限剖面
  （`host_command` 真人面、`seat_model` 模型面），能力按「角色 + 具体宿主剖面」协商。
- `src/host/`：宿主侧。席位凭据托管（`seat-custody.cjs`）、模型命令面、两份参考适配器、
  浏览器牌桌协调器。
- `web/table/`：当前牌桌 UI。
- `plugins/tokengame/`：仓库内 Skill、Hooks 与 stdio MCP 服务。
- `test/` 与 `test-support/`：自动化测试、四上下文浏览器验收驱动器、变异规格与门禁。
- `artifacts/`：本地验收产物，已在 `.gitignore` 中排除。

## 明确不包含

- 公开大厅、自动匹配、公平场、信用体系、市场；
- 账户、生产 OAuth、反作弊、持久化数据库或真钱/代币；
- 对宿主身份的密码学证明；
- 宿主桌面内嵌牌桌（当前使用独立本地 Web 页）；
- 对隐藏推理过程的获取或公开——只处理用户提交文本与最终助手消息。

## 历史实现：A/B/C/D 显式公开桥

早期版本是另一条路径：固定 A/B/C/D 四个身份的一桌牌，加一条 Codex 公开 AI 桥——以
`$tokengame public <message>` 这类前缀标记提示，由 Hook 在模型生成前登记到权威。入口是
`npm run table`（探针栈，`web/app.js` 与 `src/bridge/`）。

**那条路径已经不是产品路径。** `npm run table` 与 `npm run authority` 原样保留为已替代的
历史证据，`docs/HOST-PROBE-CHECKLIST.md` 记录它当时的实机范围。区别不只是入口名字：那时
席位是四个写死的身份，发言靠前缀触发，行动面与 AI 面分属两个互不相认的栈。现在席位由邀请码
建房产生，发言由权威派发的意图驱动，两面属于同一局同一席位。
