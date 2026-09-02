"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { PassThrough } = require("node:stream");
const {
  PROJECT_CONNECTION_FILENAME,
  PROJECT_PRIVATE_DIRECTORY,
  activateProjectConnection,
  clearProjectConnection,
  configureProjectMcp,
  projectConnectionFile,
} = require("../src/host/project-model-connection.cjs");
const {
  MANAGED_MCP_BEGIN,
  MANAGED_MCP_END,
  configureCodexProject,
} = require("../plugins/tokengame/codex/project-config.cjs");
const connectionCli = require("../src/run-model-connection.cjs");
const codexSetupCli = require("../plugins/tokengame/codex/configure-project.cjs");
const projectMcp = require("../src/run-project-mcp.cjs");
const mcp = require("../plugins/tokengame/mcp/server.cjs");

const ROOT = path.join(__dirname, "..");
const TOKEN_A = "project-seat-model-token-000000000000000000000001";
const TOKEN_B = "project-seat-model-token-000000000000000000000002";
const ENV_KEYS = ["TOKENGAME_MODEL_CONNECTION_FILE", "TOKENGAME_MODEL_TOKEN", "TOKENGAME_TABLE_ORIGIN"];

test("项目活动槽位名称固定，不能随席位或牌局改写 MCP 定义", () => {
  assert.equal(PROJECT_PRIVATE_DIRECTORY, ".tokengame-private");
  assert.equal(PROJECT_CONNECTION_FILENAME, "active-model-connection.json");
});

function projectFixture(t) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const root = fs.mkdtempSync(path.join(ROOT, "artifacts", "project-connection-"));
  fs.mkdirSync(path.join(root, "plugins", "tokengame", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "tokengame" }));
  fs.writeFileSync(path.join(root, "plugins", "tokengame", "mcp", "server.cjs"), "module.exports = {};\n");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "downloaded.json");
  const write = (origin, token = TOKEN_A, extra = {}) => fs.writeFileSync(source, JSON.stringify({
    schema: "tokengame.model-connection.v1",
    table_origin: origin,
    model_token: token,
    ...extra,
  }));
  return { root, source, write };
}

function nestedProjectFixture(t) {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const host = fs.mkdtempSync(path.join(ROOT, "artifacts", "codex-project-"));
  const repository = path.join(host, "tokengame");
  fs.mkdirSync(path.join(repository, "plugins", "tokengame", "mcp"), { recursive: true });
  fs.writeFileSync(path.join(repository, "package.json"), JSON.stringify({ name: "tokengame" }));
  fs.writeFileSync(path.join(repository, "plugins", "tokengame", "mcp", "server.cjs"), "module.exports = {};\n");
  t.after(() => fs.rmSync(host, { recursive: true, force: true }));
  return { host, repository, config: path.join(host, ".codex", "config.toml") };
}

function capture() {
  let value = "";
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function saveEnvironment(t) {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  t.after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
}

async function localServer(t) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({ headers: request.headers, body: JSON.parse(Buffer.concat(chunks)) });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: true, result: { marker: "project-route" } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return { requests, origin: `http://127.0.0.1:${server.address().port}` };
}

test("项目 launcher 固定私有槽位，覆盖继承的连接路径但不改其他环境", () => {
  const environment = { TOKENGAME_MODEL_CONNECTION_FILE: "C:/wrong-seat.json", KEEP: "yes" };
  const configured = configureProjectMcp(ROOT, environment);
  assert.equal(configured.root, fs.realpathSync(ROOT));
  assert.equal(configured.server, path.join(configured.root, "plugins", "tokengame", "mcp", "server.cjs"));
  assert.equal(environment.TOKENGAME_MODEL_CONNECTION_FILE, path.join(
    configured.root, PROJECT_PRIVATE_DIRECTORY, PROJECT_CONNECTION_FILENAME,
  ));
  assert.equal(environment.KEEP, "yes");
  assert.equal(path.isAbsolute(environment.TOKENGAME_MODEL_CONNECTION_FILE), true);
});

