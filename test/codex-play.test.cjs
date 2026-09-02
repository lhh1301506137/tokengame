"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  resolveCodexExecutable,
  run,
} = require("../plugins/tokengame/codex/play.cjs");
const { resolveCodexProject } = require("../plugins/tokengame/codex/project-config.cjs");

const ROOT = path.resolve(__dirname, "..");
const THREAD = "A04D2C43-3425-4DE6-8CBE-85B78BCFF458";
const SESSION = "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB";

function capture() {
  let value = "";
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "tokengame-codex-play-"));
  const project = path.join(base, "current-codex-project");
  const repository = path.join(project, "packages", "tokengame");
  fs.mkdirSync(path.join(repository, "plugins", "tokengame", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ name: "tokengame" }));
  fs.writeFileSync(path.join(repository, "plugins", "tokengame", "mcp", "server.cjs"), "module.exports = {};\n");
  const executable = path.join(base, "explicit", "codex.exe");
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, "fixture executable\n");
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return { base, project, repository, executable, config: path.join(project, ".codex", "config.toml") };
}

function environment(f, extra = {}) {
  return { CODEX_THREAD_ID: THREAD, TOKENGAME_CODEX_EXECUTABLE: f.executable, KEEP_ME: "yes", ...extra };
}

async function launch(f, extra = {}) {
  const stdout = extra.stdout ?? capture();
  const stderr = extra.stderr ?? capture();
  const betaCalls = [];
  const code = await run(extra.argv ?? [f.project], {
    cwd: extra.cwd ?? f.repository,
    env: extra.env ?? environment(f), stdout: stdout.stream, stderr: stderr.stream,
    configure: extra.configure,
    betaMain: extra.betaMain ?? (async (options) => { betaCalls.push(options); }),
    platform: extra.platform,
  });
  return { code, stdout: stdout.value(), stderr: stderr.value(), betaCalls };
}

