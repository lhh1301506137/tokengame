# B18：项目级稳定 MCP 与席位连接热激活

## 问题校正

B17 失败后最容易得出的错误结论是“TokenGame MCP 不支持运行中换连接”。现有实现恰好相反：
`plugins/tokengame/mcp/server.cjs` 在每次模型工具请求时重新读取
`TOKENGAME_MODEL_CONNECTION_FILE`；`test/mcp-model-connection.test.cjs` 已证明同一进程看见换发后的
新令牌。真正缺口是宿主启动 MCP 时还没有一个稳定、项目隔离的连接文件位置。此前每批把下载文件的
绝对路径写进临时 MCP 配置，等于每次换席都修改服务器定义；Codex 需要重新加载该定义，B17 才撞上
既有任务未重激活已退出进程的载体边界。

## 已核实事实与证据边界

1. OpenAI 当前文档明确支持在受信任项目的 `.codex/config.toml` 中配置项目级 MCP；stdio 服务器支持
   `command`、`args`、`env`、`env_vars` 与 `cwd`。新增服务器后 Desktop/IDE 需要一次 Restart。
   文档没有承诺 `.mcp.json` 存在“当前项目根目录”占位符，因此本批不发明该能力。
2. 官方插件文档说明本地插件会从用户缓存副本加载；插件 Hook 明确获得 `PLUGIN_ROOT` 与
   `PLUGIN_DATA`，但没有说明捆绑 MCP 自动获得当前项目根。本项目旧实机证据也表明旧式捆绑 MCP
   未继承 Hook 的 `PLUGIN_DATA`。所以不能把一份活动席位文件放在用户级插件缓存/数据目录后宣称
   项目隔离。
3. 当前仓库已经有受控 `.codex/config.toml`，且 `.gitignore` 已忽略 `.tokengame-private/`。
   但当前 Codex 保存/信任的项目根实际是父目录 `H:/tokengold`，仓库是其中的 `tokengame/` 子目录；
   当前任务的并发配置也仍是 4 而非子目录 TOML 写的 6，且从仓库运行 `codex mcp list` 没列出新项目
   服务器。后两项只是载体侧旁证，不单独证明所有 CLI 子命令的加载规则；足以说明不能把子目录模板
   冒充当前任务已接线。本批因此增加显式人工配置命令，把同一受管块写入真人指定的 Codex 项目根，
   nested repo 时写入本机绝对 `cwd`。仍不修改用户级 `~/.codex/config.toml`。
4. 当前 Windows/Node 22 实测同目录 `renameSync(temp, target)` 可完整替换已有普通文件；这是本机实现
   证据，不冒充所有文件系统的锁语义。产品合同只要求读者永远不看到半写 JSON：发布失败时保留旧文件
   或明确失败，不把部分内容写进稳定槽位。

参考：

- https://learn.chatgpt.com/docs/extend/mcp?surface=cli
- https://developers.openai.com/plugins/build/plugins

## 冻结实现合同

1. 仓库模板及显式 `codex:configure -- <Codex项目根绝对路径>` 登记一个稳定服务器名。配置命令只在
   真人指定项目内追加/替换带双标记的 TokenGame 受管块；同名非受管块、残缺/重复标记、符号链接、
   超限配置或仓库不在该项目内时失败并保留旧文件。它从仓库根启动专用 launcher；launcher 校验
   当前目录确为 TokenGame 仓库，把 `TOKENGAME_MODEL_CONNECTION_FILE` 固定为
   `.tokengame-private/active-model-connection.json` 的绝对路径，再启动现有 MCP stdio 循环。
   配置不含令牌、牌桌地址或席位；当 Codex 项目根包着子仓库时，受管块会包含本机仓库绝对路径，
   这是启动定位信息而非凭据，CLI 不把它回显到模型输出。
2. 稳定槽位不存在时 MCP 仍能初始化和列工具；模型命令失败关闭为“尚未激活”，且不发网络请求。
   首次项目服务器加载可能需要按官方宿主合同 Restart；之后下载、换发、撤销不得再修改 MCP 配置，
   也不得要求重启 MCP 进程。
3. 新增真人 CLI `connection:activate -- <下载文件>`。它只接受一个本机普通文件，限制 16 KiB，按
   `tokengame.model-connection.v1` 精确字段、回环 HTTP origin 与令牌格式验证；拒绝符号链接、目录、
   非回环地址、额外字段和稳定槽位自身。它不打印源路径、目标路径、令牌或文件内容。
4. 激活先在 `.tokengame-private/` 内以排他方式写临时文件、刷新完整内容，再以 rename 发布；任一步
   失败都清理本次临时文件并保留原活动连接。目录和文件尽力设置为仅本人权限；不同平台无法证明的
   ACL 写为限制，不伪称加密。
