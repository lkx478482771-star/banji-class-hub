#!/usr/bin/env node
/**
 * check-budget.cjs — 免费档「每个命名空间 100 条」的容量守卫。
 *
 * 背景：MantleDB 免费命名空间有两个硬顶
 *   1) 每个命名空间最多 100 条 entry，第 101 条新路径直接 403 Entry limit reached；
 *   2) 每 24 小时最多 10,000 次请求（请求预算由 check-sync.cjs 守）。
 * 所以「哪些路径落在哪个命名空间」和「每个命名空间会涨到多少条」是本项目的生命线：
 * 一旦有人加了一条 per-day 的路径、或者拿掉了归档上限，线上就会在新同学注册时 403。
 *
 * 这个脚本不跑网络，纯静态推导：从 config.js 读真实的分片表，从 app.js 读真实的
 * 常量与写入路径，断言三件事——
 *   A. 每一条写入路径都能在 mantleNamespaceMap 里找到归属（防止新增无分片路径）；
 *   B. 无底洞增长被堵住（usage 不再带日期、history 有上限且真的被调用）；
 *   C. 按 40 人规模模拟，每个命名空间的条目数都不碰 95 条（留 5 条余量）。
 *
 * 用法：node scripts/check-budget.cjs
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const TARGET_USERS = 40; // 班上 30~40 人，按 40 算
const SAFETY_SLACK = 5; // 每个命名空间留 5 条余量
const RECORDS_CEILING = 60; // 在架事项的建模上限（过期事项会被归档/清理）
const ENTRY_LIMIT = 100; // 免费档每个命名空间的硬顶（实测第 101 条返回 403）

const failures = [];
const fail = (msg) => failures.push(msg);
const ok = (msg) => console.log(`  ok    ${msg}`);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// ---------- 1. 真配置：从 config.js 里读分片表 ----------
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(read("config.js"), sandbox);
const config = sandbox.window.BANJI_CONFIG || {};
const namespaceMap = config.mantleNamespaceMap;

console.log("存储容量预算检查 (check-budget)");
console.log(`  命名空间前缀：${config.mantleNamespace || "(未配置)"}\n`);

if (!namespaceMap || typeof namespaceMap !== "object" || !Object.keys(namespaceMap).length) {
  fail("config.js 里没有 mantleNamespaceMap：所有数据都会挤在同一个命名空间，撑不过 100 条。");
  report();
}

const prefixes = Object.keys(namespaceMap).sort();
const namespaces = new Set(Object.values(namespaceMap));

if (namespaces.size < 2) {
  fail(`mantleNamespaceMap 只指向 ${namespaces.size} 个命名空间，分片没有生效。`);
} else {
  ok(`分片表：${prefixes.length} 条路径前缀 → ${namespaces.size} 个命名空间`);
}

// 最长前缀匹配要求「没有任何前缀是另一个前缀的前缀」，否则路由会随排序变。
const nested = prefixes.find((a) => prefixes.some((b) => b !== a && b.startsWith(a)));
if (nested) {
  fail(`前缀 ${nested} 是另一个前缀的父串，最长前缀匹配会变得不确定。`);
} else {
  ok("前缀之间没有互相包含（最长前缀匹配是确定的）");
}

for (const [prefix, ns] of Object.entries(namespaceMap)) {
  if (typeof ns !== "string" || !ns.trim()) fail(`前缀 ${prefix} 没有指向任何命名空间。`);
}

// ---------- 2. 从 app.js 取真实常量与写入路径 ----------
const app = read("app.js");

function numberConst(name) {
  const m = app.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)\\s*;`));
  return m ? Number(m[1].replace(/_/g, "")) : null;
}

function functionSource(name) {
  const at = app.search(new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`));
  if (at < 0) return "";
  const end = app.indexOf("\n}", at);
  return end < 0 ? app.slice(at, at + 800) : app.slice(at, end + 2);
}

// 写入路径前缀：字面量模板 + 两个「路径工厂」函数 + 照片路径常量
const writePrefixes = new Map();
for (const m of app.matchAll(/mantleEntryUrl\(\s*`([A-Za-z0-9_-]+)\//g)) {
  writePrefixes.set(`${m[1]}/`, "字面路径");
}
for (const fn of ["dailyUsagePath", "scheduleStoragePath"]) {
  for (const m of functionSource(fn).matchAll(/return\s+`([A-Za-z0-9_-]+)\//g)) {
    writePrefixes.set(`${m[1]}/`, `${fn}()`);
  }
}
const photoConst = app.match(/const\s+SPORTS_PHOTO_PATH\s*=\s*"([A-Za-z0-9_-]+)\/"/);
if (photoConst) writePrefixes.set(`${photoConst[1]}/`, "SPORTS_PHOTO_PATH");

if (writePrefixes.size < 5) {
  fail(`只从 app.js 里认出 ${writePrefixes.size} 条写入路径，静态扫描可能失效了，请检查。`);
}

const unmapped = [...writePrefixes.keys()].filter((p) => !(p in namespaceMap));
if (unmapped.length) {
  fail(`这些写入路径没有分片归属：${unmapped.join("、")}（会挤在主命名空间里）。`);
} else {
  ok(`app.js 的 ${writePrefixes.size} 条写入路径全部有分片归属：${[...writePrefixes.keys()].join(" ")}`);
}

// ---------- 3. 无底洞断言 ----------
const usageBody = functionSource("dailyUsagePath");
if (!usageBody) {
  fail("找不到 dailyUsagePath()：每日额度的存储路径无法核对。");
} else if (/localDateKey/.test(usageBody)) {
  fail("dailyUsagePath() 里又出现了日期：每天 1 条、永不清理，40 人一个月就爆 100 条上限。");
} else {
  ok("dailyUsagePath() 每用户只占 1 条（日期存在条目内容里，不再进路径）");
}

const historyMax = numberConst("HISTORY_KEEP_MAX");
if (!historyMax) {
  fail("找不到 HISTORY_KEEP_MAX：归档没有上限。");
} else if (historyMax + RECORDS_CEILING > ENTRY_LIMIT - SAFETY_SLACK) {
  fail(
    `HISTORY_KEEP_MAX=${historyMax} 与在架事项建模上限 ${RECORDS_CEILING} 相加超过安全线，` +
      `history 和 records 共用同一个命名空间。`
  );
} else {
  ok(`归档上限 HISTORY_KEEP_MAX=${historyMax}，与在架事项共用命名空间后仍有 ${ENTRY_LIMIT - SAFETY_SLACK - historyMax - RECORDS_CEILING} 条余量`);
}

const pruneBody = functionSource("pruneSharedHistory");
if (!pruneBody) {
  fail("找不到 pruneSharedHistory()：归档上限只是摆设。");
} else {
  const syncBody = functionSource("syncSharedRecords");
  if (!/pruneSharedHistory\(/.test(syncBody)) {
    fail("pruneSharedHistory() 没有在 syncSharedRecords() 里被调用，上限永远不会生效。");
  } else {
    ok("pruneSharedHistory() 已在 syncSharedRecords() 里调用");
  }
}

// ---------- 4. 100 条硬顶与照片守卫 ----------
const entryLimit = numberConst("MANTLE_ENTRY_LIMIT");
if (entryLimit !== ENTRY_LIMIT) {
  fail(`MANTLE_ENTRY_LIMIT=${entryLimit}，应为 100（免费档实测第 101 条返回 403）。`);
} else {
  ok("MANTLE_ENTRY_LIMIT=100（与实测的第 101 条 403 一致）");
}

const photoBody = functionSource("submitSportsPhoto");
const photoGuard = photoBody.match(/MANTLE_ENTRY_LIMIT\s*-\s*([0-9]+)/);
if (!photoGuard) {
  fail("submitSportsPhoto() 少了容量守卫：照片写满 100 条后同学只会看到 Shared storage request failed: 403。");
} else {
  ok(`submitSportsPhoto() 在还剩 ${photoGuard[1]} 条时就提前拦截`);
}

// ---------- 5. 容量模拟 ----------
const MODEL = {
  "accounts/": { perUser: 1 },
  "schedules/": { perUser: 1 },
  "usage/": { perUser: 1 },
  "classes/": { fixed: 3 },
  "meta/": { fixed: 1 },
  "records/": { fixed: RECORDS_CEILING },
  "history/": { fixed: historyMax || 0 },
  "photos/": { fixed: entryLimit ? entryLimit - Number(photoGuard?.[1] ?? 0) : 0 }
};

function loadFor(users) {
  const load = new Map();
  for (const [prefix, ns] of Object.entries(namespaceMap)) {
    const model = MODEL[prefix];
    if (!model) {
      load.set(ns, (load.get(ns) || 0) + 0);
      continue;
    }
    const n = model.perUser ? model.perUser * users : model.fixed || 0;
    load.set(ns, (load.get(ns) || 0) + n);
  }
  return load;
}

const safeLimit = entryLimit - SAFETY_SLACK;
const load = loadFor(TARGET_USERS);
const rows = [...load.entries()].sort((a, b) => b[1] - a[1]);
const shortName = (ns) => {
  const hit = Object.entries(namespaceMap).filter(([, v]) => v === ns).map(([k]) => k.replace(/\/$/, ""));
  return `${hit.join("+") || "?"} → ${ns}`;
};

console.log(`\n  ${TARGET_USERS} 人时的条目预算（每个命名空间安全线 ${safeLimit} / 硬顶 ${entryLimit}）：`);
for (const [ns, n] of rows) {
  console.log(`    ${String(n).padStart(3)} 条  ${shortName(ns)}`);
  if (n > safeLimit) fail(`${shortName(ns)} 在 ${TARGET_USERS} 人时会到 ${n} 条，超过安全线 ${safeLimit}。`);
}

let maxUsers = 0;
for (let n = 0; n <= 200; n += 1) {
  const l = loadFor(n);
  if ([...l.values()].every((v) => v <= safeLimit)) maxUsers = n;
  else break;
}
console.log(`    按现有布局，最多约 ${maxUsers} 人（最先到顶的是主命名空间：账号 + 班级 + 元数据）。`);
if (maxUsers < TARGET_USERS) fail(`容量只能撑 ${maxUsers} 人，不够 ${TARGET_USERS} 人用。`);

report();

function report() {
  if (failures.length) {
    console.error("\n容量预算检查：失败");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("\n容量预算检查：通过");
}