test("项目参数先做唯一绝对/canonical/包含仓库校验，失败不触碰配置", async (t) => {
  const f = fixture(t);
  assert.deepEqual(resolveCodexProject(f.repository, f.project), {
    repository: fs.realpathSync(f.repository), project: fs.realpathSync(f.project),
  });
  const unrelated = path.join(f.base, "unrelated-project");
  fs.mkdirSync(unrelated);
  for (const argv of [[], [f.project, f.project], ["relative-project"], [unrelated]]) {
    let configured = 0;
    const result = await launch(f, { argv, configure() { configured += 1; return { changed: false }; } });
    assert.notEqual(result.code, 0);
    assert.equal(configured, 0);
    assert.equal(fs.existsSync(path.join(f.project, ".codex")), false);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(f.base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("只认合法CODEX_THREAD_ID；SESSION既不读取也不参与身份回退", async (t) => {
  const f = fixture(t);
  for (const thread of [undefined, "", SESSION.slice(0, -1), ` ${THREAD}`, "not-a-task"]) {
    let configured = 0;
    const env = environment(f, { CODEX_THREAD_ID: thread });
    Object.defineProperty(env, "TOKENGAME_CODEX_EXECUTABLE", {
      enumerable: true, get() { throw new Error("executable_read_before_thread_validation"); },
    });
    const result = await launch(f, { env, configure() { configured += 1; return { changed: false }; } });
    assert.notEqual(result.code, 0);
    assert.equal(configured, 0);
    assert.match(result.stderr, /tokengame_codex_thread_invalid/);
  }

  let launched;
  const env = environment(f);
  Object.defineProperty(env, "CODEX_SESSION_ID", {
    enumerable: true, get() { throw new Error("CODEX_SESSION_ID must not be read"); },
  });
  const ok = await launch(f, { env, configure: () => ({ changed: false }),
    betaMain: async (options) => { launched = options.env; } });
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(launched.TOKENGAME_CODEX_THREAD, THREAD.toLowerCase());
  assert.equal(Object.hasOwn(launched, "CODEX_SESSION_ID"), false);
});

test("显式可执行文件优先且独占；无效时绝不读取或回退PATH", async (t) => {
  const f = fixture(t);
  for (const explicit of ["relative.exe", path.join(f.base, "missing.exe"), f.project]) {
    let configured = 0;
    const env = { CODEX_THREAD_ID: THREAD, TOKENGAME_CODEX_EXECUTABLE: explicit };
    Object.defineProperty(env, "PATH", { enumerable: true, get() { throw new Error("PATH fallback forbidden"); } });
    const result = await launch(f, { env, configure() { configured += 1; return { changed: false }; } });
    assert.notEqual(result.code, 0);
    assert.equal(configured, 0);
    assert.match(result.stderr, /tokengame_codex_executable_invalid/);
  }
  const fakeFs = {
    lstatSync() { return { isFile: () => true, isSymbolicLink: () => true }; },
    realpathSync(value) { return value; },
  };
  assert.throws(() => resolveCodexExecutable({ TOKENGAME_CODEX_EXECUTABLE: "C:\\explicit\\codex.exe" }, {
    fs: fakeFs, path: path.win32, platform: "win32",
  }), { code: "tokengame_codex_executable_invalid" });

  for (const explicit of [
    "C:\\bad\ncodex.exe",
    "C:\\bad\rcodex.exe",
    "C:\\bad\0codex.exe",
    "\\\\server\\share\\codex.exe",
    "\\root\\codex.exe",
  ]) {
    let ioCalls = 0;
    const noIoFs = {
      lstatSync() { ioCalls += 1; throw new Error("畸形路径不得进入文件系统"); },
      realpathSync() { ioCalls += 1; throw new Error("畸形路径不得进入文件系统"); },
    };
    assert.throws(() => resolveCodexExecutable({ TOKENGAME_CODEX_EXECUTABLE: explicit }, {
      fs: noIoFs, path: path.win32, platform: "win32",
    }), { code: "tokengame_codex_executable_invalid" });
    assert.equal(ioCalls, 0);
  }
});

test("Windows PATH只取第一实际候选；不可信第一项立即拒绝，不跳到后项", (t) => {
  const f = fixture(t);
  const local = path.join(f.base, "LocalAppData");
  const trustedA = path.join(local, "OpenAI", "Codex", "bin", "a1", "codex.exe");
  const trustedB = path.join(local, "OpenAI", "Codex", "bin", "beef02", "codex.exe");
  for (const file of [trustedA, trustedB]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "trusted fixture\n");
  }
  const missing = path.join(f.base, "missing-bin");
  const selected = resolveCodexExecutable({ PATH: [missing, path.dirname(trustedA), path.dirname(trustedB)].join(";"),
    LOCALAPPDATA: local }, { platform: "win32" });
  assert.equal(selected, fs.realpathSync(trustedA));

  const untrusted = path.join(f.base, "untrusted", "codex.exe");
  fs.mkdirSync(path.dirname(untrusted), { recursive: true });
  fs.writeFileSync(untrusted, "untrusted fixture\n");
  assert.throws(() => resolveCodexExecutable({ PATH: [path.dirname(untrusted), path.dirname(trustedA)].join(";"),
    LOCALAPPDATA: local }, { platform: "win32" }), { code: "tokengame_codex_executable_untrusted" });

  const nonHex = path.join(local, "OpenAI", "Codex", "bin", "not-hex", "codex.exe");
  fs.mkdirSync(path.dirname(nonHex), { recursive: true });
  fs.writeFileSync(nonHex, "wrong channel\n");
  assert.throws(() => resolveCodexExecutable({ PATH: [path.dirname(nonHex), path.dirname(trustedA)].join(";"),
    LOCALAPPDATA: local }, { platform: "win32" }), { code: "tokengame_codex_executable_untrusted" });

  for (const stat of [
    { isFile: () => false, isSymbolicLink: () => false },
    { isFile: () => true, isSymbolicLink: () => true },
  ]) {
    const candidate = "C:\\first\\codex.exe";
    const fakeFs = {
      lstatSync(value) {
        assert.equal(value, candidate);
        return stat;
      },
      realpathSync() { throw new Error("目录或链接候选不得 canonicalize/跳过"); },
    };
    assert.throws(() => resolveCodexExecutable({
      PATH: "C:\\first;C:\\second", LOCALAPPDATA: "C:\\LocalAppData",
    }, { fs: fakeFs, path: path.win32, platform: "win32" }),
    { code: "tokengame_codex_executable_untrusted" });
  }
});

test("未显式配置时非Windows失败；显式普通文件不受PATH平台回退限制", (t) => {
  const f = fixture(t);
  const env = {};
  Object.defineProperty(env, "PATH", { enumerable: true, get() { throw new Error("non-Windows PATH must not be read"); } });
  assert.throws(() => resolveCodexExecutable(env, { platform: "linux", path: path.win32 }),
    { code: "tokengame_codex_executable_required" });
  assert.equal(resolveCodexExecutable({ TOKENGAME_CODEX_EXECUTABLE: f.executable }, {
    platform: "linux", path: path.win32,
  }), fs.realpathSync(f.executable));
});

test("全部前置通过后才原子配置；changed只提示重启，重复运行才同进程启动一次", async (t) => {
  const f = fixture(t);
  let betaCalls = 0;
  const first = await launch(f, { betaMain: async () => { betaCalls += 1; } });
  assert.equal(first.code, 0, first.stderr);
  assert.equal(betaCalls, 0);
  assert.match(first.stdout, /已配置，请重启目标 Codex 任务后重跑/);
  assert.equal(fs.existsSync(f.config), true);
  const config = fs.readFileSync(f.config, "utf8");
  for (const secret of [THREAD, THREAD.toLowerCase(), SESSION, f.executable]) {
    assert.equal(config.includes(secret), false);
  }
  assert.equal(config.split("\n").find((line) => line.startsWith("cwd = ")),
    `cwd = ${JSON.stringify(fs.realpathSync(f.repository).replaceAll("\\", "/"))}`);
  for (const localValue of [f.base, f.project, f.repository, f.executable, THREAD, SESSION]) {
    assert.equal(`${first.stdout}${first.stderr}`.includes(localValue), false,
      "稳定启动输出不得回显本机路径或任务标识");
  }

  const second = await launch(f, { betaMain: async () => { betaCalls += 1; } });
  assert.equal(second.code, 0, second.stderr);
  assert.equal(betaCalls, 1);
  assert.equal(second.stdout, "");

  const repositoryIsProject = await launch(f, {
    argv: [f.repository],
    betaMain: async () => { betaCalls += 1; },
  });
  assert.equal(repositoryIsProject.code, 0, repositoryIsProject.stderr);
  assert.equal(fs.readFileSync(path.join(f.repository, ".codex", "config.toml"), "utf8")
    .split("\n").find((line) => line.startsWith("cwd = ")),
  `cwd = ${JSON.stringify(fs.realpathSync(f.repository).replaceAll("\\", "/"))}`);
  assert.equal(betaCalls, 1);
});

test("launch env复制必要宿主键、排除SESSION与全部敌意TokenGame值并强制本地合同", async (t) => {
  const f = fixture(t);
  const env = environment(f, {
    TOKENGAME_WEB_HOST: "0.0.0.0", TOKENGAME_WEB_PORT: "9999",
    TOKENGAME_COMMAND_ORIGIN: "http://remote.invalid", TOKENGAME_MODEL_ADAPTER: "evil-adapter",
    TOKENGAME_AI_RECEIPT_FILE: "secret-file", TOKENGAME_CODEX_WAKE: "0",
    TOKENGAME_CODEX_CWD: "C:\\wrong", TOKENGAME_CODEX_THREAD: SESSION,
    TOKENGAME_AUTHORITY_TOKEN: "hostile-token",
    TOKENGAME_PUBLIC_ORIGIN: "https://Friends-Tunnel.Example:443/",
    CODEX_THREAD_ID: THREAD,
  });
  Object.defineProperty(env, "CODEX_SESSION_ID", {
    enumerable: true, get() { throw new Error("session getter read"); },
  });
  let launchEnv;
  const result = await launch(f, { env, configure: () => ({ changed: false }),
    betaMain: async (options) => { launchEnv = options.env; } });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(launchEnv.KEEP_ME, "yes");
  assert.equal(Object.hasOwn(launchEnv, "CODEX_SESSION_ID"), false);
  assert.equal(Object.hasOwn(launchEnv, "TOKENGAME_AUTHORITY_TOKEN"), false);
  assert.deepEqual(Object.fromEntries(Object.entries(launchEnv).filter(([key]) => key.startsWith("TOKENGAME_"))), {
    TOKENGAME_WEB_HOST: "127.0.0.1", TOKENGAME_WEB_PORT: "", TOKENGAME_COMMAND_ORIGIN: "",
    TOKENGAME_MODEL_ADAPTER: "", TOKENGAME_AI_RECEIPT_FILE: "", TOKENGAME_CODEX_WAKE: "1",
    TOKENGAME_CODEX_EXECUTABLE: fs.realpathSync(f.executable),
    TOKENGAME_CODEX_CWD: fs.realpathSync(f.project), TOKENGAME_CODEX_THREAD: THREAD.toLowerCase(),
    TOKENGAME_PUBLIC_ORIGIN: "https://friends-tunnel.example",
  });
  assert.equal(env.TOKENGAME_WEB_HOST, "0.0.0.0", "不得改写调用方环境对象");
});

test("一键入口在写配置前拒绝非法 public origin，且稳定输出不回显其内容", async (t) => {
  const f = fixture(t);
  const secret = "http://remote.invalid/path?token=DO_NOT_PRINT";
  let configured = 0;
  const result = await launch(f, {
    env: environment(f, { TOKENGAME_PUBLIC_ORIGIN: secret }),
    configure: () => { configured += 1; return { changed: false }; },
  });
  assert.equal(result.code, 1);
  assert.equal(configured, 0);
  assert.match(result.stderr, /tokengame_public_origin_invalid/);
  assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
  assert.equal(`${result.stdout}${result.stderr}`.includes("DO_NOT_PRINT"), false);
});

test("成功失败输出均稳定去敏；配置异常不启动beta", async (t) => {
  const f = fixture(t);
  const sensitive = `${f.project}|${f.repository}|${f.executable}|${THREAD}|${SESSION}`;
  const failure = Object.assign(new Error(sensitive), { code: "tokengame_codex_config_synthetic_failure" });
  let betaCalls = 0;
  const result = await launch(f, { configure() { throw failure; },
    betaMain: async () => { betaCalls += 1; } });
  assert.equal(result.code, 1);
  assert.equal(betaCalls, 0);
  assert.match(result.stderr, /tokengame_codex_config_synthetic_failure/);
  for (const secret of [f.project, f.repository, f.executable, THREAD, SESSION]) {
    assert.equal(`${result.stdout}${result.stderr}`.includes(secret), false);
  }
});

test("package入口保持原命令，beta注入环境与启动失败通过行为合同返回", async (t) => {
  const f = fixture(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.scripts["codex:play"], "node plugins/tokengame/codex/play.cjs");
  assert.equal(manifest.scripts.beta, "node src/run-beta.cjs");
  assert.equal(manifest.scripts["codex:configure"], "node plugins/tokengame/codex/configure-project.cjs");
  const beta = require("../src/run-beta.cjs");
  assert.equal(typeof beta.main, "function");
  assert.equal(typeof beta.startBeta, "function");

  const failedPlay = await launch(f, {
    configure: () => ({ changed: false }),
    betaMain: async () => false,
  });
  assert.equal(failedPlay.code, 1);
  assert.match(failedPlay.stderr, /tokengame_codex_beta_start_failed/);
  for (const secret of [f.project, f.repository, f.executable, THREAD, SESSION]) {
    assert.equal(`${failedPlay.stdout}${failedPlay.stderr}`.includes(secret), false);
  }

  const childScript = [
    `const { main } = require(${JSON.stringify(path.join(ROOT, "src", "run-beta.cjs"))});`,
    "const env = { TOKENGAME_WEB_HOST: '127.0.0.1', TOKENGAME_WEB_PORT: '0',",
    "  TOKENGAME_COMMAND_ORIGIN: 'http://127.0.0.1:1', TOKENGAME_AI_RECEIPT_FILE: 'synthetic' };",
    "main({ env }).then((started) => {",
    "  process.stdout.write(`MAIN_RESULT=${String(started)}\\n`);",
    "  process.exitCode = started === false ? 0 : 2;",
    "}, () => { process.exitCode = 3; });",
  ].join("\n");
  const child = spawnSync(process.execPath, ["-e", childScript], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 5_000,
    env: { ...process.env, TOKENGAME_WEB_PORT: "invalid-parent-port" },
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, `${child.stdout}\n${child.stderr}`);
  assert.match(child.stdout, /MAIN_RESULT=false/);
  assert.match(child.stderr, /ai_receipt_remote_core_unsupported/);
  assert.doesNotMatch(child.stderr, /TOKENGAME_WEB_PORT/);
});
