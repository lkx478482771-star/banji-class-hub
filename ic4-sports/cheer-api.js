/* 加油墙的后端接口
 *
 * 这里**没有登录、也没有审核**：同学打开页面就能写，写完立刻上墙。
 * 数据放在旧站同一个数据库里，但属于一个独立分区（旧站的代码根本不认识它）：
 *   banji-ic4-cheer-live     写完就在这儿，页面上立刻能看到
 *
 * 公开页只做两件事：往 live 写一条、从 live 读回来。
 * 「下架某一条」只有 admin.html 用（事后删帖），而且要过口令。
 *
 * 唯一的例外是**完全重复的留言**：每次读回来的时候顺手把一模一样的话清掉
 * （同一个对象、同一段文字，只留最早的那条），免得有人连点几下刷屏。
 * 规则写死在下面的 pruneDuplicates() 里：只删「同对象 + 同文本」的重复项，
 * 不会碰任何一条措辞不同的留言。
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
  let lastPruneAt = 0;
  let cachedDev = "";

  // 这台设备的编号：只存在浏览器本地，用来数「这位同学我已经加过几次油」。
  // 不是账号、不收集个人信息；清掉浏览器数据或换台设备就重新算
  // （用来防刷屏够了，不防存心作弊的人）。
  const DEV_KEY = "ic4-cheer-dev-v1";
  const DEV_OK = /^d-[a-z0-9]{4,20}$/;

  function deviceId() {
    if (cachedDev) return cachedDev;
    let saved = "";
    try {
      saved = window.localStorage.getItem(DEV_KEY) || "";
    } catch (error) {
      saved = "";
    }
    if (DEV_OK.test(saved)) {
      cachedDev = saved;
      return cachedDev;
    }
    const made = "d-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    try {
      window.localStorage.setItem(DEV_KEY, made);
    } catch (error) {
      /* 无痕模式等禁用存储时忽略：这一次页面打开期间仍然算得对 */
    }
    cachedDev = made;
    return cachedDev;
  }

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
          // 写这句话的设备编号（老数据没有这个字段，就是空字符串）。
          dev: String(value.dev || ""),
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

  // 只接受我们自己生成的 path 形状，别让外面的东西往 URL 里塞字符。
  const PATH_OK = /^c-[a-z0-9]+-[a-z0-9]{1,10}$/;
  const AT_OK = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/;

  /* ---------------- 重复留言自动清理 ----------------
   * 判重只看两件事：送给谁（target）+ 文字本身（去空白、忽略大小写）。
   * 同一组只留最早的一条，其余删掉；措辞不同的留言一律不动。
   * 限流两条：每次读回来最多删 30 条、两次清理之间至少隔 20 秒
   * （页面开着一整天也不会反复打网络）。
   */
  const PRUNE_MAX = 30;
  const PRUNE_GAP = 20000;

  function normText(text) {
    return String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function duplicateIds(items) {
    const groups = new Map();
    (items || []).forEach((item) => {
      const key = item.target + "\u0001" + normText(item.body);
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    });
    const drop = [];
    groups.forEach((list) => {
      if (list.length < 2) return;
      // items 是「新的在前」；留下时间最早的那条（时间缺失时按它在列表里的先后判断）。
      const keep = list.reduce((a, b) => ((a.at || 0) <= (b.at || 0) ? a : b));
      list.forEach((item) => {
        if (item !== keep) drop.push(item);
      });
    });
    return drop.slice(0, PRUNE_MAX);
  }

  async function pruneDuplicates(items) {
    const drop = duplicateIds(items);
    const gone = [];
    for (let i = 0; i < drop.length; i++) {
      // 删不掉（权限/网络）就不删，当次照常显示：清理失败绝不影响读留言。
      const result = await delRow(NS.live, drop[i].id);
      if (result.ok) gone.push(drop[i].id);
    }
    return gone;
  }

  function pruneOnce(result) {
    if (!result.ok || result.items.length < 2) return Promise.resolve(result);
    const now = Date.now();
    if (now - lastPruneAt < PRUNE_GAP) return Promise.resolve(result);
    lastPruneAt = now;
    return pruneDuplicates(result.items).then((gone) => {
      if (!gone.length) return result;
      const dropped = {};
      gone.forEach((id) => {
        dropped[id] = true;
      });
      return {
        ok: true,
        items: result.items.filter((item) => !dropped[item.id]),
        pruned: gone.length
      };
    });
  }

  window.IC4_CHEER = {
    namespaces: NS,

    ready: () => Boolean(CLOUD.url && CLOUD.anonKey),

    /** 这台设备的编号（见上面 deviceId()）：页面上「你已经加过几次油」就按它数。 */
    deviceId: deviceId,

    /** 提交一句加油：直接进「已上墙」分区，不用审核，写完大家就能看到。
     *  options.force = true 时跳过「10 秒一条」的本机节流（本机队列重传时用）。
     *  options.path / options.at = 重传时复用原来的主键与时间：
     *    万一上一次请求其实写成功、只是回复丢了，重传会覆盖同一条，而不是又贴一条。
     *  返回失败时带上 path/at，调用方可以直接把它们存进本机队列。 */
    submit(target, body, options) {
      const text = String(body || "").trim();
      const who = String(target || "ALL").trim() || "ALL";
      const opts = options || {};
      const path = PATH_OK.test(String(opts.path || "")) ? String(opts.path) : newPath();
      const at = AT_OK.test(String(opts.at || "")) ? String(opts.at) : new Date().toISOString();
      if (text.length < TEXT_MIN || text.length > TEXT_MAX) {
        return Promise.resolve({ ok: false, error: "length", path: path, at: at });
      }
      if (!TARGET_OK.test(who)) return Promise.resolve({ ok: false, error: "target", path: path, at: at });
      if (!opts.force && Date.now() - lastSubmitAt < 10000) {
        return Promise.resolve({ ok: false, error: "too_fast", path: path, at: at });
      }
      lastSubmitAt = Date.now();
      return call(
        "POST",
        base() + TABLE + "?on_conflict=namespace,path",
        [{ namespace: NS.live, path: path, value: { v: 1, target: who, text: text, at: at, dev: deviceId() } }],
        { Prefer: "resolution=merge-duplicates,return=minimal" },
        TIMEOUT_WRITE
      ).then((result) => (result.ok ? result : Object.assign({}, result, { path: path, at: at })));
    },

    /** 已经上墙的加油（公开可读）。读不到会自动重试几次。
     *  读成功时顺手清掉完全重复的留言，返回值里 pruned = 这次清掉了几条。 */
    list(limit) {
      return withRetry(() =>
        call("GET", listUrl(NS.live, limit), undefined, undefined, TIMEOUT_READ).then(pickRows).then(pruneOnce)
      );
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
        duplicate: "这句话墙上已经有了，换一句吧。",
        limited: "同一位同学最多只能加 2 次油，把机会留给别人吧。",
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
