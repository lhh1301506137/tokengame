# TokenGame 验收证据

本文件按批次累积，最新在前。每节自带日期与范围；旧节按其原范围保留，不因新节通过而改写。

## 单栈牌桌复开：补齐合同与实现之间的真实差距（2026-08-28，Asia/Shanghai）

范围仍是 `TG-EU-SINGLE-STACK-WEB-TABLE`。它此前记为 completed、80 条断言全过；下一节那份记录
按其原范围保留，本节是对它的勘误与补充，不改写它。

### 为什么复开

下一节的 80 条断言与当时的证据一致，但它掩盖了五处缺口，而五处的共同点是**它们都不会红**：
没有失败的测试，没有报错，画面上也看不出异常。80 条断言之所以全过，是因为没有一条走到那些
路径上。逐条见 `REVIEW-LOG.md#2026-08-28：复开单栈牌桌，补齐合同与实现之间的真实差距`。

最能说明问题的是自愿亮牌：`can_reveal` 检查 `settlement.payouts`，而权威侧不存在这个字段
（真实字段是 `winner_ids`，`payouts` 全仓搜不到）。这个条件恒假，所以按钮一次都没出现过；
又因为它没出现过，客户端只传一个参数的缺陷从未被触发。功能有代码、有权威支持、有按钮，
而它从未成立。

### 本轮实测结果

- `npm test`：498/498 通过、0 失败（`ℹ tests 498` / `ℹ pass 498` / `ℹ fail 0`）。
- `npm run gate`：`MUTATION_TOTAL=226 KILLED=226 SURVIVED=0 SKIPPED=0` / `GATE=PASS`。
  门禁对 `SKIPPED != 0`、`SURVIVED != 0`、`TOTAL != KILLED` 与非零 npm-test 退出码都会失败，
  所以「未评估」不会被当成通过。
- 浏览器验收 `artifacts/acc-item7-redact`：150 条断言全过、控制台错误 0、四个隔离 Chromium
  上下文、打到第 4 手、24 张截图（每张连同状态指纹，可交叉核对新鲜度）。
- 新增六个变异规格，全部 0 存活 0 未评估：`connection-lease` 16/16、`voluntary-reveal` 6/6、
  `entry-consent-idempotency` 11/11、`scope-reconfirmation` 12/12、`view-model-degradation` 7/7、
  `acceptance-result` 15/15。

复现命令（工作树）：

```
npm test
npm run gate
node test-support/table-web-acceptance.mjs artifacts/acc-item7-redact
```

### 引用的 `artifacts/` 路径不在仓库里

`.gitignore` 第 3 行忽略了整个 `artifacts/`，本文件与下一节引用的每一个 `artifacts/...`
路径都**只存在于跑过它的那台机器上**。全新克隆里一个都没有——包括下一节早就在引的
`artifacts/acc-item4-negctl2`。这一点此前没有交代过，读起来像是仓库自带证据。

不改成入库，有两个理由，后一个更要紧：

1. 55 MB、591 张 PNG。`.gitignore` 那一行是刻意的。
2. `result.json` 里有凭据形状的字符串。`artifacts/negctl5/result.json` 就有一条真邀请码原文
   `invite_code=Kep2jgEI…`（43 字）。那次的进程早没了所以它是死的，但复核的人分不出死活，
   而「被忽略」和「不存在」只差一次 `git add -f`。

所以：**产物是可重跑的中间物，不是交付物。判定用的数字誊在本文件里，那才是记录在案的证据。**
每一条引用旁边给出重跑命令：

| 引用路径 | 重跑命令 |
| --- | --- |
| `artifacts/acc-item7-redact`（本轮终态） | `node test-support/table-web-acceptance.mjs artifacts/acc-item7-redact` |
| `artifacts/negctl5`、`negctl6`、`negctl6c`（负控） | 先按 `REVIEW-LOG.md` 对应条目回退那一处，再跑同一条命令换个输出目录 |
| `artifacts/mut-*.txt`（变异明细） | `npm run gate`，明细落在 `$OUT/mut-<规格名>.txt` |

### 全新克隆里重跑（`2549474`）

