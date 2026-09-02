"use strict";

// B7 -> B8：一条命令启用逐席绑定；令牌只由本人认证后下载，不生成整桌通行证。
// 真进程 + 真 HTTP 验证启动、授权交付、输出脱敏和回环边界，不靠文案自证。

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const ENTRY = path.join(ROOT, "src", "run-beta.cjs");

// 起一遍真进程，等它打印启动行，然后收工。
//
// 为什么必须 spawn：这个入口的全部内容就是那些进程级的事——生成什么、打印什么、
// 不打印什么、退出码是几。进程内 require 它测不到「令牌有没有进 stdout」。
function startBeta({ env = {}, artifactDir } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: {
        ...process.env,
        TOKENGAME_WEB_PORT: "0",
        TOKENGAME_BETA_STATE_DIR: artifactDir,
        // 不使用调用者的核心、模型适配器或宿主连接配置。
        TOKENGAME_COMMAND_ORIGIN: "",
        TOKENGAME_MODEL_TOKEN: "",
        TOKENGAME_MODEL_CONNECTION_FILE: "",
        TOKENGAME_MODEL_ADAPTER: "",
        TOKENGAME_AI_RECEIPT_FILE: "",
        TOKENGAME_CODEX_WAKE: "",
        TOKENGAME_CODEX_EXECUTABLE: "",
        TOKENGAME_CODEX_CWD: "",
        TOKENGAME_CODEX_THREAD: "",
        TOKENGAME_WEB_HOST: "127.0.0.1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      cwd: ROOT,
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`内测入口 15 秒内没有打印启动行\nstdout=${out}\nstderr=${err}`));
    }, 15_000);
    const settle = () => {
      const line = out.split("\n").find((candidate) => candidate.trim().startsWith("{"));
      if (line === undefined) return;
      clearTimeout(timer);
      try {
        resolve({ child, banner: JSON.parse(line), stdout: () => out, stderr: () => err });
      } catch (error) {
        clearTimeout(timer);
        reject(new Error(`启动行不是 JSON: ${line}`));
      }
    };
    child.stdout.on("data", (chunk) => { out += chunk; settle(); });
    child.stderr.on("data", (chunk) => { err += chunk; });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      // 正常路径上它不会退出；退出了就是启动失败，把两股输出一起交出去。
      reject(new Error(`内测入口以 ${code} 退出\nstdout=${out}\nstderr=${err}`));
    });
  });
}

function tempDir(t) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "beta-entry-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function betaOnce(t, env = {}) {
  const dir = tempDir(t);
  const started = await startBeta({ env, artifactDir: dir });
  t.after(() => started.child.kill("SIGKILL"));
  return { ...started, dir };
}

