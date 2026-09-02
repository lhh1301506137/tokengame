"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const {
  projectError,
  projectRoot,
} = require("../../../src/host/project-model-connection.cjs");

const MANAGED_MCP_BEGIN = "# BEGIN TOKENGAME MANAGED PROJECT MCP";
const MANAGED_MCP_END = "# END TOKENGAME MANAGED PROJECT MCP";

function tomlString(value) {
  return JSON.stringify(value.replaceAll("\\", "/"));
}

function insideProject(project, repository) {
  const relative = path.relative(project, repository);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

// 只读解析由配置 CLI 与一键启动器共用。写入必须在调用方完成其余前置校验之后另行触发。
function resolveCodexProject(repositoryValue, projectValue) {
  const repository = projectRoot(repositoryValue);
  if (typeof projectValue !== "string" || projectValue === "" || !path.isAbsolute(projectValue)) {
    throw projectError("tokengame_codex_project_invalid");
  }
  let project;
  try { project = fs.realpathSync(projectValue); } catch { throw projectError("tokengame_codex_project_invalid"); }
  let projectStat;
  try { projectStat = fs.lstatSync(project); } catch { throw projectError("tokengame_codex_project_invalid"); }
  if (!projectStat.isDirectory() || projectStat.isSymbolicLink() || !insideProject(project, repository)) {
    throw projectError("tokengame_codex_project_invalid");
  }
  return { repository, project };
}

function managedMcpBlock(repository, project) {
  if (!insideProject(project, repository)) throw projectError("tokengame_codex_project_invalid");
  // Codex Desktop currently recognizes a project MCP with a relative cwd in its
  // config listing, but does not reliably load the tool from that directory.
  // `repository` is already canonicalized by resolveCodexProject(), so persist
  // the exact machine-local startup directory required by the stdio server.
  const cwd = repository;
  return `${MANAGED_MCP_BEGIN}\n`
    + "[mcp_servers.tokengame_project]\n"
    + "command = \"node\"\n"
    + "args = [\"src/run-project-mcp.cjs\"]\n"
    + `cwd = ${tomlString(cwd)}\n`
    + "enabled = true\n"
    + "required = false\n"
    + "enabled_tools = [\"tokengame_table\"]\n"
    + "startup_timeout_sec = 10\n"
    + "tool_timeout_sec = 60\n"
    + MANAGED_MCP_END;
}

function configureCodexProject(repositoryValue, projectValue, options = {}) {
  const { repository, project } = resolveCodexProject(repositoryValue, projectValue);

  const directory = path.join(project, ".codex");
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) {
    if (error?.code !== "EEXIST") throw projectError("tokengame_codex_config_write_failed");
  }
  let directoryStat;
  try { directoryStat = fs.lstatSync(directory); } catch { throw projectError("tokengame_codex_config_write_failed"); }
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw projectError("tokengame_codex_config_write_failed");
  }

  const target = path.join(directory, "config.toml");
  let previous = "";
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
      throw projectError("tokengame_codex_config_conflict");
    }
    try { previous = fs.readFileSync(target, "utf8"); } catch {
      throw projectError("tokengame_codex_config_conflict");
    }
  }

  const begin = previous.indexOf(MANAGED_MCP_BEGIN);
  const end = previous.indexOf(MANAGED_MCP_END);
  if ((begin === -1) !== (end === -1) || begin !== previous.lastIndexOf(MANAGED_MCP_BEGIN)
    || end !== previous.lastIndexOf(MANAGED_MCP_END) || (begin !== -1 && end < begin)) {
    throw projectError("tokengame_codex_config_conflict");
  }
  if (begin === -1 && /^\[mcp_servers\.tokengame_project\]\s*$/m.test(previous)) {
    throw projectError("tokengame_codex_config_conflict");
  }

  const block = managedMcpBlock(repository, project);
  let next;
  if (begin === -1) {
    const prefix = previous === "" ? "" : `${previous.replace(/\s*$/, "")}\n\n`;
    next = `${prefix}${block}\n`;
  } else {
    const after = end + MANAGED_MCP_END.length;
    next = `${previous.slice(0, begin)}${block}${previous.slice(after)}`;
  }
  if (next === previous) return { status: "configured", changed: false, restart_required: false };

  const temporary = path.join(directory, `.config.toml.tokengame.${process.pid}.${randomUUID()}.tmp`);
  let descriptor = null;
  let published = false;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, next, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    const rename = options.rename ?? fs.renameSync;
    if (typeof rename !== "function") throw projectError("tokengame_codex_config_write_failed");
    rename(temporary, target);
    published = true;
  } catch {
    throw projectError("tokengame_codex_config_write_failed");
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch { /* 保留原失败。 */ }
    }
    if (!published) {
      try { fs.unlinkSync(temporary); } catch (error) {
        if (error?.code !== "ENOENT") { /* 只清本次临时文件。 */ }
      }
    }
  }
  return { status: "configured", changed: true, restart_required: true };
}

module.exports = {
  MANAGED_MCP_BEGIN,
  MANAGED_MCP_END,
  configureCodexProject,
  resolveCodexProject,
};