test("项目 MCP 入口先配置槽位再启动既有 stdio server，错误根目录不泄露路径", () => {
  const environment = {};
  const stderr = capture();
  let loaded = null;
  let received = null;
  const stdio = { input: new PassThrough(), output: new PassThrough() };
  const ok = projectMcp.run({
    cwd: ROOT,
    environment,
    stderr: stderr.stream,
    stdio,
    loadServer(file) {
      loaded = file;
      return { runStdio(value) { received = value; } };
    },
  });
  assert.equal(ok, 0);
  assert.equal(loaded, path.join(fs.realpathSync(ROOT), "plugins", "tokengame", "mcp", "server.cjs"));
  assert.equal(received, stdio);
  assert.equal(stderr.value(), "");
  assert.equal(environment.TOKENGAME_MODEL_CONNECTION_FILE, projectConnectionFile(ROOT));

  const bad = projectMcp.run({ cwd: path.dirname(ROOT), environment: {}, stderr: stderr.stream });
  assert.equal(bad, 1);
  assert.match(stderr.value(), /tokengame_project_invalid/);
  assert.equal(stderr.value().includes(path.dirname(ROOT)), false);
});

test("显式 Codex 项目配置保留既有 TOML、写入受管块且重复运行不改文件", (t) => {
  const f = nestedProjectFixture(t);
  fs.mkdirSync(path.dirname(f.config));
  fs.writeFileSync(f.config, "model = \"existing-model\"\n");
  const first = configureCodexProject(f.repository, f.host);
  assert.deepEqual(first, { status: "configured", changed: true, restart_required: true });
  const text = fs.readFileSync(f.config, "utf8");
  assert.match(text, /^model = "existing-model"$/m);
  assert.equal(text.indexOf(MANAGED_MCP_BEGIN) < text.indexOf(MANAGED_MCP_END), true);
  assert.match(text, /\[mcp_servers\.tokengame_project\]/);
  assert.match(text, /enabled_tools = \["tokengame_table"\]/);
  assert.equal(text.split("\n").find((line) => line.startsWith("cwd = ")),
    `cwd = ${JSON.stringify(fs.realpathSync(f.repository).replaceAll("\\", "/"))}`);
  assert.doesNotMatch(text, /TOKENGAME_MODEL_(?:TOKEN|CONNECTION_FILE)/);

  const second = configureCodexProject(f.repository, f.host);
  assert.deepEqual(second, { status: "configured", changed: false, restart_required: false });
  assert.equal(fs.readFileSync(f.config, "utf8"), text);
});

test("旧受管相对 cwd 会迁移为 canonical 仓库绝对路径，块外用户配置原样保留", (t) => {
  const f = nestedProjectFixture(t);
  fs.mkdirSync(path.dirname(f.config));
  const before = [
    "model = \"keep-user-model\"",
    "",
    MANAGED_MCP_BEGIN,
    "[mcp_servers.tokengame_project]",
    "command = \"node\"",
    "args = [\"src/run-project-mcp.cjs\"]",
    "cwd = \"tokengame\"",
    "enabled = true",
    "required = false",
    "enabled_tools = [\"tokengame_table\"]",
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 60",
    MANAGED_MCP_END,
    "",
    "[mcp_servers.user_owned]",
    "command = \"keep-user-command\"",
    "",
  ].join("\n");
  fs.writeFileSync(f.config, before);

  const result = configureCodexProject(f.repository, f.host);
  assert.deepEqual(result, { status: "configured", changed: true, restart_required: true });
  const after = fs.readFileSync(f.config, "utf8");
  const beforeBegin = before.indexOf(MANAGED_MCP_BEGIN);
  const beforeEnd = before.indexOf(MANAGED_MCP_END) + MANAGED_MCP_END.length;
  const afterBegin = after.indexOf(MANAGED_MCP_BEGIN);
  const afterEnd = after.indexOf(MANAGED_MCP_END) + MANAGED_MCP_END.length;
  assert.equal(after.slice(0, afterBegin), before.slice(0, beforeBegin));
  assert.equal(after.slice(afterEnd), before.slice(beforeEnd));
  assert.equal(after.split("\n").find((line) => line.startsWith("cwd = ")),
    `cwd = ${JSON.stringify(fs.realpathSync(f.repository).replaceAll("\\", "/"))}`);
  assert.doesNotMatch(after, /^cwd = "tokengame"$/m);
  assert.match(after, /^model = "keep-user-model"$/m);
  assert.match(after, /^\[mcp_servers\.user_owned\]$/m);
  assert.match(after, /^command = "keep-user-command"$/m);
});

