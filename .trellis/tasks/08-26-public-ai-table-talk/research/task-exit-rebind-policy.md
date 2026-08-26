# Codex 游戏任务主动离桌与重新绑定策略

> 决策状态（2026-08-26）：用户选择方案 A，协议名暂定 `VOLUNTARY_EXIT_V1`；暂离与离桌分开，换房/换席必须在旧 binding UNBOUND 后串行 join。

## 研究问题

一个已绑定牌桌的 Codex 游戏任务主动离桌、暂离、换房或换席时，如何同时保证扑克当前手不被回滚、任务不再误公开普通输入、席位凭据及时吊销、AI 不再主动续跑，并且不把主动离桌误当成网络掉线。

## 成熟牌桌惯例

- 现金桌通常允许玩家随时加入或离开；“sit out”则是继续占据桌边位置但暂不参加新手牌，两者是不同操作。
- 玩家带着 live hand 离开时不能拿回已经投入的筹码或回滚其他人的动作；常见结果是弃掉仍可弃的手牌。已经 all-in 的玩家没有后续选择，应按原牌面和边池正常结算。
- 成熟平台还会用重新买入义务或短期返回同桌的筹码要求抑制 ratholing / hit-and-run，但 TokenGame MVP-0 只有房间级临时身份和测试筹码，无法可靠执行跨任务、跨身份惩罚，不应假装已经解决。
- 公共匹配产品可能限制短时间频繁离桌以减少选桌和针对弱手；这是账户与匹配阶段问题，不应塞进临时私人房 MVP。

## 当前仓库事实

- `TableStore` 使用固定 A/B/C/D 四席并在构造时直接开手；没有房间成员、sit-out、leave、seat release 或 session-seat binding 状态机。
- 当前 Hook 只对带显式公开前缀的 prompt 写 pending marker；`Stop` 通过同一 `session_id + turn_id` 发布回答。未来默认公开依赖新增的本机 binding 状态，因此离桌必须先原子改变 binding 路由，再清理 pending/wake，不能只关闭网页。
- 已锁定的掉线策略会保留原席 120 秒；主动离桌是明确意图，不应复用该恢复窗口，否则离桌后凭据仍可操作、换房又可能形成双绑定。
- 扑克动作必须由权威状态机按合法行动顺序执行。主动离桌不能在其他玩家行动时插入越序 fold；可将席位置为 `LEAVE_PENDING`，在该席下一个合法行动点执行唯一 forced fold。已 all-in 或已 fold 的席位等待正常 HAND_SETTLED。

## 方案 A：暂离与离桌分开，换房必须串行（推荐）

提供两个明确操作：

- `Sit out after hand`：当前手仍正常可操作，HAND_SETTLED 后进入 SIT_OUT；保留席位和恢复凭据，任务仍绑定牌桌并保持桌内公开语义，玩家可继续旁观/聊天，之后 Ready 回归下一手。
- `Leave table`：权威接受后立即把本机任务路由从 TABLE_PUBLIC 切到 `LEAVE_PENDING_PRIVATE`，停止该席新聊天、AI wake 和扑克动作提交。尚未 all-in 的 live hand 在下一个合法行动点 forced fold；已 all-in 正常结算。HAND_SETTLED 后释放席位、吊销 seat/recovery/UI capability、删除 session-seat binding，任务恢复普通私密 Codex 语义。
- 换房或换席不提供原子 `switch`；必须等旧绑定进入 UNBOUND 后再执行新的 `join`。这避免一个 Codex session 同时持有两个席位，也使失败重试可幂等归约。

优点：符合牌桌心智，明确区分休息、主动离桌和掉线；不会误公开离桌后的 prompt；不会越序改写当前手。缺点：状态更多，离桌后如仍有 live hand，需要在后台等待手结算才能完全释放席位。

## 方案 B：只允许“本手后离桌”

所有离桌请求都等 HAND_SETTLED 才生效，期间玩家继续正常操作和公开聊天；不提供立即退出。实现最简单，也不会制造 forced fold，但用户急于退出时往往会直接关闭任务，实际退化成 120 秒掉线路径，席位释放慢且体验不诚实。

## 方案 C：立即解绑并按掉线处理

任务马上恢复私密，当前手沿用断线 deadline 的 auto-check/fold，席位和恢复凭据再保留 120 秒。代码可复用最多，但把“我明确要走”误当成“网络可能恢复”；会暂时占座、保留可复用凭据，并让换房期间存在旧席恢复冲突，不推荐。

## 共同安全约束

- `leave_request_id`、forced fold、HAND_SETTLED release 与 credential revoke 都必须幂等；刷新、重复命令、Hook 重入和事件重放不得二次 fold 或释放新占座者。
- `@tokengame leave` 和 UI 离桌按钮属于 LOCAL_CONTROL，永不进入 TABLE_PUBLIC，也不触发模型回答。
- 一旦 leave 被接受，所有 in-flight AI 输出、组件 wake 和 queued continuation 都以 binding generation 校验并丢弃；不能在任务已恢复私密后迟到公开。
- 主动离桌不能退款底池投入、改变已接受动作、展示未公开底牌或绕过 all-in 结算。
- MVP 不承诺阻止用户用新任务/新临时身份重新加入同一私人房；正式 anti-ratholing、选桌限制和离桌处罚依赖未来账户、公共匹配与持久筹码系统。

## 建议

选择方案 A。它把“暂离”和“离桌”拆成用户能理解的两个动作，同时让 Codex 任务的公开边界在离桌接受时立即收紧；换房采用 leave → unbound → join 的串行协议，避免为了一个便利按钮引入双席位、双 AI 和凭据竞态。

## 来源

- [PokerStars：现金桌可以随时加入或离开](https://www.pokerstars.com/help/articles/ring-explanations/)
- [PokerStars：sit-out 与活跃参与规则](https://www.pokerstars.com/help/articles/rules-9-10-warning/)
- [PokerStars：返回同桌与移除筹码规则](https://www.pokerstars.com/help/articles/ratholing-rules-ps/)
- [PokerStars：Seat Me 的提前离桌限制](https://www.pokerstars.com/help/articles/seat-me-introduction/)
