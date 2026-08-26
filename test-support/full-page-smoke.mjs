import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:43110";
const outputPath = path.resolve(process.argv[3] || "artifacts/full-page-smoke.png");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 980 } });
const errors = [];
page.on("console", (message) => {
  if (message.type() === "error") errors.push({ type: "console", text: message.text() });
});
page.on("pageerror", (error) => errors.push({ type: "page", text: String(error) }));

await page.goto(url, { waitUntil: "networkidle" });
await page.waitForFunction(() => typeof window.render_game_to_text === "function");
await page.screenshot({ path: outputPath, fullPage: true });
const result = await page.evaluate(() => ({
  title: document.title,
  game: JSON.parse(window.render_game_to_text()),
  canvas: (() => {
    const rect = document.querySelector("canvas").getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  })(),
  buttons: [...document.querySelectorAll("button")].map((button) => ({
    id: button.id,
    disabled: button.disabled,
    text: button.textContent.trim(),
  })),
}));
await browser.close();

process.stdout.write(`${JSON.stringify({ outputPath, errors, result }, null, 2)}\n`);
if (errors.length > 0) process.exitCode = 1;

