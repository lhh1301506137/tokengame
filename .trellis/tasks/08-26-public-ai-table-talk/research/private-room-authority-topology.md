# MVP-0 临时私人房权威拓扑研究

## 研究问题

2–4 名玩家分别从自己的 Codex 专用游戏任务加入同一临时私人房时，牌堆、底牌、动作时钟、聊天顺序和席位凭据应由谁持有和裁决。

## 当前仓库约束

- `src/authority/table-store.cjs` 已经是单写者权威状态机：服务端持有牌堆与全部底牌，按 viewer 生成逐席投影，并以 `expected_revision`、幂等键和席位 token 裁决动作。
- `src/authority/server.cjs` 目前只监听 `127.0.0.1`，采用内存单固定桌、HTTP + SSE、宽松 CORS 和本地测试 token；进程退出后状态全部丢失。
- 现有结构天然适合把“一张桌”迁移为一个独立的服务端 room actor；不适合把牌局真相复制到四个客户端后再解决冲突。
- Codex 模型调用必须继续留在每名玩家本机。房间权威只接收公开玩家文本和最终 `silent/public_speech` 结果，不应持有 Codex 凭据、隐藏推理或普通项目上下文。
- 德扑负载很低，但隐藏牌信息价值高。这里的首要问题不是带宽或帧同步，而是单序事件、私有投影和避免参赛房主持有全桌秘密。

## 可比较模式与惯例

### 1. 中立专用权威服务

多人游戏常用客户端—服务器模型，由单个服务端维护真实状态并向客户端复制各自可见的投影。Epic 的专用服务器文档明确区分 listen server 与无人参赛的 dedicated server，并指出 listen host 因直接持有真实状态而具有优势；中立服务可以专注裁决输入和信息投影。

按房间分配单写者 actor 是临时牌桌的自然实现。Cloudflare Durable Objects 只是一个可选部署例子，其官方文档明确支持一个对象协调一组 WebSocket 客户端，并以聊天室、多人游戏作为使用场景；这证明“一房一 actor”有成熟托管形态，但不等于 MVP-0 已选定 Cloudflare。

### 2. 玩家本机 listen server

一名玩家同时运行客户端和权威牌桌，其他玩家连接其机器。它最接近当前 Node 原型，早期开发成本最低；但房主持有完整牌堆、全部底牌和席位凭据，技术上可以查看或修改真相，房主断线也会结束房间。它适合本地/受信好友开发模式，不适合作为 TokenGame 核心智斗体验的默认真人验证。

若通过公网直接连接，还需要端口映射、隧道或额外中继；这些运维问题会转嫁给普通玩家。

### 3. P2P / WebRTC

WebRTC 并不消除服务端：官方 MDN 文档说明不同网络的 peer 仍需 signaling，NAT/防火墙环境还需 STUN/TURN；TURN 最终也是中继服务。更关键的是，P2P 只解决传输，不能自然解决德扑的秘密发牌、唯一权威时钟、冲突动作和恶意客户端。若另做多方可验证洗牌/发牌协议，复杂度远超当前 MVP。

## 可行方案

### A. 中立的临时权威房间服务（推荐）

- 每个 room 只有一个权威状态机实例，生成牌堆、裁决动作、分配 event sequence，并按席位输出私有投影。
- 创建房间时生成一次性/短期邀请；兑换后签发绑定 room + seat + session 的短期凭据。邀请本身不能订阅牌局或读取底牌。
- 每名玩家本地协调器把自己的 Codex 最终公开话术提交到房间；模型执行和宿主凭据不离开本机。
- 断线后凭恢复凭据在短窗口内回到原席；空房 TTL 到期销毁。MVP 不做长期账户和战绩。
- 现有 `HoldemHand`/`TableStore` 可继续作为领域核心，但必须把固定桌、查询参数 token、宽松 CORS、内存全局和本地内部 token 改为 room-scoped 合同。

优点：底牌边界清晰；无参赛房主优势；房主客户端断线不拖垮其他人；未来可平滑扩展房间列表或匹配。缺点：需要部署 HTTPS/WSS 服务、房间生命周期、短期凭据、限流和最小运维。

### B. 玩家本机房主

- 复用当前 Node 权威服务，由创建者本机运行，再借助隧道/端口转发供好友连接。

优点：改动和服务成本最低，适合作为开发 fallback。缺点：房主能读取/修改完整牌局真相；房主断线即停桌；NAT、TLS、邀请安全和版本兼容都落到用户身上。不能对外描述为中立牌桌。

### C. P2P / WebRTC 多端共识

- 客户端经 signaling/STUN/TURN 建立数据通道，再实现分布式牌局协调或选举一个 peer 为权威。

优点：理想条件下减少直接游戏流量服务器。缺点：仍需基础设施；隐藏牌和一致性协议极复杂；选出一个 peer 后实际上退化为 B。对四人低带宽回合制游戏没有足够收益。

## 建议

选择 A，并把“中立”限定为部署拓扑而非反作弊承诺：服务端掌握牌局真相，但任何玩家客户端都不掌握对手底牌。MVP-0 可先采用单区域、短生命周期、无数据库或极短恢复存储的一房一 actor 服务；具体云厂商和 WebSocket/SSE 迁移属于实现研究，不应在本轮产品裁决中提前锁定。

B 仅保留为本地开发模式，C 排除出 MVP-0。

## 最新裁决

用户明确公开大厅与自动匹配是正式产品目标，临时自定义房间只是 MVP-0 验证入口。因此选择 A：MVP-0 直接使用中立权威房间服务；邀请系统与未来匹配器只负责签发进入房间的短期 seat ticket，二者复用同一牌局运行、私有投影和 AI 话术协议。玩家本机房主保留为开发沙盒，不进入产品默认路径。

## 来源

- [Epic：Dedicated Servers](https://dev.epicgames.com/documentation/unreal-engine/setting-up-dedicated-servers-in-unreal-engine)：客户端—服务器权威模型，以及 listen server 的参赛房主优势。
- [Cloudflare：Durable Objects WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)：单个房间 actor 协调多客户端的托管模式示例。
- [Cloudflare：What are Durable Objects](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/)：单点协调、WebSocket 与 actor 模型。
- [MDN：WebRTC signaling](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Signaling_and_video_calling)：P2P 仍需要 signaling，并涉及 STUN/TURN 与 NAT 穿透。
