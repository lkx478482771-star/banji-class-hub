/*
 * 同步逻辑回归测试：从 app.js 里抠出真实函数体，在 Node 里喂假数据跑一遍。
 * 守的是「免费档 24 小时 10,000 次请求」这条底线——增量同步一旦退化，
 * 每次轮询就会从 1 次请求涨回 1+N 次，全班当天的额度会被一个挂机页面吃光。
 *
 * 覆盖：增量命中/失效/删除/前缀隔离/上限/容错、429 冷却、自适应节奏。
 * 用法：node scripts/check-sync.cjs
 */
const fs = require("fs");
const path = require("path");

const APP = path.join(__dirname, "..", "app.js");
const src = fs.readFileSync(APP, "utf8");

// 从源码里按大括号配对抠出一段函数体，保证测的是真正在跑的那份代码。
function sliceFrom(startIndex) {
  const open = src.indexOf("{", startIndex);
  if (open < 0) throw new Error("no body brace");
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(startIndex, i + 1);
    }
  }
  throw new Error("unbalanced braces");
}

function pick(marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("missing source marker: " + marker);
  return sliceFrom(at);
}

const harness = `
const MANTLE_MAX_CONCURRENCY = 6;
const RATE_LIMIT_PAUSE_MS = 600000;
const SYNC_ACTIVE_MS = 60000;
const SYNC_IDLE_MS = 300000;
const SYNC_IDLE_AFTER_MS = 180000;
const mantleEntryCache = new Map();
const syncState = { inFlight: false, retryTimer: null, available: null,
  accountChecked: false, localImported: false, usageFailed: false,
  tickTimer: null, lastActiveAt: Date.now(), rateLimitedUntil: 0 };
const authState = { session: null };
const ui = { page: "today" };
const document = { visibilityState: "visible" };
let statusLog = [];
function setSyncStatus(status) { statusLog.push(status); }
let synced = 0;
function syncSharedRecords() { synced += 1; }
function loadMemberDirectory() {}
function loadHistory() {}
function loadClassDirectory() {}
let timers = [];
const window = {
  setTimeout(fn, ms) { timers.push(ms); return timers.length; },
  clearTimeout() {}
};
${pick("function pruneMantleEntryCache(")}
${pick("async function readIncrementalEntries(")}
${pick("function isRateLimited(")}
${pick("function noteRateLimit(")}
${pick("function scheduleSharedSync(")}
${pick("function scheduleSyncTick(")}
${pick("function runSyncTick(")}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const runners = [];
  for (let i = 0; i < Math.min(limit, items.length); i += 1) {
    runners.push((async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        out[index] = await fn(items[index]);
      }
    })());
  }
  await Promise.all(runners);
  return out;
}

let serverEntries = [];
let entryValues = new Map();
let listCount = 0;
let getCount = 0;
let failPaths = new Set();
function mantleListUrl() { return "list"; }
function mantleEntryUrl(p) { return "entry:" + p; }
async function mantleRequest(url) {
  if (url === "list") {
    listCount += 1;
    return { entries: serverEntries.map((e) => ({ ...e })) };
  }
  getCount += 1;
  const key = url.slice(6);
  if (failPaths.has(key)) throw new Error("boom");
  const value = entryValues.get(key);
  return value === undefined ? null : value;
}

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra: extra === undefined ? "" : extra });
}
`;

