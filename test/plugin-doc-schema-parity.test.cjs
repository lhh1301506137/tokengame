"use strict";
// A2：插件文档面必须和真实 MCP schema 对得上。
//
// 为什么这个文件存在：`plugins/tokengame/skills/tokengame/SKILL.md` 是模型进这个项目时
// 读到的第一份指令，而它当时写的是「需要席位的命令要一并给 `seat_id` 与
// `recovery_credential`」「玩家行动经 `hand.act` 提交」。这两句在 MCP schema 上都发不出去：
// `tokengame_table` 的 command 枚举取自 MODEL_COMMANDS，hand.act 不在里面，params 里也
// 不该出现凭据——席位身份由本机协调器注入（F6）。
//
// 这种漂移的代价不是「文档过时」这么轻。模型照文档走会反复撞 command_is_model_facing，
// 而它手上没有任何线索说明为什么；更糟的一种是模型照着「要一并给 recovery_credential」
// 这句去把凭据存进自己的上下文——那正是 F6 要禁的泄漏路径，文档自己在教它。
//
// 所以这里不测「文档写得好不好」，测的是能自动判定的两件事：
//   1. 文档提到的命令是否真的在模型能发的枚举里；
//   2. 文档有没有让模型去传它不该持有的字段。

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { MODEL_COMMANDS, HUMAN_COMMANDS } = require("../src/authority/host-surface.cjs");

const ROOT = path.join(__dirname, "..");
const SKILL = path.join(ROOT, "plugins", "tokengame", "skills", "tokengame", "SKILL.md");
const skill = fs.readFileSync(SKILL, "utf8");

// 拿真实 schema，不重新推导一份。手抄 schema 的测试只能证明我抄得一致。
const serverSource = fs.readFileSync(path.join(ROOT, "plugins", "tokengame", "mcp", "server.cjs"), "utf8");

// 只看指令性文字，不看勘误段。勘误要引用旧说法才能说明改了什么，把引用也判成违规，
// 就等于禁止记录这次修的是什么——这条在 capability-honesty 那边已经踩过一次。
const ERRATA_HEADING = /^#+\s*.*(勘误|修正|历史)/m;
function directiveText(source) {
  const at = source.search(ERRATA_HEADING);
  return at === -1 ? source : source.slice(0, at);
}