test("受管 Codex 配置只替换自己的块；冲突或发布失败保留原文件", (t) => {
  const f = nestedProjectFixture(t);
  fs.mkdirSync(path.dirname(f.config));
  fs.writeFileSync(f.config, "model = \"keep\"\n\n[mcp_servers.tokengame_project]\ncommand = \"other\"\n");
  const conflicting = fs.readFileSync(f.config, "utf8");
  assert.throws(() => configureCodexProject(f.repository, f.host),
    { code: "tokengame_codex_config_conflict" });
  assert.equal(fs.readFileSync(f.config, "utf8"), conflicting);

  fs.writeFileSync(f.config, "model = \"keep\"\n");
  assert.throws(() => configureCodexProject(f.repository, f.host, {
    rename() { throw new Error("synthetic publish failure"); },
  }), { code: "tokengame_codex_config_write_failed" });
  assert.equal(fs.readFileSync(f.config, "utf8"), "model = \"keep\"\n");
  assert.deepEqual(fs.readdirSync(path.dirname(f.config)).filter((name) => name.endsWith(".tmp")), []);
});

test("Codex 配置拒绝把仓库登记到不包含它的项目，也不越界改用户配置", (t) => {
  const f = nestedProjectFixture(t);
  const outside = fs.mkdtempSync(path.join(ROOT, "artifacts", "outside-codex-project-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  assert.throws(() => configureCodexProject(f.repository, outside),
    { code: "tokengame_codex_project_invalid" });
  assert.equal(fs.existsSync(path.join(outside, ".codex")), false);
});

test("Codex 配置 CLI 要求显式项目根，输出不含路径并只提示一次重启", (t) => {
  const f = nestedProjectFixture(t);
  const stdout = capture();
  const stderr = capture();
  assert.equal(codexSetupCli.run([f.host], {
    cwd: f.repository, stdout: stdout.stream, stderr: stderr.stream,
  }), 0);
  assert.match(stdout.value(), /重启一次/);
  assert.equal(stderr.value(), "");
  assert.equal(stdout.value().includes(f.host), false);
  assert.equal(stdout.value().includes(f.repository), false);

  const repeated = capture();
  assert.equal(codexSetupCli.run([f.host], {
    cwd: f.repository, stdout: repeated.stream, stderr: stderr.stream,
  }), 0);
  assert.match(repeated.value(), /无需改动或重启/);
  assert.equal(codexSetupCli.run([], {
    cwd: f.repository, stdout: stdout.stream, stderr: stderr.stream,
  }), 2);
});

test("激活首次与换发都只发布完整文件；发布失败保留旧连接且清掉本次临时文件", (t) => {
  const f = projectFixture(t);
  f.write("http://127.0.0.1:7802", TOKEN_A);
  const first = activateProjectConnection(f.root, f.source);
  const target = projectConnectionFile(f.root);
  assert.deepEqual(first, { status: "activated", replaced: false, source_retained: true });
  assert.equal(fs.existsSync(f.source), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(target, "utf8")), {
    schema: "tokengame.model-connection.v1",
    table_origin: "http://127.0.0.1:7802",
    model_token: TOKEN_A,
  });

  f.write("http://localhost:7802", TOKEN_B);
  assert.throws(
    () => activateProjectConnection(f.root, f.source, { rename() { throw new Error("synthetic rename failure"); } }),
    { code: "model_connection_activate_failed" },
  );
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).model_token, TOKEN_A);
  assert.deepEqual(
    fs.readdirSync(path.dirname(target)).filter((name) => name.endsWith(".tmp")),
    [],
  );

  const second = activateProjectConnection(f.root, f.source);
  assert.deepEqual(second, { status: "activated", replaced: true, source_retained: true });
  assert.equal(JSON.parse(fs.readFileSync(target, "utf8")).model_token, TOKEN_B);
});

