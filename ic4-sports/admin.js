/* 加油墙管理页（只有负责人用）
 *
 * 现在加油是「写完就上墙」，不需要审核，所以这里只干一件事：
 * 看墙上有什么、把不合适的那条下架。
 *
 * 默认口令：ic4-2026
 * 想换口令：把下面 SECRET_HASH 换成 sha256("ic4-cheer-admin|" + 新口令) 的结果。
 *   （在浏览器控制台或本机跑一次就能算，改完重新发布即可。）
 *
 * 口令不会进网址、不会进浏览器本地存储，关掉页面就没了。
 * 提醒：没有服务端把关，口令只能挡住随手点进来的人（「防君子」级别）。
 */
(function () {
  "use strict";

  const SECRET_HASH = "7a5e1a9b24f0e2ce267c18f5d077047e5ab284e553d01c85f481e7f14c84e5c0";
  const api = window.IC4_CHEER;
  const state = { unlocked: false, busy: false };

  const escapeHTML = (value) =>
    String(value == null ? "" : value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );

  const icon = (name) => `<i data-lucide="${name}"></i>`;

  function refreshIcons(root) {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({ root: root || document, attrs: { "stroke-width": 1.8 } });
    }
  }

  const listNode = () => document.getElementById("admin-list");
  const msgNode = () => document.getElementById("admin-msg");
  const statsNode = () => document.getElementById("admin-stats");

  function say(text, kind) {
    const node = msgNode();
    if (!node) return;
    node.textContent = text || "";
    node.className = "admin-msg" + (kind ? " is-" + kind : "");
  }

  function formatTime(stamp) {
    if (!stamp) return "";
    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return (
      pad(date.getMonth() + 1) +
      "-" +
      pad(date.getDate()) +
      " " +
      pad(date.getHours()) +
      ":" +
      pad(date.getMinutes())
    );
  }

  async function hashSecret(secret) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error("no-crypto");
    }
    const bytes = new TextEncoder().encode("ic4-cheer-admin|" + secret);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function liveHTML(item) {
    return `
      <article class="admin-row" data-id="${escapeHTML(item.id)}">
        <div class="admin-row-head">
          <span>${escapeHTML(item.target || "ALL")} · ${escapeHTML(formatTime(item.at))}</span>
          <span class="badge green">在墙上</span>
        </div>
        <p class="admin-row-body">${escapeHTML(item.body || "")}</p>
        <div class="admin-actions">
          <button class="secondary-button" type="button" data-action="admin-unpublish" data-id="${escapeHTML(item.id)}">${icon("trash-2")} 下架</button>
        </div>
      </article>
    `;
  }

  function render(live) {
    const node = listNode();
    const stats = statsNode();
    if (stats) stats.textContent = "墙上现在有 " + live.length + " 条";
    if (!node) return;
    node.innerHTML = live.length
      ? live.map(liveHTML).join("")
      : `<p class="empty-state">墙上还是空的。同学写完就立刻出现在这里。</p>`;
    refreshIcons(node);
  }

  async function load() {
    if (state.busy) return;
    const input = document.getElementById("admin-secret");
    const secret = (input && input.value ? input.value : "").trim();
    if (!secret) return say("先输入口令。", "error");
    if (!api || !api.ready()) return say("这个页面没有配置好（config.js 缺失）。", "error");

    state.busy = true;
    say("正在读取…");
    let digest = "";
    try {
      digest = await hashSecret(secret);
    } catch (error) {
      state.busy = false;
      return say("这个页面要用网址（https）打开才能对口令，别用本地文件打开。", "error");
    }
    if (digest !== SECRET_HASH) {
      state.busy = false;
      state.unlocked = false;
      return say("口令不对。", "error");
    }

    const result = await api.list(300);
    state.busy = false;
    if (!result.ok) return say(api.explain(result.error), "error");
    state.unlocked = true;
    say("读取成功。", "ok");
    render(result.items || []);
  }

  async function act(id) {
    if (state.busy || !id) return;
    if (!state.unlocked) return say("先输入口令并点「看一下墙」。", "error");
    state.busy = true;
    const result = await api.discard(id);
    state.busy = false;
    if (!result.ok) return say(api.explain(result.error), "error");
    say("已下架，同学刷新页面就看不到这条了。", "ok");
    await load();
  }

  document.addEventListener("click", (event) => {
    const node = event.target.closest("[data-action]");
    if (!node) return;
    const action = node.dataset.action;
    if (action === "admin-load") load();
    else if (action === "admin-unpublish") act(node.dataset.id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target && event.target.id === "admin-secret") load();
  });

  const boot = () => refreshIcons(document);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
