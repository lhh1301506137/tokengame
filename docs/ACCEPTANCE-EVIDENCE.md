# TokenGame 验收证据

日期：2026-08-26（Asia/Shanghai）

## TG-L3 四人牌桌垂直切片

### 自动化结果

- `npm test`：23/23 通过，其中权威 AI 窗口 5、扑克领域/牌桌隔离 10、Hook 集成 3、MCP/HTTP/SSE 5；原有 11 项 Codex 桥接回归全部保留。
- 规则覆盖：四轮行动、七选五与 A2345、最小完整加注、短额 all-in 不重开、三种筹码深度的主池/两层边池、平池奇数筹码、超时 check/fold、默认不亮牌与自愿亮牌。
- 三层池固定场景：B/C/A 分别赢得 160/180/200，最终筹码为 A=200、B=160、C=180、D=0，总量 540 守恒。
- 安全与协议覆盖：玩家令牌不匹配被拒绝；观察者与各玩家投影只含允许的底牌；非当前玩家、非法金额和截止后请求被拒绝；动作版本和幂等受保护；重置只允许在本手结束后进行，成功后的网络重试仍重放原结果；个性化 SSE 首帧不泄漏其他底牌。

### 四玩家浏览器验收

`test-support/four-player-smoke.mjs` 创建四个独立 Chromium context。所有牌局动作都通过 Web UI 和正常玩家接口完成，没有使用特权牌局客户端。已通过三个连续场景：

1. 四个玩家完成 16 个 UI 行动，推进至 river checkdown 和标准摊牌；
2. 一名玩家从 UI all-in，另外三名玩家从各自 UI 跟注，服务端自动发完公共牌并结算；
3. 一名玩家输入最小加注额，另外三名玩家弃牌；赢家默认不亮牌，随后从 UI 自愿亮牌，四个视图同步可见。

### 座位旁公开 AI 验收

同一四窗口烟测先通过正常内部公开请求/回答接口完成 A 的真实 `prompt → generating → answer`，再用权威事件注入覆盖前端负例与通用席位投影。四个视图均通过以下断言：

- A/B/C/D 四席 AI 同伴始终可见；A 的公开 prompt 与匹配 answer 在四个视图文本一致，`aria-busy` 与全局 Prompt/Model/Answer 阶段同步变化。
- B 的合法 `actor + request_id` 独立完成 B 的最近会话；未知 actor、普通事件、孤立 answer、错席 answer、重复请求和旧回答晚到不会污染当前座位气泡。
- HTML 标记与事件属性按纯文本显示，没有创建注入元素或执行脚本；`render_game_to_text()` 给出四席最近会话的完整文本。
- 桌面气泡与公共牌、四个玩家状态及行动区几何不相交；560px 视口把 AI 区域移到牌桌后方，无水平溢出或行动区覆盖。
- 最终四个视图均实际渲染 87/87 条公开事件，证明“每席最近一组”没有误截断右侧完整历史。

这组事件注入只用于验证 UI 投影的失败路径和 B 席通用性，不证明四个真实 Codex 会话已经绑定；当前桥的真实端到端事件仍是 A / `ai:a`。

机器结果：`players=[a,b,c,d]`，公开 AI 投影和三个牌局场景均完成，`event_feed.rendered_events=87`，`console_errors=[]`。四个视图的公共牌局摘要一致，初始隐藏信息检查证明每个 context 只能看到自己的两张底牌。截图已逐张人工检查：

- `artifacts/four-player-smoke/ai-prompt-pending.png`
- `artifacts/four-player-smoke/ai-answer-published.png`
- `artifacts/four-player-smoke/ai-answer-narrow.png`

- `artifacts/four-player-smoke/checkdown-a.png`
- `artifacts/four-player-smoke/all-in-showdown.png`
- `artifacts/four-player-smoke/raise-fold-reveal.png`
- `artifacts/four-player-smoke/result.json`

在 Codex 桌面捆绑运行时中的复现命令：

```powershell
$env:CODEX_BUNDLED_NODE_MODULES='C:\Users\13015\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\13015\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --experimental-loader file:///H:/tokengold/tokengame/test-support/playwright-loader.mjs test-support/four-player-smoke.mjs artifacts/four-player-smoke
```

### 浏览器迭代证据

第一次 UI 运行暴露公共牌绘制参数错误（`label.slice is not a function`），修复后控制台错误清零。视觉检查又发现事件栏撑高 Canvas、未发公共牌误显示为牌背，随后改为固定比例桌面区域和虚线空槽。座位旁 AI 的独立 Trellis 检查进一步发现两项一致性问题：孤立/未知 answer 会误点亮全局 Answer 阶段，以及事件计数超过 80 时 DOM 私自截断；两项均修复并加入四视图回归。单玩家技能客户端也重新验证 Canvas 未受 DOM 气泡层影响，最新产物位于 `artifacts/web-game-client-ai-bubbles/`。

### 切片结论与边界

该切片的 AI 验证结论为 `pass`：单进程本地固定桌已经具备可玩的完整一手无限注德州扑克、四身份隔离、服务端权威裁决、确定性结算、可操作 Web UI 和座位旁公开 AI 气泡。用户已认可牌局机制，但本次气泡修正仍等待用户重新体验确认，因此不能写成“用户已接受”。该结论不覆盖数据库持久化、生产认证、远程并发、公网安全、多桌运营、反串谋、真钱经济、四个真实 Codex 会话绑定或 Codex 内嵌 UI。详细运行边界见 `docs/MULTIPLAYER-VERTICAL-SLICE.md`。