5. CLI 不自动删除下载源。复制成功后明确告诉真人“原下载文件仍存在，应自行安全删除”；未经另一个
   显式命令不替用户销毁 Downloads 中的文件。`connection:clear` 只删除项目固定槽位，幂等，不扫描、
   不删除其他下载文件、历史 B12/B14 资源或宿主管理进程。
6. 激活与清除不是 MCP 工具，不登记给模型；模型不能选择文件、读取凭据、切换项目或替真人清除。
   现有 `tokengame_table` 的模型命令白名单与真人扑克动作边界不变。
7. 项目隔离以“受信任项目配置 + 项目私有槽位”为边界，不把用户级全局活动席位作为 MVP 方案。
   同一项目的其他任务理论上仍能发现同一项目 MCP；当前宿主没有向 stdio 工具调用提供可验证任务
   身份，因此本批必须在文档中保留“只在专用游戏任务启用/使用”的限制，不能宣传为密码学任务隔离。
8. 浏览器“撤销”立即吊销服务端令牌，但浏览器不能删除本地文件；UI 与文档必须把“撤销服务权限”
   和“清除本地活动槽位”分开说明。陈旧文件即使仍在，后续请求也应得到权威拒绝。

## 验收矩阵

- 启动器：错误 cwd、缺 package 标记、缺 MCP 文件时失败；正确项目根只设置固定绝对路径，不覆盖调用者
  显式设置的牌桌 origin/超时，不把路径或秘密写 stdout。
- 激活：首次、换发、无效 JSON、超限、额外字段、非回环、符号链接、源等于目标、目标目录冲突、发布
  失败；失败不破坏旧活动文件，临时文件清零。
- 清除：存在/不存在都成功，只作用固定槽位；活动文件不被 Git 跟踪。
- 长驻 MCP：文件缺失时零网络；激活后同一 `handleMessage/callTool` 实例成功；再次换发后下一请求使用
  新令牌；清除后下一请求失败且零新增网络。无需重建模块或子进程。
- 配置：仓库模板只引用稳定 launcher；显式配置器保留既有 TOML、幂等更新自己的受管块、发布失败保旧，
  nested repo 只接受位于指定 Codex 项目内的仓库；插件/根 README、Skill、UI 文案与命令保持一致；
  不再把每局修改 `TOKENGAME_MODEL_CONNECTION_FILE` 作为主流程。
- 变异：固定槽位、精确 schema、失败保旧、rename 发布、模型不可调用激活/清除、同进程换发这几条关键
  围栏都有实际可达检查。最终先跑定向 Node，再跑全量；宿主 Restart/真实连续窗口另行授权验证，不能由
  本地测试推断。

## 本批不做

- 不重启当前 Codex 宿主，不触发全局 MCP reload，不创建新任务，不运行真实模型连续批次。
- 不清理 B12/B14 历史策略阻塞资源，不更改用户级配置，不安装/发布插件，不提交、部署或推送。
- 不解决任意新用户项目的“一键市场安装后自动写项目配置”；本批先闭合当前仓库与朋友内测所需的稳定
  项目路径，插件分发安装器作为后续独立切片。

## 重启后原生追加事实（2026-09-01）

- `H:/tokengold`受管项目块实际写入并由真人重启后，当前任务工具清单只出现
  `mcp__tokengame_project__tokengame_table`；没有把旧CLI探针或配置工具暴露给模型。
- 活动槽不存在时原生`view.projection`返回`model_connection_unavailable`。本地页面签发A席连接并运行
  `connection:activate`后，同一工具立即返回本席投影；页面撤销后旧槽内容返回
  `model_command_token_rejected`。同席重新签发并覆盖固定槽后，没有重启Codex或MCP，投影立即恢复。
- 第二个隔离浏览器B公开发言后，当前Codex会话完成一次`ai.take_intents`、一次`ai.start`和一次
  `ai.resolve(public_speech)`；权威返回`SEAT_AI/TABLE_PUBLIC`，A/B两页均显示同文AI气泡。该样本由
  用户“继续”显式触发，0 queue，不证明持续主动唤醒、第二真实AI席或牌局内实时性。
- 收尾先页面撤销，再`connection:clear`，随后原生调用回到`model_connection_unavailable`；两个浏览器
  均关闭，beta释放7802。工具策略在执行前拒绝包含删除的组合命令，未绕过；本轮166字节失效下载
  仍留在`.playwright-cli/`，需真人手工删除。B12/B14历史阻塞资源未读未动。
- 实机最初唯一控制台错误为浏览器自动请求`/favicon.ico`产生404；页面增加空data favicon并补源码
  回归，定向11/11，干净beta浏览器复验0 error/0 warning。此项是UI质量修补，不计为MCP失败。
