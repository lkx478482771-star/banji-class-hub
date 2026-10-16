/* 加油墙的后端接口
 *
 * 这里**没有登录、也没有审核**：同学打开页面就能写，写完立刻上墙。
 * 数据放在旧站同一个数据库里，但属于一个独立分区（旧站的代码根本不认识它）：
 *   banji-ic4-cheer-live     写完就在这儿，页面上立刻能看到
 *
 * 公开页只做两件事：往 live 写一条、从 live 读回来。
 * 「下架某一条」只有 admin.html 用（事后删帖），而且要过口令。
 *
 * 代价要说清楚：没有服务端把关，谁都能写、也能删自己分区里的东西（「防君子」级别）。
 * 想加固就跑可选的 supabase/ic4-cheers.sql，把读写收进服务端函数里。
 */
(function () {
  "use strict";

  const CLOUD = window.IC4_CLOUD || {};
  const TIMEOUT_READ = 18000;
  const TIMEOUT_WRITE = 22000;
  const ATTEMPTS = 3;
  const TABLE = "/rest/v1/class_hub_entries";
  const NS = {
    live: "banji-ic4-cheer-live"
  };
  const TEXT_MIN = 2;
  const TEXT_MAX = 40;
  const TARGET_OK = /^(ALL|IC4-\d{3})$/;

  let lastSubmitAt = 0;

  function base() {
    return String(CLOUD.url || "").replace(/\/+$/, "");
  }

  function headers(extra) {
    const head = {
      apikey: CLOUD.anonKey,
      Authorization: "Bearer " + CLOUD.anonKey,
      "Content-Type": "application/json",
      Accept: "application/json"
    };
    return Object.assign(head, extra || {});
  }

  async function call(method, url, body, extra, timeout) {
    if (!CLOUD.url || !CLOUD.anonKey) return { ok: false, error: "no-cloud" };
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout || TIMEOUT_READ);
    try {
      const response = await fetch(url, {
        method: method,
        headers: headers(extra),
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
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
        let code = "http-" + response.status;
        if (response.status === 401 || response.status === 403) code = "denied";
        else if (response.status === 404) code = "not-ready";
        else if (response.status === 400 || response.status === 409) code = "rejected";
        return { ok: false, error: code, data: data };
      }
      return { ok: true, data: data };
    } catch (error) {
      return { ok: false, error: error && error.name === "AbortError" ? "timeout" : "offline" };
    } finally {
      window.clearTimeout(timer);
    }
  }

  // 网络抖动是常态（尤其是手机网络），读不到就自己重试几次再放弃，
  // 别让同学一眼看到「连不上」——这也正是中秋节那页的做法。
  async function withRetry(run) {
    let last = null;
    for (let i = 1; i <= ATTEMPTS; i++) {
      last = await run();
      if (last && last.ok) return last;
      const soft = last && (last.error === "offline" || last.error === "timeout");
      if (!soft || i === ATTEMPTS) return last;
      await new Promise((resolve) => window.setTimeout(resolve, 650 * i));
    }
    return last;
  }

  function pickRows(result) {
    if (!result.ok) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    const items = rows
      .map((row) => {
        const value = (row && row.value) || {};
        const text = typeof value.text === "string" ? value.text.trim() : "";
        if (!text) return null;
        return {
          id: String((row && row.path) || ""),
          target: String(value.target || "ALL"),
          body: text,
          at: value.at ? Date.parse(value.at) || 0 : Date.parse((row && row.updated_at) || "") || 0
        };
      })
      .filter(Boolean);
    return { ok: true, items: items };
  }

  function listUrl(ns, limit) {
    return (
      base() +
      TABLE +
      "?namespace=eq." +
      encodeURIComponent(ns) +
      "&select=path,value,updated_at&order=updated_at.desc&limit=" +
      Math.max(1, Math.min(500, Number(limit) || 200))
    );
  }

  function rowUrl(ns, path) {
    return (
      base() +
      TABLE +
      "?namespace=eq." +
      encodeURIComponent(ns) +
      "&path=eq." +
      encodeURIComponent(path)
    );
  }

  function delRow(ns, path) {
    return call("DELETE", rowUrl(ns, path), undefined, { Prefer: "return=minimal" });
  }

  function newPath() {
    const stamp = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 7);
    return "c-" + stamp + "-" + rand;
  }

  window.IC4_CHEER = {
    namespaces: NS,

    ready: () => Boolean(CLOUD.url && CLOUD.anonKey),

    /** 提交一句加油：直接进「已上墙」分区，不用审核，写完大家就能看到。
     *  options.force = true 时跳过「10 秒一条」的本机节流（本机队列重传时用）。 */
    submit(target, body, options) {
      const text = String(body || "").trim();
      const who = String(target || "ALL").trim() || "ALL";
      if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
        return Promise.resolve({ ok: false, error: "length" });
      }
      if (!TARGET_OK.test(who)) return Promise.resolve({ ok: false, error: "target" });
      if (!(options && options.force) && Date.now() - lastSubmitAt < 10000) {
        return Promise.resolve({ ok: false, error: "too_fast" });
      }
      lastSubmitAt = Date.now();
      return call(
        "POST",
        base() + TABLE + "?on_conflict=namespace,path",
        [{ namespace: NS.live, path: newPath(), value: { v: 1, target: who, text: text, at: new Date().toISOString() } }],
        { Prefer: "resolution=merge-duplicates,return=minimal" },
        TIMEOUT_WRITE
      );
    },

    /** 已经上墙的加油（公开可读）。读不到会自动重试几次。 */
    list(limit) {
      return withRetry(() => call("GET", listUrl(NS.live, limit), undefined, undefined, TIMEOUT_READ).then(pickRows));
    },

    /** 下架一条（只有 admin.html 用）：把这条从墙上删掉。 */
    discard(path) {
      return delRow(NS.live, String(path || ""));
    },

    /** 把接口返回的错误码翻译成给同学看的话。 */
    explain(error) {
      const table = {
        length: "留言要 2 到 40 个字。",
        target: "加油对象不对。",
        too_fast: "刚发过一条，等 10 秒再发。",
        rejected: "服务器把这条退回来了，换个说法再试。",
        denied: "这个网络发不出去，换个网试试。",
        "not-ready": "加油墙还没开通（负责人正在配置）。",
        offline: "网络有点慢，先显示上次同步到的加油。",
        timeout: "网络有点慢，正在自动重试…",
        "no-cloud": "这个页面没有配置加油墙。",
        bad_secret: "口令不对。"
      };
      if (table[error]) return table[error];
      if (String(error || "").indexOf("http-") === 0) return "服务器返回 " + error.slice(5) + "，稍后再试。";
      return "出了点问题，稍后再试。";
    }
  };
})();
