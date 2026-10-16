/* 集成电路 4 班 · 运动会出战名单（独立页：不用登录 + 匿名加油墙 + 赛场原声）
 *
 * 这份脚本是班集「IC-4 运动会」栏目的精简复刻：
 *   有：晶圆图点人、出战参数面板、径赛/田赛筛选、开赛倒计时、一键通电、匿名加油墙、赛场原声
 *   没有：登录、账号、照片上传、成绩录入、海报
 * 加油墙的数据放在**旧站同一个数据库**里的一个独立分区（见 cheer-api.js）：
 *   banji-ic4-cheer-live 写完就在这儿，页面上立刻能看到（不用审核）
 * 旧站的代码只认它自己那几个分区，所以这些留言不会跑到旧网站上；
 * 代价是没有服务端把关，属于「防君子」级别（admin.html 可以事后下架）。
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

  // 加油墙状态：loading 加载中 / ready 拿到线上数据 / offline 连不上（先用本机数据顶着）
  // 设计照抄「中秋节」那页的思路：连不上网络不算失败——显示上次同步到的内容、
  // 写不上去就先存在这台设备上、过几秒自动重试，别让同学看到一句冷冰冰的错误。
  const CHEER_SEED = Array.isArray(window.IC4_CHEERS) ? window.IC4_CHEERS : [];
  const CHEER_CACHE_KEY = "ic4-cheer-cache-v1";
  const CHEER_QUEUE_KEY = "ic4-cheer-queue-v1";
  const cheer = { status: "loading", error: "", items: CHEER_SEED.slice(), queued: [], modal: null, retry: 0, retryStep: 0 };
  const CHEER_MAX = 40;
  // 连不上时的自动重试节奏：先勤后疏，试够 8 次就停下来等「再试一次」或网络恢复事件，
  // 免得一直每 8 秒打一次网络（手机上很费电）。
  const CHEER_RETRY_DELAYS = [8000, 20000, 45000, 60000, 60000, 60000, 60000, 60000];

  function storeGet(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      /* 无痕模式等禁用存储时忽略：不影响页面其他功能 */
    }
  }

  function mergeCheers() {
    const seen = new Map();
    Array.prototype.slice.call(arguments).forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((item) => {
        if (!item || !item.body) return;
        const key = String(item.id || item.target + "|" + item.at + "|" + item.body);
        seen.set(key, item);
      });
    });
    return Array.from(seen.values()).sort((a, b) => (a.at || 0) - (b.at || 0));
  }

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

  /* ---------------- 晶圆排版：同心圆环 ---------------- */

  // 中心 1 颗，第 k 环最多 6k 颗（六方晶格的环容量）。
  // 最后一环装不满时按「该环实际颗数」均分角度，左右天然对称，
  // 不会再有旧站那种「多出来的芯片跑到别人位置上」的错位观感。
  function waferRings(count) {
    const total = Math.max(1, count);
    const rings = [];
    let left = total;
    for (let k = 0; left > 0; k += 1) {
      const capacity = k === 0 ? 1 : 6 * k;
      const take = Math.min(capacity, left);
      rings.push({ ring: k, capacity, take });
      left -= take;
    }
    return rings;
  }

  // 环距 step 由「最外环的芯片边缘刚好贴住晶圆边」定出来；spacing = step，
  // 也就是任意两颗芯片的最小中心距，芯片宽度由它推算（见 view / sizeWafer）。
  function waferLayout(count) {
    const rings = waferRings(count);
    const last = rings.length - 1;
    let step = 0.5 / Math.max(1, last + 0.5);

    for (let i = 0; i < 24; i += 1) {
      const die = step * 0.82;
      if (last * step + die / 2 <= 0.48) break;
      step *= 0.97;
    }

    const points = [];
    rings.forEach((ring) => {
      const radius = ring.ring * step;
      const pitch = 360 / ring.take;
      for (let i = 0; i < ring.take; i += 1) {
        const angle = ((-90 + i * pitch) * Math.PI) / 180;
        points.push({
          x: Math.cos(angle) * radius,
          y: Math.sin(angle) * radius,
          distance: radius,
          ring: ring.ring
        });
      }
    });

    // 方盒子互不重叠的条件：任意两颗至少在一个坐标轴上错开一个盒子宽。
    // 取所有组合里 max(|dx|, |dy|) 的最小值再留 6% 余量，这样斜着相邻的
    // 那几对（正好落在 45° 方向上）也不会压在一起。
    let minAxis = Number.POSITIVE_INFINITY;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        minAxis = Math.min(
          minAxis,
          Math.max(Math.abs(points[i].x - points[j].x), Math.abs(points[i].y - points[j].y))
        );
      }
    }
    const dieLimit = Number.isFinite(minAxis) ? minAxis * 0.94 : step * 0.82;

    return { points, spacing: step, step, rings, dieLimit };
  }

  // 芯片边长（占晶圆宽度的比例）：既不能超过环距的 0.82，也不能压到邻居。
  function dieSizeOf(layout) {
    return Math.min(layout.step * 0.82, layout.dieLimit);
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
    // 接口给的是「新的在前」；墙上按时间正序读起来才顺（最早的在上面，最新的在下面）。
    const ordered = items.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    // 面板里只想看最新几条 → 取末尾。注意不能取前几条（那是最早写的，刚发的反而看不见）。
    const shown = opts.latest ? ordered.slice(-opts.latest) : ordered;
    return (
      `<ul class="cheer-list">` +
      shown
        .map(
          (item) => `
        <li class="cheer-item">
          <div class="cheer-item-head">
            <span class="cheer-item-target">给 ${escapeHTML(nameOfTarget(item.target))}</span>
            <span class="cheer-item-time">${escapeHTML((opts.tag ? opts.tag + " · " : "") + formatTime(item.at))}</span>
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
    // 网络是通的、只是还没人写：这是好消息，别写成错误提示。
    if (cheer.status === "ready") return `<p class="empty-state">还没有人写加油，第一句可以是你写的。</p>`;
    const tried = cheer.retryStep >= CHEER_RETRY_DELAYS.length;
    const text = tried
      ? "这台设备的网络一直连不上加油墙。写的内容会先存在本机，有网了自动传上去。"
      : cheer.error || "网络有点慢，先显示上次同步到的加油。";
    return (
      `<p class="empty-state">${escapeHTML(text)}</p>` +
      `<div class="cheer-actions"><button class="secondary-button" type="button" data-action="cheer-retry">${icon("refresh-cw")} 再试一次</button></div>`
    );
  }

  // 存在本机、还没传上去的句子：写的人自己能看到，别人看不到（还没进数据库）。
  function cheerQueueHTML() {
    if (!cheer.queued.length) return "";
    return (
      `<p class="cheer-note">还有 ${cheer.queued.length} 句存在这台设备上，网络一通就会自动传上去。</p>` +
      cheerListHTML(cheer.queued, { tag: "待上传" })
    );
  }

  function cheerPanelHTML() {
    const total = ATHLETES.length;
    const current = total ? ((ui.selected % total) + total) % total : 0;
    const target = total ? athleteId(current) : "ALL";
    const mine = cheerFor(target);
    // 徽章跟下面列出来的内容对齐：这位同学收到几条，就写几条（不是全班的条数）。
    const badge = cheer.status === "ready" ? mine.length + " 条" : cheer.status === "loading" ? "…" : "离线";
    const tone = cheer.status === "ready" ? "green" : "yellow";
    const wallLabel = "全班加油墙" + (cheer.items.length ? " · " + cheer.items.length : "");
    const list = cheer.items.length
      ? cheerListHTML(mine, { empty: "还没有人给这位同学写加油，你可以写第一句。", latest: 6 }) +
        (cheer.status === "ready"
          ? ""
          : `<p class="cheer-note">${escapeHTML(cheer.status === "loading" ? "正在刷新…" : cheer.error || "网络有点慢，先显示上次同步到的加油。")}</p>`)
      : cheerStatusHTML();

    return `
      <header class="panel-header">
        <div>
          <h3>加油墙</h3>
          <p>匿名留言 · 不用登录 · 写完立刻显示</p>
        </div>
        <span class="badge ${tone}">${escapeHTML(badge)}</span>
      </header>
      <div class="panel-body">
        <div class="cheer-actions">
          <button class="primary-button" type="button" data-action="cheer-open" data-target="${target}">${icon("megaphone")} 写一句加油</button>
          <button class="secondary-button" type="button" data-action="cheer-wall">${icon("message-circle")} ${wallLabel}</button>
        </div>
        <p class="cheer-note">写完立刻出现在墙上，不用等审核。别写脏话、别写别人的隐私。</p>
        ${list}
        ${cheerQueueHTML()}
      </div>
    `;
  }

  /* ---------------- 弹层 ---------------- */

  let modalKeydown = null;
  let modalReturnFocus = null;

  function closeModal() {
    const node = document.getElementById("ic4-modal");
    if (node) node.remove();
    if (modalKeydown) {
      document.removeEventListener("keydown", modalKeydown);
      modalKeydown = null;
    }
    document.body.classList.remove("is-modal-open");
    // 关掉弹层后焦点回到刚才那个按钮，键盘/读屏用户不会「丢位置」。
    if (modalReturnFocus && typeof modalReturnFocus.focus === "function") {
      try {
        modalReturnFocus.focus();
      } catch (error) {
        /* 元素可能已经不在了，忽略 */
      }
    }
    modalReturnFocus = null;
    cheer.modal = null;
  }

  function openModal(html) {
    closeModal();
    modalReturnFocus = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "ic4-modal-backdrop";
    wrap.id = "ic4-modal";
    wrap.innerHTML = `<div class="ic4-modal" role="dialog" aria-modal="true">${html}</div>`;
    wrap.addEventListener("click", (event) => {
      if (event.target === wrap) closeModal();
    });
    document.body.appendChild(wrap);
    document.body.classList.add("is-modal-open");
    modalKeydown = (event) => {
      if (event.key === "Escape") closeModal();
      // Ctrl/⌘ + Enter 直接提交，写长句时不用去点按钮。
      else if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && document.getElementById("cheer-input")) {
        event.preventDefault();
        submitCheer();
      }
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
    const list = cheer.items.length
      ? cheerListHTML(cheer.items, { empty: "还没有人写加油，你是第一个。" })
      : cheerStatusHTML();
    openModal(`
      <div class="ic4-modal-head">
        <div>
          <h3 class="ic4-modal-title">全班加油墙</h3>
          <p class="ic4-modal-sub">墙上的 ${cheer.items.length} 条 · 全部匿名</p>
        </div>
        <button class="ic4-modal-close" type="button" data-action="cheer-close" aria-label="关闭">×</button>
      </div>
      ${list}
      ${cheerQueueHTML()}
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
    const soft = !result.ok && (result.error === "offline" || result.error === "timeout");
    if (!result.ok && !soft) {
      if (button) button.disabled = false;
      return say(window.IC4_CHEER.explain(result.error), "error");
    }
    if (soft) {
      // 网络没通：先存在这台设备上，等网络好了自动重传。别让同学白写一遍。
      // 复用刚才那次请求的 path/at：万一服务器其实已经收到、只是回复丢了，
      // 重传写的是同一条（on_conflict=namespace,path 会覆盖），不会变成两条。
      queueCheer(target, body, result.path, result.at);
      cheer.status = cheer.status === "ready" ? "ready" : "offline";
      renderCheerPanel();
      scheduleCheerRetry();
    }
    const modal = document.querySelector("#ic4-modal .ic4-modal");
    if (modal) {
      modal.innerHTML = soft
        ? `
        <div class="cheer-done">
          <strong>先记下来了 📝</strong>
          <p>这台设备暂时连不上加油墙，这句话先存在本机。<br />网络一通就会自动传上去，传上去就立刻上墙。</p>
          <div class="ic4-modal-actions">
            <button class="primary-button" type="button" data-action="cheer-close">好</button>
          </div>
        </div>
      `
        : `
        <div class="cheer-done">
          <strong>已上墙 ✅</strong>
          <p>这句话已经出现在加油墙上了。<br />现在可以关掉这个窗口，或者再写一句。</p>
          <div class="ic4-modal-actions">
            <button class="primary-button" type="button" data-action="cheer-close">好</button>
          </div>
        </div>
      `;
      refreshIcons(modal);
    }
    cheer.modal = null;
    // 写完立刻刷新一遍墙，让自己的这句话马上出现。
    if (!soft) loadCheers();
  }

  function renderCheerPanel() {
    const panel = document.getElementById("cheer-panel");
    if (!panel) return;
    panel.innerHTML = cheerPanelHTML();
    refreshIcons(panel);
  }

  function loadQueue() {
    const raw = storeGet(CHEER_QUEUE_KEY, []);
    cheer.queued = (Array.isArray(raw) ? raw : []).filter((item) => item && item.target && item.body);
  }

  // path 是这条留言在数据库里的主键（namespace+path）：存下来，重传时用同一个，避免重复上墙。
  function queueCheer(target, body, path, at) {
    const stamp = at ? Date.parse(at) || Date.now() : Date.now();
    cheer.queued.push({
      id: path || "q-" + stamp.toString(36),
      path: path || "",
      target: target,
      body: body,
      at: stamp
    });
    storeSet(CHEER_QUEUE_KEY, cheer.queued);
  }

  // 把本机存着的句子传上去：网络还是不行就留着，内容本身不合规（太长等）就丢掉，不无限重试。
  async function flushCheerQueue() {
    if (!cheer.queued.length) return;
    const api = window.IC4_CHEER;
    const rest = [];
    let softStop = false;
    for (let i = 0; i < cheer.queued.length; i++) {
      const item = cheer.queued[i];
      if (softStop) {
        rest.push(item);
        continue;
      }
      const result = await api.submit(item.target, item.body, {
        force: true,
        path: item.path,
        at: item.at ? new Date(item.at).toISOString() : ""
      });
      if (result.ok) continue;
      if (result.error === "offline" || result.error === "timeout") {
        softStop = true;
        rest.push(item);
      }
    }
    cheer.queued = rest;
    storeSet(CHEER_QUEUE_KEY, rest);
    renderCheerPanel();
    // 弹层开着的话（比如「全班加油墙」），把已经传上去的从「待上传」里去掉。
    if (cheer.modal && cheer.modal.kind === "wall") openCheerWall();
  }

  function scheduleCheerRetry() {
    if (cheer.retry) return;
    if (cheer.retryStep >= CHEER_RETRY_DELAYS.length) return; // 试够了：交给「再试一次」按钮和网络恢复事件
    const delay = CHEER_RETRY_DELAYS[cheer.retryStep] || 60000;
    cheer.retryStep += 1;
    cheer.retry = window.setTimeout(() => {
      cheer.retry = 0;
      loadCheers();
    }, delay);
  }

  async function loadCheers() {
    const api = window.IC4_CHEER;
    if (!api || !api.ready()) {
      cheer.status = "offline";
      cheer.error = "加油墙还没有配置好（负责人正在弄）。";
      renderCheerPanel();
      return;
    }
    if (!cheer.items.length) {
      cheer.status = "loading";
      renderCheerPanel();
    }
    const result = await api.list(300);
    if (result.ok) {
      cheer.status = "ready";
      cheer.error = "";
      cheer.retryStep = 0;
      cheer.items = result.items;
      // items 是「新的在前」：缓存留最新的 200 条（不是最早的 200 条）。
      storeSet(CHEER_CACHE_KEY, cheer.items.slice(0, 200));
      renderCheerPanel();
      if (cheer.modal && cheer.modal.kind === "wall") openCheerWall();
      await flushCheerQueue();
      return;
    }
    // 连不上：用上次同步到的 + 构建时打进页面的快照顶着，并安排自动重试。
    const cached = storeGet(CHEER_CACHE_KEY, []);
    cheer.items = mergeCheers(cached, CHEER_SEED);
    cheer.status = "offline";
    cheer.error = api.explain(result.error);
    renderCheerPanel();
    if (cheer.modal && cheer.modal.kind === "wall") openCheerWall();
    scheduleCheerRetry();
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
    const sizePercent = Math.min(dieSizeOf(layout) * 100, 30);
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
            <div class="sports-hero-actions">
              <button class="primary-button" type="button" data-action="cheer-open" data-target="${total ? athleteId(ui.selected) : "ALL"}">${icon("megaphone")} 写一句加油</button>
              <button class="secondary-button" type="button" data-action="cheer-wall">${icon("message-circle")} 看加油墙</button>
            </div>
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
    else if (action === "cheer-retry") {
      cheer.retryStep = 0;
      loadCheers();
    }
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
    const die = Math.max(22, Math.min(dieSizeOf(layout) * side, side * 0.3));
    wafer.style.setProperty("--die-size", die.toFixed(2) + "px");
    // 底纹换成与芯片同心的圆环，免得方格子被看成「空着的芯片位」。
    wafer.style.setProperty("--ring-step", (layout.step * side).toFixed(2) + "px");
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
    // 走到有网的地方（或者刚才只是抖了一下）就自动再试一次。
    window.addEventListener("online", () => {
      cheer.retryStep = 0;
      loadCheers();
    });
    loadQueue();
    loadCheers();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
