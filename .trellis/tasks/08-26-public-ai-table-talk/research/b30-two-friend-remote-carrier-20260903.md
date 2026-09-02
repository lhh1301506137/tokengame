# B30 两好友远程载体与通知协议研究（2026-09-03）

## 问题

在购买正式服务器之前，如何让两台不同设备上的浏览器和各自 Codex 游戏任务接入同一 TokenGame 私人房，同时不直接暴露当前持有席位凭据的本地协调器，也不把实现绑定到一种隧道产品。

## 仓库事实

- `src/host/table-web-host.cjs` 只允许 `127.0.0.1`、`::1`、`localhost` 监听，非回环以 `local_bridge_auth_unresolved` 失败关闭。这条边界是安全门，不应为好友测试直接删除。
- `src/shared/model-connection-file.cjs` 当前只接受本地 `http://` origin；远程连接文件尚未实现。
- `web/table/table.js` 当前以约 700ms 间隔请求 `/api/view`，不依赖 SSE；这使页面可通过普通 HTTPS 反向代理工作。
- 当前 managed wake sender 与牌局协调器运行在同一台机器，只能唤醒这台机器上预配置的 Codex task。异地 B 席必须有运行在 B 电脑上的本席 Connector，中央服务不能直接调用 B 的 Codex。

## 官方载体事实

### Cloudflare Quick Tunnel

- 官方文档：https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/
- 可将 localhost 服务映射到随机 `trycloudflare.com` HTTPS 地址，无需先配置域名，定位是开发和测试，不保证 SLA。
- 官方明确写明 Quick Tunnel 不支持 Server-Sent Events，并有 200 个并发请求的上限。因此它适合本轮两人测试，但不能成为依赖 SSE 的产品协议，也不能写成生产部署方案。

### Tailscale Funnel / Serve

- Funnel 官方文档：https://tailscale.com/docs/reference/tailscale-cli/funnel
- Serve 官方文档：https://tailscale.com/docs/features/tailscale-serve
- Funnel 可用自动 TLS 把本地 HTTP 服务公开到互联网；Serve 只对同一 tailnet 开放。两者都要求主机安装和配置 Tailscale，适合替代测试载体，但不应进入线协议字段或业务判断。

### Node HTTP

- 官方文档：https://nodejs.org/api/http.html
- Node 内置 HTTP 客户端支持流式响应和连接复用，但服务端或代理仍可能关闭空闲连接；客户端必须把断开视为正常可恢复状态。为兼容 Quick Tunnel，本轮采用有界长轮询而非 SSE/WebSocket。

## 方案比较

### A. 回环权威 + 临时 HTTPS 隧道 + 每席出站 Connector（采用）

- 浏览器和 Connector 都访问同一显式 HTTPS public origin。
- 服务器仍只监听 loopback；隧道是可替换运维载体。
- Connector 长轮询本席通知，ACK 一次本地 queue 尝试；真正模型调用仍由本席 Codex 经 MCP 访问权威。
- 优点：不开放玩家入站端口；未来迁移正式服务器时保留协议；能证明两台机器和两个真实宿主。
- 成本：需要新增远程 origin 校验、通知投递/ACK 状态机、Connector CLI 与跨设备验收。

### B. 两人都加入 Tailscale，直接访问主机私网地址

- 实现较快，但把安装 Tailscale 变成产品入口，并仍需处理每席本地 Codex 唤醒。
- 可作为人工排障载体，不能替代 A 的应用层身份、幂等和 Connector 合同。

### C. 中央服务器直接调用双方模型 API

- 与“使用玩家自己的 Codex/Claude 会话模型和强度”冲突，需要收集另一套 API 凭据，也会产生后台影子 AI。
- 明确不采用。

## 决策

采用 A。供应商只出现在运行说明，不进入权威协议。第一批实现使用 provider-neutral HTTPS origin 与长轮询；真人测试时可按当时本机条件选择 Cloudflare Quick Tunnel、Tailscale Funnel 或等价反向代理。任何载体成功只证明网络可达，不能替代 TokenGame 的鉴权、幂等、隐私或真实模型终态证据。
