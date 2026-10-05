#!/usr/bin/env node
/**
 * 体积预算守卫：防止再次把整包图标库、未压缩大图之类的东西推上线。
 *
 * 用法：node scripts/check-size.mjs
 * 超限时以非零码退出，CI 会直接失败。
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 每个文件的上限（字节）。改这些值时请先想清楚首屏成本。 */
const BUDGETS = [
  { file: "index.html", max: 14_000 },
  { file: "styles.css", max: 70_000 },
  { file: "app.js", max: 240_000 },
  { file: "config.js", max: 2_000 },
  { file: "ahu-import.js", max: 12_000 },
  { file: "assets/icons.js", max: 50_000 },
  { file: "assets/campus-collaboration.jpg", max: 150_000 },
];

/** 首屏必须加载的文件，合计上限（字节）。 */
const FIRST_PAINT_FILES = [
  "index.html",
  "styles.css",
  "assets/icons.js",
  "app.js",
  "config.js",
  "assets/campus-collaboration.jpg",
];
// 当前实测约 411 KB，原始版本约 876 KB。这个上限留了足够日常改动的余量，
// 但把"整包图标库（+327 KB）""没压缩的大图（+200 KB）"这类回归直接挡在门外。
const FIRST_PAINT_MAX = 470_000;

/** assets/ 下任何单个文件都不该超过这个大小（除非在 BUDGETS 里单独放宽）。 */
const ASSET_HARD_MAX = 250_000;
const ASSET_EXEMPT = new Set(["assets/campus-collaboration.jpg"]);

const failures = [];
const sizeOf = (relative) => {
  const full = path.join(ROOT, relative);
  return existsSync(full) ? statSync(full).size : null;
};
const format = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

for (const { file, max } of BUDGETS) {
  const size = sizeOf(file);
  if (size === null) {
    failures.push(`缺少文件 ${file}`);
    continue;
  }
  if (size > max) failures.push(`${file} 是 ${format(size)}，超过上限 ${format(max)}`);
}

for (const file of FIRST_PAINT_FILES) {
  if (sizeOf(file) === null) failures.push(`首屏文件缺失：${file}`);
}
const firstPaint = FIRST_PAINT_FILES.reduce((total, file) => total + (sizeOf(file) || 0), 0);
if (firstPaint > FIRST_PAINT_MAX) {
  failures.push(
    `首屏合计 ${format(firstPaint)}，超过上限 ${format(FIRST_PAINT_MAX)}（明细：${FIRST_PAINT_FILES.join(", ")}）`
  );
}

const assetsDir = path.join(ROOT, "assets");
if (existsSync(assetsDir)) {
  for (const entry of readdirSync(assetsDir)) {
    const relative = `assets/${entry}`;
    if (ASSET_EXEMPT.has(relative)) continue;
    const size = statSync(path.join(assetsDir, entry)).size;
    if (size > ASSET_HARD_MAX) {
      failures.push(`${relative} 是 ${format(size)}，assets 下单个文件上限 ${format(ASSET_HARD_MAX)}`);
    }
  }
}

console.log(`首屏合计：${format(firstPaint)}（上限 ${format(FIRST_PAINT_MAX)}）`);
for (const { file } of BUDGETS) {
  const size = sizeOf(file);
  console.log(`  ${file.padEnd(38)} ${size === null ? "缺失" : format(size)}`);
}

if (failures.length) {
  console.error("\n体积预算未通过：");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log("\n体积预算通过。");
