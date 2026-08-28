"use strict";

// 解析 playwright 的安装位置。
//
// 为什么需要这个文件：既有的 test-support/playwright-loader.mjs 只认
// CODEX_BUNDLED_NODE_MODULES，那是 Codex 环境里的路径。在别的机器上这个变量是空的，
// loader 直接抛错，于是浏览器验收变成「无法执行」。而浏览器验收是本阶段唯一能证明
// 「多个隔离玩家真的在同一桌上」的东西，不能因为一个环境变量的形状而缺席。
//
// 顺序上 Codex 的路径仍然第一优先，所以那边的行为一个字都不变。
//
// 找不到时返回 null 而不是抛错。调用方据此把测试报成 skip 并说明原因——
// 把「本机没装浏览器」报成失败会让人去修一个不存在的缺陷；报成通过则更糟，
// 那是拿「没跑」冒充「跑过了」。

const fs = require("node:fs");
const path = require("node:path");

let cached;

function candidateRoots() {
  const roots = [];
  const push = (value) => {
    if (typeof value === "string" && value !== "") roots.push(value);
  };

  push(process.env.CODEX_BUNDLED_NODE_MODULES);
  push(process.env.TOKENGAME_PLAYWRIGHT_ROOT);
  // 本仓库自己的 node_modules。本项目刻意没有运行时依赖，但装了开发依赖的克隆里会有。
  roots.push(path.resolve(__dirname, "..", "node_modules"));

  // 全局安装目录。这里刻意不去 spawn `npm root -g`：
  // Windows 上 npm 是 npm.cmd，而 Node 自 CVE-2024-27980 修补后拒绝不带 shell 地
  // spawn 批处理文件（EINVAL），带 shell 又会退回不转义拼接。全局 root 的位置本来
  // 就是确定的，直接推导比开一个子进程更准也更快。
  push(process.env.npm_config_prefix && path.join(process.env.npm_config_prefix, "node_modules"));
  if (process.platform === "win32") {
    push(process.env.APPDATA && path.join(process.env.APPDATA, "npm", "node_modules"));
  } else {
    // <prefix>/lib/node_modules，prefix 由 node 自己的位置反推。
    roots.push(path.resolve(path.dirname(process.execPath), "..", "lib", "node_modules"));
  }
  for (const entry of (process.env.NODE_PATH ?? "").split(path.delimiter)) push(entry);

  return roots;
}

// 返回 { entry, root } 或 null。entry 是可以直接 require 的路径。
function resolvePlaywright() {
  if (cached !== undefined) return cached;
  const tried = [];
  for (const root of candidateRoots()) {
    const dir = path.join(root, "playwright");
    tried.push(dir);
    // 认 CJS 入口。本项目的测试是 .cjs，走 require 而不是 import。
    for (const entry of ["index.js", "index.mjs"]) {
      const full = path.join(dir, entry);
      if (fs.existsSync(full)) {
        cached = { entry: full, root, tried };
        return cached;
      }
    }
  }
  cached = null;
  cached = { entry: null, root: null, tried };
  return cached;
}

// 加载并返回 playwright 模块，或 null。
function loadPlaywright() {
  const found = resolvePlaywright();
  if (found.entry === null) return null;
  try {
    return require(found.entry);
  } catch {
    // 装了但加载失败（版本不兼容、文件损坏）与没装是两回事，但对调用方来说
    // 都是「跑不了」。具体原因由 describeMissing 报出去。
    return null;
  }
}

function describeMissing() {
  const found = resolvePlaywright();
  return `未找到可用的 playwright。已尝试：${found.tried.join(" / ")}。`
    + "装法：npm i -g playwright && npx playwright install chromium，"
    + "或设 TOKENGAME_PLAYWRIGHT_ROOT 指向包含 playwright 的 node_modules 目录。";
}

module.exports = { resolvePlaywright, loadPlaywright, describeMissing };
