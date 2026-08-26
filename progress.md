Original prompt: 继续（恢复并实现 TG-L3-CODEX-BRIDGE-SPIKE 本地聚焦探针）

# TokenGame 开发进度

## 2026-08-25

- 已按 `plugin-creator` 生成仓库内 `plugins/tokengame` 骨架；尚未安装到全局，也未发布。
- 已确认本轮边界：只验证 Codex Hook/MCP、本地桥、伪权威事件服务与最小 Web 观察页，不实现完整德州扑克。
- 已实现两个隔离的回环服务：`fake-authority` 管理服务端时钟、事件序号、一次请求额度与幂等；`bridge` 作为 Hook/MCP 的唯一入口。
- 已补齐仓库内插件的 `UserPromptSubmit`、`Stop`、`PreToolUse` Hooks、显式回答补交 MCP 工具与 `$tokengame` Skill；插件结构校验通过。
- 普通提示在 Hook 本地解析后直接结束，公开提示在权威服务接受前失败关闭；自动化已证明这两个不变量。
- 已实现 Canvas 牌桌事件观察页和权威事件侧栏；公开 Prompt、Model、Answer 三阶段只反映真实事件，不模拟扑克规则。
- `npm test` 9/9 通过；插件结构校验通过。
- Playwright 已点击关闭/重开窗口并完成公开 prompt→answer 流程；全页控制台错误为 0，最终截图为 `artifacts/full-page-smoke.png`。
- 浏览器发现的到期窗口状态分叉已修复并增加回归测试。
- 已写入协议、安全边界、宿主探针清单和验收证据。
- 当前结论：本地协议探针通过；真实 Codex Desktop 宿主仍待授权安装验证，路线不进入完整牌桌开发。

## 2026-08-26 — TG-L3 多人牌桌垂直切片

- 用户已最终确认 PRD，任务从 `planning` 切换为 `in_progress`。
- 固定范围：A/B/C/D 四个独立测试身份、服务端唯一权威状态、逐玩家隐藏信息投影、一手完整无限注德州扑克、标准摊牌与至少一个三人边池场景。
- 规则策略：成熟无限注德州扑克优先；TokenGame 只定义 Codex 公开 AI、隐私与本地测试边界。超时默认可过牌则自动过牌，否则自动弃牌。
- 实现路线：先新增独立扑克领域模块和表级权威包装，再接 HTTP/SSE 与浏览器 UI；保留现有 Codex 桥接探针合同与 11 项回归。
- 验证要求：Node 确定性规则测试、HTTP 身份隔离测试、现有 `npm test`、Playwright 多身份操作与截图/控制台检查。
- 当前 TODO：实现领域状态机、身份令牌投影、API/SSE、四人 UI、规则符合性测试和浏览器验收。
- 已新增 `src/game/holdem.cjs`：标准发牌/位置、四轮下注、最小完整加注、短额 all-in、主池/多层边池、七选五牌型、平池奇数筹码、摊牌和弃牌获胜。
- 已新增 `src/authority/table-store.cjs`：四身份令牌、逐玩家投影、版本校验、幂等动作、超时自动动作、事件序列和自愿亮牌。
- 已把个性化牌桌状态、动作、亮牌、重置和 SSE 路由接入权威 HTTP 服务；现有 11 项 Codex 桥接回归继续通过。
- 新增 `test/holdem-engine.test.cjs`，并扩展 HTTP/SSE 集成测试；完整 `npm test` 当前 23/23 通过，原有 11 项 Codex 桥接回归保持通过。
- 已将观察页替换为可操作的四人 Canvas 牌桌；按钮完全由服务端合法动作投影驱动，支持下注金额、all-in、自愿亮牌和 A 发起下一手。
- 四个隔离 Chromium context 已分别以 A/B/C/D 身份经 UI 完成 checkdown 摊牌、四人 all-in、加注后三人弃牌及赢家自愿亮牌；公共状态一致、隐藏底牌隔离、控制台错误为 0。
- 浏览器验收中发现并修复公共牌参数错误、牌桌纵向拉伸和未发公共牌误显示牌背；补充重置幂等重放与平池奇数筹码回归。
- 当前下一步：执行 Trellis 独立质量检查，修复发现项，更新状态/验收证据并收口本地任务；不扩大到生产认证、数据库或 Codex 内嵌 UI。
- 用户体验验收反馈：牌局机制可以，但 AI 助手应位于各玩家座位旁，玩家与 AI 的公开谈话应以聊天气泡呈现；因此用户验收保持开放。
- 解释边界：只显示服务端已接纳的 `AI_PROMPT_PUBLISHED` / `AI_ANSWER_PUBLISHED`，不显示普通 Codex 会话；按 `actor` 与 `request_id` 派生每席最近一组，完整历史保留在右侧事件流。
- 实现计划：在 Canvas 上方增加可访问的四席 AI DOM 覆盖层，显示玩家 prompt、AI 生成中与 answer；扩展 `render_game_to_text()` 和四浏览器 smoke，验证四视图一致、长文本不挡牌、未知来源不显示、控制台零错误。
- 已实现 A/B/C/D 四席 AI 同伴与逐席最近公开对话；合法 prompt/answer 按 `actor + request_id` 配对，等待回答显示生成中，普通/未知/孤立/错席/重复/迟到事件均不能污染当前气泡，HTML 标记只按文本展示。
- 独立 Trellis 检查发现并修复两项一致性问题：非法 answer 曾误点亮全局 Model/Answer；公开事件计数超过 80 时 DOM 曾截断历史。现全局阶段只跟随最新合法会话，四视图事件计数与实际列表均为 87/87。
- 最终主验证：`npm test` 23/23，四窗口 Playwright 公开 AI、16 动作 checkdown、四人 all-in、加注弃牌与自愿亮牌全部通过，`console_errors=[]`；桌面和 560px 窄屏截图已人工检查，Canvas 技能客户端回归通过，服务端口已释放。
- 当前下一步：请用户重新体验座位旁 AI 与聊天气泡。当前桥仍只端到端产生 A / `ai:a`；B/C/D 前端通用投影已验证，但不等于四个真实 Codex 会话已经绑定。
