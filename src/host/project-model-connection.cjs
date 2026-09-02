"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { readModelConnectionFile } = require("../shared/model-connection-file.cjs");

const PROJECT_PRIVATE_DIRECTORY = ".tokengame-private";
const PROJECT_CONNECTION_FILENAME = "active-model-connection.json";
const PROJECT_MCP_ENTRY = path.join("plugins", "tokengame", "mcp", "server.cjs");

function projectError(code) {
  return Object.assign(new Error(code), { code, projectConnectionError: true });
}

function regularFile(file) {
  let stat;
  try { stat = fs.lstatSync(file); } catch { throw projectError("tokengame_project_invalid"); }
  if (!stat.isFile() || stat.isSymbolicLink()) throw projectError("tokengame_project_invalid");
  return stat;
}

function projectRoot(value) {
  if (typeof value !== "string" || value === "" || !path.isAbsolute(value)) {
    throw projectError("tokengame_project_invalid");
  }
  let root;
  try { root = fs.realpathSync(value); } catch { throw projectError("tokengame_project_invalid"); }
  const packageFile = path.join(root, "package.json");
  regularFile(packageFile);
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(packageFile, "utf8")); } catch {
    throw projectError("tokengame_project_invalid");
  }
  if (manifest?.name !== "tokengame") throw projectError("tokengame_project_invalid");
  regularFile(path.join(root, PROJECT_MCP_ENTRY));
  return root;
}

function projectConnectionFile(rootValue) {
  return path.join(projectRoot(rootValue), PROJECT_PRIVATE_DIRECTORY, PROJECT_CONNECTION_FILENAME);
}

function samePath(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(left) === normalize(right);
}

function privateDirectory(root) {
  const directory = path.join(root, PROJECT_PRIVATE_DIRECTORY);
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) {
    if (error?.code !== "EEXIST") throw projectError("model_connection_activate_failed");
  }
  let stat;
  try { stat = fs.lstatSync(directory); } catch { throw projectError("model_connection_activate_failed"); }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw projectError("model_connection_activate_failed");
  }
  try { fs.chmodSync(directory, 0o700); } catch {
    throw projectError("model_connection_activate_failed");
  }
  return directory;
}

function activateProjectConnection(rootValue, sourceValue, options = {}) {
  const root = projectRoot(rootValue);
  if (typeof sourceValue !== "string" || sourceValue === "" || !path.isAbsolute(sourceValue)) {
    throw projectError("model_connection_source_required");
  }
  const target = path.join(root, PROJECT_PRIVATE_DIRECTORY, PROJECT_CONNECTION_FILENAME);
  if (samePath(sourceValue, target)) throw projectError("model_connection_source_is_active");

  // 读取 helper 同时拒绝符号链接、目录、超限、额外字段、远端 origin 和坏令牌。
  const connection = readModelConnectionFile(sourceValue);
  const directory = privateDirectory(root);
  let replaced = false;
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw projectError("model_connection_activate_failed");
    }
    replaced = true;
  }

  const temporary = path.join(directory, `.${PROJECT_CONNECTION_FILENAME}.${process.pid}.${randomUUID()}.tmp`);
  let descriptor = null;
  let published = false;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, connection.serialized, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    const rename = options.rename ?? fs.renameSync;
    if (typeof rename !== "function") throw projectError("model_connection_activate_failed");
    rename(temporary, target);
    published = true;
  } catch (error) {
    throw projectError("model_connection_activate_failed");
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch { /* 本次失败路径只做尽力清理。 */ }
    }
    if (!published) {
      try { fs.unlinkSync(temporary); } catch (error) {
        if (error?.code !== "ENOENT") { /* 不覆盖原始失败，也不扫描其他文件。 */ }
      }
    }
  }
  return { status: "activated", replaced, source_retained: true };
}

function clearProjectConnection(rootValue) {
  const root = projectRoot(rootValue);
  const directory = path.join(root, PROJECT_PRIVATE_DIRECTORY);
  if (!fs.existsSync(directory)) return { status: "cleared", removed: false };
  const directoryStat = fs.lstatSync(directory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw projectError("model_connection_clear_failed");
  }
  const target = path.join(directory, PROJECT_CONNECTION_FILENAME);
  if (!fs.existsSync(target)) return { status: "cleared", removed: false };
  const stat = fs.lstatSync(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw projectError("model_connection_clear_failed");
  try { fs.unlinkSync(target); } catch { throw projectError("model_connection_clear_failed"); }
  return { status: "cleared", removed: true };
}

function configureProjectMcp(rootValue, environment = process.env) {
  if (environment === null || typeof environment !== "object") {
    throw projectError("tokengame_project_invalid");
  }
  const root = projectRoot(rootValue);
  environment.TOKENGAME_MODEL_CONNECTION_FILE = path.join(
    root,
    PROJECT_PRIVATE_DIRECTORY,
    PROJECT_CONNECTION_FILENAME,
  );
  return { root, server: path.join(root, PROJECT_MCP_ENTRY) };
}

module.exports = {
  PROJECT_CONNECTION_FILENAME,
  PROJECT_MCP_ENTRY,
  PROJECT_PRIVATE_DIRECTORY,
  activateProjectConnection,
  clearProjectConnection,
  configureProjectMcp,
  projectConnectionFile,
  projectError,
  projectRoot,
};