test("激活拒绝相对路径、活动槽位自身、坏 schema、额外凭据、远端地址与超限文件", (t) => {
  const f = projectFixture(t);
  assert.throws(() => activateProjectConnection(f.root, "relative.json"),
    { code: "model_connection_source_required" });
  assert.throws(() => activateProjectConnection(f.root, projectConnectionFile(f.root)),
    { code: "model_connection_source_is_active" });
  const invalid = [
    { schema: "other.v1" },
    { recovery_credential: "must-not-import" },
    { table_origin: "https://example.invalid" },
    { model_token: "short" },
  ];
  for (const extra of invalid) {
    f.write("http://127.0.0.1:7802", TOKEN_A, extra);
    assert.throws(() => activateProjectConnection(f.root, f.source),
      { code: "model_connection_invalid" });
  }
  fs.writeFileSync(f.source, "x".repeat(16 * 1024 + 1));
  assert.throws(() => activateProjectConnection(f.root, f.source),
    { code: "model_connection_invalid" });
  assert.equal(fs.existsSync(path.join(f.root, PROJECT_PRIVATE_DIRECTORY)), false,
    "验证失败不能先创建活动目录或半成品");
});

test("clear 幂等且只删除固定活动槽位，不删除下载源或同目录其他文件", (t) => {
  const f = projectFixture(t);
  assert.deepEqual(clearProjectConnection(f.root), { status: "cleared", removed: false });
  f.write("http://127.0.0.1:7802");
  activateProjectConnection(f.root, f.source);
  const other = path.join(f.root, PROJECT_PRIVATE_DIRECTORY, "keep.txt");
  fs.writeFileSync(other, "keep");
  assert.deepEqual(clearProjectConnection(f.root), { status: "cleared", removed: true });
  assert.equal(fs.existsSync(projectConnectionFile(f.root)), false);
  assert.equal(fs.readFileSync(other, "utf8"), "keep");
  assert.equal(fs.existsSync(f.source), true);
  assert.deepEqual(clearProjectConnection(f.root), { status: "cleared", removed: false });
});

test("同一 MCP 模块在缺槽位、激活、换发、清除之间热切换，不需重建进程", async (t) => {
  saveEnvironment(t);
  const f = projectFixture(t);
  const table = await localServer(t);
  const target = projectConnectionFile(f.root);
  process.env.TOKENGAME_MODEL_CONNECTION_FILE = target;

  const missing = await mcp.callTool("tokengame_table", { command: "view.projection" });
  assert.equal(missing.isError, true);
  assert.equal(JSON.parse(missing.content[0].text).code, "model_connection_unavailable");
  assert.equal(table.requests.length, 0);

  f.write(table.origin, TOKEN_A);
  activateProjectConnection(f.root, f.source);
  assert.equal((await mcp.callTool("tokengame_table", { command: "view.projection" })).isError, false);
  assert.equal(table.requests.at(-1).headers["x-tokengame-model-token"], TOKEN_A);

  f.write(table.origin, TOKEN_B);
  activateProjectConnection(f.root, f.source);
  assert.equal((await mcp.callTool("tokengame_table", { command: "view.projection" })).isError, false);
  assert.equal(table.requests.at(-1).headers["x-tokengame-model-token"], TOKEN_B);

  clearProjectConnection(f.root);
  const cleared = await mcp.callTool("tokengame_table", { command: "view.projection" });
  assert.equal(cleared.isError, true);
  assert.equal(JSON.parse(cleared.content[0].text).code, "model_connection_unavailable");
  assert.equal(table.requests.length, 2);
});

