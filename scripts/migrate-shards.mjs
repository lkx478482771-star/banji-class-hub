#!/usr/bin/env node
/**
 * migrate-shards.mjs — 一次性把主命名空间里的条目搬进各自的分片。
 *
 * 为什么需要：分片（config.js 的 mantleNamespaceMap）上线后，app.js 会去新命名空间
 * 读 `schedules/<id>`、`usage/<id>` 等路径，而老数据还在主命名空间里躺着。
 * 不搬的话，老同学换设备登录会看不到自己的课表，每日额度也会重置。
 *
 * 安全性：
 *   - 默认只预演（dry-run），不写任何东西；确认无误后加 --apply 才真写。
 *   - 顺序是「先写新片 → 读回校验 → 再删老片」，任何一步失败就停，可安全重跑（幂等）。
 *   - usage/<id>/<日期> 会按账号合并成 usage/<id>，并把日期写进内容里。
 *
 * 用法：
 *   node --dns-result-order=ipv4first scripts/migrate-shards.mjs           # 预演
 *   node --dns-result-order=ipv4first scripts/migrate-shards.mjs --apply   # 执行
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");

const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, "config.js"), "utf8"), sandbox);
const cfg = sandbox.window.BANJI_CONFIG || {};
const BASE = cfg.mantleApiBase;
const MAIN = cfg.mantleNamespace;
const MAP = cfg.mantleNamespaceMap || {};

if (!BASE || !MAIN) {
  console.error("config.js 里缺少 mantleApiBase / mantleNamespace，无法迁移。");
  process.exit(1);
}

const namespaceForPath = (p) => {
  const text = String(p || "");
  let ns = "";
  let matched = -1;
  for (const prefix of Object.keys(MAP)) {
    if (prefix.length > matched && text.startsWith(prefix)) {
      matched = prefix.length;
      ns = MAP[prefix];
    }
  }
  return ns || MAIN;
};

const listUrl = (ns) => `${BASE}/list/${encodeURIComponent(ns)}`;
const entryUrl = (ns, p) => `${BASE}/${encodeURIComponent(ns)}/${p}`;

async function call(url, options = {}, attempts = 3) {
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
        ...options
      });
      if (response.status === 429 || response.status >= 500) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${body.replace(/\s+/g, " ").slice(0, 120)}`);
      }
      if (!response.ok && response.status !== 404) {
        const body = await response.text().catch(() => "");
        throw new Error(`HTTP ${response.status} ${body.slice(0, 160)}`);
      }
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: response.status, json, text };
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastError;
}

const readEntry = async (ns, p) => {
  const res = await call(entryUrl(ns, p));
  return res.json;
};
const writeEntry = (ns, p, value) =>
  // Content-Type 必须带：少了它 mantledb.sh 会直接回 500 Internal Server Error。
  call(entryUrl(ns, p), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value)
  });
const deleteEntry = (ns, p) => call(entryUrl(ns, p), { method: "DELETE" });

// 路径改写：只有 usage/<id>/<日期> 需要变成 usage/<id>
function rewritePath(p) {
  const usage = p.match(/^usage\/([^/]+)\/(\d{4}-\d{2}-\d{2})$/);
  if (usage) return { path: `usage/${usage[1]}`, date: usage[2] };
  return { path: p, date: "" };
}

const listed = await call(listUrl(MAIN));
const entries = Array.isArray(listed.json) ? listed.json : listed.json?.entries || [];
if (!entries.length) {
  console.log(`主命名空间 ${MAIN} 里没有条目，不需要迁移。`);
  process.exit(0);
}

const plan = [];
for (const item of entries) {
  const from = typeof item === "string" ? item : item.path;
  if (!from) continue;
  const target = namespaceForPath(from);
  if (target === MAIN) continue;
  plan.push({ from, ...rewritePath(from), namespace: target });
}

console.log(`主命名空间：${MAIN}`);
console.log(`共 ${entries.length} 条，其中 ${plan.length} 条需要搬家。`);
for (const step of plan) {
  console.log(`  ${step.from}  →  [${step.namespace}] ${step.path}${step.date ? `  (合并日期 ${step.date})` : ""}`);
}
if (!plan.length) {
  console.log("已经都在正确的分片里，收工。");
  process.exit(0);
}

if (!APPLY) {
  console.log("\n预演结束（没有写入任何数据）。确认无误后加 --apply 真正执行：");
  console.log("  node --dns-result-order=ipv4first scripts/migrate-shards.mjs --apply");
  process.exit(0);
}

let requests = 0;
for (const step of plan) {
  const value = await readEntry(MAIN, step.from);
  requests += 1;
  if (!value) {
    console.log(`  - ${step.from}：读不到内容，跳过。`);
    continue;
  }
  let payload = value;
  if (step.date && value.date !== step.date) {
    payload = { ...value, date: step.date };
  }
  const existing = await readEntry(step.namespace, step.path).catch(() => null);
  requests += 1;
  // usage 合并：同一天取更大的计数，避免把额度和已用次数改小。
  if (existing && step.date && existing.date === step.date && Number(existing.total || 0) > Number(payload.total || 0)) {
    payload = existing;
  }
  await writeEntry(step.namespace, step.path, payload);
  requests += 1;
  const check = await readEntry(step.namespace, step.path);
  requests += 1;
  if (!check) {
    throw new Error(`写回校验失败，已停止：${step.namespace}/${step.path}`);
  }
  await deleteEntry(MAIN, step.from);
  requests += 1;
  console.log(`  ✓ ${step.from} → [${step.namespace}] ${step.path}`);
}

console.log(`\n迁移完成，用了约 ${requests} 次请求。各命名空间现状：`);
const all = new Set([MAIN, ...Object.values(MAP)]);
for (const ns of all) {
  const res = await call(listUrl(ns));
  const rows = Array.isArray(res.json) ? res.json : res.json?.entries || [];
  const byPrefix = {};
  for (const item of rows) {
    const p = typeof item === "string" ? item : item.path;
    const prefix = String(p || "").split("/")[0] + "/";
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }
  const detail = Object.entries(byPrefix)
    .map(([k, v]) => `${k} ${v}`)
    .join("，");
  console.log(`  ${String(rows.length).padStart(3)} 条  ${ns}${detail ? `  （${detail}）` : ""}`);
}
