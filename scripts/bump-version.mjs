#!/usr/bin/env node
/**
 * 统一刷新 index.html 里的资源版本号（?v=YYYYMMDD）。
 *
 * 以前发一次新版要手动改 4 处（styles.css / config.js / icons.js / app.js），
 * 漏改一处就会出现「样式是新的、脚本是旧的」这种最难查的缓存问题。
 * 这个脚本把 4 处当成一个版本号一起改。
 *
 * 用法：
 *   node scripts/bump-version.mjs           # 刷成今天；同一天再跑自动加 b/c/d 后缀
 *   node scripts/bump-version.mjs --check   # 只检查是否已是今天，过期就退出码 1（给 CI 用）
 *   node scripts/bump-version.mjs --print   # 只打印当前版本号
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(here, "..", "index.html");
const flags = new Set(process.argv.slice(2));
const VERSION_PATTERN = /\?v=(\d{8})([a-z]?)/g;

function todayStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function nextVersion(current, today) {
  // 版本号只当天数用：如果仓库里的日期比今天还新（提前发布或时钟偏差），
  // 就沿用那个更大的日期，别把版本号改小 —— 改小等于让浏览器继续用旧缓存。
  const currentDay = current.slice(0, 8);
  const base = currentDay > today ? currentDay : today;
  if (!current.startsWith(base)) return base;
  const suffix = current.slice(8);
  if (!suffix) return `${base}b`;
  if (suffix >= "z") throw new Error("这一天的版本号后缀 b–z 用完了，明天再发吧。");
  return base + String.fromCharCode(suffix.charCodeAt(0) + 1);
}

const html = readFileSync(indexPath, "utf8");
const found = [...html.matchAll(VERSION_PATTERN)].map((match) => match[1] + match[2]);

if (!found.length) {
  console.error("index.html 里找不到 ?v=YYYYMMDD，检查一下资源引用是不是被改坏了。");
  process.exit(1);
}

const unique = [...new Set(found)].sort();
const current = unique[unique.length - 1];
const today = todayStamp();

if (flags.has("--print")) {
  console.log(current);
  process.exit(0);
}

if (flags.has("--check")) {
  if (current.slice(0, 8) >= today) {
    console.log(`版本号可用：${current}（${found.length} 处）`);
    process.exit(0);
  }
  console.error(
    `版本号过期：${current}，今天是 ${today}。\n` +
      "发布前先跑：node scripts/bump-version.mjs"
  );
  process.exit(1);
}

if (unique.length > 1) {
  console.warn(`发现版本号不一致（${unique.join(" / ")}），这次会全部统一。`);
}

const target = nextVersion(current, today);
if (target === current && unique.length === 1) {
  console.log(`版本号没变：${current}`);
  process.exit(0);
}

writeFileSync(indexPath, html.replace(VERSION_PATTERN, `?v=${target}`), "utf8");
console.log(`版本号：${unique.join(" / ")} → ${target}（改了 ${found.length} 处）`);