test("真人 CLI 输出不含连接文件路径、令牌或内容，且不会自动删除下载源", (t) => {
  const f = projectFixture(t);
  f.write("http://127.0.0.1:7802", TOKEN_A);
  const stdout = capture();
  const stderr = capture();
  assert.equal(connectionCli.run(["activate", f.source], {
    cwd: f.root, stdout: stdout.stream, stderr: stderr.stream,
  }), 0);
  assert.match(stdout.value(), /无需重启/);
  for (const secret of [f.source, projectConnectionFile(f.root), TOKEN_A]) {
    assert.equal(`${stdout.value()}${stderr.value()}`.includes(secret), false);
  }
  assert.equal(fs.existsSync(f.source), true);
  assert.equal(connectionCli.run(["clear"], {
    cwd: f.root, stdout: stdout.stream, stderr: stderr.stream,
  }), 0);

  fs.writeFileSync(f.source, "broken-secret-content");
  assert.equal(connectionCli.run(["activate", f.source], {
    cwd: f.root, stdout: stdout.stream, stderr: stderr.stream,
  }), 1);
  assert.match(stderr.value(), /model_connection_invalid/);
  assert.equal(stderr.value().includes("broken-secret-content"), false);
  assert.equal(stderr.value().includes(f.source), false);
});

test("仓库模板只登记稳定 launcher 与模型牌桌工具，点号 cwd 不冒充生成的运行配置", () => {
  const config = fs.readFileSync(path.join(ROOT, ".codex", "config.toml"), "utf8");
  assert.match(config, /\[mcp_servers\.tokengame_project\]/);
  assert.match(config, /args = \["src\/run-project-mcp\.cjs"\]/);
  assert.match(config, /enabled_tools = \["tokengame_table"\]/);
  assert.match(config, /^cwd = "\."$/m, "跟踪文件只是仓库内可移植模板，不是上层项目的生成配置");
  assert.doesNotMatch(config, /TOKENGAME_MODEL_(?:TOKEN|CONNECTION_FILE)/);
  assert.doesNotMatch(config, /[A-Za-z]:[\\/]|\/home\/|\/Users\//);
  const ignored = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
  assert.match(ignored, /^\.tokengame-private\/$/m);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(manifest.scripts["connection:activate"], "node src/run-model-connection.cjs activate");
  assert.equal(manifest.scripts["connection:clear"], "node src/run-model-connection.cjs clear");
  assert.equal(manifest.scripts["codex:configure"], "node plugins/tokengame/codex/configure-project.cjs");
});

test("用户文档警告生成配置含本机目录且不可分享或提交，仓库模板单独说明", () => {
  const documents = [
    "README.md",
    path.join("plugins", "tokengame", "README.md"),
    path.join("plugins", "tokengame", "skills", "tokengame", "SKILL.md"),
    path.join("docs", "MANAGED-WAKE-SESSION.md"),
  ];
  for (const document of documents) {
    const text = fs.readFileSync(path.join(ROOT, document), "utf8");
    assert.match(text, /真人生成在上层Codex项目中的`\.codex\/config\.toml`会包含\s*本机目录布局/,
      `${document} 必须说明生成配置的机器路径暴露边界`);
    assert.match(text, /不要分享或\s*提交Git/,
      `${document} 必须警告不要分享或提交生成配置`);
    assert.match(text, /仓库随源码跟踪的可移植模板不在此列/,
      `${document} 必须把跟踪模板与真人生成配置分开`);
  }
});
