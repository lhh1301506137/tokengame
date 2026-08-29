"use strict";

// 合同版本号只有一处定义，两侧都跟着它走（C.2）。
//
// 为什么这件事需要行为测试，而不是「看一眼代码都 require 了同一个文件」。
//
// 把常量抄成两份、或者让传输自己拼 `contract_version: 1` 字面量，此刻**什么都不坏**：
// 两份数字相等，形状也对，所有既有断言照样绿。危险全在将来——下一次改版本号的人只会
// 改一侧，于是传输开始拒绝所有新客户端，或者更糟：继续接受所有旧客户端。这正是这个
// 版本号存在要防的那种静默语义漂移。
//
// 变异测试先指出了这一点：四条「抄一份 / 拼字面量」的变异全部存活，因为没有任何断言
// 区分「引同一个来源」与「碰巧写了同一个数」。
//
// 做法是把那唯一的来源改掉，再看两侧是否都跟着变。改 require 缓存里的导出对象，
// 然后重新加载两侧——两侧若真的从那里读，就会看到新数字；抄了一份的那一侧不会。
// 这比源码断言强：它测的是「值从哪儿来」，而不是「文件里有没有那行 require」。

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const SHARED = require.resolve("../src/shared/contract-version.cjs");
const CONTRACT = require.resolve("../src/contract/adapter-contract.cjs");
const SERVER = require.resolve("../src/authority/command-server.cjs");
const CLIENT = require.resolve("../src/host/core-client.cjs");
const MCP = require.resolve("../plugins/tokengame/mcp/server.cjs");

// 把这几个模块从缓存里摘掉，好让它们下一次 require 时重新执行顶层的解构。
// 解构是在模块加载那一刻发生的，所以不重新加载就读不到新值。
//
// MCP server 不在这个名单里，由它自己那条测试单独摘：它在模块顶层就建了 custody 与
// ModelCommandSurface，每次 reload 都白造一份状态。它依赖的 CONTRACT 在这里被摘掉了，
// 所以它重新加载时拿到的是新的 requestEnvelope，而不是旧闭包。
function reload() {
  for (const id of [SHARED, CONTRACT, SERVER, CLIENT]) delete require.cache[id];
}

// 在「共享常量被改成 fake」的世界里跑一段，跑完无条件还原。
//
// `await body()` 此刻是防御性的，不是承重的：实测把它改成 `return body()`，五条测试
// 全部照旧通过。原因是 `const { CONTRACT_VERSION } = require(...)` 在模块加载那一刻
// 就把值取走了，所以下面每一次读版本号都发生在 body 的同步前缀里，早于任何 await，
// 也早于 finally。留着它是为了将来：哪天有一条测试在 await 之后才读版本，没有它
// finally 会先把常量换回去，那条测试就会变成「测的是真值」——照样绿，什么也没钉住。
//
// 还原必须在 finally 里：漏了它，同一个进程里后面的测试会在一个版本号被改过的世界里跑，
// 而那种污染的表现是「另一个文件里某条断言偶尔失败」——最难查的一类。
async function withVersion(fake, body) {
  reload();
  const shared = require("../src/shared/contract-version.cjs");
  const real = shared.CONTRACT_VERSION;
  try {
    shared.CONTRACT_VERSION = fake;
    return await body();
  } finally {
    shared.CONTRACT_VERSION = real;
    reload();
  }
}

// 取一个「肯定不是当前真版本」的数字。
//
// 不写死具体数：写死的那一天版本号涨上来撞上它，这些测试就会在「fake 等于真值」的
// 情况下继续全绿——而它们要区分的恰恰是这两者。偏移量各不相同，好让失败信息里的
// 数字能指认是哪一条。
function otherVersion(offset) {
  return require("../src/shared/contract-version.cjs").CONTRACT_VERSION + offset;
}

test("改掉唯一来源，合同层构造的请求信封跟着变", async () => {
  const fake = otherVersion(98);
  const seen = await withVersion(fake, () => {
    const contract = require("../src/contract/adapter-contract.cjs");
    return contract.requestEnvelope("view.projection", {}).contract_version;
  });
  assert.equal(seen, fake,
    "合同层没跟着共享常量走——它大概自己抄了一份数字");
});

test("改掉唯一来源，响应信封也跟着变", async () => {
  // 请求信封与响应信封是两个 helper。只测请求的话，把响应那两个改成字面量不会红，
  // 而跨版本时先出问题的往往是响应侧：客户端拿它判断「对面认不认得我」。
  const fake = otherVersion(97);
  const seen = await withVersion(fake, () => {
    const contract = require("../src/contract/adapter-contract.cjs");
    return [
      contract.okEnvelope({}).contract_version,
      contract.errorEnvelope("room_full").contract_version,
    ];
  });
  assert.deepEqual(seen, [fake, fake]);
});

