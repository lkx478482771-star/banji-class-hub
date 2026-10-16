/*
 * 后端接缝回归测试：确认「换后端只换适配器」这条约定是真的。
 *
 * 为什么需要：app.js 用「规范化 URL」当内部货币（`${base}/${分片}/${path}`），
 * backend-supabase.js 负责把它拆回 (namespace, path)。这两边只要有一边改了形状，
 * 线上表现是「所有数据突然读不到 / 全丢」——最贵、最难查的一类故障，
 * 所以这里把 app.js 里**真正在跑**的 URL 构造函数抠出来，和适配器对着跑。
 *
 * 覆盖：URL 形状往返、两套 provider 的配置判定、适配器的 GET/POST/DELETE/list、
 *       429 与「分区满」的错误语义、建表 SQL 的关键约束。
 * 用法：node scripts/check-backend.cjs
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const appSrc = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const adapterSrc = fs.readFileSync(path.join(ROOT, "backend-supabase.js"), "utf8");
const configSrc = fs.readFileSync(path.join(ROOT, "config.js"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const sql = fs.readFileSync(path.join(ROOT, "supabase", "202610160001_class_hub_entries.sql"), "utf8");
const migrateSrc = fs.readFileSync(path.join(ROOT, "scripts", "migrate-to-supabase.mjs"), "utf8");

const configWindow = {};
new Function("window", configSrc)(configWindow);
const CONFIG_JSON = JSON.stringify(configWindow.BANJI_CONFIG);

const results = [];
function check(name, ok, extra) {
  results.push({ name, ok: Boolean(ok), extra: extra === undefined ? "" : String(extra) });
}

// —— 静态检查：壳文件、配置、SQL 的形状 ——————————————————————————
const scriptTags = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const versioned = scriptTags.filter((src) => /\?v=\d{8}/.test(src));

check("A1 index.html 挂了 backend-supabase.js", scriptTags.some((s) => s.startsWith("backend-supabase.js")), scriptTags.join(" "));
check(
  "A2 适配器在 app.js 之前加载",
  html.indexOf("backend-supabase.js") < html.indexOf('src="app.js'),
  "defer 脚本按文档顺序执行"
);
check("A3 所有脚本都带 ?v= 版本号", versioned.length === scriptTags.length, versioned.length + "/" + scriptTags.length);
// 2026-10-16 起正式切到 supabase：provider 允许两个值，但切过去时两个配置项必须填好。
const providerHit = configSrc.match(/provider:\s*"(mantle|supabase)"/);
check(
  "A4 config.js 的 provider 合法且切到 supabase 时配置齐全",
  Boolean(providerHit) &&
    (providerHit[1] === "mantle" ||
      (/supabaseUrl:\s*"[^"]+"/.test(configSrc) && /supabaseAnonKey:\s*"[^"]+"/.test(configSrc))),
  providerHit && providerHit[1]
);
check("A5 config.js 留了 supabaseUrl / supabaseAnonKey 占位", /supabaseUrl:/.test(configSrc) && /supabaseAnonKey:/.test(configSrc));
// 注释里可以提 service_role（比如「绝不允许进这个文件」），代码里出现才是事故。
function stripComments(text) {
  return String(text).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

check("A6 app.js 里没有 service_role", !/service_role/.test(stripComments(appSrc)));
check("A7 适配器里没有 service_role", !/service_role/.test(stripComments(adapterSrc)));

check("B1 SQL 建了 class_hub_entries 表", /create table if not exists public\.class_hub_entries/.test(sql));
check("B2 SQL 主键是 (namespace, path)", /primary key \(namespace, path\)/.test(sql));
check("B3 SQL 的分区上限报错含 Entry limit reached", /raise exception ''?Entry limit reached/.test(sql));
check("B4 SQL 有写入频率触发器", /create trigger enforce_class_hub_write_rate/.test(sql));
check("B5 SQL 开了 RLS", /enable row level security/.test(sql));
check(
  "B6 SQL 四条策略齐全",
  ["for select", "for insert", "for update", "for delete"].every((clause) => sql.includes(clause)) &&
    (sql.match(/create policy/g) || []).length === 4,
  (sql.match(/create policy/g) || []).length + " 条"
);
check("B7 SQL 用 json_agg 绕开 PostgREST 1000 行截断", /json_agg\(/.test(sql) && /class_hub_list/.test(sql));
check("B8 SQL 单条上限 256 KB（大于 MantleDB 的 64 KB）", /octet_length\(value::text\) <= 262144/.test(sql));
// 2026-10-16：正则量词 {1,48} 在 Postgres ARE 下会报 2201B，所以改成零正则的纯字符串判断。
check(
  "B9 SQL 限制分区名格式（零正则）",
  /class_hub_namespace_ok/.test(sql) && /left\(p_namespace, 6\)/.test(sql) && /translate\(p_namespace/.test(sql)
);
check("B10 导入脚本用 upsert（幂等可重跑）", /on_conflict=namespace,path/.test(migrateSrc) && /merge-duplicates/.test(migrateSrc));
// 复制粘贴时 `$$` 会被聊天窗口加上反斜杠，SQL 里必须一个美元符号都不剩。
check("B11 建表 SQL 里没有 $ 和反斜杠", !/\$/.test(sql) && !/\\/.test(sql), (sql.match(/\$/g) || []).length + " 个 $");

// —— 动态检查：真的把 app.js 的 URL 构造函数和适配器对着跑 ——————————
const code = `
(async () => {
const vm = require("vm");
const src = appSrc;

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
      if (parens === 0) { bodyAt = src.indexOf("{", i); break; }
    }
  }
  if (bodyAt < 0) throw new Error("no body brace");
  let depth = 0;
  for (let i = bodyAt; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return src.slice(startIndex, i + 1); }
  }
  throw new Error("unbalanced braces");
}
function pick(marker) {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error("missing source marker: " + marker);
  return sliceFrom(at);
}

// 1) 适配器：在独立的 vm 上下文里加载，只给它必要的主机全局量
const ctx = { window: {}, module: { exports: {} }, setTimeout, clearTimeout, AbortController };
vm.createContext(ctx);
vm.runInContext(adapterSrc, ctx);
const adapter = ctx.module.exports;

check("C1 适配器导出了约定接口",
  adapter && adapter.name === "supabase" && typeof adapter.request === "function" &&
  typeof adapter.parseTarget === "function" && typeof adapter.endpoints === "function",
  adapter && Object.keys(adapter).join(","));
check("C2 _endpoints 能从 base 推出 rpc 地址",
  adapter.endpoints("https://x.supabase.co/rest/v1/class_hub_entries").rpc === "https://x.supabase.co/rest/v1/rpc/class_hub_list",
  adapter.endpoints("https://x.supabase.co/rest/v1/class_hub_entries").rpc);

// 2) app.js 里真正的 URL 构造函数，抠出来跑
const seam = new Function(\`
  let sharedConfig = Object.assign({}, \${CONFIG_JSON}, { provider: "mantle" });
  const window = {};
  \${pick("function hasSharedConfig(")}
  \${pick("function sharedApiBase(")}
  \${pick("function sharedBackend(")}
  \${pick("function mantleNamespaceMap(")}
  \${pick("function mantleNamespaceForPath(")}
  \${pick("function mantleKnownNamespaces(")}
  \${pick("function mantleEntryUrl(")}
  \${pick("function mantlePathFromUrl(")}
  \${pick("function mantleListUrl(")}
  return {
    hasSharedConfig: () => hasSharedConfig(),
    setConfig(next) { sharedConfig = Object.assign({}, \${CONFIG_JSON}, { provider: "mantle" }, next); },
    apiBase: () => sharedApiBase(),
    backend: () => sharedBackend(),
    setBackend(value) { window.SharedBackendSupabase = value; },
    entryUrl: (p) => mantleEntryUrl(p),
    listUrl: (ns) => mantleListUrl(ns),
    pathFromUrl: (u) => mantlePathFromUrl(u),
    nsFor: (p) => mantleNamespaceForPath(p),
    known: () => [...mantleKnownNamespaces()]
  };
\`)();

const SUPA = "https://demo-abc.supabase.co";
const MANTLE_BASE = "https://mantledb.sh/v2";

check("C3 mantle 配置下 hasSharedConfig 为真", seam.hasSharedConfig() === true);
seam.setConfig({ cloudEnabled: false });
check("C4 cloudEnabled 关掉后为假", seam.hasSharedConfig() === false);
seam.setConfig({ provider: "supabase", supabaseUrl: SUPA + "/", supabaseAnonKey: "anon-key" });
check("C5 supabase 配置齐了为真（顺带吃掉尾部斜杠）", seam.hasSharedConfig() === true);
seam.setConfig({ provider: "supabase", supabaseUrl: SUPA, supabaseAnonKey: "" });
check("C6 supabase 缺 anonKey 为假", seam.hasSharedConfig() === false);

seam.setConfig({});
check("C7 mantle 的 base 就是 mantleApiBase", seam.apiBase() === MANTLE_BASE, seam.apiBase());
check("C8 mantle 下不接管 fetchMantle", seam.backend() === null);

seam.setConfig({ provider: "supabase", supabaseUrl: SUPA + "/", supabaseAnonKey: "anon-key" });
const SUPA_BASE = SUPA + "/rest/v1/class_hub_entries";
check("C9 supabase 的 base 指向表", seam.apiBase() === SUPA_BASE, seam.apiBase());
let backendError = null;
try { seam.backend(); } catch (error) { backendError = error; }
check("C10 适配器脚本没加载时给出明确报错", backendError && /刷新页面/.test(backendError.message) && backendError.status === 0);
seam.setBackend(adapter);
check("C11 适配器脚本在时被返回", seam.backend() === adapter);

// 3) URL 形状往返：app.js 构造 → 适配器解析 → app.js 反解，三者必须一致
const SAMPLES = [
  "accounts/ethan",
  "accounts/刘凯翔",
  "classes/ahu-ic-2026",
  "schedules/49464975-84c2-4b34-8edd-ba174e930ed7",
  "usage/49464975-84c2-4b34-8edd-ba174e930ed7",
  "records/rec-1",
  "history/rec-1",
  "photos/sp-1"
];
let roundTrip = 0;
let namespaceMismatch = "";
for (const sample of SAMPLES) {
  const url = seam.entryUrl(sample);
  const parsed = adapter.parseTarget(url, seam.apiBase());
  if (!parsed || parsed.mode !== "entry") { namespaceMismatch = sample + " 解析失败"; continue; }
  if (parsed.namespace !== seam.nsFor(sample)) { namespaceMismatch = sample + " 分片不一致"; continue; }
  if (parsed.path !== sample) { namespaceMismatch = sample + " path 不一致：" + parsed.path; continue; }
  if (seam.pathFromUrl(url) !== sample) { namespaceMismatch = sample + " 反解不一致"; continue; }
  roundTrip += 1;
}
check("D1 单条 URL 往返一致（8 个分片样例）", roundTrip === SAMPLES.length, namespaceMismatch || roundTrip + "/" + SAMPLES.length);

const nsList = seam.known();
check("D2 分片表里 5 个命名空间", nsList.length === 5, nsList.length + " 个");
check(
  "D3 列表 URL 往返一致",
  nsList.every((ns) => {
    const parsed = adapter.parseTarget(seam.listUrl(ns), seam.apiBase());
    return parsed && parsed.mode === "list" && parsed.namespace === ns;
  })
);
check("D4 无关 URL 不被认领", adapter.parseTarget("https://evil.example.com/x/y", seam.apiBase()) === null);
check("D5 列表 URL 不会被当成条目", seam.pathFromUrl(seam.listUrl(nsList[0])) === "");

// 4) 适配器的四种读写 + 错误语义（用假 fetch 抓住真实请求）
function fakeFetch(replies) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url: url, init: init || {} });
    const reply = replies.shift() || { status: 200, text: "" };
    return { ok: reply.status >= 200 && reply.status < 300, status: reply.status, text: async () => reply.text || "" };
  };
  impl.calls = calls;
  return impl;
}
const ctxBase = { base: SUPA_BASE, anonKey: "anon-key" };
const recUrl = seam.entryUrl("records/rec-1");
const recFilter = "namespace=eq." + encodeURIComponent("banji-ahu-live-33cf9d5cd38f93f5") + "&path=eq." + encodeURIComponent("records/rec-1");

let fetchImpl = fakeFetch([{ status: 200, text: JSON.stringify([{ value: { title: "hi" } }]) }]);
let value = await adapter.request(recUrl, { method: "GET" }, { ...ctxBase, fetchImpl });
check("E1 GET 取回 value 字段", value && value.title === "hi", JSON.stringify(value));
check("E2 GET 用了 select=value + 双条件过滤",
  fetchImpl.calls[0].url.includes("select=value") && fetchImpl.calls[0].url.includes(recFilter),
  fetchImpl.calls[0].url);
check("E3 请求带 apikey 与 Bearer",
  fetchImpl.calls[0].init.headers.apikey === "anon-key" && fetchImpl.calls[0].init.headers.Authorization === "Bearer anon-key");

fetchImpl = fakeFetch([{ status: 200, text: "[]" }]);
value = await adapter.request(recUrl, { method: "GET" }, { ...ctxBase, fetchImpl });
check("E4 条目不存在返回 null（对应 404 语义）", value === null, JSON.stringify(value));

fetchImpl = fakeFetch([{ status: 201, text: JSON.stringify([{ value: { ok: 1 } }]) }]);
value = await adapter.request(recUrl, { method: "POST", body: JSON.stringify({ ok: 1 }) }, { ...ctxBase, fetchImpl });
const postCall = fetchImpl.calls[0];
const postBody = JSON.parse(postCall.init.body);
check("E5 POST 走 upsert 且回填 value",
  postCall.url.includes("on_conflict=namespace,path") &&
    /resolution=merge-duplicates/.test(postCall.init.headers.Prefer) &&
    Array.isArray(postBody) && postBody[0].namespace === "banji-ahu-live-33cf9d5cd38f93f5" &&
    postBody[0].path === "records/rec-1" && postBody[0].value.ok === 1,
  postCall.init.body);

fetchImpl = fakeFetch([{ status: 204, text: "" }]);
value = await adapter.request(recUrl, { method: "DELETE" }, { ...ctxBase, fetchImpl });
check("E6 DELETE 用 return=minimal 且返回 null",
  fetchImpl.calls[0].init.method === "DELETE" && fetchImpl.calls[0].init.headers.Prefer === "return=minimal" && value === null);

fetchImpl = fakeFetch([{ status: 200, text: JSON.stringify([{ path: "records/a", updated_at: 1791077712000 }]) }]);
const listed = await adapter.request(seam.listUrl("banji-ahu-live-33cf9d5cd38f93f5"), { method: "GET" }, { ...ctxBase, fetchImpl });
check("E7 列表走 rpc 且包成 { entries }",
  fetchImpl.calls[0].url.endsWith("/rpc/class_hub_list") &&
    JSON.parse(fetchImpl.calls[0].init.body).p_namespace === "banji-ahu-live-33cf9d5cd38f93f5" &&
    listed.entries.length === 1 && listed.entries[0].path === "records/a",
  fetchImpl.calls[0].url);
check("E8 列表 rpc 空结果返回空数组",
  (await adapter.request(seam.listUrl("banji-ahu-live-33cf9d5cd38f93f5"), { method: "GET" }, { ...ctxBase, fetchImpl: fakeFetch([{ status: 200, text: "null" }]) })).entries.length === 0);

fetchImpl = fakeFetch([{ status: 429, text: "rate limited" }]);
let err = null;
try { await adapter.request(recUrl, { method: "GET" }, { ...ctxBase, fetchImpl }); } catch (error) { err = error; }
check("E9 429 带 status 与 rateLimited", err && err.status === 429 && err.rateLimited === true, err && err.message);

fetchImpl = fakeFetch([{ status: 403, text: JSON.stringify({ message: "Entry limit reached: 分区 photos 已有 4000 条" }) }]);
err = null;
try { await adapter.request(recUrl, { method: "POST", body: "{}" }, { ...ctxBase, fetchImpl }); } catch (error) { err = error; }
check("E10 分区满能被识别（entryLimit）", err && err.entryLimit === true && /Entry limit reached/.test(err.detail), err && err.detail);

err = null;
try { await adapter.request(recUrl, { method: "GET" }, { base: SUPA_BASE, anonKey: "", fetchImpl: fakeFetch([]) }); } catch (error) { err = error; }
check("E11 缺 anonKey 时报错清楚", err && /supabaseAnonKey/.test(err.message), err && err.message);

err = null;
try { await adapter.request("https://evil.example.com/x", { method: "GET" }, { ...ctxBase, fetchImpl: fakeFetch([]) }); } catch (error) { err = error; }
check("E12 base 对不上时报错而不是乱发请求", err && /supabaseUrl/.test(err.message), err && err.message);

const failed = results.filter((row) => !row.ok);
for (const row of results) {
  console.log((row.ok ? "  ok  " : "  FAIL") + "  " + row.name + (row.extra ? "  (" + row.extra + ")" : ""));
}
console.log("后端接缝检查：" + (results.length - failed.length) + "/" + results.length + " 通过");
process.exit(failed.length === 0 ? 0 : 1);
})().catch((error) => {
  console.log("  FAIL  动态检查中途抛异常  (" + (error && error.message) + ")");
  console.log("后端接缝检查：0/" + results.length + " 通过");
  process.exit(1);
});
`;

new Function("require", "process", "appSrc", "adapterSrc", "CONFIG_JSON", "check", "results", code)(
  require,
  process,
  appSrc,
  adapterSrc,
  CONFIG_JSON,
  check,
  results
);