## Codex 桥接聚焦探针（历史基线）

### 自动化

- `npm test`：11 项测试全部通过（权威状态机 5、Hook 集成 3、MCP/HTTP 3）。
- 新增回归覆盖：Stop 重入不会用错误说明覆盖原始回答；MCP 显式补交会把已登记公开提示的回答送入权威事件流。
- Node 语法与运行路径：权威服务、桥、Hooks、MCP 与 Web 脚本均由测试或真宿主执行。
- 插件清单是有效 JSON，真实 `codex-cli 0.145.0` 能安装、加载 Skill/MCP，并在显式信任后加载 Hooks。

自动化覆盖普通 Prompt/Stop 零桥流量、公开 prompt/answer 顺序、一次请求额度、幂等冲突、关闭与截止时间、失败关闭、PreToolUse、Stop 重入、MCP stdio、显式回答补交和静态 UI 合同。

### 校验器兼容性说明

在清单没有显式 `hooks` 字段时，本地 plugin-creator 校验器通过，但真宿主没有加载 Hook。按官方插件清单格式补上 `hooks` 后，真实宿主成功执行，而当前本地校验器误报 `plugin.json field hooks is not accepted by plugin validation`。这是工具版本落后于运行时/文档的假阴性，与 [openai/codex#27141](https://github.com/openai/codex/issues/27141) 记录的问题一致；因此不能继续声称“当前校验器通过”，应以官方清单合同、JSON 解析、自动化和真宿主执行为证据。

### 浏览器

- Playwright 客户端真实点击“关闭当前窗口”，机器状态记录 `ACTION_WINDOW_CLOSED / ui_probe_close`。
- 随后真实点击“打开 2 分钟窗口”，运行公开 Prompt Hook 和 Stop Hook；最终 `render_game_to_text()` 记录 `AI_PROMPT_PUBLISHED` 与 `AI_ANSWER_PUBLISHED`，三个协议阶段均为 `done`。
- 全页 smoke：1440×980，控制台错误 0，事件流连接为 `online`，Canvas 938×654.453。
- 该 UI 是独立 Web 权威事件观察页，不是 Codex 桌面内嵌 MCP UI。

本地截图（生成物不纳入版本控制）：

- `artifacts/full-page-smoke.png`
- `artifacts/ui-close/shot-0.png`
- `artifacts/ui-public-prompt/shot-0.png`
- `artifacts/ui-public-answer/shot-0.png`

### 真实 Codex 宿主

在 `H:\tokengold\tokengame-host-probe` 的无秘密专用任务中，通过仓库本地 marketplace 安装插件并启动新的 Codex 0.145.0 会话。详细逐项记录见 `docs/HOST-PROBE-CHECKLIST.md`。

- 公开提示：`AI_PROMPT_PUBLISHED` 在模型开始生成前写入；最终 `HOST_PROBE_OK` 只发布一次，request/window/turn 绑定一致。
- 普通提示：模型输出 `PRIVATE_HOST_OK`，桥和事件计数均不变。
- 重复请求与关窗请求：均在生成前被 Hook 拒绝，无错误的权威 AI 事件。
- 工具边界：公开回答 pending 期间，`PreToolUse` 拒绝无关本地工具。
- MCP：真宿主发现并调用状态工具，返回 `tokengame.local-probe.v1`；恢复桥后又真实调用 `publish_ai_answer` 完成故障回答补交。
- 信任：插件安装后 Hook 默认不自动运行；只在专用任务一次性明确信任后运行，符合官方安全模型。
- Stop 故障：真宿主暴露了重入覆盖缺陷；修复后 pending 保留原始长回答，并由 MCP 补交为同一权威请求的唯一 answer 事件。
- 卸载：插件、测试 marketplace、专用信任配置、缓存、插件数据、端口和本次产生的 MCP 子进程均已清理。

### 结果与限制

桥接探针结论为 `pass_with_notes`。已直接证明 TokenGame 的 Codex 插件宿主路径可行，包括提示预公开、回答配对、普通内容零桥流量、失败关闭、显式 MCP 回退、信任默认值和可逆卸载。

仍未证明：

- Codex 桌面会渲染自定义内嵌牌桌 UI；首版仍以独立 Web 页为准。
- 生产 OAuth、本地凭据安全、持久化、真实断线重放、多人并发和跨平台进程管理。
- 对任意旧会话上下文的形式化零泄漏，或不可伪造的 Codex 来源证明。
- 四人德州扑克状态机、边池和本地结算已由上方 TG-L3 切片补证；内容治理和公开运营合规仍未证明。

补充生命周期限制：本次运行中 Hook 的 `PLUGIN_DATA` 没有自动出现在旧式捆绑 MCP 进程，因此 MCP 补交后 pending 不能即时归档；权威服务幂等闭环已成立，但生产实现需要统一状态所有权。Codex `exec` 插件刷新还可能留下 MCP 子进程，卸载前需按确切父进程与命令行回收。
