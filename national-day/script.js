const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function initHeader() {
  const header = document.querySelector("#site-header");
  const nav = document.querySelector("#primary-navigation");
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelectorAll(".nav-link");

  const syncHeader = () => {
    header?.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  syncHeader();
  window.addEventListener("scroll", syncHeader, { passive: true });

  const closeNavigation = () => {
    nav?.classList.remove("is-open");
    navToggle?.setAttribute("aria-expanded", "false");
    navToggle?.setAttribute("aria-label", "打开导航");
    if (navToggle) {
      navToggle.innerHTML = '<i data-lucide="menu" aria-hidden="true"></i>';
      refreshIcons();
    }
  };

  navToggle?.addEventListener("click", () => {
    const willOpen = !nav?.classList.contains("is-open");
    nav?.classList.toggle("is-open", willOpen);
    navToggle.setAttribute("aria-expanded", String(willOpen));
    navToggle.setAttribute("aria-label", willOpen ? "关闭导航" : "打开导航");
    navToggle.innerHTML = `<i data-lucide="${willOpen ? "x" : "menu"}" aria-hidden="true"></i>`;
    refreshIcons();
  });

  navLinks.forEach((link) => link.addEventListener("click", closeNavigation));

  document.addEventListener("click", (event) => {
    if (!nav?.classList.contains("is-open")) {
      return;
    }

    const eventPath = event.composedPath();
    if (!eventPath.includes(nav) && !eventPath.includes(navToggle)) {
      closeNavigation();
    }
  });
}

function initReveal() {
  const elements = document.querySelectorAll(".reveal");

  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    elements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.12,
      rootMargin: "0px 0px -48px",
    },
  );

  elements.forEach((element) => observer.observe(element));
}

function initCountdown() {
  const panel = document.querySelector(".countdown-panel");
  const label = document.querySelector("#countdown-label");
  const dateText = panel?.querySelector(".countdown-date span");
  const values = {
    days: panel?.querySelector('[data-countdown="days"]'),
    hours: panel?.querySelector('[data-countdown="hours"]'),
    minutes: panel?.querySelector('[data-countdown="minutes"]'),
    seconds: panel?.querySelector('[data-countdown="seconds"]'),
  };

  if (!panel || !label || !dateText || Object.values(values).some((value) => !value)) {
    return;
  }

  const format = (value) => String(value).padStart(2, "0");

  const update = () => {
    const now = Date.now();
    const beijingNow = new Date(now + BEIJING_OFFSET_MS);
    const year = beijingNow.getUTCFullYear();
    const nationalDayStart = Date.UTC(year, 9, 1) - BEIJING_OFFSET_MS;
    const nationalDayEnd = nationalDayStart + 24 * 60 * 60 * 1000;
    const holidayEnd = Date.UTC(year, 9, 8) - BEIJING_OFFSET_MS;
    let target = nationalDayStart;
    let labelText = "距离国庆节还有";
    let dateLabel = `${year}年10月1日 · 星期四`;

    if (now >= nationalDayStart && now < nationalDayEnd) {
      target = nationalDayEnd;
      labelText = "距离国庆节结束还有";
      dateLabel = `${year}年10月1日 · 国庆节`;
    } else if (now >= nationalDayEnd && now < holidayEnd) {
      label.textContent = `已欢度${year - 1949}周年国庆`;
      Object.values(values).forEach((value) => {
        value.textContent = "00";
      });
      dateText.textContent = `${year}年国庆假期`;
      return;
    } else if (now >= holidayEnd) {
      target = Date.UTC(year + 1, 9, 1) - BEIJING_OFFSET_MS;
      dateLabel = `${year + 1}年10月1日 · 星期四`;
    }

    const difference = Math.max(0, target - now);
    const days = Math.floor(difference / (24 * 60 * 60 * 1000));
    const hours = Math.floor((difference / (60 * 60 * 1000)) % 24);
    const minutes = Math.floor((difference / (60 * 1000)) % 60);
    const seconds = Math.floor((difference / 1000) % 60);

    label.textContent = labelText;
    values.days.textContent = format(days);
    values.hours.textContent = format(hours);
    values.minutes.textContent = format(minutes);
    values.seconds.textContent = format(seconds);
    dateText.textContent = dateLabel;
  };

  update();
  window.setInterval(update, 1000);
}

