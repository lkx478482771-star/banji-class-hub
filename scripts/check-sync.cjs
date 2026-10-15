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
// 先配对参数表的圆括号——默认值里可能出现 {}（如 options = {}），
// 直接找第一个 { 会在那里提前收尾。
function sliceFrom(startIndex) {
  const parenOpen = src.indexOf("(", startIndex);
  if (parenOpen < 0) throw new Error("no param list");
  let parens = 0;
  let bodyAt = -1;
  for (let i = parenOpen; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(") parens += 1;
    else if (ch === ")") {
      parens -= 1;
      if (parens === 0) {
        bodyAt = src.indexOf("{", i);
        break;
      }
    }
  }
  if (bodyAt < 0) throw new Error("no body brace");
  let depth = 0;
  for (let i = bodyAt; i < src.length; i += 1) {
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

// 分片表来自仓库里真正的 config.js：在测试里另抄一份映射，
// 等于放过「改了配置没改代码」这类回归。
const configWindow = {};
new Function("window", fs.readFileSync(path.join(__dirname, "..", "config.js"), "utf8"))(
  configWindow
);
const CONFIG_JSON = JSON.stringify(configWindow.BANJI_CONFIG);

const harness = `
const MANTLE_MAX_CONCURRENCY = 6;
const MANTLE_ENTRY_LIMIT = 100;
const RATE_LIMIT_PAUSE_MS = 600000;
const SYNC_ACTIVE_MS = 60000;
const SYNC_IDLE_MS = 300000;
const SYNC_IDLE_AFTER_MS = 180000;
const mantleEntryCache = new Map();
const mantleNamespaceLoad = new Map();
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
${pick("function mantleNamespaceMap(")}
${pick("function mantleNamespaceForPath(")}
${pick("function mantleKnownNamespaces(")}
${pick("function noteMantleNamespaceLoad(")}
${pick("function jitterMs(")}
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
let lastListNamespace = "";
const sharedConfig = Object.assign({}, ${CONFIG_JSON}, { mantleApiBase: "https://db" });
const BASE = sharedConfig.mantleApiBase;
const pathOfUrl = (url) => {
  const rest = String(url).slice(BASE.length + 1);
  return rest.slice(rest.indexOf("/") + 1);
};
const MANTLE_CACHE_TTL_MS = 5000;
const mantleValueCache = new Map();
const mantleInFlight = new Map();
let mantleCacheEpoch = 0;
function fetchMantle(url) { return Promise.resolve({ ok: true, url }); }
${pick("function sharedApiBase(")}
${pick("function mantleEntryUrl(")}
${pick("function mantlePathFromUrl(")}
${pick("async function mantleRequest(").replace("async function mantleRequest(", "async function realMantleRequest(")}
function mantleListUrl(namespace) {
  return BASE + "/list/" + encodeURIComponent(namespace || sharedConfig.mantleNamespace);
}
async function mantleRequest(url) {
  if (url.indexOf("/list/") === BASE.length) {
    listCount += 1;
    lastListNamespace = url.slice(BASE.length + "/list/".length);
    return { entries: serverEntries.map((e) => ({ ...e })) };
  }
  getCount += 1;
  const key = pathOfUrl(url);
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

  // I 自适应节奏：活跃 60s / 闲置 5min。排期带 ±15% 抖动（防全班锁步），
  // 所以只断言落在区间内，另配一条单独守「抖动确实在起作用」。
  timers = [];
  syncState.lastActiveAt = Date.now();
  scheduleSyncTick();
  const activeTick = timers[timers.length - 1];
  check("I 活跃 60s(±15%)", activeTick >= 51000 && activeTick <= 69000, String(activeTick));
  timers = [];
  syncState.lastActiveAt = Date.now() - 200000;
  scheduleSyncTick();
  const idleTick = timers[timers.length - 1];
  check("I 闲置 5min(±15%)", idleTick >= 255000 && idleTick <= 345000, String(idleTick));
  const spread = new Set();
  for (let i = 0; i < 25; i += 1) {
    timers = [];
    syncState.lastActiveAt = Date.now();
    scheduleSyncTick();
    spread.add(timers[0]);
  }
  check("I 排期有抖动（否则全班会锁步）", spread.size > 1, "distinct=" + spread.size);

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

  // K 写入只精准失效被写的那一条：一旦退回"写一次清整份缓存"，
  // 下一次同步就会重新拉全部记录，这里是那条底线的守门测试。
  mantleEntryCache.clear();
  mantleEntryCache.set("records/a", { stamp: 1, value: rec("a") });
  mantleEntryCache.set("records/b", { stamp: 2, value: rec("b") });
  mantleEntryCache.set("accounts/zzz", { stamp: 3, value: {} });
  check("K 反推写入 path", mantlePathFromUrl(mantleEntryUrl("records/b")) === "records/b");
  check("K 列表 URL 反推为空", mantlePathFromUrl(mantleListUrl()) === "");
  await realMantleRequest(mantleEntryUrl("records/b"), { method: "POST", body: "{}" });
  check("K 被写条目已失效", mantleEntryCache.has("records/b") === false);
  check(
    "K 无关条目仍复用缓存",
    mantleEntryCache.has("records/a") === true && mantleEntryCache.has("accounts/zzz") === true
  );

  // L 端到端：写入之后紧接着的那一轮同步，只重取被写的那一条。
  // 旧实现（写一次就 mantleEntryCache.clear()）这里会变成 3 次 GET。
  serverEntries = [
    { path: "records/a", updated_at: 10 },
    { path: "records/b", updated_at: 20 },
    { path: "records/c", updated_at: 30 }
  ];
  entryValues.set("records/a", rec("a"));
  entryValues.set("records/b", rec("b"));
  entryValues.set("records/c", rec("c"));
  mantleEntryCache.clear();
  getCount = 0;
  await readIncrementalEntries("records/");
  check("L 首次全取 3 条", getCount === 3, "get=" + getCount);
  entryValues.set("records/b", rec("b3"));
  serverEntries = serverEntries.map((e) => (e.path === "records/b" ? { ...e, updated_at: 21 } : e));
  await realMantleRequest(mantleEntryUrl("records/b"), { method: "POST", body: "{}" });
  getCount = 0;
  const afterWrite = await readIncrementalEntries("records/");
  check("L 写入后只重取 1 条", getCount === 1, "get=" + getCount);
  check("L 写后读到的是新内容", afterWrite.find((v) => v.record_key === "b3") !== undefined);

  // M 存储分片：每条写路径都必须落在配置好的命名空间里。
  // 免费档每片只有 100 条，全班 40 人挤一片时「账号 + 课表」就 80 条，
  // 第 101 条会被 403 打回、新同学注册直接卡死，所以这里守住分片表与写路径不许漂移。
  const nsOf = (p) => mantleNamespaceForPath(p);
  const main = sharedConfig.mantleNamespace;
  check("M accounts 在主片", nsOf("accounts/abc") === main);
  check("M classes 在主片", nsOf("classes/x") === main);
  check("M meta 在主片", nsOf("meta/x") === main);
  check("M schedules 在个人片", nsOf("schedules/u1") !== main);
  check("M usage 在额度片", nsOf("usage/u1") !== main && nsOf("usage/u1") !== nsOf("schedules/u1"));
  check("M records 与 history 同片", nsOf("records/r1") === nsOf("history/h1") && nsOf("records/r1") !== main);
  check("M photos 独立成片", nsOf("photos/p1") !== main && nsOf("photos/p1") !== nsOf("records/r1"));
  check("M 未知前缀回落主片", nsOf("whatever/x") === main);
  check(
    "M 五个片互不重叠",
    new Set([main, nsOf("schedules/u1"), nsOf("usage/u1"), nsOf("records/r1"), nsOf("photos/p1")]).size === 5
  );
  // 增量同步必须去「这个前缀所在的片」列清单，查错片等于白拿一份别人的列表。
  mantleEntryCache.clear();
  getCount = 0;
  listCount = 0;
  serverEntries = [{ path: "records/a", updated_at: 1 }];
  entryValues.set("records/a", rec("a"));
  await readIncrementalEntries("records/");
  check("M records 列的是 live 片", lastListNamespace === nsOf("records/"), lastListNamespace);
  await readIncrementalEntries("accounts/");
  check("M accounts 列的是主片", lastListNamespace === main, lastListNamespace);

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
