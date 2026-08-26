<!-- DUAL:PROJECT-ROUTER:START -->
## Dual 项目路由

- 路由合同：`dual-ai.project-router.v3`。
- 在会话首次进入、恢复或收到 `继续`，以及处理 L0-L2/主链语义、验收/完成/发布/风险、路线重基、审查、无人值守或多模型工作时，先加载 `$dual-ai-collaboration`，再按其单层路由读取必要模块。
- 已确认路线内、范围明确且孤立的 L3/L4 工作可保持轻路径，不要求加载全部 Dual 协议。
- Adaptive 的 `active_route_continuous` 在 L0-L2、活动路线、范围、风险和停止边界明确且没有专门人类门时，由 Primary 连续选择并完成同路线 L3/L4，不逐叶询问。`current_next_leaf: none`、新叶编号、新文件、跨模块、架构标签、checkpoint commit 或缺少 Git 都不能单独成为授权门。先判断路线是否完成；完成则进入 Done Gate，不得为维持连续模式制造低价值后继工作。
- 执行连续性、风险上限与本地收口相互独立；缺少 Git 只使本地 commit 暂不可用，不阻断已授权的产品实施。
- Dual 决定本地收口是否已有授权，Trellis 仍负责 commit mechanics 和 task/archive/journal 顺序。当有效授权满足任务范围、归属、精确路径 staging、验证和停止边界时，已满足 Trellis 的通用 commit confirmation；AI 必须自动创建仅含本任务的本地 commit，并继续同一已授权路线。不得 push；未分类 dirty、归属不明、staged overlap 或 user-only/Critical 边界仍须停止。
- 对显式专用 Skill（例如 `$dual-ai-session-handoff`）的自然语言近似请求，只提示用户输入字面调用；不得加载其工作流、读取项目或生成产物。
<!-- DUAL:PROJECT-ROUTER:END -->
