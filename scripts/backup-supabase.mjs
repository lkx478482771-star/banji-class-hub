/* scripts/backup-supabase.mjs — 把线上班级数据全量导出成一份 JSON（免费档没有自动备份，
 * 这就是自己那份备份）。
 *
 * 用法：
 *   node scripts/backup-supabase.mjs              # 写到 backups/supabase-backup-<时间戳>.json
 *   node scripts/backup-supabase.mjs <输出目录>    # 换目录
 *
 * 它做三件事：
 *   1. 拉取 class_hub_entries 全表（分页，不会被 PostgREST 的 1000 行静默截断）；
 *   2. 顺带列出 Storage 里 sports-photos 桶的对象（照片文件不在数据库备份里，这份清单是找回照片的索引）；
 *   3. 写成一个 JSON，并把照片的公开地址单独写成一份 .txt，方便逐张另存。
 *
 * 只读：只用 config.js 里的 anon key 做 GET / list，不会写、不会删。
 * 输出文件含同学真实信息与口令摘要 —— backups/ 已在 .gitignore 里，仍然不要外传。
 * 密钥只从 config.js 读，不打印、不写进备份文件。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const outDir = resolve(process.argv[2] || join(repoRoot, "backups"));
const TABLE = "class_hub_entries";
const BUCKET = "sports-photos";
const PAGE = 1000;
const TIMEOUT_MS = 20000;

function readConfig() {
  const src = readFileSync(join(repoRoot, "config.js"), "utf8");
  const pick = (name) => {
    const m = src.match(new RegExp(name + "\\s*:\\s*[\"']([^\"']+)[\"']"));
    return m ? m[1] : "";
  };
  const url = pick("supabaseUrl").replace(/\/+$/, "");
  const key = pick("supabaseAnonKey");
  if (!url || !key) {
    throw new Error("config.js 里读不到 supabaseUrl / supabaseAnonKey，先确认配置。");
  }
  return { url, key };
}

const config = readConfig();
const authHeaders = { apikey: config.key, Authorization: `Bearer ${config.key}` };

async function getAllEntries() {
  const rows = [];
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${config.url}/rest/v1/${TABLE}` +
      `?select=namespace,path,value,updated_at&order=namespace.asc,path.asc`;
    const response = await fetch(url, {
      headers: { ...authHeaders, Range: `${offset}-${offset + PAGE - 1}`, "Range-Unit": "items" },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) {
      throw new Error(`拉取记录失败：HTTP ${response.status} ${String(await response.text()).slice(0, 200)}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("返回内容不是记录数组，检查 supabaseUrl 是否正确。");
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function listBucket() {
  const objects = [];
  for (let offset = 0; ; offset += PAGE) {
    const response = await fetch(`${config.url}/storage/v1/object/list/${BUCKET}`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: PAGE, offset }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!response.ok) {
      return { ok: false, status: response.status, objects };
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) return { ok: false, status: response.status, objects };
    for (const item of batch) {
      objects.push({
        name: item?.name ?? "",
        size: item?.metadata?.size ?? null,
        updated_at: item?.updated_at ?? null
      });
    }
    if (batch.length < PAGE) break;
  }
  return { ok: true, status: 200, objects };
}

function collectPhotoPaths(rows) {
  const paths = new Set();
  for (const row of rows) {
    const value = row?.value;
    if (!value || typeof value !== "object") continue;
    for (const key of ["thumb_path", "photo_path"]) {
      const path = value[key];
      if (typeof path === "string" && path) paths.add(path);
    }
  }
  return [...paths].sort();
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  console.log(`项目：${config.url}`);
  console.log("正在读取记录…");
  const rows = await getAllEntries();

  console.log("正在列出照片桶…");
  const bucket = await listBucket();

  const photoPaths = collectPhotoPaths(rows);
  const byNamespace = {};
  for (const row of rows) {
    byNamespace[row.namespace] = (byNamespace[row.namespace] || 0) + 1;
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    projectUrl: config.url,
    table: TABLE,
    entryCount: rows.length,
    countsByNamespace: byNamespace,
    storage: {
      bucket: BUCKET,
      listOk: bucket.ok,
      listStatus: bucket.status,
      objectCount: bucket.objects.length,
      objects: bucket.objects,
      pathsFromRecords: photoPaths
    },
    entries: rows
  };

  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, `supabase-backup-${stamp()}.json`);
  writeFileSync(jsonPath, JSON.stringify(payload, null, 2), "utf8");

  const urlList = bucket.objects.length
    ? bucket.objects.map((o) => `${config.url}/storage/v1/object/public/${BUCKET}/${o.name}`)
    : photoPaths.map((p) => `${config.url}/storage/v1/object/public/${BUCKET}/${p}`);
  const txtPath = join(outDir, `supabase-photos-${stamp()}.txt`);
  writeFileSync(txtPath, urlList.join("\n") + (urlList.length ? "\n" : ""), "utf8");

  console.log("");
  console.log(`记录：${rows.length} 条`);
  for (const [ns, n] of Object.entries(byNamespace).sort()) console.log(`  ${ns} — ${n} 条`);
  console.log(
    bucket.ok
      ? `照片桶：${bucket.objects.length} 个文件`
      : `照片桶：列不出来（HTTP ${bucket.status}），但记录里提到 ${photoPaths.length} 个路径`
  );
  console.log(`已写出：${jsonPath}`);
  console.log(`照片地址清单：${txtPath}（共 ${urlList.length} 条）`);
  console.log("提示：这份文件含同学真实信息与口令摘要，别提交进 git、别外传。");
}

main().catch((error) => {
  console.error(`备份失败：${error?.message || error}`);
  console.error("（最常见原因是当前网络到 *.supabase.co 不通，先把节点打开再跑。）");
  process.exitCode = 1;
});