test("SKILL 与 MCP schema 对账", async (t) => {
  await t.test("模型工具的命令枚举确实取自 MODEL_COMMANDS", () => {
    // 这条是下面所有断言的前提：如果 server.cjs 改成手抄清单，本文件其余断言
    // 就是在拿 SKILL 和一份不再是真相的东西对账。
    assert.match(
      serverSource,
      /command:\s*\{\s*type:\s*"string",\s*enum:\s*\[\.\.\.MODEL_COMMANDS\]/,
      "tokengame_table 的 command 枚举必须展开 MODEL_COMMANDS",
    );
  });

  await t.test("SKILL 不让模型提交真人命令", () => {
    const text = directiveText(skill);
    // 逐条查，报错要点名是哪一条，否则下一个人只知道「有一条」。
    for (const command of HUMAN_COMMANDS) {
      if (MODEL_COMMANDS.includes(command)) continue;
      // 反引号包起来的命令名算「让模型发这条」；散文里提到 hand.act 属于真人不算。
      const asDirective = new RegExp(
        "(发|提交|调用|使用|经|通过|用)\\s*`" + command.replace(".", "\\.") + "`"
        + "|`" + command.replace(".", "\\.") + "`\\s*(提交|发送|下注)",
      );
      assert.doesNotMatch(
        text,
        asDirective,
        `SKILL 在教模型提交真人命令 ${command}；模型面只有 ${MODEL_COMMANDS.join("、")}`,
      );
    }
  });

  await t.test("SKILL 不让模型传席位身份字段", () => {
    const text = directiveText(skill);
    // 这三个字段各自的危险不同：seat_id 让模型自称是哪一席，seat_handle 是托管句柄，
    // recovery_credential 是能直接换到下注权限的凭据原文。都不该出现在模型的 params 里。
    //
    // 判定要能分清禁令和指令。「不要传 seat_id」和「要一并给 seat_id」在关键词上完全
    // 一样，差别只在动词前面有没有否定。所以看的是句首到字段之间那一段有没有否定词，
    // 而不是整句有没有——整句扫会把「经 hand.act 提交，不需要 Web 牌桌」这种句子放过去，
    // 那句的否定落在后半句，指令还在前半句。
    for (const field of ["seat_id", "seat_handle", "recovery_credential"]) {
      const asDirective = new RegExp(
        "(要|需|请|一并|附上|传|给|带上|填)[^\\n。]{0,20}`" + field + "`"
        + "|`" + field + "`[^\\n。]{0,20}(一并|传|给|附上|必填)",
      );
      for (const sentence of text.split(/[。\n]/)) {
        const hit = asDirective.exec(sentence);
        if (!hit) continue;
        const before = sentence.slice(0, hit.index + hit[0].indexOf("`"));
        assert.match(
          before,
          /[不别勿禁]/,
          `SKILL 在要求模型传 ${field}：${sentence.trim()}`,
        );
      }
    }
  });

  await t.test("SKILL 的命令表与 MODEL_COMMANDS 逐条相等", () => {
    // 精确对账，不做启发式。表格是文档里唯一声明「你能发什么」的地方，所以它该和枚举
    // 一模一样：MODEL_COMMANDS 多一条而表里没写 → 模型不知道自己有这项能力；表里多写
    // 一条 → 模型会去发一条发不出的命令，并且不知道为什么被拒。
    //
    // 这条替掉了原先「把文档里所有 `x.y` 捞出来逐个查」的写法。那种写法必须靠一份
    // 「这句是在划边界」的关键词白名单来豁免正当的禁令段落，而白名单会一直长，长到某天
    // 漏掉一个词就变成假红，或者多收一个词就变成假绿。
    const rows = [...directiveText(skill).matchAll(/^\|\s*`([a-z_]+\.[a-z_]+)`\s*\|/gm)].map((m) => m[1]);
    assert.deepEqual(
      rows.slice().sort(),
      [...MODEL_COMMANDS].sort(),
      `命令表与 MODEL_COMMANDS 不一致：表里 ${rows.join("、")}`,
    );
    // 表格顺序也要跟枚举一致，读的人才能一眼对上，不用来回找。
    assert.deepEqual(rows, [...MODEL_COMMANDS], "命令表的顺序应与 MODEL_COMMANDS 一致");
  });

  await t.test("SKILL 没有把真人命令混进能力表", () => {
    // 和上一条不同的角度：上一条比集合，这一条直接问「表里有没有真人命令」。
    // 集合相等时这条必然成立，留着是因为它的失败信息说得出「哪一条真人命令跑进来了」，
    // 而集合 diff 只会显示两串清单。
    const rows = [...directiveText(skill).matchAll(/^\|\s*`([a-z_]+\.[a-z_]+)`\s*\|/gm)].map((m) => m[1]);
    for (const command of rows) {
      assert.ok(
        !HUMAN_COMMANDS.includes(command) || MODEL_COMMANDS.includes(command),
        `能力表里有真人命令 ${command}`,
      );
    }
  });

  await t.test("SKILL 说清了模型只能拿一次性 id 出示身份", () => {
    // 正面要求。前面几条都是「不许说什么」，只有禁令的话，把那几句删空也能全绿——
    // 而一份删空的 SKILL 不会教模型正确的做法。
    assert.match(directiveText(skill), /intent_id|turn_id/, "SKILL 必须告诉模型用什么出示身份");
  });

  await t.test("SKILL 的启动说明指向的命令真的能让模型发出命令", () => {
    // B7 补的一条。此前 SKILL 写的是「`npm run core` 起权威核心，然后用 tokengame_table
    // 发命令」——B6 之后那句不成立了：模型命令走协调器，而协调器要有模型令牌才开那条路。
    // 照着旧说明做的模型会拿到 model_command_token_not_configured，而它手上没有任何
    // 线索说明为什么。
    //
    // 判定方式不是查关键词，是**跟着说明走一遍**：把 SKILL 里点名的 npm 脚本取出来，
    // 查它在不在 package.json 里，再查那个脚本的入口源码有没有真的接上 modelCommandToken。
    // 只查关键词的话，把 `npm run beta` 改成 `npm run 随便什么` 也能绿。
    const text = directiveText(skill);
    const scripts = [...text.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0, "SKILL 里没有任何启动命令——模型不知道该先做什么");

    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    for (const name of scripts) {
      assert.ok(pkg.scripts[name] !== undefined,
        `SKILL 让人跑 npm run ${name}，而 package.json 里没有这个脚本`);
    }

    // 至少有一条被点名的脚本必须真的打开模型路由。
    const enabling = scripts.filter((name) => {
      const entry = /node\s+(\S+\.cjs)/.exec(pkg.scripts[name] ?? "");
      if (entry === null) return false;
      const file = path.join(ROOT, entry[1]);
      if (!fs.existsSync(file)) return false;
      return /modelCommandToken/.test(fs.readFileSync(file, "utf8"));
    });
    assert.notEqual(enabling.length, 0,
      `SKILL 点名的启动命令（${scripts.join("、")}）没有一条会接上模型命令令牌。`
      + "照着做的模型会拿到 model_command_token_not_configured，而它读不出原因。");

    // 而且要说清那个令牌得配。缺它时的报错已经带 hint，但模型在**读文档的时候**就该知道
    // 这一步存在——否则第一次调用必然失败，而第一次失败会被当成「这个项目坏了」。
    assert.match(text, /TOKENGAME_MODEL_TOKEN/,
      "SKILL 没提模型令牌这一步，而没有它模型一条命令都发不出去");
  });

  await t.test("SKILL 说清了空手而归时怎么分辨在等什么", () => {
    // B7 的另一半。ai.take_intents 空手而归时会带 waiting_on，而模型只有知道去读它
    // 才能分辨「再轮询一次」和「得叫人来入座」。文档不写的话，那个字段等于不存在——
    // 模型不会去读一个没人告诉过它的字段，于是它继续轮询，表现为静默空转。
    const text = directiveText(skill);
    assert.match(text, /waiting_on/, "SKILL 没告诉模型去读 waiting_on");
    for (const value of ["human_entry", "table"]) {
      assert.ok(text.includes(value), `SKILL 没说 waiting_on 的取值 ${value} 是什么意思`);
    }
    // 取值必须与实现一致，不是文档里另起一套名字。
    const surface = fs.readFileSync(path.join(ROOT, "src/host/model-command-surface.cjs"), "utf8");
    for (const value of ["human_entry", "table"]) {
      assert.match(surface, new RegExp(`waiting_on: "${value}"`),
        `实现里没有 waiting_on: "${value}"，文档写的是另一套名字`);
    }
  });

  await t.test("这些断言在旧文本上会红", () => {
    // 自证：把当时的原句喂给同一组判定，必须被抓住。否则上面几条可能只是碰巧成立——
    // 一份改对了的文档让所有 doesNotMatch 都通过，而一份被删空的文档也让它们全部通过。
    const old = "需要席位的命令要一并给 `seat_id` 与 `recovery_credential`。"
      + "这条路径上玩家行动经 `hand.act` 提交，不需要 Web 牌桌。";
    const text = directiveText(old);

    // 真人命令：指令动词挂在 hand.act 上，且动词前没有否定。
    const humanDirective = /(发|提交|调用|使用|经|通过|用)\s*`hand\.act`|`hand\.act`\s*(提交|发送|下注)/;
    assert.match(text, humanDirective, "旧文本教模型发 hand.act，判定必须抓住");

    // 席位字段：注意旧句的否定（「不需要 Web 牌桌」）落在指令之后，所以只看句首到字段
    // 那一段的写法在这里必须仍然判为指令。这正是上面不用「整句扫否定」的原因。
    const fieldDirective = /(要|需|请|一并|附上|传|给|带上|填)[^\n。]{0,20}`seat_id`/;
    const sentence = text.split(/[。\n]/).find((s) => fieldDirective.test(s));
    assert.ok(sentence, "旧文本要求传 seat_id，判定必须抓住");
    const hit = fieldDirective.exec(sentence);
    const before = sentence.slice(0, hit.index + hit[0].indexOf("`"));
    assert.doesNotMatch(before, /[不别勿禁]/, "旧文本那句是指令而非禁令");

    // 当前文本的对应句必须走到另一边：同一个正则命中，但前缀里有否定。
    const now = directiveText(skill).split(/[。\n]/).find((s) => fieldDirective.test(s));
    if (now) {
      const nowHit = fieldDirective.exec(now);
      assert.match(
        now.slice(0, nowHit.index + nowHit[0].indexOf("`")),
        /[不别勿禁]/,
        "当前文本提到 seat_id 的那句必须是禁令",
      );
    }
  });
});
