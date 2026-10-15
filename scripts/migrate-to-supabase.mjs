#!/usr/bin/env node
/**
 * migrate-to-supabase.mjs — 把 MantleDB 里的全班数据搬进 Supabase。
 *
 * 为什么需要：MantleDB 免费档每个命名空间只有 100 条 / 每 24 小时 10000 次请求，
 * 而且口令摘要放在公开可读的命名空间里（能离线爆破）。Supabase 是真 Postgres：
 * 条目数、请求数都不再是天花板，安全边界交给数据库的 RLS 策略。
 *
 * 数据模型刻意保持 1:1：Supabase 侧是一张 `class_hub_entries(namespace, path, value)`，
 * 分片名就是 namespace 字段。这样 app.js 的同步逻辑一行都不用改，只换底层适配器。
 *
 * 用法：
 *   node --dns-result-order=ipv4first scripts/migrate-to-supabase.mjs                  # 预演
 *   node --dns-result-order=ipv4first scripts/migrate-to-supabase.mjs --apply           # 真正写入
 *   node --dns-result-order=ipv4first scripts/migrate-to-supabase.mjs --from backups    # 改用本地备份文件
 *
 * 前置条件：
 *   1. 已在 Supabase 建好项目，并在 SQL Editor 跑过 supabase/202610160001_class_hub_entries.sql；
 *   2. config.js 里的 supabaseUrl / supabaseAnonKey 已填写。
 * 幂等：用 upsert 写入，可以反复跑；源数据（MantleDB）不会被删，切换失败随时能回退。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const FROM = (() => {
  const index = process.argv.indexOf("--from");
  return index >= 0 ? process.argv[index + 1] : "";
})();

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox);
const cfg = sandbox.window.BANJI_CONFIG || {};

const BASE = cfg.mantleApiBase;
const MAIN = cfg.mantleNamespace;
const MAP = cfg.mantleNamespaceMap || {};
const NAMESPACES = [...new Set([MAIN, ...Object.values(MAP)].filter(Boolean))];
const SUPA_URL = String(process.env.BANJI_SUPABASE_URL || cfg.supabaseUrl || "").replace(/\/+$/, "");
const SUPA_KEY = String(process.env.BANJI_SUPABASE_ANON_KEY || cfg.supabaseAnonKey || "");
const TABLE = `${SUPA_URL}/rest/v1/class_hub_entries`;
const BATCH = 25;

if (!BASE || !MAIN) {
  console.error("config.js 里缺少 mantleApiBase / mantleNamespace，无法确定数据来源。");
  process.exit(1);
}
if (!SUPA_URL || !SUPA_KEY) {
  console.error(
    "config.js 里的 supabaseUrl / supabaseAnonKey 还是空的，先把它们填上：\n" +
      "  1. 打开 https://supabase.com/dashboard → 新建项目（区域选 Southeast Asia (Singapore)）\n" +
      "  2. 左侧 SQL Editor → 粘贴并运行 supabase/202610160001_class_hub_entries.sql\n" +
      "  3. Project Settings → API → 复制 Project URL 与 anon public 两条，填进 config.js\n" +
      "（anon key 是公开密钥，写在静态站里不算泄密；安全靠数据库的 RLS 策略。）"
  );
  process.exit(1);
}

const listUrl = (ns) => `${BASE}/list/${encodeURIComponent(ns)}`;
const entryUrl = (ns, p) => `${BASE}/${encodeURIComponent(ns)}/${p}`;

async function mine(url, options = {}, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
        ...options
      });
      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${body.replace(/\s+/g, " ").slice(0, 120)}`);
      }
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = text;
      }
      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP ${response.status} ${text.slice(0, 160)}`);
      }
      return json;
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

async function supa(pathname, options = {}) {
  const response = await fetch(`${TABLE}${pathname}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    ...options,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  if (!response.ok) {
    const hint =
      response.status === 401 || response.status === 403
        ? "（key 填错了？或者 SQL 里的 RLS 策略没跑成功？表名必须是 class_hub_entries）"
        : "";
    throw new Error(`Supabase HTTP ${response.status}${hint} ${text.slice(0, 200)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// usage/<id>/<日期> 归一成 usage/<id>（与分片迁移同一套规则），日期写回内容里。
function normalize(p, value) {
  const usage = String(p).match(/^usage\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
  if (!usage) return { path: p, value };
  const next = value && typeof value === "object" ? { ...value, date: usage[2] } : value;
  return { path: `usage/${usage[1]}`, value: next };
}

async function collectFromBackups(target) {
  const stat = fs.statSync(target);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(target)
        .filter((name) => name.endsWith(".json"))
        .map((name) => path.join(target, name))
    : [target];
  const rows = [];
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    const ns = payload.namespace || "";
    const records = payload.records || {};
    let count = 0;
    for (const [p, value] of Object.entries(records)) {
      const fixed = normalize(p, value);
      rows.push({ namespace: MAP[`${String(p).split("/")[0]}/`] || ns || MAIN, path: fixed.path, value: fixed.value });
      count += 1;
    }
    console.log(`  读备份 ${path.basename(file)}：${ns || "(无命名空间)"} ${count} 条`);
  }
  return rows;
}

async function collectFromMantle() {
  const rows = [];
  for (const ns of NAMESPACES) {
    const listed = await mine(listUrl(ns)).catch(() => []);
    const entries = Array.isArray(listed) ? listed : listed?.entries || [];
    for (const item of entries) {
      const p = typeof item === "string" ? item : item.path;
      if (!p) continue;
      const value = await mine(entryUrl(ns, p)).catch(() => null);
      if (value === null || value === undefined) {
        console.log(`  ! ${ns}/${p} 读不到内容，跳过`);
        continue;
      }
      const fixed = normalize(p, value);
      rows.push({ namespace: ns, path: fixed.path, value: fixed.value });
    }
    console.log(`  读 MantleDB ${ns}：${entries.length} 条`);
  }
  return rows;
}

console.log(APPLY ? "模式：写入（--apply）" : "模式：预演（不写任何数据）");
console.log(`目标：${SUPA_URL}/rest/v1/class_hub_entries`);
console.log(FROM ? `来源：本地备份 ${FROM}` : `来源：MantleDB（${NAMESPACES.length} 个命名空间）`);

const rows = FROM ? await collectFromBackups(FROM) : await collectFromMantle();
if (!rows.length) {
  console.log("没有读到任何数据，结束。");
  process.exit(0);
}

const byNamespace = {};
for (const row of rows) byNamespace[row.namespace] = (byNamespace[row.namespace] || 0) + 1;
console.log(`\n共 ${rows.length} 条，按分片：`);
for (const [ns, count] of Object.entries(byNamespace)) console.log(`  ${String(count).padStart(3)} 条  ${ns}`);

if (!APPLY) {
  console.log("\n预演结束。确认无误后真正写入：");
  console.log("  node --dns-result-order=ipv4first scripts/migrate-to-supabase.mjs --apply");
  process.exit(0);
}

let written = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  await supa("?on_conflict=namespace,path", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(chunk)
  });
  written += chunk.length;
  console.log(`  已写入 ${written}/${rows.length}`);
}

console.log("\n回读校验：");
let mismatch = 0;
for (const [ns, expected] of Object.entries(byNamespace)) {
  const back = await supa(`?select=path&namespace=eq.${encodeURIComponent(ns)}&limit=5000`);
  const got = Array.isArray(back) ? back.length : 0;
  const ok = got >= expected;
  if (!ok) mismatch += 1;
  console.log(`  ${ok ? "✓" : "×"} ${ns}：源 ${expected} 条，Supabase ${got} 条`);
}

if (mismatch) {
  console.error("\n有分片条数对不上，先别切换 provider，请把上面的输出发我看。");
  process.exit(1);
}

console.log(
  "\n数据已经全部在 Supabase 里了。接下来三步（README「迁移到 Supabase」有详细说明）：\n" +
    "  1. 在 Supabase 里把自己设成管理员所需的数据检查一遍（accounts/ 里的账号、classes/）\n" +
    "  2. 改 config.js：provider 从 \"mantle\" 改成 \"supabase\"\n" +
    "  3. 跑 node scripts/bump-version.mjs 后提交推送，再打开线上页面实测登录/发布/课表\n" +
    "回退：把 provider 改回 \"mantle\" 再推一次即可，MantleDB 里的数据一条都没删。"
);
