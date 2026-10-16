/* 集成电路 4 班 · 运动会出战名单（独立页：不用登录 + 匿名加油墙 + 赛场原声）
 *
 * 这份脚本是班集「IC-4 运动会」栏目的精简复刻：
 *   有：晶圆图点人、出战参数面板、径赛/田赛筛选、开赛倒计时、一键通电、匿名加油墙、赛场原声
 *   没有：登录、账号、照片上传、成绩录入、海报
 * 加油墙的数据放在**旧站同一个数据库**里的两个独立分区（见 cheer-api.js）：
 *   banji-ic4-cheer-pending 待审核 / banji-ic4-cheer-live 已上墙
 * 旧站的代码只认它自己那几个分区，所以这些留言不会跑到旧网站上；
 * 代价是这套审核没有服务端把关，属于「防君子」级别。
 * 音乐不复制第二份，直接播旧站 assets/music 里的那三首。
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

  // 加油墙状态：loading 加载中 / ready 拿到数据 / error 连不上
  const cheer = { status: "loading", error: "", items: [], modal: null };
  const CHEER_MAX = 40;

  // 赛场原声：三首歌不复制第二份，直接用旧站 assets/music 里的文件。
  // 线上页面在 /banji-class-hub/ic4-sports/，音乐在同仓库的 /banji-class-hub/assets/music/；
  // 本地用 file:// 调试时，源码在工作区里是并列的两个目录。
  const BGM =
    Array.isArray(window.IC4_BGM) && window.IC4_BGM.length
      ? window.IC4_BGM
      : [
          ["那些无人看见的时光", "01-unseen-days.mp3", "4:23"],
          ["那天的风", "02-wind-of-that-day.mp3", "3:28"],
          ["发令枪响之前", "03-before-the-gun.mp3", "3:29"]
        ];
  const MUSIC_BASE =
    window.location.protocol === "file:" ? "../banji-class-hub/assets/music/" : "../assets/music/";
  const bgm = { index: -1, playing: false, bound: false };

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

  /* ---------------- 加油墙的小工具 ---------------- */

  // 加油对象是选手编号（IC4-001…）或 "ALL"（全班）；这里换成给人看的名字。
  function nameOfTarget(target) {
    const hit = /^IC4-(\d{1,3})$/.exec(String(target || ""));
    if (!hit) return "全班同学";
    const athlete = ATHLETES[Number(hit[1]) - 1];
    return athlete ? athlete.name : "同学";
  }

  function formatTime(ms) {
    if (!ms) return "";
    const date = new Date(ms);
    const pad = (value) => String(value).padStart(2, "0");
    return pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  const cheerFor = (target) => cheer.items.filter((item) => item.target === target);

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

  /* ---------------- 加油墙渲染 ---------------- */

  function cheerListHTML(items, options) {
    const opts = options || {};
    if (!items.length) return `<p class="empty-state">${escapeHTML(opts.empty || "还没有人写加油。")}</p>`;
    const ordered = items.slice().reverse();
    const shown = opts.limit ? ordered.slice(0, opts.limit) : ordered;
    return (
      `<ul class="cheer-list">` +
      shown
        .map(
          (item) => `
        <li class="cheer-item">
          <div class="cheer-item-head">
            <span class="cheer-item-target">给 ${escapeHTML(nameOfTarget(item.target))}</span>
            <span class="cheer-item-time">${escapeHTML(formatTime(item.at))}</span>
          </div>
          <p class="cheer-item-body">${escapeHTML(item.body)}</p>
        </li>`
        )
        .join("") +
      `</ul>`
    );
  }

  function cheerStatusHTML() {
    if (cheer.status === "loading") return `<p class="empty-state">正在加载加油墙…</p>`;
    return `<p class="empty-state">${escapeHTML(cheer.error || "加油墙暂时连不上。")}</p>`;
  }

  function cheerPanelHTML() {
    const total = ATHLETES.length;
    const current = total ? ((ui.selected % total) + total) % total : 0;
    const target = total ? athleteId(current) : "ALL";
    const mine = cheerFor(target);
    const badge = cheer.status === "ready" ? cheer.items.length + " 条" : "…";
    const tone = cheer.status === "ready" ? "green" : "yellow";
    const list =
      cheer.status === "ready"
        ? cheerListHTML(mine, { empty: "还没有人给这位同学写加油，你可以写第一句。", limit: 6 })
        : cheerStatusHTML();

    return `
      <header class="panel-header">
        <div>
          <h3>加油墙</h3>
          <p>匿名留言 · 不用登录 · 负责人审核后显示</p>
        </div>
        <span class="badge ${tone}">${escapeHTML(badge)}</span>
      </header>
      <div class="panel-body">
        <div class="cheer-actions">
          <button class="primary-button" type="button" data-action="cheer-open" data-target="${target}">${icon("megaphone")} 写一句加油</button>
          <button class="secondary-button" type="button" data-action="cheer-wall">${icon("message-circle")} 全班加油墙</button>
        </div>
        <p class="cheer-note">写的话会先进待审核，负责人通过后才出现在墙上。别写脏话、别写别人的隐私。</p>
        ${list}
      </div>
    `;
  }

  /* ---------------- 弹层 ---------------- */

  let modalKeydown = null;

  function closeModal() {
    const node = document.getElementById("ic4-modal");
    if (node) node.remove();
    if (modalKeydown) {
      document.removeEventListener("keydown", modalKeydown);
      modalKeydown = null;
    }
    cheer.modal = null;
  }

  function openModal(html) {
    closeModal();
    const wrap = document.createElement("div");
    wrap.className = "ic4-modal-backdrop";
    wrap.id = "ic4-modal";
    wrap.innerHTML = `<div class="ic4-modal" role="dialog" aria-modal="true">${html}</div>`;
    wrap.addEventListener("click", (event) => {
      if (event.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
    modalKeydown = (event) => {
      if (event.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", modalKeydown);
    refreshIcons(wrap);
    return wrap;
  }

  function openCheerForm(target) {
    openModal(`
      <div class="ic4-modal-head">
        <div>
          <h3 class="ic4-modal-title">给 ${escapeHTML(nameOfTarget(target))} 写一句加油</h3>
          <p class="ic4-modal-sub">匿名 · 不用登录 · 最多 ${CHEER_MAX} 个字</p>
        </div>
        <button class="ic4-modal-close" type="button" data-action="cheer-close" aria-label="关闭">×</button>
      </div>
      <textarea class="cheer-input" id="cheer-input" maxlength="${CHEER_MAX}" placeholder="例如：起跑枪一响，全班的信号都给你！"></textarea>
      <p class="cheer-counter" id="cheer-counter">0 / ${CHEER_MAX}</p>
      <p class="cheer-msg" id="cheer-msg"></p>
      <div class="ic4-modal-actions">
        <button class="primary-button" type="button" data-action="cheer-submit">${icon("send")} 提交</button>
        <button class="secondary-button" type="button" data-action="cheer-close">取消</button>
      </div>
    `);
    cheer.modal = { kind: "form", target };
    const input = document.getElementById("cheer-input");
    if (input) input.focus();
  }

  function openCheerWall() {
    const list =
      cheer.status === "ready"
        ? cheerListHTML(cheer.items, { empty: "还没有人写加油，你是第一个。" })
        : cheerStatusHTML();
    openModal(`
      <div class="ic4-modal-head">
        <div>
          <h3 class="ic4-modal-title">全班加油墙</h3>
          <p class="ic4-modal-sub">已通过审核的 ${cheer.items.length} 条 · 全部匿名</p>
        </div>
        <button class="ic4-modal-close" type="button" data-action="cheer-close" aria-label="关闭">×</button>
      </div>
      ${list}
    `);
    cheer.modal = { kind: "wall" };
  }

  async function submitCheer() {
    const input = document.getElementById("cheer-input");
    const msg = document.getElementById("cheer-msg");
    if (!input) return;
    const say = (text, kind) => {
      if (!msg) return;
      msg.textContent = text;
      msg.className = "cheer-msg" + (kind ? " is-" + kind : "");
    };
    const target = (cheer.modal && cheer.modal.target) || "ALL";
    const body = input.value.trim();
    if (body.length < 2) return say("至少写 2 个字。", "error");
    if (body.length > CHEER_MAX) return say("最多 " + CHEER_MAX + " 个字。", "error");

    const button = document.querySelector('[data-action="cheer-submit"]');
    if (button) button.disabled = true;
    say("正在提交…");
    const result = await window.IC4_CHEER.submit(target, body);
    if (!result.ok) {
      if (button) button.disabled = false;
      return say(window.IC4_CHEER.explain(result.error), "error");
    }
    const modal = document.querySelector("#ic4-modal .ic4-modal");
    if (modal) {
      modal.innerHTML = `
        <div class="cheer-done">
          <strong>已提交 ✅</strong>
          <p>等负责人审核通过后，就会出现在加油墙上。<br />现在可以关掉这个窗口了。</p>
          <div class="ic4-modal-actions">
            <button class="primary-button" type="button" data-action="cheer-close">好</button>
          </div>
        </div>
      `;
      refreshIcons(modal);
    }
    cheer.modal = null;
  }

  function renderCheerPanel() {
    const panel = document.getElementById("cheer-panel");
    if (!panel) return;
    panel.innerHTML = cheerPanelHTML();
    refreshIcons(panel);
  }

  async function loadCheers() {
    const api = window.IC4_CHEER;
    if (!api || !api.ready()) {
      cheer.status = "error";
      cheer.error = "加油墙还没有配置好（负责人正在弄）。";
      renderCheerPanel();
      return;
    }
    const result = await api.list(300);
    if (result.ok) {
      cheer.status = "ready";
      cheer.items = result.items;
    } else {
      cheer.status = "error";
      cheer.error = api.explain(result.error);
    }
    renderCheerPanel();
    if (cheer.modal && cheer.modal.kind === "wall") openCheerWall();
  }

  /* ---------------- 赛场原声（三首歌） ---------------- */

  function bgmHTML() {
    const tracks = BGM.map((track, index) => {
      const on = bgm.index === index;
      const playing = on && bgm.playing;
      const cls = on ? (playing ? " is-active is-playing" : " is-active") : "";
      return `
        <button class="bgm-track${cls}" type="button"
          data-action="bgm-toggle" data-index="${index}" aria-pressed="${playing ? "true" : "false"}">
          <span class="bgm-glyph" aria-hidden="true"></span>
          <span class="bgm-title">${escapeHTML(track[0])}</span>
          <span class="bgm-time">${escapeHTML(track[2] || "")}</span>
        </button>
      `;
    }).join("");
    return `
      <header class="panel-header">
        <div>
          <h3>赛场原声</h3>
          <p>点一首当背景音，不想听就不点</p>
        </div>
        <span class="badge blue">${BGM.length} 首</span>
      </header>
      <div class="panel-body">
        <div class="bgm-list">${tracks}</div>
        <p class="bgm-status" id="bgm-status"></p>
        <audio id="ic4-bgm" preload="none"></audio>
      </div>
    `;
  }

  const bgmAudio = () => document.getElementById("ic4-bgm");

  function syncBgm() {
    const audio = bgmAudio();
    bgm.playing = Boolean(audio) && !audio.paused && bgm.index >= 0;
    document.querySelectorAll("#app .bgm-track").forEach((node) => {
      const on = Number(node.dataset.index) === bgm.index;
      node.classList.toggle("is-active", on);
      node.classList.toggle("is-playing", on && bgm.playing);
      node.setAttribute("aria-pressed", String(on && bgm.playing));
    });
  }

  function bindBgm() {
    const audio = bgmAudio();
    if (!audio || bgm.bound) return;
    bgm.bound = true;
    ["play", "pause", "ended"].forEach((name) => audio.addEventListener(name, syncBgm));
    audio.addEventListener("error", () => {
      const status = document.getElementById("bgm-status");
      if (status) status.textContent = "音乐加载失败（本地调试正常，线上才有这几个文件）。";
    });
  }

  function toggleBgm(index) {
    const audio = bgmAudio();
    const track = BGM[index];
    if (!audio || !track) return;
    const status = document.getElementById("bgm-status");
    if (bgm.index === index && !audio.paused) {
      audio.pause();
      syncBgm();
      return;
    }
    if (bgm.index !== index) {
      audio.src = MUSIC_BASE + track[1];
      bgm.index = index;
    }
    if (status) status.textContent = "";
    const started = audio.play();
    if (started && typeof started.catch === "function") {
      started.catch(() => {
        if (status) status.textContent = "浏览器不让自动播，再点一下这首歌。";
      });
    }
    syncBgm();
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

            <section class="panel" id="bgm-panel">${bgmHTML()}</section>
          </div>

          <aside class="stack">
            <section class="panel" id="sports-panel">${panelHTML(ui.selected)}</section>
            <section class="panel" id="cheer-panel">${cheerPanelHTML()}</section>
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
    renderCheerPanel();
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
    else if (action === "cheer-open") openCheerForm(node.dataset.target || "ALL");
    else if (action === "cheer-wall") openCheerWall();
    else if (action === "cheer-submit") submitCheer();
    else if (action === "cheer-close") closeModal();
    else if (action === "bgm-toggle") toggleBgm(Number(node.dataset.index));
  }

  function onInput(event) {
    if (!event.target || event.target.id !== "cheer-input") return;
    const counter = document.getElementById("cheer-counter");
    if (!counter) return;
    const length = event.target.value.length;
    counter.textContent = length + " / " + CHEER_MAX;
    counter.className = "cheer-counter" + (length >= CHEER_MAX ? " is-over" : "");
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
    bindBgm();
    startCountdown();
    // 事件挂在 document 上：加油墙的弹层在 body 下，不在 #app 里。
    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    ui.onResize = () => sizeWafer();
    window.addEventListener("resize", ui.onResize);
    loadCheers();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