function initFireworks() {
  const canvas = document.querySelector("#fireworks-canvas");
  const context = canvas?.getContext("2d");

  if (!canvas || !context) {
    document.querySelectorAll(".celebrate-trigger").forEach((button) => {
      button.addEventListener("click", () => button.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }], 320));
    });
    return;
  }

  const colors = ["#f3cb6c", "#ffe099", "#d92831", "#ffffff", "#54c6ad"];
  let particles = [];
  let animationId = 0;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  const resize = () => {
    width = window.innerWidth;
    height = window.innerHeight;
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * pixelRatio);
    canvas.height = Math.floor(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const createBurst = (x, y, count = 58) => {
    if (prefersReducedMotion) {
      return;
    }

    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / count + Math.random() * 0.12;
      const speed = 2.1 + Math.random() * 5.2;
      const life = 56 + Math.random() * 34;
      particles.push({
        x,
        y,
        previousX: x,
        previousY: y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.2 + Math.random() * 2.4,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    if (!animationId) {
      animationId = window.requestAnimationFrame(animate);
    }
  };

  const animate = () => {
    context.clearRect(0, 0, width, height);
    context.globalCompositeOperation = "lighter";

    particles = particles.filter((particle) => particle.life > 0);

    particles.forEach((particle) => {
      particle.life -= 1;
      particle.previousX = particle.x;
      particle.previousY = particle.y;
      particle.velocityX *= 0.982;
      particle.velocityY = particle.velocityY * 0.982 + 0.04;
      particle.x += particle.velocityX;
      particle.y += particle.velocityY;

      const opacity = Math.max(0, particle.life / particle.maxLife);
      context.beginPath();
      context.moveTo(particle.previousX, particle.previousY);
      context.lineTo(particle.x, particle.y);
      context.lineWidth = particle.size * opacity;
      context.lineCap = "round";
      context.strokeStyle = particle.color;
      context.globalAlpha = opacity;

      if (opacity > 0.72) {
        context.shadowBlur = 11;
        context.shadowColor = particle.color;
      } else {
        context.shadowBlur = 0;
      }

      context.stroke();
    });

    context.globalAlpha = 1;
    context.shadowBlur = 0;
    context.globalCompositeOperation = "source-over";

    if (particles.length > 0) {
      animationId = window.requestAnimationFrame(animate);
    } else {
      animationId = 0;
      context.clearRect(0, 0, width, height);
    }
  };

  const celebrateAt = (element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const sequence = [
      { x, y, delay: 0, count: 64 },
      { x: Math.min(width - 70, x + 100), y: Math.max(80, y - 80), delay: 120, count: 44 },
      { x: Math.max(70, x - 120), y: Math.max(90, y - 40), delay: 220, count: 48 },
    ];

    sequence.forEach((burst) => {
      window.setTimeout(() => createBurst(burst.x, burst.y, burst.count), burst.delay);
    });
  };

  document.querySelectorAll(".celebrate-trigger").forEach((button) => {
    button.addEventListener("click", () => celebrateAt(button));
  });

  window.addEventListener("wish-added", (event) => {
    if (event.detail) {
      createBurst(event.detail.x, event.detail.y, 72);
    }
  });

  window.addEventListener("resize", resize, { passive: true });
  resize();
}

function initStarRain() {
  const layer = document.querySelector("#star-rain");

  if (!layer || prefersReducedMotion || !window.matchMedia("(pointer: fine)").matches) {
    return;
  }

  let lastEmit = 0;

  document.addEventListener("pointermove", (event) => {
    const now = performance.now();
    if (now - lastEmit < 90) {
      return;
    }
    lastEmit = now;

    const star = document.createElement("span");
    star.className = "star-particle";
    star.textContent = "★";
    star.style.left = `${event.clientX + (Math.random() * 30 - 15)}px`;
    star.style.top = `${event.clientY + (Math.random() * 22 - 11)}px`;
    star.style.setProperty("--star-size", `${9 + Math.random() * 8}px`);
    star.style.setProperty("--star-duration", `${1 + Math.random() * 0.7}s`);
    layer.appendChild(star);
    window.setTimeout(() => star.remove(), 1800);
  }, { passive: true });
}

function initWishes() {
  const form = document.querySelector("#wish-form");
  const input = document.querySelector("#wish-input");
  const submitButton = form?.querySelector('button[type="submit"]');
  const wall = document.querySelector("#wish-wall");
  const status = document.querySelector("#wish-form-status");
  const spotlight = document.querySelector("#wish-spotlight");
  const spotlightText = document.querySelector("#wish-spotlight-text");
  const sharedConfig = window.NATIONAL_DAY_CONFIG || {};
  const pendingStorageKey = "national-day-pending-wishes-2026";
  const visitorStorageKey = "national-day-visitor-2026";

  if (!form || !input || !submitButton || !wall || !status || !spotlight || !spotlightText) {
    return;
  }

  const hasMantleStorage = Boolean(
    sharedConfig.provider === "mantle" && sharedConfig.apiBase && sharedConfig.namespace,
  );
  const hasGitHubIssues = Boolean(
    sharedConfig.githubRepo && sharedConfig.issuePrefix && sharedConfig.issueMarker,
  );
  const entryUrl = (path) =>
    `${sharedConfig.apiBase}/${encodeURIComponent(sharedConfig.namespace)}/${path}`;
  const listUrl = `${sharedConfig.apiBase}/list/${encodeURIComponent(sharedConfig.namespace)}`;
  const githubIssuesUrl = `https://api.github.com/repos/${sharedConfig.githubRepo}/issues?state=all&per_page=100&sort=created&direction=desc`;
  let sharedWishes = [];
  let isRefreshing = false;
  let wallPaused = false;

  const readPendingWishes = () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(pendingStorageKey) || "[]");
      return Array.isArray(saved) ? saved.filter((wish) => wish?.id && wish?.text) : [];
    } catch {
      return [];
    }
  };

  const savePendingWishes = (wishes) => {
    try {
      window.localStorage.setItem(pendingStorageKey, JSON.stringify(wishes.slice(0, 50)));
    } catch {
      // The current page still keeps the wish in memory when storage is unavailable.
    }
  };

  const getVisitorId = () => {
    try {
      const existing = window.localStorage.getItem(visitorStorageKey);
      if (existing) {
        return existing;
      }

      const generated =
        window.crypto?.randomUUID?.() ||
        `visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
      window.localStorage.setItem(visitorStorageKey, generated);
      return generated;
    } catch {
      return "anonymous-visitor";
    }
  };

  const createTimeoutSignal = (timeout) => {
    if (typeof AbortSignal?.timeout === "function") {
      return AbortSignal.timeout(timeout);
    }

    const controller = new AbortController();
    window.setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  };

  const withTimeout = (promise, timeout = 7000) =>
    new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("Request timed out")), timeout);
      promise.then(
        (value) => {
          window.clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });

  const requestJson = async (url, options = {}) => {
    const response = await withTimeout(
      fetch(url, {
        ...options,
        cache: "no-store",
        signal: options.signal || createTimeoutSignal(7000),
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {}),
        },
      }),
    );

    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Shared wish request failed: ${response.status}`);
    }
    if (response.status === 204) {
      return null;
    }
    return response.json();
  };

  const publishWish = async (wish) => {
    await requestJson(entryUrl(`wishes/${encodeURIComponent(wish.id)}`), {
      method: "POST",
      body: JSON.stringify({
        record_key: `wishes/${wish.id}`,
        payload: wish,
        visitor_id: getVisitorId(),
      }),
    });
  };

  const readMantleWishes = async () => {
    if (!hasMantleStorage) {
      return [];
    }

    const list = await requestJson(listUrl);
    const paths = (list?.entries || [])
      .map((entry) => entry?.path)
      .filter((path) => typeof path === "string" && path.startsWith("wishes/"))
      .slice(0, 200);

    const records = await Promise.all(
      paths.map((path) => requestJson(entryUrl(path)).catch(() => null)),
    );

    return records
      .map((record) => record?.payload)
      .filter((wish) => wish?.id && typeof wish.text === "string" && wish.text.trim())
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  };

  const readGitHubWishes = async () => {
    if (!hasGitHubIssues) {
      return [];
    }

    const response = await withTimeout(
      fetch(githubIssuesUrl, {
        cache: "no-store",
        signal: createTimeoutSignal(7000),
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      }),
    );

    if (!response.ok) {
      throw new Error(`GitHub issue request failed: ${response.status}`);
    }

    const issues = await response.json();
    const markerPattern = new RegExp(`${sharedConfig.issueMarker}:([a-z0-9-]+)`, "i");

    return issues
      .filter(
        (issue) =>
          !issue.pull_request &&
          typeof issue.title === "string" &&
          issue.title.startsWith(sharedConfig.issuePrefix),
      )
      .map((issue) => {
        const marker = String(issue.body || "").match(markerPattern);
        return {
          id: marker?.[1] || `github-${issue.number}`,
          text: issue.title.slice(sharedConfig.issuePrefix.length).trim(),
          createdAt: issue.created_at,
          githubNumber: issue.number,
        };
      })
      .filter((wish) => wish.id && wish.text);
  };

  const readSharedWishes = async () => {
    if (hasMantleStorage) {
      try {
        return await readMantleWishes();
      } catch {
        // Fall through to GitHub only when the primary shared database is unavailable.
      }
    }

    if (hasGitHubIssues) {
      try {
        return await readGitHubWishes();
      } catch {
        return [];
      }
    }

    return [];
  };

  const flushPendingWishes = async () => {
    if (!hasMantleStorage || !navigator.onLine) {
      return;
    }

    const pending = readPendingWishes();
    const remaining = [];

    for (const wish of pending) {
      try {
        await publishWish(wish);
      } catch {
        remaining.push(wish);
      }
    }

    savePendingWishes(remaining);
  };

  const buildGitHubIssueUrl = (wish) => {
    const title = `${sharedConfig.issuePrefix}${wish.text}`;
    const body = `<!-- ${sharedConfig.issueMarker}:${wish.id} -->\n\n${wish.text}\n\n来自国庆祝福墙`;
    const query = new URLSearchParams({ title, body });
    return `https://github.com/${sharedConfig.githubRepo}/issues/new?${query.toString()}`;
  };

  const showGitHubFallback = (wish) => {
    status.replaceChildren();
    const note = document.createTextNode("共享数据库暂时不可用，可前往 GitHub 发布：");
    const link = document.createElement("a");
    link.href = buildGitHubIssueUrl(wish);
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "打开发布页面";
    status.append(note, link);
  };

  const showPublishSuccess = () => {
    status.textContent = "祝福已同步，所有访客刷新后都能看见。";
    window.setTimeout(() => {
      if (status.textContent === "祝福已同步，所有访客刷新后都能看见。") {
        status.textContent = "";
      }
    }, 5000);
  };

  const renderWishes = () => {
    wall.replaceChildren();
    const pending = readPendingWishes();
    const uniqueWishes = [...pending, ...sharedWishes].filter(
      (wish, index, collection) =>
        collection.findIndex((candidate) => candidate.id === wish.id) === index,
    );
    const allWishes = uniqueWishes.slice(0, 30);

    if (isRefreshing && allWishes.length === 0) {
      const loading = document.createElement("span");
      loading.className = "wish-chip wish-chip-muted";
      loading.textContent = "正在读取大家的祝福…";
      wall.appendChild(loading);
      return;
    }

    if (sharedWishes.length > 0 && (!spotlightText.textContent || Math.random() < 0.3)) {
      spotlightText.textContent = sharedWishes[Math.floor(Math.random() * sharedWishes.length)].text;
      spotlight.hidden = false;
    }

    if (allWishes.length === 0) {
      const empty = document.createElement("span");
      empty.className = "wish-chip wish-chip-muted";
      empty.textContent = hasMantleStorage || hasGitHubIssues
        ? "还没有祝福，来写下第一条吧。"
        : "在线祝福暂时不可用，请稍后再试。";
      wall.appendChild(empty);
      return;
    }

    allWishes.forEach((wish, index) => {
      const chip = document.createElement("span");
      chip.className = "wish-chip";
      chip.textContent = wish.text;
      chip.style.animationDelay = `${Math.min(index * 45, 360)}ms`;
      wall.appendChild(chip);
    });

    if (!prefersReducedMotion && !wall.dataset.tickerReady) {
      wall.dataset.tickerReady = "true";
      let lastFrame = performance.now();
      const ticker = (now) => {
        const maxScroll = Math.max(0, wall.scrollWidth - wall.clientWidth);
        if (!wallPaused && maxScroll > 0) {
          wall.scrollLeft += (now - lastFrame) * 0.024;
          if (wall.scrollLeft >= maxScroll - 1) {
            wall.scrollLeft = 0;
          }
        }
        lastFrame = now;
        window.requestAnimationFrame(ticker);
      };
      window.requestAnimationFrame(ticker);
      wall.addEventListener("pointerenter", () => {
        wallPaused = true;
      });
      wall.addEventListener("pointerleave", () => {
        wallPaused = false;
      });
      wall.addEventListener("focus", () => {
        wallPaused = true;
      });
      wall.addEventListener("blur", () => {
        wallPaused = false;
      });
    }
  };

  const refreshWishes = async () => {
    if (isRefreshing || (!hasMantleStorage && !hasGitHubIssues)) {
      if (!hasMantleStorage && !hasGitHubIssues) {
        renderWishes();
      }
      return;
    }

    isRefreshing = true;
    renderWishes();

    try {
      await flushPendingWishes();
      sharedWishes = await readSharedWishes();
      const publishedIds = new Set(sharedWishes.map((wish) => wish.id));
      savePendingWishes(readPendingWishes().filter((wish) => !publishedIds.has(wish.id)));
    } catch {
      // Pending local wishes remain visible and will be retried later.
    } finally {
      isRefreshing = false;
      renderWishes();
    }
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const wishText = input.value.trim().replace(/\s+/g, " ");

    if (!wishText) {
      input.focus();
      return;
    }

    const wish = {
      id:
        window.crypto?.randomUUID?.() ||
        `wish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      text: wishText.slice(0, 48),
      createdAt: new Date().toISOString(),
      visitorId: getVisitorId(),
    };

    sharedWishes = [wish, ...sharedWishes];
    savePendingWishes([wish, ...readPendingWishes().filter((item) => item.id !== wish.id)]);
    renderWishes();
    form.reset();
    input.focus();
    submitButton.disabled = true;
    submitButton.setAttribute("aria-busy", "true");
    status.textContent = "";

    const firstWish = wall.querySelector(".wish-chip");
    if (firstWish) {
      const rect = firstWish.getBoundingClientRect();
      const canvasEvent = new CustomEvent("wish-added", {
        detail: {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        },
      });
      window.dispatchEvent(canvasEvent);
    }

    if (hasMantleStorage) {
      try {
        await publishWish(wish);
        savePendingWishes(readPendingWishes().filter((item) => item.id !== wish.id));
        showPublishSuccess();
      } catch {
        showGitHubFallback(wish);
      }
    } else {
      showGitHubFallback(wish);
    }

    submitButton.disabled = false;
    submitButton.removeAttribute("aria-busy");
    void refreshWishes();
  });

  window.addEventListener("online", () => void refreshWishes());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void refreshWishes();
    }
  });

  renderWishes();
  void refreshWishes();
  window.setInterval(() => {
    if (document.visibilityState === "visible") {
      void refreshWishes();
    }
  }, 120000);
}

function initMusic() {
  const dock = document.querySelector("#music-dock");
  const primaryButton = document.querySelector("#music-primary");
  const primaryAction = document.querySelector("#music-action");
  const ambientButton = document.querySelector("#music-ambient");
  const ambientIcon = document.querySelector("#music-ambient-icon");
  const mobileToggle = document.querySelector("#music-mobile-toggle");
  const fileInput = document.querySelector("#music-file-input");
  const themeAudio = document.querySelector("#theme-audio");
  const ambientAudio = document.querySelector("#ambient-audio");
  const title = document.querySelector("#music-title");
  const status = document.querySelector("#music-status");

  if (
    !dock ||
    !primaryButton ||
    !primaryAction ||
    !ambientButton ||
    !ambientIcon ||
    !mobileToggle ||
    !fileInput ||
    !themeAudio ||
    !ambientAudio ||
    !title ||
    !status
  ) {
    return;
  }

  let objectUrl = "";
  ambientAudio.volume = 0.42;
  themeAudio.volume = 0.86;

  const setIcon = (container, iconName) => {
    container.innerHTML = `<i data-lucide="${iconName}" aria-hidden="true"></i>`;
    refreshIcons();
  };

  const syncAudibleState = () => {
    const themeIsPlaying = !themeAudio.paused && !themeAudio.ended;
    const ambientIsPlaying = !ambientAudio.paused && !ambientAudio.ended;
    dock.classList.toggle("is-audible", themeIsPlaying || ambientIsPlaying);
  };

  const syncTheme = () => {
    const hasCustomAudio = Boolean(themeAudio.getAttribute("src"));
    const isPlaying = hasCustomAudio && !themeAudio.paused && !themeAudio.ended;
    const trackTitle = themeAudio.dataset.fileName || themeAudio.dataset.title || "《我和我的祖国》";
    const trackArtist = themeAudio.dataset.fileName ? "" : themeAudio.dataset.artist || "";

    primaryButton.classList.toggle("is-playing", isPlaying);
    primaryButton.setAttribute("aria-pressed", String(isPlaying));
    syncAudibleState();

    if (!hasCustomAudio) {
      title.textContent = "《我和我的祖国》";
      status.textContent = "选择你的本地音频";
      setIcon(primaryAction, "folder-open");
      return;
    }

    setIcon(primaryAction, isPlaying ? "pause" : "play");
    title.textContent = trackTitle;
    status.textContent = isPlaying
      ? `${trackArtist ? `${trackArtist} · ` : ""}正在播放`
      : themeAudio.currentTime > 0
        ? `${trackArtist ? `${trackArtist} · ` : ""}已暂停`
        : `${trackArtist ? `${trackArtist} · ` : ""}点击播放`;
  };

  const syncAmbient = () => {
    const isPlaying = !ambientAudio.paused && !ambientAudio.ended;
    syncAudibleState();
    ambientButton.setAttribute("aria-pressed", String(isPlaying));
    ambientButton.setAttribute("aria-label", isPlaying ? "暂停节庆氛围音乐" : "播放节庆氛围音乐");
    ambientButton.title = isPlaying ? "暂停节庆氛围音乐" : "播放节庆氛围音乐";
    setIcon(ambientIcon, isPlaying ? "pause" : "sparkles");

    if (isPlaying) {
      status.textContent = "正在播放 · 节庆氛围音";
      title.textContent = "节庆氛围音乐";
      setIcon(primaryAction, "play");
    } else if (!themeAudio.getAttribute("src")) {
      title.textContent = "《我和我的祖国》";
      status.textContent = "选择你的本地音频";
      setIcon(primaryAction, "folder-open");
    } else {
      syncTheme();
    }
  };

  primaryButton.addEventListener("click", async () => {
    if (!themeAudio.getAttribute("src")) {
      fileInput.click();
      return;
    }

    if (themeAudio.paused || themeAudio.ended) {
      ambientAudio.pause();
      try {
        await themeAudio.play();
      } catch {
        status.textContent = "播放失败，请重新选择音频";
      }
    } else {
      themeAudio.pause();
    }
  });

  mobileToggle.addEventListener("click", () => {
    const isExpanded = dock.classList.toggle("is-expanded");
    mobileToggle.setAttribute("aria-expanded", String(isExpanded));
    mobileToggle.setAttribute("aria-label", isExpanded ? "收起音乐控制" : "打开音乐控制");
    mobileToggle.title = isExpanded ? "收起音乐控制" : "打开音乐控制";
    setIcon(mobileToggle, isExpanded ? "x" : "music-2");
  });

  ambientButton.addEventListener("click", async () => {
    if (ambientAudio.paused || ambientAudio.ended) {
      themeAudio.pause();
      try {
        await ambientAudio.play();
      } catch {
        status.textContent = "氛围音播放失败";
      }
    } else {
      ambientAudio.pause();
    }
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }

    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }

    ambientAudio.pause();
    objectUrl = URL.createObjectURL(file);
    themeAudio.src = objectUrl;
    themeAudio.dataset.fileName = file.name;
    title.textContent = file.name.replace(/\.[^.]+$/, "");

    try {
      await themeAudio.play();
    } catch {
      status.textContent = "音频已载入，点击即可播放";
    }

    fileInput.value = "";
    syncTheme();
  });

  ["play", "pause", "ended", "loadedmetadata", "error"].forEach((eventName) => {
    themeAudio.addEventListener(eventName, syncTheme);
  });

  ["play", "pause", "ended", "error"].forEach((eventName) => {
    ambientAudio.addEventListener(eventName, syncAmbient);
  });

  syncTheme();
  syncAmbient();
}

function init() {
  refreshIcons();
  initHeader();
  initReveal();
  initCountdown();
  initFireworks();
  initStarRain();
  initWishes();
  initMusic();
}

init();