工作树里的数字只说明「在我这台机器的这个目录里成立」。按 `2549474` 做了一次
`git clone --no-hardlinks` 到临时目录，**不跑 `npm install`**（本仓库 `dependencies` 与
`devDependencies` 都是空的，门禁只用 stock Node）：

- `npm test`：498/498 通过、0 失败、0 跳过。
- `npm run gate`：`MUTATION_TOTAL=226 KILLED=226 SURVIVED=0 SKIPPED=0` / `GATE=PASS`。
- 浏览器验收：150 条断言全过、控制台错误 0、24 张截图，`result.json` 里
  `passed: true` / `aborted: null` / `steps_ran: 150`，且不含任何邀请码原文。
- 行尾抽查 `test-support/gate.sh`、`test-support/acceptance-result.cjs`、
  `src/host/table-view-model.cjs`，均 `i/lf w/lf`。PI 门禁按工作树字节算哈希，
  这一条是它在新克隆里成立的前提。
- `artifacts/` 在新克隆里确实不存在——与上一小节所述一致。

顺带修掉了 2 的根因：脱敏挪进 `test-support/acceptance-result.cjs` 的 `redactDetail()`，
由 `ok()`/`bad()` 两条记录路径统一调用——不是只改那一处 `invite_code=${...}`，否则下一条
写出凭据的断言照样会漏。凭据键下的短值（`session_token=null`）刻意不脱敏：一条断言失败时
印出的往往正是那个 null，它是根因。覆盖它的是 `test/acceptance-result.test.cjs` 里 9 条脱敏
断言，变异规格 4 条。

### 每项的负控

每一项都先有一条能在旧代码上失败的测试，或一次真的跑出来的负控。这是本节最重要的部分——
没有它，「修好了」只是一句话。

| 项 | 负控 | 结果 |
| --- | --- | --- |
| 连接租约 | `test/connection-lease.test.cjs` 对修复前代码 | 13 条里 12 条红 |
| 自愿亮牌 | `test/voluntary-reveal.test.cjs` 对修复前代码 | 5 条里 3 条红 |
| 自愿亮牌（浏览器） | `artifacts/acc-item4-negctl2`：只还原客户端那个单参数处理器 | 恰好卡在「亮牌后对手看到赢家的两张底牌」 |
| 同意门顺序 + 入口幂等 | `test/entry-consent-idempotency.test.cjs` 对旧内核 | 10 条里 8 条红，2 条钉既有行为的照旧绿 |
| 同意门顺序（浏览器） | `artifacts/negctl5`：本轮脚本对旧客户端 | 恰好 4 条新断言红，其余 141 条照旧过 |
| 重新确认 | `test/scope-reconfirmation.test.cjs` 对旧视图模型 | 12 条全红 |
| 重新确认（浏览器） | `artifacts/negctl6`：本轮脚本对旧视图模型与旧客户端 | **超时中止**于第 25 步「public_limits_changed 让同意门重新出现」，前 24 步全过。注意那份 `result.json` 写着 `passed: true`——判定式当时读不出中止，见下文与 `artifacts/negctl6/ERRATA.md` |
| 重新确认（隔离到一行） | `artifacts/negctl6c`：只回退客户端 `\|\| reason !== null` 这一行 | 同一处中止。这是那条无法在单元层判定的变异的唯一证据。`result.json` 同样自称 `passed: true`，见 `artifacts/negctl6c/ERRATA.md` |
| 有界降级 | `test/view-model-degradation.test.cjs` 对修复前视图模型 | 10 条里 4 条红（四条真实抛错路径），其余 6 条钉既有行为的照旧绿 |
| 验收判定式自身 | `test/acceptance-result.test.cjs`：判定式退回 `failures.length === 0` | 12 条里红 1（恰好是「异常终止时判定为不通过」）；另把 `.mjs` 的 `catch` 块整段删掉，同样红 1 |

「2 条照旧绿」不是凑数：它们钉的是**不能改变**的行为（换一个入口键仍然撞 409、不带键的老客户端
照样能建房）。幂等如果变成「任何重复请求都放过」，一个人就能同时占两个座。

### 证据文件自己也会说谎

