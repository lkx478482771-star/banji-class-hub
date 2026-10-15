/* backend-supabase.js — Supabase（PostgREST）版的共享存储适配器。
 *
 * 它是 app.js 里 fetchMantle() 的替身：config.js 的 provider 一改成 "supabase"，
 * 所有共享存储读写都会走这里。默认 provider 仍是 "mantle"，
 * 所以切换之前这个文件对线上行为**零影响**（只是多下载几 KB）。
 *
 * 约定与 MantleDB 版完全一致，因此上层的 5 秒缓存、增量同步、写入精准失效
 * 一行代码都不用改：
 *   调用  request(url, options, context)
 *   URL   `${base}/${namespace}/${path}`（单条）    `${base}/list/${namespace}`（列表）
 *   返回  单条 → 该条的 JSON；不存在 → null
 *         列表 → { entries: [{ path, updated_at }] }，updated_at 是毫秒数
 *   错误  throw Error，带 .status；429 带 .rateLimited；分区满带 .entryLimit
 *
 * 鉴权：anon key 是「设计上就可以公开的钥匙」，真正兜底的是数据库的行级权限（RLS），
 * 见 supabase/202610160001_class_hub_entries.sql。service_role key 绝不允许进这个文件。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else if (root) root.SharedBackendSupabase = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_TIMEOUT_MS = 8000;
  const LIST_RPC = "class_hub_list";

  function trimBase(base) {
    return String(base || "").replace(/\/+$/, "");
  }

  // base 形如 `https://xxx.supabase.co/rest/v1/class_hub_entries`：
  //   root = `.../rest/v1`，table = `class_hub_entries`，列表走同层的 rpc。
  function endpoints(base) {
    const full = trimBase(base);
    const cut = full.lastIndexOf("/");
    return {
      root: cut > 0 ? full.slice(0, cut) : full,
      table: cut > 0 ? full.slice(cut + 1) : "",
      rpc: `${cut > 0 ? full.slice(0, cut) : full}/rpc/${LIST_RPC}`
    };
  }

  // app.js 用「规范化 URL」当内部货币，这里把它拆回 (namespace, path)。
  // 路径本身可能带 %XX（用户名/文件名都过过 encodeURIComponent），所以保持原样不解码。
  function parseTarget(url, base) {
    const prefix = trimBase(base);
    const text = String(url || "");
    if (!prefix || !text.startsWith(`${prefix}/`)) return null;
    const rest = text.slice(prefix.length + 1);
    if (rest === "list" || rest.startsWith("list/")) {
      return { mode: "list", namespace: decodeURIComponent(rest.slice(5)) };
    }
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    return {
      mode: "entry",
      namespace: decodeURIComponent(rest.slice(0, slash)),
      path: rest.slice(slash + 1)
    };
  }

  function parseJson(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function toError(status, text) {
    let detail = String(text || "");
    const parsed = parseJson(detail);
    if (parsed && typeof parsed === "object") {
      detail = [parsed.message, parsed.details, parsed.hint].filter(Boolean).join(" · ") || detail;
    }
    const error = new Error(`Shared storage request failed: ${status}`);
    error.status = status;
    error.detail = detail.slice(0, 200);
    if (status === 429) error.rateLimited = true;
    // 分区满的报错文案里带着 "Entry limit reached"（见建表 SQL），
    // 这样 app.js 里已有的「共享库已满，请联系管理员」提示在两套后端上都能生效。
    if (/entry limit/i.test(error.detail)) error.entryLimit = true;
    return error;
  }

  function timeoutError() {
    const error = new Error("共享服务响应超时，请稍后再试。");
    error.name = "MantleTimeoutError";
    error.status = 0;
    error.timeout = true;
    return error;
  }

  async function send(fetchImpl, url, init, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        cache: "no-store"
      });
      const text = await response.text().catch(() => "");
      if (!response.ok) throw toError(response.status, text);
      return text;
    } catch (error) {
      if (controller.signal.aborted) throw timeoutError();
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(url, options = {}, context = {}) {
    const target = parseTarget(url, context.base);
    if (!target) {
      const error = new Error("共享存储地址不对，检查一下 config.js 里的 supabaseUrl。");
      error.status = 0;
      throw error;
    }
    const anonKey = String(context.anonKey || "");
    if (!anonKey) {
      const error = new Error("缺少 supabaseAnonKey，共享存储无法访问。");
      error.status = 0;
      throw error;
    }
    const fetchImpl = context.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      const error = new Error("这个浏览器不支持 fetch，共享存储无法访问。");
      error.status = 0;
      throw error;
    }
    const timeoutMs = Number(context.timeoutMs) || DEFAULT_TIMEOUT_MS;
    const { root, table, rpc } = endpoints(context.base);
    const method = String(options.method || "GET").toUpperCase();
    const auth = {
      Accept: "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`
    };

    if (target.mode === "list") {
      const text = await send(
        fetchImpl,
        rpc,
        {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ p_namespace: target.namespace })
        },
        timeoutMs
      );
      const rows = parseJson(text);
      return { entries: Array.isArray(rows) ? rows : [] };
    }

    const filter = `namespace=eq.${encodeURIComponent(target.namespace)}&path=eq.${encodeURIComponent(target.path)}`;

    if (method === "DELETE") {
      await send(
        fetchImpl,
        `${root}/${table}?${filter}`,
        { method: "DELETE", headers: { ...auth, Prefer: "return=minimal" } },
        timeoutMs
      );
      return null;
    }

    if (method !== "GET") {
      const value = parseJson(String(options.body === undefined ? "null" : options.body));
      const text = await send(
        fetchImpl,
        `${root}/${table}?on_conflict=namespace,path`,
        {
          method: "POST",
          headers: {
            ...auth,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation"
          },
          body: JSON.stringify([{ namespace: target.namespace, path: target.path, value }])
        },
        timeoutMs
      );
      const rows = parseJson(text);
      return rows && rows[0] ? rows[0].value : null;
    }

    const text = await send(
      fetchImpl,
      `${root}/${table}?select=value&${filter}&limit=1`,
      { method: "GET", headers: auth },
      timeoutMs
    );
    const rows = parseJson(text);
    return rows && rows[0] ? rows[0].value : null;
  }

  return {
    name: "supabase",
    request,
    parseTarget,
    endpoints,
    DEFAULT_TIMEOUT_MS
  };
});
