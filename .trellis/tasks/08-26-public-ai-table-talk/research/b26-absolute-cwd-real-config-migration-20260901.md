# B26 真实项目绝对 `cwd` 迁移事实包（2026-09-01）

## 范围与授权

- 授权依据：`PROJECT-DECISION-LOG.md#DEC-20260901-002`。
- 唯一允许的配置变化：把 `H:/tokengold/.codex/config.toml` 中 TokenGame 唯一托管块的 `cwd` 从 `tokengame` 恢复为 `H:/tokengold/tokengame`；托管块外内容不变。
- Codex 由用户手动重启；本批不得自动重启、启动牌桌、发送通知、调用模型或 queue，也不改模型、推理、全局配置、远端监听、第二 AI、提交或部署。

## 迁移前事实

- 目标解析为 `H:\tokengold\.codex\config.toml`，是普通非链接文件，291 字节。
- TokenGame 托管起止标记各 1 个；`cwd = "tokengame"` 存在，目标绝对 `cwd` 不存在。
- 配置中没有任务 UUID 或绝对 Codex 可执行路径；7802 没有监听。
- 完整文件 SHA-256：`4C48CABF471B24D7ADEFEAD8B66B78553EF2A0CD3BB526AB1E0897EFFBA5655F`。
- 托管块外 SHA-256：`01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`。

## 执行与迁移后事实

- 从 `H:/tokengold/tokengame` 执行一次 `npm run codex:play -- "H:\tokengold"`。
- 命令 exit 0，只输出去敏的已配置/请重启提示；在 beta、监听、浏览器、连接、通知、模型和 queue 之前停止。
- 迁移后文件为 304 字节，起止标记仍各 1 个；`cwd = "H:/tokengold/tokengame"` 精确存在，旧相对值不存在。
- 完整文件 SHA-256：`63EB0B67B285B59E30692B50795546ABD87B6D59403AD9E9183E16117D9C769E`。
- 托管块外 SHA-256 仍为 `01BA4719C80B6FE911B091A7C05124B64EEECE964E09C058EF8F9805DACA546B`，与迁移前完全一致。
- 目标绝对 `cwd` 只出现 1 次；把它替换回旧相对值后，整份文件可精确重构迁移前完整 SHA-256。这证明配置只存在授权的 `cwd` 字符串差异。
- 配置中仍无任务 UUID 或绝对 Codex 可执行路径；7802 仍无监听。

## 验证边界与恢复点

- 本批未补跑 Node、变异或浏览器套件；这些合同已由 B25 本地实现与独立检查覆盖，本批只验证授权后的真实配置执行边界。
- 实际消费：0 通知、0 原生模型回合、0 queue、0 权威评估、0 浏览器、0 监听。
- 第二次真人手动 Codex 重启尚未执行，重启后 `tokengame_table` 是否加载为 `not_run`。配置正确不能替代宿主重载与工具就绪证据。
- 当前恢复点：用户手动重启 Codex，返回同一任务并说“继续”；Primary 先直接核对 `tokengame_table`，只有工具就绪才继续原定一次回环、固定目标、最多 1 次通知的有界原生验收。

B26 裁决：`absolute_cwd_real_config_migrated_waiting_for_second_manual_restart`。