核对上面两行引用的路径时发现的：`artifacts/negctl6/result.json` 与 `negctl6c/result.json`
都写着 `"passed": true`、24 步全过、控制台错误 0。**两次运行都没有通过**，它们是在第 25 步
超时中止的。判定式当时是 `passed: failures.length === 0`，而异常终止不会往 `failures` 里
放任何东西——于是「中止」和「跑完且全过」在文件里完全同形。

这跟本轮反复撞到的是同一个缺陷类：恒为真的条件读不出任何真东西。区别只在于这一次它长在
证据采集器上，而不是产品里。一份自称通过的负控比没有证据更糟：负控的全部价值在于它失败。

判定式原先内联在 `test-support/table-web-acceptance.mjs` 的 `finally` 里。`.mjs` 单元测试
加载不了（两个浏览器 UI 因为同样的原因被排除在变异门禁之外），所以它只能靠跑一次真浏览器
才可能发现是错的——而它恰好只在中止的那种运行里才错，那种运行本来就没人细看。已搬进
`test-support/acceptance-result.cjs` 让 `node --test` 看得见，判定式改为
`failures.length === 0 && aborted === null`，另加 `aborted`（含 message 与 stack）与
`steps_ran` 两个字段。此后生成的 `result.json` 中止不再读作通过。

两份历史 `result.json` **保持原样不回改**，各自旁边加一份 `ERRATA.md`。理由与
「历史证据只追加勘误」是同一条：把文件改成 `passed: false` 会让人以为当时就记对了。

### 浏览器验收新增的段落

- **1b 入口幂等**：同一 `entry_key` 连发两次 join 回到同一会话同一座位；换键仍撞
  `player_binding_not_released`；探针自己离桌不留座位。走 `fetch` 直发而不是点两下按钮——
  页面上的连点被 `entryInFlight` 挡在客户端，根本到不了服务端，那道防线证明不了服务端的重放行为。
- **1c 重新确认**：三个维度各跑一遍，用 `context.route` 改写 `/api/view` 的响应体，让客户端
  收到一份「版本变了」的投影，然后要求同意门重新出现并说出是哪一项变了；恢复原样之后门必须
  自己收起来。刻意不给产品加测试钩子——钩子会在产品里留下一条能让全桌重新确认的路，而那正是
  隐私门最不该有的东西。
- **8b 自愿亮牌**：显式三次弃牌凑出 `all_others_folded`，赢家点亮牌，对手页面上的底牌由暗变明；
  重复点击不报错；另有三条 `page.evaluate` 探针分别验证新键配陈旧版本号（`revision_conflict`）、
  已用过的键换版本号（`idempotency_key_conflict`）、同键同版本号重发（回到原结果）。
- **9b/9c/11b 真实断线**：真 `reload`、真断网（`context.route` 全部 abort）、真
  `context.close()`。三者都要求同桌看到掉线且席位进入保留窗，而不是永远在线。断网那条另有一条
  非空检查：断网期间必须真的产生过失败请求，否则「看到掉线」是靠别的原因过的。

### 仍未验证的部分

- **真实宿主 Gate 5（事件驱动主动唤醒）：未通过。** 本轮全部证据来自自动化与确定性 fake 适配器
  （`test-support/scripted-model-adapter.cjs`，`simulated: true` 硬编码不可覆盖，视图上显示为
  「（模拟）」，所以每张截图都自证不是真实宿主能力）。自动化结果不能代替实机门禁。
- **四真人 UAT：未做。** 本节没有任何真人试玩证据。
- **最终门禁未在全新克隆或 worktree 重跑。** 本节数字均来自工作树。
- 旧探针栈的 Playwright 烟测本轮未重跑；`four-player-smoke.mjs` 的 10 处 `every()` 仍未逐个判定
  （随旧栈冻结，不是产品路径）。

### 一项交用户裁决

权威侧 `requireConfirmedScope` 记 `limits_version` 但从不比对它。规则 3 的原文是「实质改变热闹度
或公平性的调整仍须重新确认」，而「实质」是人的判断，机器只有版本串可比；按版本串强制会让一次
非实质的版本号变动也让既有确认失效，那是改变已确认的用户结果。本轮只做了 UI 侧重新询问，
权威侧是否加这道比对留给用户与 Primary 裁定。当前仓里只有一个 `LIVELY_V1`，所以这条路径在产品上
还不可能发生。

