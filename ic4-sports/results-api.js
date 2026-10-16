/* 成绩收集的后端接口
 *
 * 和加油墙一样：**没有登录、没有审核**，同学打开页面就能填，填完大家立刻能看到。
 * 数据放在同一个数据库里，但属于又一个独立分区（旧站的代码根本不认识它）：
 *   banji-ic4-results-live     一条成绩就是这儿的一行
 *
 * 为什么「一条成绩 = 一行、改一次就多一行」而不是盖掉原来那行：
 *   1) 现场填错很正常，改一次留一条，历史还在，不会被覆盖丢失；
 *   2) 页面上显示的是「同一个格子（谁 + 哪个项目）里最新的一条」，
 *      所以看到的效果和「直接改」一模一样；
 *   3) 万一手滑填错，重新填一遍就是最新，不需要「撤销」按钮。
 *
 * 主键（path）长得像：r-<项目代号>-<同学代号>-<时间戳随机>
 *   项目代号/同学代号由页面生成时写死在 HTML 里（见 tmp/zhixuce/build_embed.py），
 *   这里只负责校验形状，别让外面的字符塞进 URL。
 *
 * 代价同样说清楚：没有服务端把关，谁都能往这个分区写、也能删（「防君子」级别）。
 * 想加固就跑可选的 supabase/ic4-cheers.sql（把读写收进服务端函数里）。
 */
(function () {
  "use strict";

  const CLOUD = window.IC4_CLOUD || {};
  const TIMEOUT_READ = 18000;
  const TIMEOUT_WRITE = 22000;
  const ATTEMPTS = 3;
  const TABLE = "/rest/v1/class_hub_entries";
  const NS = {
    live: "banji-ic4-results-live"
  };
  const TEXT_MAX = 40;
  const PATH_OK = /^r-[a-z0-9]{2,12}-[a-z0-9]{1,8}-[a-z0-9]{1,12}$/;

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

  // 手机网络抖是常态：读不到就自己重试几次，别让同学一眼看到「连不上」。
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

  function listUrl(limit) {
    return (
      base() +
      TABLE +
      "?namespace=eq." +
      encodeURIComponent(NS.live) +
      "&select=path,value,updated_at&order=updated_at.desc&limit=" +
      Math.max(1, Math.min(1000, Number(limit) || 500))
    );
  }

  function pickRows(result) {
    if (!result.ok) return result;
    const rows = Array.isArray(result.data) ? result.data : [];
    const items = rows
      .map((row) => {
        const value = (row && row.value) || {};
        const name = typeof value.name === "string" ? value.name.trim() : "";
        const event = typeof value.event === "string" ? value.event.trim() : "";
        if (!name || !event) return null;
        return {
          id: String((row && row.path) || ""),
          name: name,
          event: event,
          slot: String(value.slot || ""),
          result: String(value.result || "").trim(),
          rank: String(value.rank || "").trim(),
          at: value.at ? Date.parse(value.at) || 0 : Date.parse((row && row.updated_at) || "") || 0
        };
      })
      .filter(Boolean);
    return { ok: true, items: items };
  }

  function clean(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, TEXT_MAX);
  }

  window.IC4_RESULTS = {
    namespaces: NS,

    ready: () => Boolean(CLOUD.url && CLOUD.anonKey),

    /** 已经填过的成绩（公开可读）。读不到会自动重试几次。 */
    list(limit) {
      return withRetry(() => call("GET", listUrl(limit), undefined, undefined, TIMEOUT_READ).then(pickRows));
    },

    /** 填一条成绩：每次都新增一行（见文件头解释），页面上按「最新那条」显示。
     *  cell = { ekey, nkey, name, event, slot, result, rank } */
    submit(cell) {
      const src = cell || {};
      const name = clean(src.name);
      const event = clean(src.event);
      const result = clean(src.result);
      const rank = clean(src.rank);
      const ekey = String(src.ekey || "").toLowerCase();
      const nkey = String(src.nkey || "").toLowerCase();
      if (!name || !event) return Promise.resolve({ ok: false, error: "bad-cell" });
      if (!result && !rank) return Promise.resolve({ ok: false, error: "empty" });
      const at = new Date().toISOString();
      const path =
        "r-" +
        ekey +
        "-" +
        nkey +
        "-" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 4);
      if (!PATH_OK.test(path)) return Promise.resolve({ ok: false, error: "bad-path", path: path, at: at });
      // 写也重试，而且**重试用的是同一个 path**：on_conflict=namespace,path 加
      // merge-duplicates 让重复写变成幂等操作——哪怕第一次其实写成功了、只是回包在路上丢了，
      // 也只会是同一行，不会多出一条。运动场信号抖的时候靠这个把成绩送出去。
      return withRetry(() =>
        call(
          "POST",
          base() + TABLE + "?on_conflict=namespace,path",
          [
            {
              namespace: NS.live,
              path: path,
              value: {
                v: 1,
                name: name,
                event: event,
                slot: String(src.slot || ""),
                result: result,
                rank: rank,
                at: at
              }
            }
          ],
          { Prefer: "resolution=merge-duplicates,return=minimal" },
          TIMEOUT_WRITE
        )
      ).then((out) => (out.ok ? { ok: true, path: path, at: at } : Object.assign({}, out, { path: path, at: at })));
    },

    /** 把接口返回的错误码翻译成给同学看的话。 */
    explain(error) {
      const table = {
        empty: "成绩和名次至少填一个再保存。",
        "bad-cell": "这一行没对上同学或项目，刷新一下再试。",
        "bad-path": "这条存不进去，刷新一下再试。",
        rejected: "服务器把这条退回来了，刷新一下再试。",
        denied: "这个网络发不出去，换个网试试。",
        "not-ready": "成绩单还没开通（负责人正在配置）。",
        offline: "网络没连上，内容还留着——等有信号了点一下这一格就会重存。",
        timeout: "网络有点慢，还没发出去——内容还留着，过会儿点一下这一格就行。",
        "no-cloud": "这个页面没有配置成绩单。"
      };
      if (table[error]) return table[error];
      if (String(error || "").indexOf("http-") === 0) return "服务器返回 " + error.slice(5) + "，稍后再试。";
      return "出了点问题，稍后再试。";
    }
  };
})();
