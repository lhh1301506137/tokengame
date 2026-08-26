# 权威牌局引擎与实时传输研究

研究日期：2026-08-26

## 研究问题

首个多人德州扑克纵向切片应如何组织权威规则、私有投影和实时传输，才能在当前无框架 Node.js 项目上最快获得可信证据，同时避免把探针结构固化成生产架构？

## 已核实资料

### 1. SSE 仍足以承担本切片的服务端推送

- WHATWG HTML 标准把 `EventSource` 定义为服务器通过 HTTP 向网页推送数据的接口；连接关闭后客户端会重连。
- 事件 `id` 会形成 `Last-Event-ID`，重连时浏览器把最后事件 ID 发回服务器，适合按单调序号补流。
- 标准建议可用约 15 秒注释心跳应对会丢弃长连接的旧代理。当前服务已经采用 15 秒 keepalive，但尚未消费 `Last-Event-ID` 做缺口恢复。
- 玩家动作本来就需要一次请求/响应的明确接纳或拒绝，因此继续用 HTTP POST 提交动作、SSE 广播权威变化，比在首切片引入双向套接字更简单。

结论：保留 `POST + SSE`，补上玩家身份绑定、`Last-Event-ID`/序号恢复和按玩家投影；不要为了技术观感切换 WebSocket。

### 2. WebSocket 在当前 Node 基线上不是零成本替换

- Node.js 22 的全局 `WebSocket` 是浏览器兼容客户端实现。
- `node:http` 提供底层 `upgrade` 事件，但完整服务器握手、连接认证、心跳、背压、广播和重连语义仍需自行实现或增加库。
- 本切片只有单桌、低频轮流行动；WebSocket 的双向长连接优势尚不足以抵消新增生命周期与测试面。

推导：当以后需要多桌高频状态、双向 presence 或统一移动端连接时再评估 WebSocket；当前 SSE 不妨碍权威领域模型演进。

### 3. 成熟游戏框架验证了“纯 move + 主服务器 + 玩家投影”模式

- boardgame.io 官方文档把 move 定义为不依赖外部状态、无副作用的状态变换；远程 master 保持单一权威源。
- 它提供 `playerView` 来为不同玩家裁剪秘密状态，并说明涉及秘密状态时应禁用客户端乐观计算。
- 其远程多人默认引入 Socket.IO、框架状态/阶段/日志模型和服务器模块。

结论：借用模式，不在本切片引入框架。当前代码已经有事件序号、服务端裁决和自有 Web UI；迁移 boardgame.io 会同时替换传输、状态、日志和身份接口，验证面过大。尤其公开事件日志也必须逐玩家投影，不能只裁剪快照。

### 4. 完整扑克库说明了规则复杂度，但现成选项不宜直接成为当前权威源

- PokerKit 0.7.x 官方文档提供无上限德州扑克状态工厂，并把盲注、发牌、下注收集、亮牌/弃牌、筹码推动等建模为细粒度操作；这支持“扑克规则应是独立领域状态机”的判断。它是 Python 库，引入后会增加第二运行时和跨进程边界，不适合当前 CommonJS 切片。
- `pokersolver` 是 MIT JavaScript 手牌评估器，支持最多 7 张牌、赢家比较和并列；它不负责下注轮转、短额 all-in 是否重新开放加注、边池或私有投影。它可作为经测试向量复核后的候选评估器，但不能替代牌局引擎。
- npm 上的 `miaoda-game-texas-holdem-rules` 0.3.2 声称覆盖 2–9 人单手牌、短额 all-in、边池、分池和玩家视图，接口形态非常贴合；但注册表元数据显示其在 2026-07-28 才创建、约两周内发布 7 个版本、依赖另一个同系列新包，且 `npm view` 未给出 repository。它的公开使用历史和 API 稳定性不足，不能未经 tarball/source/测试向量审计就成为权威规则源。

## 候选方案

### A. 项目内纯领域状态机 + 现有 HTTP/SSE（推荐）

- 新建独立 `src/game/texas-holdem/` 或同等边界，使用 JSON-safe 状态、显式 command、结构化 rejection、确定性牌堆输入和纯状态转换。
- `EventStore`/权威服务负责表级事件序号、身份、截止时间、幂等和传输；领域引擎负责德州扑克规则、合法行动和结算。
- 同时实现 `publicView(state)`、`playerView(state, playerId)` 和安全事件投影；原始权威 state、牌堆和未授权底牌绝不进入网络层。
- 首切片继续 HTTP POST 提交 command，SSE 按事件序号推送或触发快照刷新。
- 手牌评估可先写小而可审计的 5/7 张比较器，或单独审计一个 evaluator 依赖；无论哪种都用相同金牌测试向量交叉验证。

优点：与当前架构连续；测试和隐私边界清晰；以后可替换传输或持久化。  
代价：下注重开、边池、平分奇数筹码等规则必须认真实现和测试，不能把简单 demo 当完成。

### B. 迁移到 boardgame.io

- 用框架 moves/phases/playerView/remote master 重建牌桌。

优点：现成多人同步、身份和阶段框架。  
代价：需要引入其状态、Socket.IO、服务器和客户端抽象；与现有协议/插件桥重合，且仍需自己实现扑克规则与秘密日志过滤。首切片迁移面大于风险收益。

### C. 直接采用完整第三方扑克规则包

- 以新近 Node 包作为规则引擎，只包一层权威会话和 UI。

优点：理论上最快覆盖边池、all-in 和牌型。  
代价：当前候选过新、来源和兼容承诺不足；一旦隐藏状态或短额加注语义有缺陷，错误直接进入权威层。只有完成源码审计、固定版本、许可证记录和交叉测试后才可重新考虑。

## 推荐决定

采用方案 A。具体边界为：

```text
HTTP command -> table authority（身份/版本/幂等/截止）
             -> pure holdem engine（合法性/推进/结算）
             -> committed domain events + new state
             -> per-viewer snapshot/event projection
             -> SSE sequence/reconnect -> Web UI
```

在本切片保留以下扩展点：

- command 带 `command_id` 和 `expected_revision`，为重试与旧客户端拒绝留出稳定语义。
- 牌堆/随机源可注入，生产使用密码学随机，测试使用固定牌序；客户端永远不获得 seed 或剩余牌堆。
- transport 只消费投影，不直接读取原始 state；未来切换 WebSocket 不改扑克引擎。
- 规则 profile 固定版本并写入状态，未来规则变化不悄悄改变历史牌局解释。

## 来源

- [WHATWG HTML：Server-sent events](https://html.spec.whatwg.org/dev/server-sent-events.html)
- [Node.js 22 globals：WebSocket / EventSource](https://nodejs.org/download/release/v22.17.0/docs/api/globals.html)
- [Node.js HTTP API](https://nodejs.org/api/http.html)
- [boardgame.io multiplayer 文档](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/multiplayer.md)
- [boardgame.io Game API / playerView](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/api/Game.md)
- [PokerKit game simulation](https://pokerkit.readthedocs.io/en/stable/simulation.html)
- [pokersolver 官方仓库](https://github.com/goldfire/pokersolver)
- [npm：miaoda-game-texas-holdem-rules](https://www.npmjs.com/package/miaoda-game-texas-holdem-rules)