## 宿主中立单栈牌桌产品闭环（2026-08-28，Asia/Shanghai）

范围是 `TG-EU-SINGLE-STACK-WEB-TABLE`：`web/table/` 的新 UI 经协调器连同一份宿主中立权威内核，入口 `npm run web`。旧探针栈 `web/app.js` 与 `npm run authority` / `table` 原样保留为已替代历史证据，不再是产品路径。

### 单栈自动化结果

- `npm test`：351/351 通过、0 失败（`ℹ tests 351` / `ℹ pass 351` / `ℹ fail 0`）。全新克隆一次、工作树一次，两次同数。
- `test/table-web-host.test.cjs`：15/15 通过。覆盖底牌只认权威私密视图、视图不透传原始事件、凭据形状键与自由文本双向出口扫描、字素计数与权威一致、手内余额与手间账本不重复计入、协调器拒绝非回环监听、模型失败落成 silent 而非把回合悬住。
- 变异规格 `test-support/mutations/web-host-boundary.json`：16 条全部杀死，0 存活、0 未评估。承重点包括浏览器可发命令白名单、隐藏先记后发、字素计数不退回 `String.length`、未附适配器时不得谎称已附。

### 四上下文浏览器验收

`test-support/table-web-acceptance.mjs` 起四个相互隔离的 Chromium context，每个只走 Web UI 与正常玩家接口。没有特权客户端，也没有直接往内核发命令的后门——某一步只能靠后门完成，就说明 UI 缺了东西。80 条断言全过，控制台错误 0，连续打到第 3 手。

十三节依次覆盖：建房与邀请码加入与逐席公开范围确认（含第五人点「先不加入」以证明座位被释放且不残留）、Ready 与 3 秒倒计时、底牌隔离、玩家公开聊天与 140/141 字素边界、第一手加注与弃牌、座位旁 AI 公开气泡、第二手打到河牌与筹码守恒、逐查看者本地隐藏及其可逆性、掉线与 120 秒保留窗与恢复、暂离、离桌、控制台错误为 0、截图自身的新鲜度。

底牌隔离这一节最要紧，所以做了三重：每人看得见自己两张明牌；看别人是三席各两张暗牌；再把每人的底牌拿去另外三人的整页 `body.innerHTML` 里搜，24 次搜索 0 命中。第三重刻意放在任何摊牌之前——摊牌之后别人的底牌本来就该出现在我的页面上，那时再搜会把正确行为报成泄漏。

### 模型适配器的边界

适配器是 `test-support/scripted-model-adapter.cjs`：按查表返回固定文本，不推理，不访问任何模型，`simulated: true` 硬编码且不接受覆盖，视图显示为「（模拟）」，因此每张截图都自证这不是真实宿主能力。说不说话按已评估次数取模决定而非随机——随机会让「AI 恰好这次没说话」与「AI 坏了」在验收里无法区分。

这组证据能证明「AI 公开发言出现在座位旁、带 AI 标记、与玩家气泡可区分」这条链路成立。它**不构成**真实宿主无点击主动唤醒已通过的证据，那件事仍然未验证（`TG-EU-PROACTIVE-WAKE-SPIKE`）。

### 浏览器发现而单元测试没发现的缺陷

四个，每个都先复现为失败再修，修后重跑通过：

1. `[hidden]` 被类选择器上的 `display` 盖掉。浏览器的 `[hidden]` 只是一条特异性最低的 UA 样式，`entry-view`、`scope-gate`、`raise-row` 三个元素因此带着 hidden 仍在布局里。其中 `scope-gate` 是 `position:fixed; inset:0` 的全屏层——一个看不见的遮罩罩住整张桌子，之后每次点击都被它吃掉，画面上毫无痕迹。症状只是「点不动我准备好了」。
2. 离桌后轮询不停，每 700ms 一条 403，玩家停在一份永不更新的旧牌桌上。修在 `refresh()` 遇终态会话码即收摊回入口。
3. 公共牌从未被观察过。74 条断言全绿，而每张截图的状态指纹里 `board` 一直是 0。绿色不等于覆盖。
4. 只等建房者一页就读四页。四页各自 700ms 轮询、起点不同，慢一点的机器上其余三页差一个 tick 读到空桌——这一条在工作树连跑三次都没出现，是全新克隆里才暴露的。

