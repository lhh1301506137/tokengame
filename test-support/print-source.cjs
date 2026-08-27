"use strict";
// 通用单股源码打印器。用法：node test-support/print-source.cjs <相对路径> [起始行] [结束行]
// 存在理由同 print-due-work.cjs：本会话读文件通道返回过 garbled 内容，程序 stdout 可信。
const fs = require("fs");
const path = require("path");

const rel = process.argv[2];
if (!rel) throw new Error("需要相对路径");
const target = path.join(__dirname, "..", rel);
const src = fs.readFileSync(target, "utf8");
const lines = src.split("\n");
const from = process.argv[3] ? Number(process.argv[3]) : 1;
const to = process.argv[4] ? Number(process.argv[4]) : lines.length;

const out = [`FILE ${rel} LINES ${lines.length} BYTES ${Buffer.byteLength(src)} SHOWING ${from}-${to}`];
for (let i = from - 1; i < Math.min(to, lines.length); i += 1) {
  out.push(`${String(i + 1).padStart(4, " ")}| ${lines[i]}`);
}
process.stdout.write(out.join("\n") + "\n");
