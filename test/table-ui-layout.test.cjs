"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "web/table/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "web/table/table.css"), "utf8");
const js = fs.readFileSync(path.join(root, "web/table/table.js"), "utf8");

test("配置与游戏是同一 TokenGame 客户端的两个独立工作面", () => {
  assert.match(html, /id="entry-view"[^>]*data-surface="setup"/);
  assert.match(html, /id="table-main"[^>]*data-surface="game"/);
  assert.match(html, /class="brand" aria-label="TokenGame"/);
  assert.match(html, /class="game-workspace"/);
  assert.match(html, /class="table-stage"/);
  assert.match(html, /class="table-felt"/);
  assert.match(html, /class="side-panel" aria-label="公开时间线"/);
  assert.match(html, /id="nav-game"[^>]*aria-controls="table-main"/);
  assert.match(html, /id="nav-settings"[^>]*aria-controls="entry-view config-main"/);
  assert.match(html, /id="config-main"[^>]*data-surface="settings"/);
  assert.doesNotMatch(html, /Codex Poker Table|CODEX TABLE PROTOCOL/,
    "产品页不应伪装成 Codex 官方客户端");
});

test("长篇 AI 与通知诊断在独立配置工作面，保留唯一 DOM 控件", () => {
  const settingsAt = html.indexOf('id="model-connection-panel"');
  const configAt = html.indexOf('id="config-main"');
  const tableAt = html.indexOf('id="table-main"');
  const tableEnd = html.indexOf("</main>", tableAt);
  assert.ok(configAt > tableEnd && settingsAt > configAt,
    "本人设置不能继续占用主牌桌");
  const detailsTag = html.slice(html.lastIndexOf("<details", settingsAt), html.indexOf(">", settingsAt) + 1);
  assert.doesNotMatch(detailsTag, /\bopen\b/, "本人设置必须默认折叠");
  assert.ok(html.indexOf('id="actions"') < tableEnd, "真人动作区必须留在牌桌主区");
  for (const id of ["model-bind-form", "modelWakeForm", "model-consent", "modelWakeConsent"]) {
    assert.equal(html.split(`id="${id}"`).length - 1, 1, "不能克隆连接表单或授权框");
  }
});

test("席位由当前查看者和实际 1–4 席生成视觉位置，单挑不是固定身份布局", () => {
  assert.match(js, /1:\s*\["bottom"\]/);
  assert.match(js, /2:\s*\["bottom",\s*"top"\]/);
  assert.match(js, /3:\s*\["bottom",\s*"left",\s*"right"\]/);
  assert.match(js, /4:\s*\["bottom",\s*"left",\s*"top",\s*"right"\]/);
  assert.match(js, /findIndex\(\(seat\) => seat\.is_viewer\)/);
  assert.match(js, /li\.dataset\.position = position/);
  assert.doesNotMatch(css, /data-seat(?:-id)?=["']?[abcd]["']?/i,
    "CSS 不得按固定 a/b/c/d 身份摆座位");
});

test("浅色椭圆牌桌、窄屏流式座位和底部动作坞都有可执行样式", () => {
  assert.match(css, /color-scheme:\s*light/);
  assert.match(css, /\.table-felt\s*\{[\s\S]*?border-radius:\s*50%/);
  for (const position of ["top", "bottom", "left", "right"]) {
    assert.match(css, new RegExp(`\\.seat\\[data-position="${position}"\\]`));
  }
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.seats\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /@media\s*\(max-width:\s*760px\)[\s\S]*?\.actions\s*\{[\s\S]*?position:\s*relative/);
  assert.match(css, /\.seat-bubble\[data-speaker="SEAT_AI"\]/);
  assert.match(css, /\.bubble\[data-speaker="SEAT_AI"\]/);
});

test("机器视图说明当前工作面、席数与设置开合且不恢复旧牌桌接口", () => {
  assert.match(js, /surface:\s*state\.sessionToken === null \? "setup" : state\.workspace/);
  assert.match(js, /seat_count:\s*state\.view\?\.seats\?\.length \?\? 0/);
  assert.match(js, /settings_open:\s*state\.sessionToken !== null && state\.workspace === "settings"/);
  assert.match(js, /scope_confirmation_open:\s*el\("scope-gate"\)\.hidden === false/);
  assert.doesNotMatch(js, /\/api\/table\//, "不能恢复旧固定席位 API");
  assert.doesNotMatch(js, /URLSearchParams|location\.search/, "不能恢复 URL 凭据入口");
});
