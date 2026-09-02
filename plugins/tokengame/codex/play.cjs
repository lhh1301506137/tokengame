#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { UUID } = require("../../../src/host/codex-queue-transport.cjs");
const { connectionOrigin } = require("../../../src/shared/model-connection-file.cjs");
const { main: betaMain } = require("../../../src/run-beta.cjs");
const { configureCodexProject, resolveCodexProject } = require("./project-config.cjs");

function playError(code) {
  return Object.assign(new Error(code), { code });
}

function canonicalRegularFile(value, dependencies, code = "tokengame_codex_executable_invalid") {
  const fsApi = dependencies.fs ?? fs;
  const pathApi = dependencies.path ?? path;
  const platform = dependencies.platform ?? process.platform;
  if (typeof value !== "string" || value === "" || /[\0\r\n]/.test(value) || !pathApi.isAbsolute(value)
    || (platform === "win32" && (!/^[a-z]:[\\/]/i.test(value) || /^[\\/]{2}/.test(value)))) {
    throw playError(code);
  }
  let initial;
  try { initial = fsApi.lstatSync(value); } catch { throw playError(code); }
  if (!initial.isFile() || initial.isSymbolicLink()) throw playError(code);
  let canonical;
  try { canonical = fsApi.realpathSync(value); } catch { throw playError(code); }
  let actual;
  try { actual = fsApi.lstatSync(canonical); } catch { throw playError(code); }
  if (!actual.isFile() || actual.isSymbolicLink()) throw playError(code);
  return canonical;
}

function trustedWindowsExecutable(canonical, environment, dependencies) {
  const fsApi = dependencies.fs ?? fs;
  const pathApi = dependencies.path ?? path.win32;
  const localAppData = environment.LOCALAPPDATA;
  if (typeof localAppData !== "string" || localAppData === "" || !pathApi.isAbsolute(localAppData)) {
    throw playError("tokengame_codex_executable_untrusted");
  }
  let canonicalLocal;
  let canonicalBin;
  try {
    canonicalLocal = fsApi.realpathSync(localAppData);
    canonicalBin = fsApi.realpathSync(pathApi.join(canonicalLocal, "OpenAI", "Codex", "bin"));
  } catch { throw playError("tokengame_codex_executable_untrusted"); }
  const relative = pathApi.relative(canonicalBin, canonical);
  const parts = relative.split(/[\\/]/);
  if (parts.length !== 2 || !/^[0-9a-f]+$/i.test(parts[0]) || !/^codex\.exe$/i.test(parts[1])) {
    throw playError("tokengame_codex_executable_untrusted");
  }
  return canonical;
}

function resolveCodexExecutable(environment, dependencies = {}) {
  if (environment === null || typeof environment !== "object" || Array.isArray(environment)) {
    throw playError("tokengame_codex_environment_invalid");
  }
  const platform = dependencies.platform ?? process.platform;
  const pathApi = dependencies.path ?? (platform === "win32" ? path.win32 : path.posix);
  const explicit = environment.TOKENGAME_CODEX_EXECUTABLE;
  if (explicit !== undefined && explicit !== "") {
    return canonicalRegularFile(explicit, { ...dependencies, path: pathApi });
  }
  if (platform !== "win32") throw playError("tokengame_codex_executable_required");

  const rawPath = environment.PATH;
  if (typeof rawPath !== "string") throw playError("tokengame_codex_executable_not_found");
  for (const entry of rawPath.split(";")) {
    const candidate = pathApi.resolve(entry === "" ? "." : entry, "codex.exe");
    let stat;
    try { stat = (dependencies.fs ?? fs).lstatSync(candidate); } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error?.code)) continue;
      throw playError("tokengame_codex_executable_untrusted");
    }
    if (!stat.isFile() || stat.isSymbolicLink()) throw playError("tokengame_codex_executable_untrusted");
    const canonical = canonicalRegularFile(candidate, { ...dependencies, path: pathApi },
      "tokengame_codex_executable_untrusted");
    return trustedWindowsExecutable(canonical, environment, { ...dependencies, path: pathApi });
  }
  throw playError("tokengame_codex_executable_not_found");
}

