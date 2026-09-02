# 目录结构

## 总览

当前仓库是单包 Node.js 项目，无第三方运行时依赖。浏览器 UI、宿主侧协调器、权威内核、本地桥、Codex 插件和测试各自独立，不能把这些边界折叠到一个文件或一个运行时状态中。

其中「协调器 ≠ 权威」这条边界最容易被折叠：协调器就在同一个进程里，顺手判一下规则似乎更省事，但那样同一条规则就有了两个实现，而两个实现迟早会分叉。权威只有一份，在 `src/authority/`。

## 现有布局

仓库里同时存在两套牌桌栈，这是刻意的：新栈是产品路径，旧探针栈原样保留为已替代的历史证据。读这份文件时要先分清自己在哪一套里，不要把两者的文件混着改。

```text
web/                         # 无构建步骤的浏览器 UI
  table/                     # 【产品路径】新牌桌 UI，连宿主中立权威内核
    index.html               # 语义结构与可访问性标记
    table.js                 # 只认 /api/view 的 table-view.v1 契约，按权威投影渲染
    table.css                # 设计令牌、布局与响应式样式
  index.html                 # 【已替代】旧探针栈 UI，保留为历史证据
  app.js                     # 【已替代】连旧 /api/table/* 与 EventStore
  styles.css                 # 【已替代】
src/
  game/
    holdem.cjs               # 扑克领域状态机、牌型与底池结算（两套栈共用）
  authority/                 # 权威内核
    room-store.cjs           # 临时私人房、席位归属、Ready 门、120 秒保留窗、暂离与离桌
    seat-ai-store.cjs        # SEAT_AI 七条受保护规则、LIVELY_V1 配额、字素计数
    table-orchestrator.cjs   # 咬合三个内核，不新增任何产品语义
    action-ledger.cjs        # 官方动作幂等账，绑定 hand_id 与 expected_revision
    due-work.cjs             # 到期驱动：玩家不在场时该发生的事按时发生
    command-surface.cjs      # 唯一命令词表
    command-server.cjs       # 进程外传输面（回环、令牌、无静态文件、无 CORS）
    host-surface.cjs         # 可发命令的三分类
    event-store.cjs          # 【已替代】旧探针栈的公开 AI 窗口
    table-store.cjs          # 【已替代】旧探针栈的四固定身份与投影
    server.cjs               # 【已替代】旧探针栈的 API、SSE 与静态文件服务
  host/                      # 宿主侧协调器。不是权威，也不许重新判定受保护规则
    table-web-host.cjs       # 浏览器牌桌协调器：会话、连接、动作转发、出口泄漏扫描
    table-view-model.cjs     # 权威投影 → table-view.v1 视图模型
    core-client.cjs          # InProcess / Http 两种内核客户端，行为必须一致
    seat-custody.cjs         # 席位凭据本机托管，模型只拿进程内存作用域的不透明句柄
    remote-wake-broker.cjs   # 本席通知注册/长轮询/ACK；不生成模型内容，不接收原生任务 ID
    remote-wake-connector.cjs # 宿主中立的出站通知客户端；发送器由适配器注入
  bridge/server.cjs          # 【已替代】插件到旧权威服务的本地受限转发
  shared/http.cjs            # Node HTTP 共用函数
  run-table-core.cjs         # 权威内核进程入口（npm run core）
  run-table-web.cjs          # 浏览器牌桌进程入口（npm run web）
  run-remote-beta.cjs        # 显式 HTTPS 入口下的好友测试启动器；不启动隧道
  run-probe.cjs              # 【已替代】旧探针启动入口
plugins/tokengame/
  hooks/                     # Codex Hook 可执行文件及共享库
  mcp/                       # MCP stdio 服务
  codex/connect.cjs          # 当前 Codex 专用游戏任务的本机连接器启动器
  codex/run-connector.cjs    # 注入 Codex queue 发送器；不把宿主依赖移入中立模块
  skills/tokengame/          # 面向用户的插件技能
test/                        # Node 内置测试运行器的契约与集成测试
test-support/                # 浏览器验收、变异测试驱动、Playwright 定位与测试替身
  mutations/                 # 变异规格 JSON，复核者可重跑同一组变异
docs/                        # 架构、隐私、验收和真实宿主探针说明
```

## 模块归属规则