const assertions = `
(async () => {
  const rec = (key) => ({ record_key: key, payload: { title: key } });
  entryValues.set("records/a", rec("a"));
  entryValues.set("records/b", rec("b"));
  entryValues.set("records/c", rec("c"));
  serverEntries = [
    { path: "accounts/zzz", updated_at: 1 },
    { path: "records/a", updated_at: 100 },
    { path: "records/b", updated_at: 200 },
    { path: "records/c", updated_at: 300 }
  ];

  // A 冷启动：一次 list + 三条 GET，前缀外的 accounts/ 不计入
  let values = await readIncrementalEntries("records/");
  check("A 冷启动 1 list + 3 get", listCount === 1 && getCount === 3, listCount + "/" + getCount);
  check("A 结果按列表顺序且完整", values.length === 3 && values[0].record_key === "a" && values.complete === true);

  // B 热轮询：列表照旧，一条 GET 都不该再发（这就是省下 95% 请求的地方）
  values = await readIncrementalEntries("records/");
  check("B 无变化时 0 GET", getCount === 3, "get=" + getCount + " list=" + listCount);

  // C 只有 b 变了：只重取 b
  const before = getCount;
  serverEntries = serverEntries.map((e) => (e.path === "records/b" ? { ...e, updated_at: 999 } : e));
  entryValues.set("records/b", rec("b2"));
  values = await readIncrementalEntries("records/");
  check("C 单条变化只发 1 GET", getCount === before + 1, "delta=" + (getCount - before));
  check("C 新内容已生效", values.find((v) => v.record_key === "b2") !== undefined);

  // D 服务器删掉 a：结果少一条，缓存也要跟着瘦
  serverEntries = serverEntries.filter((e) => e.path !== "records/a");
  values = await readIncrementalEntries("records/");
  check("D 删除后结果 2 条", values.length === 2, "len=" + values.length);
  check("D 缓存已剔除 a", mantleEntryCache.has("records/a") === false);
  check("D 删除本身不发 GET", getCount === before + 1, "get=" + getCount);

  // E 上限：limit=1 时 complete=false 且只取一条
  serverEntries = [
    { path: "records/a", updated_at: 1 },
    { path: "records/b", updated_at: 2 }
  ];
  entryValues.set("records/a", rec("a"));
  entryValues.set("records/b", rec("b"));
  mantleEntryCache.clear();
  getCount = 0;
  values = await readIncrementalEntries("records/", 1);
  check("E limit 生效", values.length === 1 && values.complete === false, "len=" + values.length);
  check("E 只发 1 GET", getCount === 1, "get=" + getCount);

  // F 容错：坏路径不写缓存，下轮还会再试
  failPaths = new Set(["records/a"]);
  mantleEntryCache.clear();
  getCount = 0;
  values = await readIncrementalEntries("records/", 500, true);
  check("F 容错返回 null 占位", values.length === 2 && values[0] === null);
  check("F 坏路径未入缓存", mantleEntryCache.has("records/a") === false);
  failPaths = new Set();
  getCount = 0;
  await readIncrementalEntries("records/", 500, true);
  check("F 下一轮重试坏路径", getCount === 1, "get=" + getCount);

  // G 404：null 不写缓存
  mantleEntryCache.clear();
  entryValues.delete("records/b");
  getCount = 0;
  await readIncrementalEntries("records/");
  await readIncrementalEntries("records/");
  check("G 404 每轮都重试", getCount === 3, "get=" + getCount);
  entryValues.set("records/b", rec("b"));

  // H 429 冷却：暂停 10 分钟，期间不再自动重试
  syncState.rateLimitedUntil = 0;
  check("H 初始未限流", isRateLimited() === false);
  noteRateLimit();
  check("H 命中后进入限流", isRateLimited() === true);
  check("H 状态提示已切换", statusLog[statusLog.length - 1] === "ratelimited");
  const timerBefore = timers.length;
  scheduleSharedSync();
  check("H 限流期间不排重试", timers.length === timerBefore);
  syncState.rateLimitedUntil = 0;
  scheduleSharedSync();
  check("H 解除后恢复重试", timers.length === timerBefore + 1);

  // I 自适应节奏：活跃 60s / 闲置 5min
  timers = [];
  syncState.lastActiveAt = Date.now();
  scheduleSyncTick();
  check("I 活跃 60s", timers[timers.length - 1] === 60000, String(timers[timers.length - 1]));
  timers = [];
  syncState.lastActiveAt = Date.now() - 200000;
  scheduleSyncTick();
  check("I 闲置 5min", timers[timers.length - 1] === 300000, String(timers[timers.length - 1]));

  // J tick 行为：限流期间不刷，正常时刷一次并续排
  authState.session = { username: "x" };
  synced = 0;
  timers = [];
  syncState.rateLimitedUntil = 0;
  runSyncTick();
  check("J 正常 tick 会同步", synced === 1, "synced=" + synced);
  check("J tick 自己续排", timers.length === 1);
  syncState.rateLimitedUntil = Date.now() + 60000;
  syncState.tickTimer = null;
  synced = 0;
  runSyncTick();
  check("J 限流期间 tick 不同步", synced === 0, "synced=" + synced);
  check("J 限流期间仍旧续排", timers.length === 2);

  const failed = results.filter((r) => !r.ok);
  for (const row of results) {
    console.log((row.ok ? "  ok  " : "  FAIL") + "  " + row.name + (row.extra ? "  (" + row.extra + ")" : ""));
  }
  console.log("同步逻辑检查：" + (results.length - failed.length) + "/" + results.length + " 通过");
  process.exit(failed.length === 0 ? 0 : 1);
})();
`;

const code = harness + assertions;
new Function("require", "process", "console", code)(require, process, console);