function launchEnvironment(environment, { project, executable, threadId }) {
  let publicOrigin = "";
  if (environment.TOKENGAME_PUBLIC_ORIGIN !== undefined
      && environment.TOKENGAME_PUBLIC_ORIGIN !== "") {
    try {
      publicOrigin = connectionOrigin(environment.TOKENGAME_PUBLIC_ORIGIN);
      if (!publicOrigin.startsWith("https://")) throw playError("tokengame_public_origin_invalid");
    } catch {
      throw playError("tokengame_public_origin_invalid");
    }
  }
  const result = {};
  for (const key of Object.keys(environment)) {
    const upper = key.toUpperCase();
    if (upper.startsWith("TOKENGAME_") || upper === "CODEX_SESSION_ID" || upper === "CODEX_THREAD_ID") continue;
    result[key] = environment[key];
  }
  return {
    ...result,
    TOKENGAME_WEB_HOST: "127.0.0.1",
    TOKENGAME_WEB_PORT: "",
    TOKENGAME_COMMAND_ORIGIN: "",
    TOKENGAME_MODEL_ADAPTER: "",
    TOKENGAME_AI_RECEIPT_FILE: "",
    TOKENGAME_CODEX_WAKE: "1",
    TOKENGAME_CODEX_EXECUTABLE: executable,
    TOKENGAME_CODEX_CWD: project,
    TOKENGAME_CODEX_THREAD: threadId,
    TOKENGAME_PUBLIC_ORIGIN: publicOrigin,
  };
}

function stableCode(error) {
  return typeof error?.code === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(error.code)
    ? error.code : "tokengame_codex_play_failed";
}

async function run(argv = process.argv.slice(2), options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  try {
    if (!Array.isArray(argv) || argv.length !== 1) throw playError("tokengame_codex_project_invalid");
    const resolver = options.resolveProject ?? resolveCodexProject;
    const repositoryValue = options.cwd ?? process.cwd();
    const resolved = resolver(repositoryValue, argv[0]);
    if (resolved === null || typeof resolved !== "object"
      || typeof resolved.repository !== "string" || typeof resolved.project !== "string") {
      throw playError("tokengame_codex_project_invalid");
    }
    const environment = options.env ?? process.env;
    if (environment === null || typeof environment !== "object" || Array.isArray(environment)) {
      throw playError("tokengame_codex_environment_invalid");
    }
    const rawThread = environment.CODEX_THREAD_ID;
    if (typeof rawThread !== "string" || !UUID.test(rawThread)) throw playError("tokengame_codex_thread_invalid");
    const threadId = rawThread.toLowerCase();
    const executable = resolveCodexExecutable(environment, {
      fs: options.fs, path: options.path, platform: options.platform,
    });
    // 复制环境也属于前置验证：敌意 getter 失败时不能先写项目配置。
    const launchEnv = launchEnvironment(environment, { project: resolved.project, executable, threadId });
    const configure = options.configure ?? configureCodexProject;
    const configured = configure(resolved.repository, resolved.project);
    if (configured === null || typeof configured !== "object" || typeof configured.changed !== "boolean") {
      throw playError("tokengame_codex_config_result_invalid");
    }
    if (configured.changed) {
      stdout.write("TokenGame 已配置，请重启目标 Codex 任务后重跑。\n");
      return 0;
    }
    const start = options.betaMain ?? betaMain;
    if (typeof start !== "function") throw playError("tokengame_codex_beta_invalid");
    const started = await start({ env: launchEnv });
    if (started === false) throw playError("tokengame_codex_beta_start_failed");
    return 0;
  } catch (error) {
    stderr.write(`TokenGame Codex 一键启动失败：${stableCode(error)}。\n`);
    return 1;
  }
}

if (require.main === module) {
  run().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
}

module.exports = { resolveCodexExecutable, run };
