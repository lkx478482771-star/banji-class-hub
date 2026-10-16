/* 集成电路 4 班 · 运动会出战名单（独立只读页）
 *
 * 这份脚本由 ic4-sports/app.js 维护，是班集「IC-4 运动会」栏目的精简复刻：
 *   有：晶圆图点人、出战参数面板、径赛/田赛筛选、开赛倒计时、一键通电
 *   没有：登录、账号、云端读写、照片上传、成绩录入、加油墙、海报、背景音乐
 * 交互逻辑与排版参数跟旧站保持一致，方便两边看起来是同一个班的东西。
 */
(function () {
  "use strict";

  const MEET = window.IC4_MEET || {};
  const ATHLETES = Array.isArray(window.IC4_ROSTER) ? window.IC4_ROSTER : [];
  const FILTERS = [
    ["all", "全部"],
    ["track", "径赛"],
    ["field", "田赛"]
  ];
  const KIND_COLORS = { track: "#38bdf8", field: "#fb923c", both: "#a78bfa" };

  const ui = { selected: 0, lit: false, filter: "all", timer: 0, onResize: null };

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

  const athleteId = (index) => "IC4-" + String(index + 1).padStart(3, "0");
  const eventText = (athlete) => athlete.events.join(" / ");
  const rosterText = (athlete) =>
    athlete.events.length > 1 ? athlete.events[0] + " 等 " + athlete.events.length + " 项" : athlete.events[0];
  const trackField = (event) => (/跳|铅球|实心球|标枪|铁饼/.test(event) ? "field" : "track");
  const allEvents = ATHLETES.flatMap((athlete) => athlete.events);
  const pickAthletes = () =>
    ATHLETES.map((athlete, index) => ({ athlete, index })).filter(
      (item) =>
        ui.filter === "all" || item.athlete.events.some((event) => trackField(event) === ui.filter)
    );

  /* ---------------- 晶圆排版：与旧站逐行一致 ---------------- */

  // 在直径 1 的圆里铺一层六方网格（间距 = step），返回所有落在圆内的格子中心。
  function waferPoints(step) {
    const radius = 0.5;
    const points = [];
    const rows = Math.max(1, Math.floor((2 * radius) / step));
    const startY = -((rows - 1) * step) / 2;

    for (let row = 0; row < rows; row += 1) {
      const y = startY + row * step;
      const half = Math.sqrt(Math.max(0, radius * radius - y * y));
      const cols = Math.max(1, Math.floor((2 * half) / step) + 1);
      const startX = -((cols - 1) * step) / 2;
      for (let col = 0; col < cols; col += 1) {
        const x = startX + col * step;
        const distance = Math.hypot(x, y);
        if (distance <= radius) points.push({ x, y, distance });
      }
    }

    return points;
  }

  // 二分找出「刚好装得下 count 颗、且间距最大」的步长，再居中、放大到贴住圆边。
  function waferLayout(count) {
    const total = Math.max(1, count);
    const radius = 0.5;
    let tooSmall = 0.005;
    let tooBig = 1;

    for (let i = 0; i < 48; i += 1) {
      const mid = (tooSmall + tooBig) / 2;
      if (waferPoints(mid).length >= total) tooSmall = mid;
      else tooBig = mid;
    }

    const step = tooSmall;
    const points = waferPoints(step);
    points.sort((a, b) => a.distance - b.distance);
    const picked = points.slice(0, total);
    if (!picked.length) return { points: [], spacing: step };

    let centerX = 0;
    let centerY = 0;
    picked.forEach((point) => {
      centerX += point.x;
      centerY += point.y;
    });
    centerX /= picked.length;
    centerY /= picked.length;
    picked.forEach((point) => {
      point.x -= centerX;
      point.y -= centerY;
    });

    const used = Math.max(
      0.000001,
      picked.reduce((max, point) => Math.max(max, Math.hypot(point.x, point.y)), 0)
    );

    const maxDie = 0.3;
    const inner = radius - 0.03;
    let scale = Math.min((radius * 0.98) / used, 2.2);
    for (let i = 0; i < 24; i += 1) {
      const die = Math.min(step * scale * 0.82, maxDie);
      const extent = used * scale + die / 2;
      if (extent <= inner) break;
      scale *= inner / extent;
    }

    picked.forEach((point) => {
      point.x *= scale;
      point.y *= scale;
    });

    return { points: picked, spacing: step * scale };
  }

  /* ---------------- 片段渲染 ---------------- */

  function panelHTML(index) {
    const total = ATHLETES.length;
    if (!total) return `<div class="panel-body"><p>名单还没有数据。</p></div>`;
    const current = ((index % total) + total) % total;
    const athlete = ATHLETES[current];
    const specs = [
      ["EVENT", eventText(athlete)],
      ["GROUP", athlete.group],
      ["ENTRIES", athlete.events.length + " 项"],
      ["POWER SUPPLY", MEET.supply || ""],
      ["STATUS", ui.lit ? MEET.status || "已通电 / READY" : "待机 / STANDBY"]
    ];

    return `
      <header class="panel-header">
        <div>
          <h3>${athleteId(current)}</h3>
          <p>DATASHEET / Rev.1.0</p>
        </div>
        <span class="badge ${ui.lit ? "green" : "yellow"}">${ui.lit ? "已通电" : "待机"}</span>
      </header>
      <div class="panel-body sports-datasheet">
        <h4 class="sports-name">${escapeHTML(athlete.name)}</h4>
        <p class="sports-event">${escapeHTML(eventText(athlete))}</p>
        <dl class="sports-specs">
          ${specs
            .map(
              (item) => `
              <div class="sports-spec">
                <dt>${escapeHTML(item[0])}</dt>
                <dd>${escapeHTML(item[1])}</dd>
              </div>`
            )
            .join("")}
        </dl>
        <p class="sports-cheer">${escapeHTML(athlete.cheer || "信号满格，等你冲线。")}</p>
      </div>
    `;
  }

  function chipsHTML() {
    return FILTERS.map(
      ([key, label]) =>
        `<button class="sports-chip${ui.filter === key ? " is-active" : ""}" type="button" data-action="sports-filter" data-filter="${key}">${label}</button>`
    ).join("");
  }

  function rosterHTML() {
    const rows = pickAthletes().map(({ athlete, index }) => {
      const active = index === ui.selected;
      return `
        <button class="sports-roster-row${active ? " is-active" : ""}" type="button" data-action="sports-select" data-index="${index}">
          <span class="sports-roster-no">${String(index + 1).padStart(3, "0")}</span>
          <strong>${escapeHTML(athlete.name)}</strong>
          <span class="sports-roster-event">${escapeHTML(rosterText(athlete))}</span>
          <span class="sports-roster-pack">${escapeHTML(athlete.group || "")}</span>
        </button>
      `;
    });
    return rows.join("") || `<p class="sports-roster-empty">这一类暂时没有人报名。</p>`;
  }

  function view() {
    const total = ATHLETES.length;
    const layout = waferLayout(total);
    const sizePercent = Math.min(layout.spacing * 0.82 * 100, 30);
    const dice = ATHLETES.map((athlete, index) => {
      const point = layout.points[index];
      if (!point) return "";
      const length = athlete.name.length;
      const ratio = length >= 4 ? 0.17 : length === 3 ? 0.215 : 0.255;
      return `
        <button
          class="sports-die${index === ui.selected ? " is-active" : ""}"
          type="button"
          data-action="sports-select"
          data-index="${index}"
          style="left: ${(50 + point.x * 100).toFixed(3)}%; top: ${(50 + point.y * 100).toFixed(3)}%; width: ${sizePercent.toFixed(3)}%; --die-ratio: ${ratio}; --i: ${index}; --kind: ${KIND_COLORS[athlete.kind] || KIND_COLORS.track}"
          aria-label="${escapeHTML(athlete.name)} ${escapeHTML(eventText(athlete))}"
        >
          <span class="sports-die-name">${escapeHTML(athlete.name)}</span>
          <span class="sports-die-id">${athleteId(index)}</span>
        </button>
      `;
    }).join("");

    const trackCount = allEvents.filter((event) => trackField(event) === "track").length;
    const eventCount = new Set(allEvents.map((event) => event.replace(/^(男子|女子)\s?/, ""))).size;

    return `
      <div class="page-stack">
        <section class="sports-hero">
          <div class="sports-hero-main">
            <p class="sports-hero-eyebrow">安徽大学 · 集成电路学院</p>
            <h2>IC-4 <b>出战名单</b></h2>
            <p class="sports-hero-sub">${escapeHTML(MEET.dateLabel || "")} · 一片晶圆，全员通电</p>
            <p class="sports-hero-slogan">${escapeHTML(MEET.slogan || "")}</p>
          </div>
          <div class="sports-count">
            <span class="sports-count-label">距开赛</span>
            <div class="sports-count-nums" id="sports-countdown">--</div>
          </div>
        </section>

        <section class="metric-grid">
          <article class="metric">
            <span class="metric-icon green">${icon("users-round")}</span>
            <div><strong class="metric-value">${total}</strong><span class="metric-label">参赛选手</span></div>
          </article>
          <article class="metric">
            <span class="metric-icon blue">${icon("flag")}</span>
            <div><strong class="metric-value">${eventCount}</strong><span class="metric-label">比赛项目</span></div>
          </article>
          <article class="metric">
            <span class="metric-icon orange">${icon("gauge")}</span>
            <div><strong class="metric-value">${trackCount}</strong><span class="metric-label">径赛人次</span></div>
          </article>
          <article class="metric">
            <span class="metric-icon yellow">${icon("presentation")}</span>
            <div><strong class="metric-value">${allEvents.length - trackCount}</strong><span class="metric-label">田赛人次</span></div>
          </article>
        </section>

        <section class="content-grid">
          <div class="stack">
            <article class="panel sports-wafer-card">
              <header class="panel-header">
                <div>
                  <h3>IC-4 WAFER · LOT ${escapeHTML(String(MEET.meetTime || "").slice(0, 10))}</h3>
                  <p>点任意一颗芯片，看它的出战参数</p>
                </div>
                <span class="badge green">${total} 颗在测</span>
              </header>
              <div class="panel-body">
                <div class="sports-wafer-wrap">
                  <div class="sports-wafer" id="sports-wafer">
                    <div class="sports-wafer-grid" aria-hidden="true"></div>
                    <div class="sports-wafer-traces" aria-hidden="true"></div>
                    <div class="sports-wafer-sweep" aria-hidden="true"></div>
                    <div class="sports-wafer-ring" aria-hidden="true"></div>
                    ${dice}
                    <div class="sports-probe" aria-hidden="true"></div>
                  </div>
                </div>
                <div class="sports-legend">
                  <span class="sports-legend-item"><i></i>待机</span>
                  <span class="sports-legend-item is-lit"><i></i>已通电</span>
                  <span class="sports-legend-item is-active"><i></i>当前查看</span>
                  <span class="sports-legend-item is-track"><i></i>径赛</span>
                  <span class="sports-legend-item is-field"><i></i>田赛</span>
                </div>
                <div class="sports-wafer-actions">
                  <button class="primary-button" type="button" data-action="sports-power">${icon("gauge")} 一键通电</button>
                  <button class="secondary-button" type="button" data-action="sports-reset">复位</button>
                  <span class="sports-hint">${escapeHTML(MEET.slogan || "")}</span>
                </div>
              </div>
            </article>
          </div>

          <aside class="stack">
            <section class="panel" id="sports-panel">${panelHTML(ui.selected)}</section>
            <section class="panel">
              <header class="panel-header">
                <div>
                  <h3>出战名单</h3>
                  <p>共 ${total} 人，点一行看详情</p>
                </div>
              </header>
              <div class="panel-body" id="sports-roster-wrap">
                ${chipsHTML()}
                <div class="sports-roster" id="sports-roster">${rosterHTML()}</div>
              </div>
            </section>
          </aside>
        </section>
      </div>
    `;
  }

  /* ---------------- 交互 ---------------- */

  function selectAthlete(index) {
    const total = ATHLETES.length;
    if (!total) return;
    const next = (((Number(index) || 0) % total) + total) % total;
    ui.selected = next;

    document.querySelectorAll("#app .sports-die.is-active").forEach((node) => node.classList.remove("is-active"));
    document.querySelectorAll("#app .sports-roster-row.is-active").forEach((node) => node.classList.remove("is-active"));

    const die = document.querySelector(`#app .sports-die[data-index="${next}"]`);
    if (die) die.classList.add("is-active");
    const row = document.querySelector(`#app .sports-roster-row[data-index="${next}"]`);
    if (row && row.classList.contains("is-active") === false) row.classList.add("is-active");

    const panel = document.getElementById("sports-panel");
    if (panel) {
      panel.innerHTML = panelHTML(next);
      refreshIcons(panel);
    }
  }

  function renderRoster() {
    const wrap = document.getElementById("sports-roster-wrap");
    if (!wrap) return;
    wrap.innerHTML = chipsHTML() + `<div class="sports-roster" id="sports-roster">${rosterHTML()}</div>`;
  }

  function powerOn() {
    const wafer = document.getElementById("sports-wafer");
    if (!wafer) return;
    const waferRect = wafer.getBoundingClientRect();
    const centerX = waferRect.width / 2;
    const centerY = waferRect.height / 2;
    const dice = Array.from(wafer.querySelectorAll(".sports-die")).map((node) => {
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2 - waferRect.left;
      const y = rect.top + rect.height / 2 - waferRect.top;
      return { node, distance: Math.hypot(x - centerX, y - centerY) };
    });
    if (!dice.length) return;
    dice.sort((a, b) => a.distance - b.distance);

    ui.lit = true;
    dice.forEach((item, order) => {
      item.node.classList.remove("is-lit");
      window.setTimeout(() => {
        item.node.classList.add("is-lit");
        if (order === dice.length - 1) {
          const panel = document.getElementById("sports-panel");
          if (panel) {
            panel.innerHTML = panelHTML(ui.selected);
            refreshIcons(panel);
          }
        }
      }, 60 + order * 38);
    });
  }

  function resetPower() {
    ui.lit = false;
    document.querySelectorAll("#app .sports-die.is-lit").forEach((node) => node.classList.remove("is-lit"));
    const panel = document.getElementById("sports-panel");
    if (panel) {
      panel.innerHTML = panelHTML(ui.selected);
      refreshIcons(panel);
    }
  }

  function onClick(event) {
    const node = event.target.closest("[data-action]");
    if (!node) return;
    const action = node.dataset.action;
    if (action === "sports-select") selectAthlete(Number(node.dataset.index));
    else if (action === "sports-filter") {
      ui.filter = node.dataset.filter || "all";
      renderRoster();
    } else if (action === "sports-power") powerOn();
    else if (action === "sports-reset") resetPower();
  }

  /* ---------------- 倒计时与芯片自适应 ---------------- */

  function startCountdown() {
    if (ui.timer) window.clearInterval(ui.timer);
    const target = new Date(MEET.meetTime).getTime();
    const cell = (value, unit) => `<b>${String(value).padStart(2, "0")}</b><i>${unit}</i>`;

    const tick = () => {
      const node = document.getElementById("sports-countdown");
      if (!node) {
        if (ui.timer) window.clearInterval(ui.timer);
        ui.timer = 0;
        return;
      }
      const rest = target - Date.now();
      if (!Number.isFinite(rest) || rest <= 0) {
        node.innerHTML = "<b>GO</b><i>全员通电</i>";
        return;
      }
      const days = Math.floor(rest / 86400000);
      const hours = Math.floor((rest % 86400000) / 3600000);
      const minutes = Math.floor((rest % 3600000) / 60000);
      const seconds = Math.floor((rest % 60000) / 1000);
      node.innerHTML =
        days > 0
          ? cell(days, "天") + cell(hours, "时") + cell(minutes, "分")
          : cell(hours, "时") + cell(minutes, "分") + cell(seconds, "秒");
    };

    tick();
    ui.timer = window.setInterval(tick, 1000);
  }

  // 名字宽度随字体变化，逐个量一次：谁比芯片内宽还宽就缩谁，任何机型都不切字。
  function fitDieText() {
    const wafer = document.getElementById("sports-wafer");
    if (!wafer) return;
    const items = [];
    wafer.querySelectorAll(".sports-die").forEach((die) => {
      [".sports-die-name", ".sports-die-id"].forEach((selector) => {
        const node = die.querySelector(selector);
        if (!node) return;
        node.style.fontSize = "";
        items.push({ die, node });
      });
    });
    if (!items.length) return;
    const plan = items.map(({ die, node }) => {
      const available = die.clientWidth - 8;
      if (available <= 0) return null;
      const need = node.getBoundingClientRect().width;
      const base = Number.parseFloat(window.getComputedStyle(node).fontSize);
      if (!Number.isFinite(base) || base <= 0 || need <= available) return null;
      return { node, size: Math.max(5, base * (available / need)) };
    });
    plan.forEach((item) => {
      if (item) item.node.style.fontSize = item.size.toFixed(2) + "px";
    });
  }

  function sizeWafer() {
    const wafer = document.getElementById("sports-wafer");
    if (!wafer) return;
    const side = wafer.clientWidth;
    if (!side) return;
    const layout = waferLayout(ATHLETES.length);
    const die = Math.max(30, Math.min(layout.spacing * side * 0.82, side * 0.3));
    wafer.style.setProperty("--die-size", die.toFixed(2) + "px");
    fitDieText();
  }

  /* ---------------- 启动 ---------------- */

  function boot() {
    const app = document.getElementById("app");
    if (!app) return;
    app.innerHTML = view();
    refreshIcons(app);
    sizeWafer();
    startCountdown();
    app.addEventListener("click", onClick);
    ui.onResize = () => sizeWafer();
    window.addEventListener("resize", ui.onResize);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