第 4 条同时暴露了更值得记的一件事：那三页一张牌都没渲染时，有五条断言照样通过。空集合让 `every()` 与 `Set` 去重无条件成立，其中包括上面那条自称全场最严的跨上下文泄漏检查——它只搜了 24 次里的 6 次就宣布通过。断言在无数据时通过比没有这条断言更糟，因为它把缺口报成绿色。三条断言现在都先要求数量到位再判内容，另外两条要求真的查到了元素。

### 证据自审

每张截图都附一份当时的页面状态指纹（手序号、街道、底池、公共牌数、气泡数、席位数），脚本再把同一查看者的截图两两交叉核对：状态不同而图像字节相同即判失败。这一条存在的原因是曾出现三张字节完全相同的截图，而当时无法区分「页面没变」与「截图没重拍」。`result.json` 无条件落盘，包括脚本中途抛错的情况——证据文件的价值恰恰在失败的那次。

产物（生成物不纳入版本控制）：`artifacts/table-web-acceptance/`，含 17 张 PNG 与 `result.json`。

### 复现命令

```powershell
npm test
node test-support/mutate-suite.cjs test-support/mutations/web-host-boundary.json
node test-support/table-web-acceptance.mjs artifacts/table-web-acceptance
```

浏览器验收需要本机装有 Playwright 与 Chromium；`test-support/playwright-resolve.cjs` 按局部、显式覆盖、全局、`NODE_PATH` 顺序查找，找不到时脚本以退出码 2 报「未跑」并给出安装命令，不报成通过也不报成失败。本次实测环境为 Playwright 1.58.2 / Chromium 145.0.7632.6。

### 本节边界

已验证：本地单栈产品闭环、四上下文隔离、控制台零错误。未验证：真实宿主适配器、无点击主动唤醒、四真人 45 分钟试玩签字、`PLAYABILITY_GATE_V1` 的自动化层（要求至少 10 手与故障矩阵、隐私金丝雀，本次只到第 3 手）、生产鉴权与远程部署。本机桥接鉴权仍是未闭合未知项 `U-TG-LOCAL-BRIDGE-AUTH`。

## TG-L3 四人牌桌垂直切片（2026-08-26，已替代范围）

### 自动化结果

- `npm test`：23/23 通过，其中权威 AI 窗口 5、扑克领域/牌桌隔离 10、Hook 集成 3、MCP/HTTP/SSE 5；原有 11 项 Codex 桥接回归全部保留。
- 规则覆盖：四轮行动、七选五与 A2345、最小完整加注、短额 all-in 不重开、三种筹码深度的主池/两层边池、平池奇数筹码、超时 check/fold、默认不亮牌与自愿亮牌。
- 三层池固定场景：B/C/A 分别赢得 160/180/200，最终筹码为 A=200、B=160、C=180、D=0，总量 540 守恒。
- 安全与协议覆盖：玩家令牌不匹配被拒绝；观察者与各玩家投影只含允许的底牌；非当前玩家、非法金额和截止后请求被拒绝；动作版本和幂等受保护；重置只允许在本手结束后进行，成功后的网络重试仍重放原结果；个性化 SSE 首帧不泄漏其他底牌。

### 四玩家浏览器验收

`test-support/four-player-smoke.mjs` 创建四个独立 Chromium context。所有牌局动作都通过 Web UI 和正常玩家接口完成，没有使用特权牌局客户端。已通过三个连续场景：

1. 四个玩家完成 16 个 UI 行动，推进至 river checkdown 和标准摊牌；
2. 一名玩家从 UI all-in，另外三名玩家从各自 UI 跟注，服务端自动发完公共牌并结算；
3. 一名玩家输入最小加注额，另外三名玩家弃牌；赢家默认不亮牌，随后从 UI 自愿亮牌，四个视图同步可见。

### 座位旁公开 AI 验收

同一四窗口烟测先通过正常内部公开请求/回答接口完成 A 的真实 `prompt → generating → answer`，再用权威事件注入覆盖前端负例与通用席位投影。四个视图均通过以下断言：

