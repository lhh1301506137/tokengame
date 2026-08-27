"use strict";
// 单股 grep 替代品：打印一个标识符在 src/ 与 test/ 里出现的文件与行号。
const fs = require("fs");
const path = require("path");

const needle = process.argv[2];
if (!needle) throw new Error("需要要查的标识符");
const root = path.join(__dirname, "..");
const dirs = ["src", "test", "plugins", "test-support"];
const out = [`NEEDLE ${needle}`];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      walk(full);
      continue;
    }
    if (!/\.(cjs|js|mjs|json|md)$/.test(entry.name)) continue;
    const lines = fs.readFileSync(full, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (line.includes(needle)) {
        out.push(`${path.relative(root, full)}:${i + 1}| ${line.trim().slice(0, 150)}`);
      }
    });
  }
}

for (const dir of dirs) walk(path.join(root, dir));
out.push(`MATCHES ${out.length - 2}`);
process.stdout.write(out.join("\n") + "\n");