async function bindSeat(run) {
  const post = async (route, body) => {
    const response = await fetch(`${run.banner.origin}${route}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 200, route);
    const value = await response.json();
    assert.equal(value.ok, true, route);
    return value;
  };
  const seat = await post("/api/room/create", { player_id: "beta-player", table_rules_version: "table-rules-v1" });
  await post("/api/action", {
    session_token: seat.session_token, command: "room.confirm_public_scope", params: { acknowledged: true },
  });
  return post("/api/model/bind", {
    session_token: seat.session_token, acknowledged: true, binding_request_id: "beta-test-binding-request-0001",
  });
}

// 等人话那一段落地。
//
// 启动行与人话是两次 write，所以拿到 JSON 那一行时后面几行可能还没到。这里等具体的
// 内容而不是睡固定毫秒：睡短了偶发红，睡长了每条都慢，而两者都测不到「这句话真的在」。
async function waitForText(run, pattern, deadlineMs = 5_000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (pattern.test(run.stdout())) return run.stdout();
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`${deadlineMs}ms 内没等到 ${pattern}，实际输出:\n${run.stdout()}`);
}

test("内测入口把模型路由打开，而不是留给人自己去发现它是关着的", async (t) => {
  const { banner } = await betaOnce(t);
  assert.equal(typeof banner.origin, "string");
  assert.match(banner.origin, /^http:\/\/127\.0\.0\.1:\d+$/, `默认必须回环: ${banner.origin}`);

  const health = await (await fetch(`${banner.origin}/api/health`)).json();
  assert.equal(health.model_command_route, "enabled",
    "内测入口起的协调器上模型路由仍然关着——那条「AI 在座位旁说话」的链路整条不成立");
});

test("逐席下载交付不同的高熵令牌，不再生成进程级令牌文件", async (t) => {
  const first = await betaOnce(t);
  const second = await betaOnce(t);
  const firstBinding = await bindSeat(first);
  const secondBinding = await bindSeat(second);
  const a = firstBinding.connection.model_token;
  const b = secondBinding.connection.model_token;
  assert.equal(firstBinding.connection.schema, "tokengame.model-connection.v1");
  assert.equal(firstBinding.connection.table_origin, first.banner.origin);
  assert.deepEqual(Object.keys(firstBinding.connection).sort(), ["model_token", "schema", "table_origin"]);
  assert.ok(a.length >= 32, `令牌太短: ${a.length} 个字符`);
  assert.notEqual(a, b, "两次启动生成了同一个令牌——那说明它不是随机的");
  // 熵的下界。十六进制串的每个字符最多 4 bit，所以字符集大小要真的够。
  assert.ok(new Set(a).size >= 10, `字符集太小，可能是个写死的串: ${new Set(a).size}`);
  // 源码里不许有一个「本地够用」的默认值。
  const source = fs.readFileSync(ENTRY, "utf8");
  assert.doesNotMatch(source, /TOKENGAME_MODEL_TOKEN\s*\|\|\s*["'][^"']+["']/,
    "源码里给模型令牌留了默认值——那等于本机任何进程都能替所有席位发言");
  for (const run of [first, second]) {
    assert.equal(run.banner.model_auth, "per_seat_binding");
    assert.equal(run.banner.model_token_file, undefined);
    assert.deepEqual(fs.readdirSync(run.dir), [], "beta 不得把整桌令牌写进旧状态目录");
  }
});

test("令牌不进 stdout，也不进 stderr", async (t) => {
  const run = await betaOnce(t);
  const token = (await bindSeat(run)).connection.model_token;
  // 等整段输出落地再扫。只看第一行会让「后面几行才泄漏」漏过去。
  await waitForText(run, /Ctrl\+C/);
  assert.equal(run.stdout().includes(token), false,
    "模型令牌被打到了 stdout。`npm run beta > log.txt` 之后它就在文件里了");
  assert.equal(run.stderr().includes(token), false, "模型令牌被打到了 stderr");
  // 反面：真实下载已返回令牌，说明也必须指向本人授权入口，不能只是不提供任何权限。
  assert.match(run.stdout(), /下载本席 AI 连接文件/);
  assert.match(run.stdout(), /插件 README/);
  assert.match(run.stdout(), /connection:activate/);
  assert.match(run.stdout(), /connection:clear/);
  assert.doesNotMatch(run.stdout(), /TOKENGAME_MODEL_CONNECTION_FILE/,
    "内测主入口不能再要求真人逐局修改 MCP 环境变量；该变量只属于 launcher 内部或兼容排障");
  assert.equal(run.banner.model_token_file, undefined);
});

test("启动行如实说明本机能力，不宣称主动唤醒", async (t) => {
  const run = await betaOnce(t);
  const { banner } = run;
  // 没挂适配器就是没挂。启动行不许含糊。
  assert.equal(banner.model_adapter, null,
    "没有 --model-adapter 却报了一个适配器");
  // B14只证明固定版本单席有限样本，持续主动产品仍未验证。这个入口不许把前者扩成后者。
  //
  // 按解析后的字段断言，不靠正则去扫 JSON 文本。扫文本那种写法我写窄过一次：
  // `proactive_wake["\s]*[:=]` 匹配不到真实的 `"proactive_wake_verified":true`，
  // 于是把它翻成 true 的变异活了下来——一条读起来很像在防这件事、实际上什么都不防的断言。
  assert.equal(banner.proactive_wake_verified, false,
    "启动行把固定版本单席有限样本扩大成了持续主动产品已验证");
  assert.equal(banner.wake_fallback, "polling",
    "启动行没说兜底是轮询——缺能力时那句话就是「可见兜底」的全部内容");
  const text = `${JSON.stringify(banner)}\n${await waitForText(run, /Ctrl\+C/)}`;
  // 人话那一段也不许有这类说法。上面两条管的是字段，这一条管的是散文。
  assert.doesNotMatch(text, /主动唤醒(已|可用|支持|通过)/,
    "启动信息的人话部分宣称了主动唤醒");
  // 而且必须明确说出兜底是轮询。缺能力时「不静默卡住」的全部内容就是这句话。
  assert.match(text, /轮询/,
    "启动信息没说清缺主动唤醒时靠轮询兜底——那正是「静默卡住」与「可见兜底」的差别");
});

test("加入说明里有邀请码这一步，且不含任何令牌", async (t) => {
  const run = await betaOnce(t);
  const { banner } = run;
  const text = await waitForText(run, /Ctrl\+C/);
  // 朋友要做的三件事：打开地址、建房或输邀请码、按 Ready。说明里至少要有邀请码这一步，
  // 否则第二个人不知道自己该拿什么加入。
  assert.match(text, /邀请码/, "加入说明里没有邀请码这一步");
  assert.ok(text.includes(banner.origin), "加入说明里没有牌桌地址");
  // 会话令牌绝不出现在任何一行里。它是真人的下注权限。
  assert.doesNotMatch(text, /web-session-[0-9a-f-]{8}/,
    "启动输出里出现了会话令牌——那是真人的下注权限");
  const token = (await bindSeat(run)).connection.model_token;
  assert.equal(text.includes(token), false, "加入说明里带上了模型令牌");
  assert.match(text, /远程联机尚未开放/);
  assert.match(text, /不能直接发给异地朋友/);
});

test("固定通知入口要求目标游戏任务先结束当前回复并保持空闲", async (t) => {
  const run = await betaOnce(t, {
    TOKENGAME_CODEX_WAKE: "1",
    TOKENGAME_CODEX_EXECUTABLE: process.execPath,
    TOKENGAME_CODEX_CWD: ROOT,
    TOKENGAME_CODEX_THREAD: "018f76d0-7fd2-7b85-a4b5-91a7fcf019f1",
  });
  assert.equal(run.banner.managed_wake, "available");
  const text = await waitForText(run, /保持空闲/);
  assert.match(text, /结束当前回复并保持空闲/);
  assert.match(text, /任务正在运行时[^。]*通知可能已接收[^。]*不能并发结清/);
});

test("默认端口两侧同一个来源，插件不配也能对上", async (t) => {
  // 内测入口默认监听约定端口，MCP 插件在没配 TOKENGAME_TABLE_ORIGIN 时默认连的也是它。
  // 两处各写一遍数字的坏法很具体：改一侧之后表现是「模型说连不上牌桌，而牌桌明明开着」
  // ——读起来像网络问题，实际是两个不一致的数字。所以这里断言的是「同一个来源」。
  const { DEFAULT_TABLE_ORIGIN, DEFAULT_TABLE_PORT } = require("../src/shared/endpoints.cjs");
  assert.equal(DEFAULT_TABLE_ORIGIN, `http://127.0.0.1:${DEFAULT_TABLE_PORT}`);

  const stripped = (file) => fs.readFileSync(path.join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const file of ["src/run-beta.cjs", "plugins/tokengame/mcp/server.cjs", "src/host/table-web-host.cjs"]) {
    assert.match(stripped(file), /require\((?:"|')(?:\.\.?\/)+(?:src\/)?shared\/endpoints\.cjs(?:"|')\)/,
      `${file} 应当引用共享的端口常量，而不是自己写一个数字`);
    assert.doesNotMatch(stripped(file), new RegExp(`${DEFAULT_TABLE_PORT}`),
      `${file} 里出现了端口字面量 ${DEFAULT_TABLE_PORT}——那就是抄了一份`);
  }

  // 行为面：不设 TOKENGAME_WEB_PORT 时真的监听那个口。
  //
  // 这一条与其他用例都设 port=0 相反，所以它可能撞上一个已经在跑的协调器。撞上就跳过
  // 而不是失败：一个真在用的内测进程不该让测试红。跳过时明确说出原因，不静默通过。
  const dir = tempDir(t);
  let started;
  try {
    started = await startBeta({ env: { TOKENGAME_WEB_PORT: "" }, artifactDir: dir });
  } catch (error) {
    if (/EADDRINUSE|address already in use/i.test(error.message)) {
      t.skip(`约定端口 ${DEFAULT_TABLE_PORT} 已被占用，跳过监听断言`);
      return;
    }
    throw error;
  }
  t.after(() => started.child.kill("SIGKILL"));
  assert.equal(started.banner.origin, DEFAULT_TABLE_ORIGIN,
    "不设端口时应当监听约定端口，这样人填一次宿主配置就够");
});

test("对外监听被拒，而且入口不提供绕过它的开关", async (t) => {
  const dir = tempDir(t);
  await assert.rejects(
    () => startBeta({ env: { TOKENGAME_WEB_HOST: "0.0.0.0" }, artifactDir: dir }),
    (error) => {
      // 拒绝要说得出是哪一条未关闭的未知在挡着，而不是一句 EACCES。
      assert.match(error.message, /U-TG-LOCAL-BRIDGE-AUTH|local_bridge_auth_unresolved/,
        `拒绝理由里没有那条未知: ${error.message}`);
      return true;
    },
  );
  // 源码里不许有一个把这道门关掉的开关。
  const source = fs.readFileSync(ENTRY, "utf8");
  assert.doesNotMatch(source, /ALLOW_(REMOTE|LAN|EXTERNAL)|allowNonLoopback|--unsafe/,
    "入口提供了绕过回环限制的开关——U-TG-LOCAL-BRIDGE-AUTH 还开着，绕过它就是提前放行");
});
