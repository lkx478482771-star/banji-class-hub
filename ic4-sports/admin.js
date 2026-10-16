/* 加油墙审核页（只有负责人用）
 *
 * 流程：输入口令 → ic4_cheer_review(action:"list") 拿待审 → 点「通过」或「删除」。
 * 口令不会存在任何地方（内存里用完即弃），也不会写进网址或本地存储。
 */
(function () {
  "use strict";

  const api = window.IC4_CHEER;
  const state = { secret: "", busy: false };

  const escapeHTML = (value) =>
    String(value == null ? "" : value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );

  const icon = (name) => `<i data-lucide="${name}"></i>`;

  function refreshIcons(root) {
    if (window.lucide && window.lucide.createIcons) {
      window.lucide.createIcons({ root: root || document, attrs: { "stroke-width": 1.9 } });
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

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function rowHTML(item) {
    return `
      <article class="admin-row" data-id="${escapeHTML(item.id)}">
        <div class="admin-row-head">
          <span>${escapeHTML(item.target || "ALL")} · ${escapeHTML(formatTime(item.created_at))}</span>
          <span>${escapeHTML(String(item.id || "").slice(0, 8))}</span>
        </div>
        <p class="admin-row-body">${escapeHTML(item.body || "")}</p>
        <div class="admin-actions">
          <button class="primary-button" type="button" data-action="admin-approve" data-id="${escapeHTML(item.id)}">${icon("check")} 通过</button>
          <button class="secondary-button" type="button" data-action="admin-delete" data-id="${escapeHTML(item.id)}">${icon("trash-2")} 删掉</button>
        </div>
      </article>
    `;
  }

  function render(pending, pendingCount, approvedCount) {
    const node = listNode();
    const stats = statsNode();
    if (stats) {
      stats.textContent = "待审核 " + (pendingCount == null ? pending.length : pendingCount) + " 条 · 已上墙 " + (approvedCount == null ? "-" : approvedCount) + " 条";
    }
    if (!node) return;
    node.innerHTML = pending.length
      ? pending.map(rowHTML).join("")
      : `<p class="empty-state">现在没有待审的留言。同学发的新留言会出现在这里。</p>`;
    refreshIcons(node);
  }

  async function load() {
    if (state.busy) return;
    const input = document.getElementById("admin-secret");
    const secret = (input && input.value ? input.value : state.secret || "").trim();
    if (!secret) return say("先输入审核口令。", "error");
    if (!api || !api.ready()) return say("这个页面没有配置好（config.js 缺失）。", "error");

    state.busy = true;
    say("正在读取…");
    const result = await api.review(secret, "list");
    state.busy = false;
    if (!result.ok) return say(api.explain(result.error), "error");
    state.secret = secret;
    const data = result.data || {};
    say("读取成功。", "ok");
    render(Array.isArray(data.pending) ? data.pending : [], data.pendingCount, data.approvedCount);
  }

  async function act(action, id) {
    if (state.busy || !id) return;
    if (!state.secret) return say("口令已过期，请重新输入口令再点「查看待审」。", "error");
    state.busy = true;
    const result = await api.review(state.secret, action, id);
    state.busy = false;
    if (!result.ok) return say(api.explain(result.error), "error");
    say(action === "approve" ? "已通过，同学刷新页面就能看到。" : "已删除。", "ok");
    await load();
  }

  document.addEventListener("click", (event) => {
    const node = event.target.closest("[data-action]");
    if (!node) return;
    const action = node.dataset.action;
    if (action === "admin-load") load();
    else if (action === "admin-approve") act("approve", node.dataset.id);
    else if (action === "admin-delete") act("delete", node.dataset.id);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target && event.target.id === "admin-secret") load();
  });

  const boot = () => {
    refreshIcons(document);
    const params = new URLSearchParams(window.location.search);
    if (params.get("auto") === "1") load();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
