# TokenGame 安装、建房与邀请动线

> 决策状态（2026-08-26）：用户选择方案 A，协议名暂定 `INSTALL_CREATE_JOIN_V1`；一次安装与 Hook 信任后，新专用任务直接 create/join，首次设置与公开公告就地完成。

## 研究问题

如何把用户最初设想的“在 Codex 里让它下载 TokenGame，随后就在当前任务玩”落成最短且不虚假的 MVP 动线，同时处理插件安装、Hook 信任、任务隔离、临时房创建、邀请复制、加入和 Ready。

## 官方 Codex 插件边界

- Codex 插件可在 ChatGPT 桌面 App 或 Codex CLI 中浏览和安装，不在 IDE extension 中提供。插件可以同时包含 Skill、MCP server、可选 UI 与 Hooks。
- 本地/仓库 Marketplace 是开发、测试和团队分发入口；公共产品最终应发布到 ChatGPT 与 Codex 共用的 universal plugin directory。两者是不同分发阶段，不能把仓库内 Marketplace 冒充已上架公共目录。
- 仓库 Marketplace 位于 `$REPO_ROOT/.agents/plugins/marketplace.json`；安装后宿主把插件复制进 `~/.codex/plugins/cache/...`，不是直接运行仓库源目录。版本升级、缓存刷新和回滚必须按安装副本处理。
- 安装或启用插件不会自动信任捆绑 Hooks。用户必须审阅并信任当前 Hook 定义；未信任时 Hook 被跳过。因此“安装成功”不能等同于“默认公开聊天边界已启用”。
- Git-backed Marketplace 可由 `codex plugin marketplace add <source>` 添加，适合封闭测试；正式消费者不应被要求理解仓库路径、Git ref 或本地 manifest。

## 当前仓库事实

- 已有 `.codex-plugin/plugin.json`、`.mcp.json`、Skill、Hooks 和 repo marketplace，且 Codex 0.145.0 真宿主探针验证过安装、Hook 信任默认关闭、MCP 发现、卸载与残留清理。
- 当前 Marketplace 名为 `tokengame-host-probe`，插件描述仍是“本地牌桌/公开桥”，不适合作为正式消费者品牌和安装文案。
- 当前运行仍要求用户在项目根目录执行 `npm run table`，并打开独立 Web 页；这只是开发垂直切片，不能作为目标的一键游戏体验。
- 现有插件不具备 create room、invite、join、Ready 或内嵌 UI 工具；新的首次运行健康检查必须覆盖 Hook trust/heartbeat、本地协调器、MCP UI 能力、版本兼容和远端房间服务连接。

## 方案 A：一次安装，create/join 直接进入向导（推荐）

### 开发/封测安装

1. 测试者通过固定 Git ref 的 Marketplace 安装 TokenGame；安装页展示来源、版本、Hook/MCP/UI 权限与卸载方法。
2. 用户审阅并信任 TokenGame Hooks，然后刷新 Codex、在 `tokengame` 项目文件夹新建专用游戏任务。
3. 第一次调用 create/join 时运行只读 preflight；未就绪则在同一响应中显示修复卡片，不要求先记忆另一个 setup 命令。

### 目标公共安装

通过 universal plugin directory 的 TokenGame 页面安装；安装和 Hook 信任仍由宿主显式确认。普通对话中“帮我安装 TokenGame”最多引导/打开受支持安装入口，不能承诺插件在用户不知情时静默安装或信任 Hook。

### 建房与加入

- 房主在全新专用任务发送 `@tokengame create`。插件执行 preflight，首次需要时用内嵌卡片确认昵称、玩家头像、AI 名称/头像/基础人设与“入桌后普通输入默认公开”公告；随后向中立房间服务创建临时房，绑定当前 session，渲染牌桌并给出 `Copy invite`。
- 邀请同时包含可点击 URL 与可复制短码，但只携带短期 invite token，不含 seat/recovery credential、房主 session_id 或底牌信息。邀请码的单次/多次兑换范围在后续邀请策略中定义。
- 其他玩家各自在自己的项目文件夹/专用 Codex 任务发送 `@tokengame join <invite>`。插件先验证版本、房间、空席和本机未绑定状态，再显示公开桌规确认；确认后兑换独立 seat/recovery credential 并进入 WAITING。
- 玩家在内嵌牌桌点击 Ready；至少两席 Ready 后沿用已锁定的 3 秒开局。create 不赋予房主额外开始权或牌局管理权。
- `@tokengame` 无参数只显示当前状态和可用 LOCAL_CONTROL，不自动建房；避免误触产生远端房间。

优点：安装只做一次；之后 create/join 都是一条可记忆指令，且所有必要检查在上下文内完成。缺点：首次 create/join 的响应会比后续多一个确认卡；目标体验仍依赖内嵌 UI 门禁。

## 方案 B：显式 setup → create/join

用户安装后先运行 `@tokengame setup`，完成 Hook、配置和头像人设，再允许 `create`/`join`。状态机清楚、排障容易，但多一个用户必须记住的步骤；如果用户直接点邀请，仍要自动跳回 setup，因此最终并没有减少实现复杂度。

## 方案 C：插件首页 UI 优先

用户安装后从插件目录打开 TokenGame 首页，在组件中选择 Create/Join、粘贴邀请并设置资料；任务输入框只在入桌后使用。对非技术用户友好，但更依赖各宿主 UI 兼容，也弱化“在新 Codex 任务里一句话开始游戏”的产品差异。

## 必要失败与安全行为

- Hook 未信任、版本不兼容、协调器不可达或 UI 主路径能力不足时，create/join 必须停在明确的 `SETUP_REQUIRED`/`DEGRADED`，不得创建一个聊天隐私边界不成立的活跃席位。
- 安装、Hook 信任、公开公告确认和 invite 兑换是不同状态；不得用一次“允许安装”暗中代表用户接受公开聊天桌规。
- create/join 使用幂等 request id；重试、刷新和重复粘贴邀请不得创建多个房间、重复占座或双 session binding。
- 新任务是强建议也是验收路径：普通开发任务即使插件已安装，也不会因自然语言提到 poker 而自动绑定或公开。
- 开发 Marketplace 与生产目录使用相同 plugin id/协议版本迁移规则，但不同签发来源；测试版升级不得静默覆盖用户已审阅的 Hook 定义。

## 建议

选择方案 A。它最接近用户的原始心智，但把无法省略的安全步骤讲清楚：插件安装和 Hook 信任只做一次；每个新游戏任务用一条 `@tokengame create` 或 `@tokengame join <invite>` 进入，首次配置作为就地向导而不是额外命令。

## 来源

- [OpenAI：Plugins 支持面与组成](https://learn.chatgpt.com/docs/plugins#use-plugins-from-a-supported-surface)
- [OpenAI：本地 Marketplace 工作方式](https://developers.openai.com/plugins/build/plugins#how-local-marketplaces-work)
- [OpenAI：捆绑 MCP server 与 Hook 信任](https://developers.openai.com/plugins/build/plugins#bundled-mcp-servers-and-lifecycle-hooks)
- [OpenAI：Codex Marketplace CLI](https://learn.chatgpt.com/docs/developer-commands#codex-plugin-marketplace)
- [OpenAI：用 Plugin Creator 构建与测试](https://learn.chatgpt.com/docs/build-plugins#create-a-plugin-with-plugin-creator)
