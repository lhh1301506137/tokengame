# 引导任务：建立项目开发规范

## 任务背景

这是 `trellis init` 首次在项目中运行时创建的一次性引导任务。目标是把团队真实采用的工程约定写入 `.trellis/spec/`，使后续 `trellis-implement` 与 `trellis-check` 获得项目特定上下文，而不是按通用模板生成代码。

## 完成状态

- [x] 填写前端与相邻运行时规范
- [x] 加入来自现有代码的真实示例

## 已填写规范

| 文件 | 记录内容 |
|---|---|
| `.trellis/spec/frontend/directory-structure.md` | 浏览器 UI、权威服务、本地桥、插件和测试的目录边界 |
| `.trellis/spec/frontend/component-guidelines.md` | 原生 DOM、Canvas、渲染函数、样式与可访问性约定 |
| `.trellis/spec/frontend/hook-guidelines.md` | Codex Hook、浏览器事件、零桥隐私短路和 Stop 重入约束 |
| `.trellis/spec/frontend/state-management.md` | 权威状态、浏览器投影、插件交接状态和派生显示状态 |
| `.trellis/spec/frontend/type-safety.md` | 当前 JavaScript 模块格式、运行时校验和线协议字段约定 |
| `.trellis/spec/frontend/quality-guidelines.md` | 自动化测试、真实宿主探针、禁止模式和审查清单 |

## 取证方法

1. 先读取项目 `AGENTS.md`、`package.json`、Dual 状态和已有文档。
2. 再检查 `web/`、`src/authority/`、`src/bridge/`、`plugins/tokengame/hooks/` 与 `test/` 的真实模式。
3. 只记录当前代码已经采用的约定，并明确当前没有 React、TypeScript、lint 或 CI；未把未来理想架构伪装成事实。
4. 为每份规范加入真实文件路径、代码模式、常见错误和禁止边界。

## 归档结论

本任务已完成并归档。后续功能任务应从 `.trellis/spec/frontend/` 选择相关文件写入 `implement.jsonl` 和 `check.jsonl`；如果实现形成新的稳定约定，再通过 Trellis 规范更新流程修改这些文件。

