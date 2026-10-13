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
  { file: "styles.css", max: 100_000 },
  { file: "app.js", max: 320_000 },
  { file: "config.js", max: 2_000 },
  { file: "ahu-import.js", max: 12_000 },
  { file: "assets/icons.js", max: 50_000 },
  { file: "assets/campus-collaboration.webp", max: 150_000 },
];

/** 首屏必须加载的文件，合计上限（字节）。 */
const FIRST_PAINT_FILES = [
  "index.html",
  "styles.css",
  "assets/icons.js",
  "app.js",
  "config.js",
  "assets/campus-collaboration.webp",
];
// 当前实测约 415 KB（首图从 JPEG 换成 WebP 后省下约 50 KB），原始版本约 876 KB。
// 这个上限留了足够日常改动的余量，但把"整包图标库（+327 KB）""没压缩的大图（+200 KB）"这类回归直接挡在门外。
// 单文件上限是软性维护线，真正的红线是首屏合计：2026-10-13 先因运动会栏目扩容到 250 KB，
// 当天又把 20 条示例名单换成全院报名表里的 27 条真实名单（每人多项），再调到 265 KB；
// 同一天又加了晶圆动效和 canvas 选手海报，调到 285 KB；
// 接着加了「加入 / 更换 / 退出班级（需审核）」与管理员删除账号，调到 296 KB，首屏上限同步调到 490 KB。
// 2026-10-13 又把运动会栏目从「深夜芯片风」改成「校园青春亮色主题」，styles.css 末尾追加了一层
// 亮色覆盖块（+4 KB），styles.css 单文件上限从 76 KB 调到 80 KB；首屏合计仍在上限内。
// 同一天晚间做第二档：styles.css 末尾再加一整段 prefers-color-scheme: dark 覆盖（+5 KB，调到 92 KB），
// app.js 加 .ics 导出、搜索扩充成员与选手、Service Worker 注册（调到 310 KB），首屏上限同步到 520 KB。
// 2026-10-13 深夜做第三档「让班级真的用起来」：运动会加油墙（app.js 的 cheer 线程 + styles.css 的
// .cheer-* 样式，约 +4 KB），app.js 调到 320 KB、styles.css 调到 100 KB、首屏上限调到 545 KB。
const FIRST_PAINT_MAX = 545_000;

/** assets/ 下任何单个文件都不该超过这个大小（除非在 BUDGETS 里单独放宽）。 */
const ASSET_HARD_MAX = 250_000;
const ASSET_EXEMPT = new Set(["assets/campus-collaboration.webp"]);

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