- A/B/C/D 四席 AI 同伴始终可见；A 的公开 prompt 与匹配 answer 在四个视图文本一致，`aria-busy` 与全局 Prompt/Model/Answer 阶段同步变化。
- B 的合法 `actor + request_id` 独立完成 B 的最近会话；未知 actor、普通事件、孤立 answer、错席 answer、重复请求和旧回答晚到不会污染当前座位气泡。
- HTML 标记与事件属性按纯文本显示，没有创建注入元素或执行脚本；`render_game_to_text()` 给出四席最近会话的完整文本。
- 桌面气泡与公共牌、四个玩家状态及行动区几何不相交；560px 视口把 AI 区域移到牌桌后方，无水平溢出或行动区覆盖。
- 最终四个视图均实际渲染 87/87 条公开事件，证明“每席最近一组”没有误截断右侧完整历史。

这组事件注入只用于验证 UI 投影的失败路径和 B 席通用性，不证明四个真实 Codex 会话已经绑定；当前桥的真实端到端事件仍是 A / `ai:a`。

机器结果：`players=[a,b,c,d]`，公开 AI 投影和三个牌局场景均完成，`event_feed.rendered_events=87`，`console_errors=[]`。四个视图的公共牌局摘要一致，初始隐藏信息检查证明每个 context 只能看到自己的两张底牌。截图已逐张人工检查：

- `artifacts/four-player-smoke/ai-prompt-pending.png`
- `artifacts/four-player-smoke/ai-answer-published.png`
- `artifacts/four-player-smoke/ai-answer-narrow.png`

- `artifacts/four-player-smoke/checkdown-a.png`
- `artifacts/four-player-smoke/all-in-showdown.png`
- `artifacts/four-player-smoke/raise-fold-reveal.png`
- `artifacts/four-player-smoke/result.json`

在 Codex 桌面捆绑运行时中的复现命令：

```powershell
$env:CODEX_BUNDLED_NODE_MODULES='C:\Users\13015\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
& 'C:\Users\13015\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' --experimental-loader file:///H:/tokengold/tokengame/test-support/playwright-loader.mjs test-support/four-player-smoke.mjs artifacts/four-player-smoke
```

### 浏览器迭代证据

第一次 UI 运行暴露公共牌绘制参数错误（`label.slice is not a function`），修复后控制台错误清零。视觉检查又发现事件栏撑高 Canvas、未发公共牌误显示为牌背，随后改为固定比例桌面区域和虚线空槽。座位旁 AI 的独立 Trellis 检查进一步发现两项一致性问题：孤立/未知 answer 会误点亮全局 Answer 阶段，以及事件计数超过 80 时 DOM 私自截断；两项均修复并加入四视图回归。单玩家技能客户端也重新验证 Canvas 未受 DOM 气泡层影响，最新产物位于 `artifacts/web-game-client-ai-bubbles/`。

### 切片结论与边界

该切片的 AI 验证结论为 `pass`：单进程本地固定桌已经具备可玩的完整一手无限注德州扑克、四身份隔离、服务端权威裁决、确定性结算、可操作 Web UI 和座位旁公开 AI 气泡。用户已认可牌局机制，但本次气泡修正仍等待用户重新体验确认，因此不能写成“用户已接受”。该结论不覆盖数据库持久化、生产认证、远程并发、公网安全、多桌运营、反串谋、真钱经济、四个真实 Codex 会话绑定或 Codex 内嵌 UI。详细运行边界见 `docs/MULTIPLAYER-VERTICAL-SLICE.md`。

## Codex 桥接聚焦探针（历史基线）

### 自动化

- `npm test`：11 项测试全部通过（权威状态机 5、Hook 集成 3、MCP/HTTP 3）。
- 新增回归覆盖：Stop 重入不会用错误说明覆盖原始回答；MCP 显式补交会把已登记公开提示的回答送入权威事件流。
- Node 语法与运行路径：权威服务、桥、Hooks、MCP 与 Web 脚本均由测试或真宿主执行。
- 插件清单是有效 JSON，真实 `codex-cli 0.145.0` 能安装、加载 Skill/MCP，并在显式信任后加载 Hooks。

