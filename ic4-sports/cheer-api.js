/* 加油墙的后端接口（Supabase）
 *
 * 这里**没有登录**：同学打开页面就能写。
 * 能做什么完全由数据库那边决定 —— 公共页只能调 submit（提交）和 list（看已通过的），
 * review（审核）只有 admin.html 用得上，而且要口令。
 *
 * 三个函数都在 Supabase 里用 security definer 定义，直接读写小表是被数据库拒绝的，
 * 所以就算有人拿到这份代码，也删不掉墙上的内容。
 */
(function () {
  "use strict";

  const CLOUD = window.IC4_CLOUD || {};
  const CHEER = CLOUD.cheer || {};
  const TIMEOUT = 12000;

  function endpoint(name) {
    if (!CLOUD.url || !CLOUD.anonKey) throw new Error("no-cloud");
    return String(CLOUD.url).replace(/\/+$/, "") + "/rest/v1/rpc/" + encodeURIComponent(name);
  }

  function headers() {
    return {
      apikey: CLOUD.anonKey,
      Authorization: "Bearer " + CLOUD.anonKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  }

  async function call(name, payload) {
    if (!CLOUD.url || !CLOUD.anonKey) return { ok: false, error: "no-cloud" };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch(endpoint(name), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(payload || {}),
        signal: controller.signal
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (error) {
        data = null;
      }
      if (!response.ok) {
        // 数据表还没建好时 PostgREST 会回 404/400，这里翻译成一句人话。
        const missing = response.status === 404 || response.status === 400;
        return { ok: false, error: missing ? "not-ready" : "http-" + response.status, data };
      }
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: error && error.name === "AbortError" ? "timeout" : "offline" };
    } finally {
      window.clearTimeout(timer);
    }
  }

  function pickList(result) {
    if (!result.ok) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    return {
      ok: true,
      items: rows
        .filter((row) => row && typeof row.body === "string" && row.body.trim())
        .map((row) => ({
          id: String(row.id || ""),
          target: String(row.target || "ALL"),
          body: String(row.body).trim(),
          at: row.created_at ? Date.parse(row.created_at) || 0 : 0
        }))
    };
  }

  window.IC4_CHEER = {
    ready: () => Boolean(CLOUD.url && CLOUD.anonKey),

    /** 提交一句加油：先落库为「待审核」，审核通过后才会出现在墙上。 */
    submit(target, body) {
      return call(CHEER.submit || "ic4_cheer_submit", {
        p_target: String(target || "ALL"),
        p_body: String(body || "")
      });
    },

    /** 已通过审核的加油（公开可读，最多 500 条）。 */
    async list(limit) {
      const result = await call(CHEER.list || "ic4_cheer_list", { p_limit: limit || 300 });
      return pickList(result);
    },

    /** 审核接口，只有 admin.html 用：action = list / approve / delete。 */
    review(secret, action, id) {
      return call(CHEER.review || "ic4_cheer_review", {
        p_secret: String(secret || ""),
        p_action: String(action || "list"),
        p_id: id || null
      });
    },

    /** 把接口返回的错误码翻译成给同学看的话。 */
    explain(error) {
      const table = {
        length: "留言要 2 到 40 个字。",
        target: "加油对象不对。",
        too_fast: "刚发过一条，等 10 秒再发。",
        too_many: "这个网络一小时发的有点多，歇一会儿再来。",
        "not-ready": "加油墙还没开通（负责人正在配置）。",
        offline: "连不上加油墙，检查一下网络。",
        timeout: "网络有点慢，稍后再试。",
        "no-cloud": "这个页面没有配置加油墙。",
        bad_action: "操作不对。",
        "bad_secret": "口令不对。"
      };
      if (table[error]) return table[error];
      if (String(error || "").indexOf("http-") === 0) return "服务器返回 " + error.slice(5) + "，稍后再试。";
      return "出了点问题，稍后再试。";
    }
  };
})();
