# TokenGame

TokenGame 是一个本地优先的 Codex 德州扑克原型。当前版本把两条已验证链路放在同一项目里：

- 固定 A/B/C/D 四个独立身份的一桌无限注德州扑克，由服务端维护唯一权威状态并逐玩家投影隐藏信息；
- Codex 公开 AI 桥：复用当前 Codex 会话的模型与推理强度，只公开显式标记的赛时提示和对应最终回答，不再次调用模型 API；A/B/C/D 座位旁分别显示 AI 同伴，每席最近一组公开提问与回答以聊天气泡呈现。

这仍是本地垂直切片，不是生产牌室。完整范围和证据见 [多人牌桌说明](./docs/MULTIPLAYER-VERTICAL-SLICE.md) 与 [验收证据](./docs/ACCEPTANCE-EVIDENCE.md)。

## 本地运行

要求 Node.js 22 或更高版本；项目没有第三方运行时依赖。

```powershell
npm test
npm run table
```

启动输出会打印观察者地址、A/B/C/D 四个带临时身份令牌的玩家地址，以及本地桥地址。每位玩家应在独立浏览器上下文中打开自己的地址；不要交换 URL。按 `Ctrl+C` 同时停止牌桌和桥。默认端口为 `43110` 与 `43111`。

仓库内插件位于 `plugins/tokengame`，本地 marketplace 位于 `.agents/plugins/marketplace.json`。插件的公开提示语法为：

```text
$tokengame public <message>
@tokengame public <message>
[tokengame:public] <message>
```

## 代码地图

- `src/game/`：无第三方运行依赖的德州扑克领域状态机、牌型比较与底池结算。
- `src/authority/`：内存权威服务，管理牌桌身份、逐玩家投影、服务端时钟、事件序号、幂等与公开 AI 窗口。
- `src/bridge/`：只监听回环地址的 Hook/MCP 桥。
- `plugins/tokengame/`：仓库内 Codex Skill、Hooks 与 stdio MCP 服务。
- `web/`：只投影权威状态并提交动作的四人 Canvas 牌桌，以及从权威公开事件派生的座位旁 AI 气泡；不在浏览器内裁决规则或读取普通 Codex 会话。
- `test/`：扑克规则、隐私、HTTP/SSE、Codex 协议与失败关闭自动化测试。
- `test-support/four-player-smoke.mjs`：四个隔离浏览器上下文的 UI 验收驱动器。
- `artifacts/`：本地浏览器验收截图与机器可读状态，已在 `.gitignore` 中排除。

## 明确不包含

- 大厅、匹配、房间、多桌或公网多人服务；
- 账户、生产 OAuth、反作弊、持久化数据库或真钱/代币；
- 对 Codex 身份的密码学证明；
- Codex 桌面内嵌牌桌（当前使用独立本地 Web 页）；
- 对隐藏推理过程的获取或公开——只处理用户提交文本与最终助手消息。