test("改掉唯一来源，客户端发出去的 body 里也是新版本", async () => {
  // 这一条钉的是「传输经 helper 构造信封」，而不是自己拼字面量。
  // 拼字面量此刻形状也对、服务端也接受，所以只有换掉来源才分得出来。
  const bodies = [];
  const fake = otherVersion(96);
  await withVersion(fake, async () => {
    const { HttpCoreClient } = require("../src/host/core-client.cjs");
    const client = new HttpCoreClient({
      origin: "http://127.0.0.1:1",
      token: "t",
      fetchImpl: async (_url, options) => {
        bodies.push(JSON.parse(options.body));
        return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
      },
    });
    await client.dispatch("view.projection", { room_id: "r1" });
  });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].contract_version, fake,
    "传输没经 requestEnvelope 构造——它大概自己拼了字面量，"
    + "于是改合同不再影响传输，而合同文档描述的是 helper");
  // 顺带钉住其余两个字段：信封是三件事，不是一件。
  assert.equal(bodies[0].command, "view.projection");
  assert.deepEqual(bodies[0].params, { room_id: "r1" });
});

test("改掉唯一来源，MCP 传输发出去的 body 里也是新版本", async (t) => {
  // MCP 那一侧的 coreRequest 没有导出，也不接受注入的 fetch。但它按环境变量决定打给谁，
  // 所以把 TOKENGAME_COMMAND_ORIGIN 指向一个只负责记账的假核心，就能看见它真正写在
  // 线上的字节——不必为了可测性给产品加一个测试专用出口。
  //
  // 走 hostCommand("room.create")：它是真人剖面里不需要先有托管凭据的入口，
  // 因此能一路走到传输而不必先造出一间房。
  const bodies = [];
  const stub = http.createServer((request, response) => {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      try { bodies.push(JSON.parse(raw)); } catch { bodies.push({ unparsable: raw }); }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: {} }));
    });
  });
  await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => stub.close(resolve)));

  const origin = `http://127.0.0.1:${stub.address().port}`;
  const previous = process.env.TOKENGAME_COMMAND_ORIGIN;
  process.env.TOKENGAME_COMMAND_ORIGIN = origin;
  t.after(() => {
    if (previous === undefined) delete process.env.TOKENGAME_COMMAND_ORIGIN;
    else process.env.TOKENGAME_COMMAND_ORIGIN = previous;
  });

  const fake = otherVersion(95);
  await withVersion(fake, async () => {
    delete require.cache[MCP];
    const server = require("../plugins/tokengame/mcp/server.cjs");
    await server.hostCommand("room.create", { rules_version: "table-rules-v1" });
  });
  delete require.cache[MCP];

  assert.equal(bodies.length, 1, "MCP 传输没打到假核心上");
  assert.equal(bodies[0].contract_version, fake,
    "MCP 传输没经 requestEnvelope 构造——它大概自己拼了字面量，"
    + "于是它与另一个传输会在改版本时分道扬镳");
  assert.equal(bodies[0].command, "room.create");
});

test("改掉唯一来源，服务端的版本闸门也跟着变（不是抄了一份数字）", async (t) => {
  // 服务端那一侧同理，但这里必须真起服务、真发请求：服务端读到的版本只体现在
  // 「它接受谁、拒绝谁」上，没有别的可观察面。
  //
  // 判据是一对方向相反的请求：新版本要放过闸门，旧的真版本要被挡住。
  // 只测其中一个方向都不够——只测「放过 fake」的话，一个根本不检查版本的服务端也通过；
  // 只测「挡住真值」的话，一个把所有请求都挡掉的服务端也通过。
  //
  // 「旧的真版本」从常量读，不写死数字：写死的话，将来版本号真的从 1 涨上去之后，
  // 这一条会悄悄变成「测两个都不是当前版本的数字」——两个都该被挡，于是它不再证明
  // 闸门跟着来源走。
  const real = require("../src/shared/contract-version.cjs").CONTRACT_VERSION;
  const fake = otherVersion(94);
  const outcomes = await withVersion(fake, async () => {
    const {
      createCommandServer, AUTHORITY_TOKEN_HEADER, DEFAULT_AUTHORITY_TOKEN,
    } = require("../src/authority/command-server.cjs");
    const service = createCommandServer({ internalToken: DEFAULT_AUTHORITY_TOKEN });
    const origin = await service.start({ host: "127.0.0.1", port: 0 });
    t.after(() => service.stop());

    // 故意用一个不存在的命令：这样过了闸门的请求会停在 unknown_command，
    // 不必为了探版本去构造一间合法房间。区分的是「停在哪一层」。
    async function probe(version) {
      const response = await fetch(`${origin}/command`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [AUTHORITY_TOKEN_HEADER]: DEFAULT_AUTHORITY_TOKEN,
        },
        body: JSON.stringify({
          contract_version: version,
          command: "tg.no.such.command",
          params: {},
        }),
      });
      const payload = await response.json();
      return payload.code;
    }

    return { fake: await probe(fake), real: await probe(real) };
  });

  assert.equal(outcomes.fake, "unknown_command",
    "服务端没跟着共享常量走：它拒了合同此刻声明的版本，"
    + "说明它自己抄了一份数字，改合同不再改它");
  assert.equal(outcomes.real, "contract_version_mismatch",
    "服务端放过了旧版本：版本闸门要么没生效，要么认的不是共享常量");
});