自动化覆盖普通 Prompt/Stop 零桥流量、公开 prompt/answer 顺序、一次请求额度、幂等冲突、关闭与截止时间、失败关闭、PreToolUse、Stop 重入、MCP stdio、显式回答补交和静态 UI 合同。

### 校验器兼容性说明

在清单没有显式 `hooks` 字段时，本地 plugin-creator 校验器通过，但真宿主没有加载 Hook。按官方插件清单格式补上 `hooks` 后，真实宿主成功执行，而当前本地校验器误报 `plugin.json field hooks is not accepted by plugin validation`。这是工具版本落后于运行时/文档的假阴性，与 [openai/codex#27141](https://github.com/openai/codex/issues/27141) 记录的问题一致；因此不能继续声称“当前校验器通过”，应以官方清单合同、JSON 解析、自动化和真宿主执行为证据。

### 浏览器

- Playwright 客户端真实点击“关闭当前窗口”，机器状态记录 `ACTION_WINDOW_CLOSED / ui_probe_close`。
- 随后真实点击“打开 2 分钟窗口”，运行公开 Prompt Hook 和 Stop Hook；最终 `render_game_to_text()` 记录 `AI_PROMPT_PUBLISHED` 与 `AI_ANSWER_PUBLISHED`，三个协议阶段均为 `done`。
- 全页 smoke：1440×980，控制台错误 0，事件流连接为 `online`，Canvas 938×654.453。
- 该 UI 是独立 Web 权威事件观察页，不是 Codex 桌面内嵌 MCP UI。

本地截图（生成物不纳入版本控制）：

- `artifacts/full-page-smoke.png`
- `artifacts/ui-close/shot-0.png`
- `artifacts/ui-public-prompt/shot-0.png`
- `artifacts/ui-public-answer/shot-0.png`

### 真实 Codex 宿主

在 `H:\tokengold\tokengame-host-probe` 的无秘密专用任务中，通过仓库本地 marketplace 安装插件并启动新的 Codex 0.145.0 会话。详细逐项记录见 `docs/HOST-PROBE-CHECKLIST.md`。

- 公开提示：`AI_PROMPT_PUBLISHED` 在模型开始生成前写入；最终 `HOST_PROBE_OK` 只发布一次，request/window/turn 绑定一致。
- 普通提示：模型输出 `PRIVATE_HOST_OK`，桥和事件计数均不变。
- 重复请求与关窗请求：均在生成前被 Hook 拒绝，无错误的权威 AI 事件。
- 工具边界：公开回答 pending 期间，`PreToolUse` 拒绝无关本地工具。
- MCP：真宿主发现并调用状态工具，返回 `tokengame.local-probe.v1`；恢复桥后又真实调用 `publish_ai_answer` 完成故障回答补交。
- 信任：插件安装后 Hook 默认不自动运行；只在专用任务一次性明确信任后运行，符合官方安全模型。
- Stop 故障：真宿主暴露了重入覆盖缺陷；修复后 pending 保留原始长回答，并由 MCP 补交为同一权威请求的唯一 answer 事件。
- 卸载：插件、测试 marketplace、专用信任配置、缓存、插件数据、端口和本次产生的 MCP 子进程均已清理。

### 结果与限制

桥接探针结论为 `pass_with_notes`。已直接证明 TokenGame 的 Codex 插件宿主路径可行，包括提示预公开、回答配对、普通内容零桥流量、失败关闭、显式 MCP 回退、信任默认值和可逆卸载。

仍未证明：

- Codex 桌面会渲染自定义内嵌牌桌 UI；首版仍以独立 Web 页为准。
- 生产 OAuth、本地凭据安全、持久化、真实断线重放、多人并发和跨平台进程管理。
- 对任意旧会话上下文的形式化零泄漏，或不可伪造的 Codex 来源证明。
- 四人德州扑克状态机、边池和本地结算已由上方 TG-L3 切片补证；内容治理和公开运营合规仍未证明。

补充生命周期限制：本次运行中 Hook 的 `PLUGIN_DATA` 没有自动出现在旧式捆绑 MCP 进程，因此 MCP 补交后 pending 不能即时归档；权威服务幂等闭环已成立，但生产实现需要统一状态所有权。Codex `exec` 插件刷新还可能留下 MCP 子进程，卸载前需按确切父进程与命令行回收。
