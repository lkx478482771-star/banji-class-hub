#!/usr/bin/env node
/**
 * 图标一致性守卫：源码里出现的每个 data-lucide / icon("...") 图标名，
 * 都必须已经打包进 assets/icons.js。
 *
 * 用法：node scripts/check-icons.mjs
 * 失败时按提示运行 node scripts/build-icons.mjs 重新生成。
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ICON_FILE = path.join(ROOT, "assets", "icons.js");
const SOURCES = ["index.html", "app.js", "ahu-import.js"];
const NAME_PATTERNS = [
  /data-lucide="([a-z0-9-]+)"/g,
  /\bicon\(\s*"([a-z0-9-]+)"\s*\)/g,
  /\bicon\(\s*'([a-z0-9-]+)'\s*\)/g,
  /iconName\s*=\s*"([a-z0-9-]+)"/g,
];

if (!existsSync(ICON_FILE)) {
  console.error("找不到 assets/icons.js，请先运行 node scripts/build-icons.mjs");
  process.exit(1);
}

const shipped = new Set(
  [...readFileSync(ICON_FILE, "utf8").matchAll(/^  "([a-z0-9-]+)":/gm)].map((match) => match[1])
);

const used = new Map();
for (const file of SOURCES) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, "utf8");
  for (const pattern of NAME_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1];
      const line = text.slice(0, match.index).split("\n").length;
      if (!used.has(name)) used.set(name, `${file}:${line}`);
    }
  }
  // 动态写法（例如 icon(cond ? "eye-off" : "eye")）上面的模式扫不出来，
  // 这里用"字符串字面量正好命中已打包的图标名"兜底，免得把它们误报成"没用到"。
  // 真正的兜底是 assets/icons.js 里的运行时告警，以及冒烟测试中
  // "DOM 里不允许残留 <i data-lucide>" 的断言。
  for (const match of text.matchAll(/["']([a-z0-9]+(?:-[a-z0-9]+)*)["']/g)) {
    const name = match[1];
    if (shipped.has(name) && !used.has(name)) {
      const line = text.slice(0, match.index).split("\n").length;
      used.set(name, `${file}:${line}`);
    }
  }
}

const missing = [...used].filter(([name]) => !shipped.has(name));
const unused = [...shipped].filter((name) => !used.has(name));

console.log(`源码用到 ${used.size} 个图标，assets/icons.js 打包了 ${shipped.size} 个。`);

if (missing.length) {
  console.error("\n以下图标还没有打包，页面上会显示不出来：");
  for (const [name, where] of missing) console.error(` - ${name}（首次出现在 ${where}）`);
  console.error("\n修复：node scripts/build-icons.mjs");
  process.exit(1);
}

if (unused.length) {
  console.warn(`\n以下图标已打包但源码里没用到（可清理）：${unused.join(", ")}`);
}

console.log("图标检查通过。");