- 扑克合法动作、轮转、发牌和结算放在 `src/game/`；房间与席位生命周期、AI 公开发言判定与配额、幂等账、到期判定放在 `src/authority/`。这些决定不能放进任何 UI 或协调器文件。
- `src/host/` 是宿主侧，不是权威。协调器可以翻译、聚合、缓存，但不许重新判定任何受保护规则——判定重复一次就等于多一个会漂移的事实源。
- 席位凭据只在 `src/host/seat-custody.cjs` 管的协调器进程内存里。核心继续校验凭据（权威的信任边界不削弱），模型只拿到不可移植的进程内句柄。
- 两个内核客户端（`InProcessCoreClient` / `HttpCoreClient`）的行为必须一致，测试对两种传输各跑一遍同一批断言。只留进程内那种等于默认「宿主嵌内核」，而 L0 否定的正是那个形态。
- 仅负责鉴权、路由映射、超时和上游错误转换的逻辑放在 `src/bridge/`；桥不拥有牌局状态。
- 多个 Node 服务复用的底层 HTTP 逻辑放在 `src/shared/`。
- Codex 进程生命周期相关逻辑放在 `plugins/tokengame/hooks/`；可复用的 stdin、桥请求和 pending-marker 操作集中在 `hook-lib.cjs`。
- 新 UI 的结构、视觉和交互分别留在 `web/table/index.html`、`web/table/table.css`、`web/table/table.js`。
- 游戏与配置工作面共享一份会话/投影；切换工作面不能创建第二套连接、离席或重绑。远程通知状态是传输状态，不是牌局权威或第二个 AI 调度器。
- 测试按被验证的边界命名，例如 `room-store.test.cjs`、`table-web-host.test.cjs`、`due-work.test.cjs`。

## 命名约定

- 文件和目录使用小写 kebab-case，例如 `event-store.cjs`；Codex Hook 事件文件沿用 snake_case，例如 `pre_tool_use.cjs`。
- JavaScript 函数和局部变量使用 camelCase；协议 JSON 字段使用 snake_case，以匹配已公开的线协议。
- 事件类型使用全大写 snake case，例如 `AI_PROMPT_PUBLISHED`。
- DOM `id` 使用 camelCase，CSS 类使用 kebab-case，状态通过 `data-state`、`data-kind` 等属性表达。

## 真实示例

- `src/game/holdem.cjs` 集中实现 `legalActions()`、`act()`、牌型比较和分池支付。
- `src/authority/room-store.cjs` 集中实现 Ready 门与 3 秒倒计时、`DISCONNECT_STRICT_V1` 的 120 秒保留窗、`VOLUNTARY_EXIT_V1` 的暂离与离桌。
- `src/authority/seat-ai-store.cjs` 集中实现七条公开交流规则与 `LIVELY_V1` 四层反刷屏；字素计数用 `Intl.Segmenter`，不用 `String.length`——家庭 emoji 的 UTF-16 长度是 8 但只算 1 个字素，用 length 会让 140 上限被轻易绕过。
- `src/authority/due-work.cjs` 按固定因果顺序 tick：结算过期动作 → 释放过期席位 → 回收过期评估 → 释放过期意图 claim → 促进待定上下文 → 到期开手。到期判定同时在每个读取点自行促进，不取决于驱动跑没跑。
- `src/host/table-web-host.cjs` 承担会话、连接、动作转发与出口泄漏扫描；`table-view-model.cjs` 把权威投影翻译成 `table-view.v1`。
- `web/table/table.js` 的 `refresh()`、`renderSeats()`、`renderActions()`、`renderTimeline()` 分别承担同步、席位投影、合法按钮投影和公开时间线投影。

## 禁止模式

- 不在浏览器内自行判定动作是否合法；客户端时钟只用于倒计时显示。
- 不让 UI 直接读取权威原始事件或任何秘密。浏览器只拿会话令牌，视图与动作两个出口都要做凭据形状与自由文本的泄漏扫描，扫到即按本进程缺陷处理。
- 不在协调器或桥层复制权威的业务规则。
- 不并行维护两套互相矛盾的牌桌。旧探针栈是冻结的历史证据，新功能一律加在新栈上；要改旧栈只能是为了保持它可运行，不是为了让它继续演进。
- 不为尚未采用的 React/TypeScript 目录结构预建空文件夹；技术栈迁移必须另立任务。
- 不把测试产物、插件运行数据或截图当源代码；它们归入 `artifacts/` 或系统临时目录。
