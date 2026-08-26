# Codex 会话桥接聚焦探针

## 结论

本地协议闭环已跑通：Codex 可以继续使用当前会话选定的模型与推理强度，TokenGame 不需要单独配置或再次请求模型。仓库内插件通过同步 `UserPromptSubmit` Hook 在生成前登记明确标记的公开提示，通过 `Stop` Hook 发布最终助手消息；MCP 只提供状态、窗口控制和失败后的显式回答补交。

这个结论现在同时由本地脚本、服务、浏览器、11 项自动化测试和 `codex-cli 0.145.0` 真插件宿主支持。可准确表述为“Codex 插件宿主聚焦探针通过，带生命周期说明”；它仍不等于完整多人牌桌、生产集成或 Codex 桌面原生牌桌 UI 已完成。

## 协议顺序

1. 用户在专用 TokenGame 任务中提交 `$tokengame public <message>`。
2. `UserPromptSubmit` Hook 严格识别前缀；普通提示立即退出，不进行 IPC。
3. Hook 同步调用回环桥；桥把请求转交伪权威服务。
4. 权威服务检查窗口、服务端截止时间、每窗口一次 AI 请求额度和幂等键；成功后先写入 `AI_PROMPT_PUBLISHED` 事件。
5. 只有收到成功响应，Hook 才允许 Codex 继续生成并注入最小公开回合约束；失败则返回 `decision: block`。
6. Hook 在 `PLUGIN_DATA/pending` 写入与 `session_id + turn_id` 绑定的最小待提交标记。
7. Codex 生成最终回答。TokenGame 不访问隐藏推理，只接收 `last_assistant_message`。
8. `Stop` Hook 仅在精确待提交标记存在时调用桥，权威服务在窗口仍开放时写入 `AI_ANSWER_PUBLISHED`。
9. Stop 成功或权威终态拒绝后，待提交标记被移到 `PLUGIN_DATA/terminal`；桥临时不可达时保留原始标记，可由 `publish_ai_answer` MCP 工具显式补交。真宿主已证明补交能完成权威事件闭环；当前旧式捆绑 MCP 进程没有自动继承 Hook 的 `PLUGIN_DATA`，所以补交后的本地标记即时归档仍需统一状态所有权。

```text
Codex task
  UserPromptSubmit Hook ──sync──> local bridge ──> fake authority ──> public event feed
  model generation
  Stop Hook ──────────────sync──> local bridge ──> fake authority ──> public event feed
                                                 └───────────────> Web observer UI
```

## 已执行的不变量

| 不变量 | 实现 | 自动化证据 |
|---|---|---|
| 普通提示不进入 TokenGame | Hook 前缀解析后直接返回 | 桥 `received` 保持 0 |
| 普通 Stop 不进入 TokenGame | 没有精确 pending 标记就返回 `{}` | 桥 `received` 保持 0 |
| 提示先公开、后生成 | Hook 等待权威服务 2xx，事件写入后才返回上下文 | Hook 集成测试在返回后立即看到 prompt 事件 |
| 每窗口最多一次 AI 请求 | 权威状态机原子占用 `ai_request` | 第二个不同请求得到 409 |
| 网络重试不重复公开 | prompt/answer 独立幂等键与内容指纹 | 同内容重放不增加事件，不同内容冲突 |
| 迟到回答不进入事件流 | 服务端时钟在截止时刻结算关闭 | prompt 保留，answer 缺失，close 只产生一次 |
| 桥或权威故障失败关闭 | 公开提示 Hook 返回 `decision: block` | 桥断开与窗口关闭两条测试 |
| 回答期间限制本地工具 | pending 存在时 `PreToolUse` 拒绝非 TokenGame 工具 | 集成测试验证 deny 与零额外桥流量 |
| Stop 重入不覆盖原回答 | `stop_hook_active` 时立即退出，不处理第二次 Stop | 自动化回归与真宿主桥故障场景均通过 |
| 显式 MCP 故障补交 | `publish_ai_answer` 复用 request/window/turn 和幂等键 | 自动化与真宿主均写入唯一 answer 事件 |

## 已发现并修复的状态问题

首次浏览器点击时发现：UI 已按截止时间显示窗口过期，但权威服务只在写请求时结算超时，造成 UI 与服务端短暂分叉。现在任何公开状态读取都会先结算到期窗口，并保证 `ACTION_WINDOW_CLOSED` 只写一次；对应回归测试已加入。

## 真实宿主结论

2026-08-26 在无秘密专用任务中完成了本地 marketplace 安装、新 Codex 会话、显式 Hook 信任、公开/普通/重复/关窗路径、PreToolUse、MCP 状态调用、桥故障补交和卸载清理。原始 `$tokengame public` 前缀与 Unicode 文本保持可识别；`UserPromptSubmit` 在生成前同步阻塞，`Stop` 提供最终回答，MCP 服务可被真宿主发现和调用。

探针也发现并固定了三个运行时事实：清单必须显式声明 `hooks` 才能在本机可靠加载；安装的 Hook 默认不自动受信任；Stop 故障说明会触发重入，必须用 `stop_hook_active` 防止覆盖原回答。详细证据见 `HOST-PROBE-CHECKLIST.md`。

仍需在产品化前处理：旧式捆绑 MCP 与 Hook 的 `PLUGIN_DATA` 状态共享、MCP 子进程正常回收、生产认证、跨平台、多人并发与隐私金丝雀。未验证 hosted tool 的 PreToolUse 行为，也不应推进公开 marketplace 或远程多人发布。

## UI 的定位

`web/` 是权威事件的观察者和本地窗口控制器，不是游戏真相源。中心三张协议卡只表示 `PROMPT → MODEL → ANSWER` 的完成阶段；它没有手牌、下注或胜负逻辑，避免用视觉完成度掩盖协议尚处于探针阶段。
