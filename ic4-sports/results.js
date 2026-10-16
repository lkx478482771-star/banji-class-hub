/* 成绩收集的界面逻辑
 *
 * 页面上的表格是生成时就写死在 HTML 里的（谁参加哪个项目），
 * 这里只做三件事：把已经填过的读回来、改了就存一条新的、把最新的一条显示出来。
 *
 * 规则（和页面上写的一样）：
 *   · 谁的项目比完，就在那一行填「成绩」和「名次」，至少填一个；
 *   · 填完自动保存（离开这一格就存），不用点按钮；
 *   · 同一个格子谁都能改，显示的是最新填的那条，改动次数会标出来。
 *
 * 只在同学切到「成绩收集」这个模块时才去读数据（名单页不因此变慢）。
 */
(function () {
  "use strict";

  const root = document.getElementById("results");
  if (!root) return;

  const api = window.IC4_RESULTS;
  const listEl = document.getElementById("rs-list");
  const statEl = document.getElementById("rs-stat");
  const qEl = document.getElementById("rs-q");
  const unfilledEl = document.getElementById("rs-unfilled");
  const refreshEl = document.getElementById("rs-refresh");
  const rows = [].slice.call(root.querySelectorAll(".rs-row"));
  const cards = [].slice.call(root.querySelectorAll(".rs-ev"));
  const cells = {};

  const state = {
    shown: false,
    loaded: false,
    loading: false,
    items: [],
    timer: 0,
    lastAt: 0,
    filled: 0,
    newest: 0
  };

  const KEY = (name, event) => name + "\u0001" + event;

  function clockOf(ms) {
    const d = new Date(ms);
    const pad = (n) => String(n).padStart(2, "0");
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
    const hm = pad(d.getHours()) + ":" + pad(d.getMinutes());
    return sameDay ? hm : d.getMonth() + 1 + "月" + d.getDate() + "日 " + hm;
  }

  function say(node, text, kind) {
    node.textContent = text || "";
    node.className = "rs-state" + (kind ? " rs-" + kind : "");
  }

  rows.forEach((el) => {
    const name = el.getAttribute("data-name") || "";
    const event = el.getAttribute("data-event") || "";
    el.__key = KEY(name, event);
    el.__name = name;
    el.__event = event;
    el.__mates = el.getAttribute("data-mates") || "";
    el.__res = el.querySelector(".rs-result");
    el.__rank = el.querySelector(".rs-rank");
    el.__state = el.querySelector(".rs-state");
    el.__dirty = false;
    el.__saving = false;
    el.__count = 0;
    cells[el.__key] = el;

    [el.__res, el.__rank].forEach((input) => {
      if (!input) return;
      input.addEventListener("input", () => {
        el.__dirty = true;
        say(el.__state, "还没保存…", "warn");
      });
      input.addEventListener("blur", () => save(el));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          input.blur();
          focusNext(input);
        }
      });
    });
  });

  // 手机上一个人常连着填好几格：回车 = 先存这一格，再把手指送到下一格。
  // 只跳「看得见」的输入框——被搜索或「只看还没填」藏起来的格子不该抢焦点。
  function focusNext(from) {
    const all = [].slice
      .call(root.querySelectorAll(".rs-row input"))
      .filter((el) => el.offsetParent !== null);
    const i = all.indexOf(from);
    if (i < 0) return;
    const next = all[i + 1];
    if (!next) return;
    next.focus();
    try {
      next.setSelectionRange(next.value.length, next.value.length);
    } catch (err) {
      /* 个别 input 类型不支持 setSelectionRange，忽略即可 */
    }
  }

  function latestMap(items) {
    const map = {};
    (items || []).forEach((item) => {
      const key = KEY(item.name, item.event);
      const cur = map[key];
      if (!cur) {
        map[key] = { item: item, count: 1 };
        return;
      }
      cur.count += 1;
      if ((item.at || 0) >= (cur.item.at || 0)) cur.item = item;
    });
    return map;
  }

  function paint(map, force) {
    let filled = 0;
    let newest = 0;
    rows.forEach((el) => {
      const hit = map[el.__key];
      const item = hit ? hit.item : null;
      el.__count = hit ? hit.count : 0;
      const hasValue = Boolean(item && (item.result || item.rank));
      if (hasValue) filled += 1;
      if (item && item.at > newest) newest = item.at;
      const editing =
        document.activeElement === el.__res || document.activeElement === el.__rank || el.__dirty || el.__saving;
      if (!editing || force) {
        if (el.__res) el.__res.value = item ? item.result : "";
        if (el.__rank) el.__rank.value = item ? item.rank : "";
        el.__dirty = false;
      }
      if (!el.__saving) {
        if (!hasValue) say(el.__state, "还没填", "warn");
        else say(el.__state, "更新于 " + clockOf(item.at) + (hit.count > 1 ? " · 改过 " + hit.count + " 次" : ""), "ok");
      }
      el.setAttribute("data-filled", hasValue ? "1" : "0");
    });
    state.lastAt = newest;
    state.filled = filled;
    state.newest = newest;
    applyFilter();
  }

  // 状态行：没筛选时报总账；筛了之后把「现在显示几格」也说清楚，
  // 不然行被藏起来的时候看不出是筛选生效了还是没反应。
  function updateStat(shown) {
    if (!statEl) return;
    const kw = (qEl && qEl.value.trim()) || "";
    const onlyEmpty = Boolean(unfilledEl && unfilledEl.checked);
    let text =
      "已填 " + state.filled + " / 共 " + rows.length + " 格" +
      (state.newest ? " · 最近更新 " + clockOf(state.newest) : "");
    if (kw || onlyEmpty) {
      if (shown === 0) {
        text = kw ? "没找到「" + kw + "」，换个名字或项目试试" : "都填完了，没有还没填的";
      } else {
        text += " · 现在显示 " + shown + " 格";
      }
    }
    statEl.textContent = text;
  }

  function applyFilter() {
    const kw = (qEl && qEl.value.trim()) || "";
    const onlyEmpty = Boolean(unfilledEl && unfilledEl.checked);
    let shown = 0;
    let shownEmpty = 0;
    rows.forEach((el) => {
      const slot = el.getAttribute("data-slot") || "";
      const okName =
        !kw ||
        el.__name.indexOf(kw) >= 0 ||
        el.__event.indexOf(kw) >= 0 ||
        el.__mates.indexOf(kw) >= 0 ||
        slot.indexOf(kw) >= 0;
      const okFill = !onlyEmpty || el.getAttribute("data-filled") !== "1";
      const ok = okName && okFill;
      el.hidden = !ok;
      if (ok) {
        shown += 1;
        if (el.getAttribute("data-filled") !== "1") shownEmpty += 1;
      }
    });
    // 一张项目卡：只要里面还有一行是显示的就留着，全被筛掉了才收起来
    cards.forEach((card) => {
      const any = [].slice.call(card.querySelectorAll(".rs-row")).some((el) => !el.hidden);
      card.hidden = !any;
    });
    // 「上午」「下午」这种半日小标题：它下面一张卡都不剩了就一起收起来
    [].slice.call(root.querySelectorAll(".rs-half")).forEach((h) => {
      let n = h.nextElementSibling;
      let any = false;
      while (n && n.classList && n.classList.contains("rs-ev")) {
        if (!n.hidden) any = true;
        n = n.nextElementSibling;
      }
      h.hidden = !any;
    });
    if (listEl) {
      listEl.setAttribute("data-shown", String(shown));
      listEl.setAttribute("data-shown-empty", String(shownEmpty));
    }
    updateStat(shown);
  }

  async function save(el) {
    if (!api || !api.ready()) {
      say(el.__state, "成绩单还没连上，刷新页面试试", "bad");
      return;
    }
    const result = (el.__res && el.__res.value.trim()) || "";
    const rank = (el.__rank && el.__rank.value.trim()) || "";
    const same = result === (el.__savedResult || "") && rank === (el.__savedRank || "");
    if (!el.__dirty && same) return;
    if (!result && !rank) {
      el.__dirty = false;
      say(el.__state, "成绩和名次至少填一个", "bad");
      return;
    }
    el.__saving = true;
    say(el.__state, "保存中…", "warn");
    const out = await api.submit({
      ekey: el.getAttribute("data-ekey"),
      nkey: el.getAttribute("data-nkey"),
      name: el.__name,
      event: el.__event,
      slot: el.getAttribute("data-slot"),
      result: result,
      rank: rank
    });
    el.__saving = false;
    if (!out || !out.ok) {
      say(el.__state, (api.explain && api.explain(out && out.error)) || "没存上，再试一次", "bad");
      return;
    }
    el.__dirty = false;
    el.__savedResult = result;
    el.__savedRank = rank;
    el.__count += 1;
    el.setAttribute("data-filled", result || rank ? "1" : "0");
    say(el.__state, "已保存 " + clockOf(Date.parse(out.at) || Date.now()), "ok");
    state.items.push({
      id: out.path,
      name: el.__name,
      event: el.__event,
      slot: el.getAttribute("data-slot") || "",
      result: result,
      rank: rank,
      at: Date.parse(out.at) || Date.now()
    });
    const map = latestMap(state.items);
    let filled = 0;
    let newest = 0;
    rows.forEach((row) => {
      const hit = map[row.__key];
      const item = hit ? hit.item : null;
      if (item && (item.result || item.rank)) filled += 1;
      if (item && item.at > newest) newest = item.at;
    });
    state.filled = filled;
    state.newest = newest;
    // 刚填完这一格可能正好被「只看还没填的」筛掉，交给 applyFilter 重新算一遍并刷新状态行
    applyFilter();
  }

  async function load() {
    if (!api) {
      if (statEl) statEl.textContent = "成绩单没加载出来，刷新页面试试";
      return;
    }
    if (!api.ready()) {
      if (statEl) statEl.textContent = "这个页面还没有配置成绩单";
      return;
    }
    if (state.loading) return;
    state.loading = true;
    if (statEl && !state.loaded) statEl.textContent = "正在读取…";
    const out = await api.list(1000);
    state.loading = false;
    if (!out || !out.ok) {
      if (statEl) statEl.textContent = (api.explain && api.explain(out && out.error)) || "读不到成绩，过会儿再试";
      return;
    }
    state.items = out.items || [];
    state.loaded = true;
    paint(latestMap(state.items), false);
  }

  function schedule() {
    if (state.timer) window.clearInterval(state.timer);
    state.timer = window.setInterval(() => {
      if (state.shown) load();
    }, 60000);
  }

  if (qEl) qEl.addEventListener("input", applyFilter);
  if (unfilledEl) unfilledEl.addEventListener("change", applyFilter);
  if (refreshEl) {
    refreshEl.addEventListener("click", () => {
      load();
    });
  }
  document.addEventListener("visibilitychange", () => {
    if (state.shown && !document.hidden) load();
  });
  schedule();

  // 给页面上的模块切换器用：切到成绩这一格时才第一次去读数据。
  window.IC4_RESULTS_UI = {
    show() {
      state.shown = true;
      load();
    },
    hide() {
      state.shown = false;
    }
  };

  // 兜底：打开页面时就已经停在成绩这一格（比如 #results 直达），立刻读一次。
  // 模块切换器的初始化脚本跑在 results.js 之前，那一次调用还看不到上面这个入口，
  // 不兜底的话页面会一直停在「正在读取…」。
  if (document.querySelector(".standalone-shell.mod-results")) {
    state.shown = true;
    load();
  }
})();
