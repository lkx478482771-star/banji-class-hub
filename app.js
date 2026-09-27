const STORAGE_KEY = "banji-state-v1";
const FILE_DB_NAME = "banji-shared-files";
const FILE_STORE_NAME = "files";
const SHARED_CACHE_KEY = "banji-shared-cache-v1";
const PENDING_SHARED_KEY = "banji-shared-pending-v1";
const VISITOR_KEY = "banji-visitor-v1";
const sharedConfig = window.BANJI_CONFIG || {};
const syncState = {
  inFlight: false,
  retryTimer: null,
  available: null
};

const PAGE_INFO = {
  today: { title: "今日班级", eyebrow: "班级服务台" },
  "mutual-aid": { title: "互助广场", eyebrow: "让问题更快被看见" },
  teams: { title: "任务搭子", eyebrow: "找同伴，也找行动力" },
  resources: { title: "资源共享", eyebrow: "让好资料在班级里流动" },
  feedback: { title: "匿名意见箱", eyebrow: "认真收集，公开改进" },
  candidate: { title: "我的竞选页", eyebrow: "用作品证明行动力" }
};

const POST_TYPE_META = {
  求助: { color: "orange", icon: "circle-help" },
  失物: { color: "red", icon: "search-check" },
  借用: { color: "blue", icon: "package-open" },
  学习: { color: "green", icon: "book-open-check" }
};

const PROMISE_DEFAULTS = [
  {
    title: "需求有回音",
    text: "所有公开求助在当天确认，能解决的给时间点，暂时解决不了的说明原因。"
  },
  {
    title: "信息不遗漏",
    text: "把通知、截止日期和班级事项集中整理，重要事项至少提前两次提醒。"
  },
  {
    title: "规则更透明",
    text: "评优、活动名额和班级支出可查询，有疑问时给出明确、可追踪的答复。"
  }
];

const ui = {
  page: "today",
  aidFilter: "全部",
  aidQuery: "",
  resourceFilter: "全部",
  resourceQuery: "",
  globalQuery: "",
  notificationsOpen: false
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dateAtOffset(days, hour = 20, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function createSeedState() {
  return {
    candidate: {
      name: "候选人",
      slogan: "让每个声音有回应，让每件小事有结果",
      intro:
        "我想把班委工作从临时通知变成稳定服务：问题有入口，处理有进度，结果有反馈。班集就是这个想法的第一份行动答卷。",
      letter:
        "各位同学：\n\n竞选班委，我不只是想多一个头衔。我想把大家每天真正会遇到的小麻烦，做成看得见、用得上的解决方案。\n\n班集会持续记录需求、汇总截止日期、连接互助和资源，也会把匿名意见变成公开行动。如果当选，我会每周发布一次处理清单，让每一条意见都知道自己走到了哪里。\n\n请大家用这个网站检验我的执行力。",
      promises: PROMISE_DEFAULTS.map((item) => ({ ...item }))
    },
    deadlines: [
      {
        id: "d-1",
        title: "大学英语单元展示",
        category: "课程",
        due: dateAtOffset(1, 14),
        priority: "高",
        done: false
      },
      {
        id: "d-2",
        title: "奖学金材料班级汇总",
        category: "材料",
        due: dateAtOffset(3, 17),
        priority: "高",
        done: false
      },
      {
        id: "d-3",
        title: "高等数学阶段测验",
        category: "考试",
        due: dateAtOffset(6, 9),
        priority: "中",
        done: false
      },
      {
        id: "d-4",
        title: "志愿服务报名截止",
        category: "活动",
        due: dateAtOffset(9, 18),
        priority: "中",
        done: false
      }
    ],
    posts: [
      {
        id: "p-1",
        type: "借用",
        title: "周三下午有人顺路去图书馆吗？",
        description: "想请同学帮忙借一本专业参考书，校园卡和取书码都已经准备好。",
        place: "图书馆南门",
        author: "周琪",
        createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
        responseCount: 3,
        status: "open"
      },
      {
        id: "p-2",
        type: "失物",
        title: "在三教捡到一张校园卡",
        description: "卡面姓氏为张，目前放在三教一楼值班室，请失主尽快领取。",
        place: "三教一楼",
        author: "陈可",
        createdAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
        responseCount: 5,
        status: "resolved"
      },
      {
        id: "p-3",
        type: "学习",
        title: "求高数第 3 章错题整理",
        description: "想交换复习笔记，我这里有线代前三章的公式汇总和例题。",
        place: "线上",
        author: "许成",
        createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        responseCount: 2,
        status: "open"
      },
      {
        id: "p-4",
        type: "求助",
        title: "周五晚搬社团物资，差一位同学",
        description: "预计 40 分钟，从大学生活动中心搬到二食堂门口，有推车。",
        place: "大学生活动中心",
        author: "林晓",
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        responseCount: 1,
        status: "open"
      },
      {
        id: "p-5",
        type: "求助",
        title: "谁能借一下四级听力耳机？",
        description: "周六上午考试结束后归还，可以带一杯咖啡作为感谢。",
        place: "二号教学楼",
        author: "王然",
        createdAt: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
        responseCount: 4,
        status: "resolved"
      }
    ],
    teams: [
      {
        id: "t-1",
        title: "大学英语情景展示组队",
        type: "课程作业",
        description: "已有选题方向，希望找两位擅长口语和视频剪辑的同学。",
        date: dateAtOffset(2, 16),
        place: "文科楼 304",
        members: 3,
        capacity: 5,
        owner: "姜南"
      },
      {
        id: "t-2",
        title: "周六上午羽毛球搭子",
        type: "运动",
        description: "新手友好，主要是活动身体，结束后可以一起吃饭。",
        date: dateAtOffset(4, 9),
        place: "体育馆 3 号场",
        members: 2,
        capacity: 4,
        owner: "赵一"
      },
      {
        id: "t-3",
        title: "敬老院志愿服务小队",
        type: "志愿",
        description: "负责陪伴聊天和节目协助，统一记录志愿服务时长。",
        date: dateAtOffset(7, 13),
        place: "校门口集合",
        members: 5,
        capacity: 8,
        owner: "林晓"
      },
      {
        id: "t-4",
        title: "高数互助晚自习",
        type: "学习",
        description: "每周固定两次，先做题再互相讲思路，拒绝只报答案。",
        date: dateAtOffset(1, 19),
        place: "图书馆 4 楼",
        members: 4,
        capacity: 6,
        owner: "许成"
      }
    ],
    resources: [
      {
        id: "r-1",
        title: "高数上册期末复习清单",
        category: "课程资料",
        size: "18 KB",
        uploader: "班集资料组",
        uploadedAt: dateAtOffset(-6, 10),
        content:
          "# 高数上册期末复习清单\n\n1. 极限与连续\n2. 导数与微分\n3. 微分中值定理\n4. 不定积分\n5. 定积分及应用\n\n建议：每章整理 5 道代表题，错误原因单独标注。\n"
      },
      {
        id: "r-2",
        title: "四六级高频词两周计划",
        category: "考试提升",
        size: "24 KB",
        uploader: "英语学习小组",
        uploadedAt: dateAtOffset(-4, 16),
        content:
          "# 四六级高频词两周计划\n\n- 每天 60 个新词\n- 次日复习 120 个旧词\n- 每周完成一套听力\n- 错词按阅读、听力、写作分类\n"
      },
      {
        id: "r-3",
        title: "创新创业比赛计划书模板",
        category: "竞赛模板",
        size: "31 KB",
        uploader: "科创委员",
        uploadedAt: dateAtOffset(-2, 9),
        content:
          "# 创新创业比赛计划书模板\n\n一、项目背景\n二、用户痛点\n三、解决方案\n四、市场分析\n五、商业模式\n六、团队分工\n七、财务预测\n八、风险与应对\n"
      },
      {
        id: "r-4",
        title: "奖学金申请材料检查表",
        category: "办事指南",
        size: "12 KB",
        uploader: "班集资料组",
        uploadedAt: dateAtOffset(-1, 15),
        content:
          "# 奖学金申请材料检查表\n\n- [ ] 申请审批表\n- [ ] 成绩单\n- [ ] 获奖证明\n- [ ] 志愿服务证明\n- [ ] 个人陈述\n- [ ] 电子材料命名规范\n"
      }
    ],
    suggestions: [
      {
        id: "s-1",
        category: "班级事务",
        text: "希望每月公开一次班费收支，截图和用途放在同一个文件里。",
        urgent: false,
        createdAt: dateAtOffset(-1, 21),
        status: "已纳入计划"
      },
      {
        id: "s-2",
        category: "学习互助",
        text: "考前可以组织一次自愿答疑，建议提前收集大家最没把握的章节。",
        urgent: false,
        createdAt: dateAtOffset(-2, 18),
        status: "处理中"
      },
      {
        id: "s-3",
        category: "日常服务",
        text: "快递站晚上排队太久，能否统计大家的空档时间，试试错峰取件。",
        urgent: false,
        createdAt: dateAtOffset(-4, 12),
        status: "已反馈"
      }
    ],
    poll: {
      question: "如果班级先上线一个固定服务，你最希望是？",
      options: [
        { text: "公开待办与截止提醒", votes: 23 },
        { text: "每周资料整理与共享", votes: 18 },
        { text: "匿名意见与公开回应", votes: 14 },
        { text: "学习、运动和竞赛组队", votes: 19 }
      ],
      userVote: null
    },
    notifications: [
      {
        id: "n-1",
        title: "奖学金材料还有 3 天截止",
        text: "已有 12 位同学完成提交，缺材料的同学可在资源页下载检查表。",
        time: "今天 09:20",
        type: "deadline",
        read: false
      },
      {
        id: "n-2",
        title: "你的求助收到了新回应",
        text: "高数错题交换已有 2 位同学回应。",
        time: "今天 08:45",
        type: "help",
        read: false
      },
      {
        id: "n-3",
        title: "匿名意见已更新进度",
        text: "“每月公开班费收支”已纳入本期改进计划。",
        time: "昨天 21:10",
        type: "feedback",
        read: true
      }
    ],
    counters: {
      solved: 18,
      responses: 31
    }
  };
}

function loadState() {
  const defaults = createSeedState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved) {
      return defaults;
    }

    return {
      ...defaults,
      ...saved,
      candidate: {
        ...defaults.candidate,
        ...(saved.candidate || {}),
        promises:
          Array.isArray(saved.candidate?.promises) && saved.candidate.promises.length
            ? saved.candidate.promises
            : defaults.candidate.promises
      },
      poll: {
        ...defaults.poll,
        ...(saved.poll || {}),
        options:
          Array.isArray(saved.poll?.options) && saved.poll.options.length
            ? saved.poll.options
            : defaults.poll.options
      },
      counters: { ...defaults.counters, ...(saved.counters || {}) }
    };
  } catch (error) {
    return defaults;
  }
}

let state = loadState();

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nl2br(value) {
  return escapeHTML(value).replace(/\n/g, "<br>");
}

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    showToast("保存失败", "浏览器本地空间不足，请删除部分上传资料后重试。");
  }
}

function refreshIcons(root = document) {
  if (window.lucide?.createIcons) {
    window.lucide.createIcons({
      root,
      attrs: {
        "stroke-width": 1.9
      }
    });
  }
}

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatShortDate(value) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatMonthDay(value) {
  const date = parseDate(value);
  return {
    day: String(date.getDate()).padStart(2, "0"),
    month: `${date.getMonth() + 1}月`
  };
}

function formatDateTime(value) {
  const date = parseDate(value);
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, "0")}:${String(
    date.getMinutes()
  ).padStart(2, "0")}`;
}

function formatRelativeTime(value) {
  const delta = Date.now() - parseDate(value).getTime();
  const minutes = Math.max(1, Math.floor(delta / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return formatShortDate(value);
}

function daysUntil(value) {
  const target = parseDate(value);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function dueLabel(value) {
  const days = daysUntil(value);
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days === 0) return "今天截止";
  if (days === 1) return "明天截止";
  return `${days} 天后截止`;
}

function toDateInputValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getInitials(name) {
  const cleaned = String(name || "候选人").trim();
  if (!cleaned) return "竞";
  return cleaned.slice(-1);
}

function getReadiness() {
  const candidate = state.candidate;
  let score = 46;
  if (candidate.name && candidate.name !== "候选人") score += 10;
  if (candidate.slogan?.length >= 14) score += 10;
  if (candidate.intro?.length >= 40) score += 10;
  if (candidate.promises?.filter((item) => item.title && item.text).length >= 3) score += 12;
  if (candidate.letter?.length >= 120) score += 8;
  score += Math.min(4, Math.floor((state.resources.length + state.posts.length + state.teams.length) / 4));
  return Math.min(score, 98);
}

function updateShell() {
  const openPosts = state.posts.filter((item) => item.status === "open").length;
  const candidateName = state.candidate.name || "候选人";
  const initials = getInitials(candidateName);
  const readiness = getReadiness();
  const unreadCount = state.notifications.filter((item) => !item.read).length;

  document.getElementById("top-candidate-name").textContent = candidateName;
  document.getElementById("top-avatar").textContent = initials;
  document.getElementById("nav-post-count").textContent = String(openPosts);
  document.getElementById("candidate-readiness").textContent = `${readiness}%`;
  document.getElementById("candidate-progress-bar").style.width = `${readiness}%`;
  document.getElementById("notification-dot").classList.toggle("is-read", unreadCount === 0);
}

function render() {
  const info = PAGE_INFO[ui.page] || PAGE_INFO.today;
  document.getElementById("page-title").textContent = info.title;
  document.getElementById("page-eyebrow").textContent = info.eyebrow;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === ui.page);
  });

  const renderers = {
    today: renderDashboard,
    "mutual-aid": renderMutualAid,
    teams: renderTeams,
    resources: renderResources,
    feedback: renderFeedback,
    candidate: renderCandidate
  };

  const app = document.getElementById("app");
  app.innerHTML = (renderers[ui.page] || renderDashboard)();
  updateShell();
  renderNotificationPanel();
  refreshIcons(app);
}

function navigate(page) {
  if (!PAGE_INFO[page]) return;
  ui.page = page;
  ui.notificationsOpen = false;
  document.getElementById("notification-panel").hidden = true;
  document.body.classList.remove("sidebar-open");
  if (location.hash !== `#${page}`) {
    history.replaceState(null, "", `#${page}`);
  }
  render();
  document.getElementById("app").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const openPosts = state.posts.filter((item) => item.status === "open").length;
  const openTeams = state.teams.filter((item) => item.members < item.capacity).length;
  const pendingDeadlines = state.deadlines.filter((item) => !item.done).length;
  const resourceCount = state.resources.length;
  const activeSuggestions = state.suggestions.filter((item) => item.status !== "已完成").length;
  const sortedDeadlines = [...state.deadlines]
    .filter((item) => !item.done)
    .sort((a, b) => parseDate(a.due) - parseDate(b.due))
    .slice(0, 4);

  const radarItems = [
    {
      label: "待回应求助",
      note: "建议在当天给出处理进度",
      value: openPosts,
      unit: "条",
      page: "mutual-aid",
      color: "orange",
      icon: "hand-heart"
    },
    {
      label: "正在招募的搭子",
      note: "课程、运动、志愿和学习",
      value: openTeams,
      unit: "组",
      page: "teams",
      color: "green",
      icon: "users-round"
    },
    {
      label: "即将截止的事项",
      note: "未来 10 天内需要关注",
      value: pendingDeadlines,
      unit: "项",
      page: "today",
      color: "blue",
      icon: "calendar-clock"
    },
    {
      label: "未完成回应的意见",
      note: "从收集走向公开改进",
      value: activeSuggestions,
      unit: "条",
      page: "feedback",
      color: "yellow",
      icon: "message-square-lock"
    }
  ];

  const activities = [
    ...state.posts.slice(0, 3).map((item) => ({
      title: `${item.author} 发布了${item.type}信息`,
      text: item.title,
      time: formatRelativeTime(item.createdAt),
      color: POST_TYPE_META[item.type]?.color || "blue",
      icon: POST_TYPE_META[item.type]?.icon || "message-circle"
    })),
    {
      title: "匿名意见进入处理清单",
      text: state.suggestions[0]?.text || "暂无意见",
      time: formatRelativeTime(state.suggestions[0]?.createdAt || new Date()),
      color: "yellow",
      icon: "clipboard-check"
    }
  ].slice(0, 4);

  return `
    <div class="page-stack">
      <section class="hero-band">
        <div class="hero-content">
          <span class="hero-badge">${icon("flag")} 竞选作品 · 班级共建站</span>
          <h2>${escapeHTML(state.candidate.slogan || "让每个声音有回应，让每件小事有结果")}</h2>
          <p>把同学每天会遇到的小麻烦，变成有入口、有进度、有结果的服务。</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-action="open-modal" data-modal="post">
              ${icon("plus")}
              发布班级需求
            </button>
            <button class="secondary-button" type="button" data-action="navigate" data-page="candidate">
              ${icon("megaphone")}
              查看我的承诺
            </button>
          </div>
        </div>
      </section>

      <section class="metric-grid" aria-label="班级服务概况">
        <article class="metric">
          <span class="metric-icon orange">${icon("inbox")}</span>
          <div>
            <strong class="metric-value">${openPosts}</strong>
            <span class="metric-label">进行中的互助</span>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon green">${icon("circle-check-big")}</span>
          <div>
            <strong class="metric-value">${state.counters.solved}</strong>
            <span class="metric-label">累计解决的问题</span>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon blue">${icon("library-big")}</span>
          <div>
            <strong class="metric-value">${resourceCount}</strong>
            <span class="metric-label">班级共享资料</span>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon yellow">${icon("calendar-days")}</span>
          <div>
            <strong class="metric-value">${pendingDeadlines}</strong>
            <span class="metric-label">待关注的截止日</span>
          </div>
        </article>
      </section>

      <section class="content-grid">
        <div class="stack">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>班级需求雷达</h3>
                <p>把最需要被处理的事情放在前面</p>
              </div>
              <span class="badge green">实时</span>
            </header>
            <div class="panel-body radar-list">
              ${radarItems
                .map(
                  (item) => `
                    <button class="radar-item" type="button" data-action="navigate" data-page="${item.page}">
                      <span class="radar-icon ${item.color}">${icon(item.icon)}</span>
                      <span class="radar-copy">
                        <strong>${escapeHTML(item.label)}</strong>
                        <small>${escapeHTML(item.note)}</small>
                      </span>
                      <span class="radar-value">
                        <strong>${item.value}</strong>
                        <small>${item.unit}</small>
                      </span>
                    </button>
                  `
                )
                .join("")}
            </div>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>即将截止</h3>
                <p>课程、材料、考试和活动统一提醒</p>
              </div>
              <button class="secondary-button" type="button" data-action="open-modal" data-modal="deadline">
                ${icon("calendar-plus")}
                添加事项
              </button>
            </header>
            <div class="panel-body deadline-list">
              ${
                sortedDeadlines.length
                  ? sortedDeadlines.map(renderDeadlineItem).join("")
                  : renderEmpty("circle-check-big", "暂时没有待办", "新的截止事项会显示在这里。")
              }
            </div>
          </article>

          <article class="panel week-panel">
            <header class="section-header">
              <div>
                <h2>未来 7 天</h2>
                <p class="eyebrow">把班级节奏提前说清楚</p>
              </div>
            </header>
            <div class="week-strip">
              ${renderWeekStrip()}
            </div>
          </article>
        </div>

        <aside class="panel">
          <header class="panel-header">
            <div>
              <h3>班级动态</h3>
              <p>最近发生的回应与改进</p>
            </div>
            <span class="badge blue">${activities.length} 条</span>
          </header>
          <div class="panel-body activity-list">
            ${activities
              .map(
                (item) => `
                  <div class="activity-item">
                    <span class="activity-icon ${item.color}">${icon(item.icon)}</span>
                    <div class="activity-copy">
                      <strong>${escapeHTML(item.title)}</strong>
                      <p>${escapeHTML(item.text)}</p>
                      <time>${escapeHTML(item.time)}</time>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </aside>
      </section>
    </div>
  `;
}

function renderDeadlineItem(item) {
  const date = formatMonthDay(item.due);
  const urgent = daysUntil(item.due) <= 3;
  return `
    <div class="deadline-item ${item.done ? "is-done" : ""}">
      <div class="date-block ${urgent && !item.done ? "is-urgent" : ""}">
        <strong>${date.day}</strong>
        <small>${date.month}</small>
      </div>
      <div class="deadline-copy">
        <strong>${escapeHTML(item.title)}</strong>
        <span>${escapeHTML(item.category)} · ${escapeHTML(dueLabel(item.due))}</span>
      </div>
      <div class="row-actions">
        <button
          class="small-icon-button"
          type="button"
          data-action="toggle-deadline"
          data-id="${item.id}"
          aria-label="${item.done ? "标记为未完成" : "标记为完成"}"
          title="${item.done ? "标记为未完成" : "标记为完成"}"
        >
          ${icon(item.done ? "rotate-ccw" : "check")}
        </button>
        <button
          class="small-icon-button"
          type="button"
          data-action="delete-deadline"
          data-id="${item.id}"
          aria-label="删除事项"
          title="删除事项"
        >
          ${icon("trash-2")}
        </button>
      </div>
    </div>
  `;
}

function renderWeekStrip() {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(date.getDate() + index);
    const sameDayEvents = state.deadlines.filter((item) => {
      const due = parseDate(item.due);
      return (
        due.getFullYear() === date.getFullYear() &&
        due.getMonth() === date.getMonth() &&
        due.getDate() === date.getDate()
      );
    });

    return `
      <div class="day-cell ${index === 0 ? "is-today" : ""}">
        <time>${weekdays[date.getDay()]} · ${date.getMonth() + 1}/${date.getDate()}</time>
        <strong>${index === 0 ? "今天" : `${date.getDate()} 日`}</strong>
        ${
          sameDayEvents.length
            ? sameDayEvents
                .slice(0, 2)
                .map((item) => `<span class="day-event">${escapeHTML(item.title)}</span>`)
                .join("")
            : '<span class="day-event">暂无安排</span>'
        }
      </div>
    `;
  }).join("");
}

function renderMutualAid() {
  const filters = ["全部", "求助", "失物", "借用", "学习"];
  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">同班互助不必等人开口</p>
          <h2>今天需要搭把手的同学</h2>
          <p>问题、失物、借用和学习资料都集中在一个地方，回应不再靠群消息碰运气。</p>
        </div>
        <div class="page-actions">
          <button class="primary-button" type="button" data-action="open-modal" data-modal="post">
            ${icon("plus")}
            发布信息
          </button>
        </div>
      </header>

      <section class="filter-bar">
        ${filters
          .map(
            (filter) => `
              <button
                class="filter-chip ${ui.aidFilter === filter ? "is-active" : ""}"
                type="button"
                data-action="filter-aid"
                data-filter="${filter}"
              >
                ${filter}
              </button>
            `
          )
          .join("")}
        <label class="search-inline">
          ${icon("search")}
          <input id="aid-search" type="search" placeholder="搜索互助信息" value="${escapeHTML(ui.aidQuery)}" />
        </label>
      </section>

      <section class="card-list" id="aid-results">
        ${renderAidCards()}
      </section>
    </div>
  `;
}

function renderAidCards() {
  const query = ui.aidQuery.trim().toLowerCase();
  const filtered = state.posts.filter((item) => {
    const matchesFilter = ui.aidFilter === "全部" || item.type === ui.aidFilter;
    const haystack = `${item.title} ${item.description} ${item.place} ${item.author}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });

  if (!filtered.length) {
    return renderEmpty("search-x", "没有找到匹配信息", "可以更换筛选条件，或发布一条新的班级需求。");
  }

  return filtered.map(renderPostCard).join("");
}

function renderPostCard(item) {
  const meta = POST_TYPE_META[item.type] || { color: "blue", icon: "message-circle" };
  const resolved = item.status === "resolved";
  return `
    <article class="item-card">
      <div class="card-top-row">
        <span class="badge ${meta.color}">${icon(meta.icon)} ${escapeHTML(item.type)}</span>
        <span class="card-time">${formatRelativeTime(item.createdAt)}</span>
      </div>
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.description)}</p>
      <div class="card-meta">
        <span>${icon("map-pin")} ${escapeHTML(item.place || "线上")}</span>
        <span>${icon("message-circle")} ${item.responseCount} 人回应</span>
      </div>
      <div class="card-footer">
        <div class="author">
          <span class="author-avatar">${escapeHTML(getInitials(item.author))}</span>
          <span>
            <strong>${escapeHTML(item.author)}</strong>
            <small>${resolved ? "已完成互助" : "等待回应"}</small>
          </span>
        </div>
        <button
          class="${resolved ? "secondary-button" : "primary-button"}"
          type="button"
          data-action="respond-post"
          data-id="${item.id}"
          ${resolved ? "disabled" : ""}
        >
          ${icon(resolved ? "circle-check" : "hand-heart")}
          ${resolved ? "已解决" : "我能帮忙"}
        </button>
      </div>
    </article>
  `;
}

function renderTeams() {
  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">从“谁有空”变成“直接加入”</p>
          <h2>找到一起行动的同伴</h2>
          <p>课程作业、运动、志愿和学习搭子都可以公开招募，人数与时间一眼看清。</p>
        </div>
        <div class="page-actions">
          <button class="primary-button" type="button" data-action="open-modal" data-modal="team">
            ${icon("user-round-plus")}
            发起组队
          </button>
        </div>
      </header>

      <section class="card-list">
        ${state.teams.map(renderTeamCard).join("")}
      </section>
    </div>
  `;
}

function renderTeamCard(item) {
  const full = item.members >= item.capacity;
  const percentage = Math.min(100, Math.round((item.members / item.capacity) * 100));
  const colorMap = {
    课程作业: "blue",
    运动: "orange",
    志愿: "green",
    学习: "yellow"
  };

  return `
    <article class="team-card">
      <div class="card-top-row">
        <span class="badge ${colorMap[item.type] || "blue"}">${escapeHTML(item.type)}</span>
        <span class="card-time">${formatDateTime(item.date)}</span>
      </div>
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.description)}</p>
      <div class="card-meta">
        <span>${icon("map-pin")} ${escapeHTML(item.place)}</span>
        <span>${icon("user-round")} 发起人 ${escapeHTML(item.owner)}</span>
      </div>
      <div class="team-progress" aria-label="招募进度 ${percentage}%">
        <span style="width: ${percentage}%"></span>
      </div>
      <div class="team-footer">
        <span class="team-slots">${item.members}/${item.capacity} 人已加入</span>
        <button
          class="${full ? "secondary-button" : "primary-button"}"
          type="button"
          data-action="join-team"
          data-id="${item.id}"
          ${full ? "disabled" : ""}
        >
          ${icon(full ? "circle-check" : "plus")}
          ${full ? "已满员" : "加入搭子"}
        </button>
      </div>
    </article>
  `;
}

function renderResources() {
  const filters = ["全部", "课程资料", "考试提升", "竞赛模板", "办事指南", "同学上传"];
  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">资料只发一次，全班随时能找到</p>
          <h2>班级共享资料库</h2>
          <p>常用模板、复习清单和同学上传的资料集中管理，减少重复询问和群文件过期。</p>
        </div>
        <div class="page-actions">
          <button class="primary-button" type="button" data-action="trigger-upload">
            ${icon("upload")}
            上传资料
          </button>
          <input class="visually-hidden" id="resource-file" type="file" />
        </div>
      </header>

      <section class="filter-bar">
        ${filters
          .map(
            (filter) => `
              <button
                class="filter-chip ${ui.resourceFilter === filter ? "is-active" : ""}"
                type="button"
                data-action="filter-resource"
                data-filter="${filter}"
              >
                ${filter}
              </button>
            `
          )
          .join("")}
        <label class="search-inline">
          ${icon("search")}
          <input
            id="resource-search"
            type="search"
            placeholder="搜索文件名或分类"
            value="${escapeHTML(ui.resourceQuery)}"
          />
        </label>
      </section>

      <section class="two-column-form">
        <article class="panel">
          <header class="panel-header">
            <div>
              <h3>资料列表</h3>
              <p>${state.resources.length} 份资料可按需下载</p>
            </div>
          </header>
          <div class="panel-body resource-list" id="resource-results">
            ${renderResourceRows()}
          </div>
        </article>

        <aside class="panel">
          <div class="panel-body">
            <button class="upload-zone full-width" type="button" data-action="trigger-upload">
              <span class="upload-icon">${icon("cloud-upload")}</span>
              <strong>上传一份班级资料</strong>
              <p>支持文档、图片和压缩包，单个文件不超过 15 MB</p>
            </button>
          </div>
        </aside>
      </section>
    </div>
  `;
}

function renderResourceRows() {
  const query = ui.resourceQuery.trim().toLowerCase();
  const filtered = state.resources.filter((item) => {
    const matchesFilter = ui.resourceFilter === "全部" || item.category === ui.resourceFilter;
    const haystack = `${item.title} ${item.category} ${item.uploader || ""}`.toLowerCase();
    return matchesFilter && (!query || haystack.includes(query));
  });

  if (!filtered.length) {
    return renderEmpty("folder-search", "没有找到资料", "可以更换分类，或上传一份新的班级资料。");
  }

  return filtered
    .map(
      (item) => `
        <div class="resource-row">
          <span class="file-icon">${icon(item.stored ? "file-up" : "file-text")}</span>
          <div class="resource-copy">
            <strong>${escapeHTML(item.title)}</strong>
            <small>${escapeHTML(item.category)} · ${escapeHTML(item.size)} · ${escapeHTML(
              item.uploader || "班级同学"
            )}</small>
          </div>
          <div class="row-actions">
            <button
              class="small-icon-button"
              type="button"
              data-action="download-resource"
              data-id="${item.id}"
              aria-label="下载"
              title="下载"
            >
              ${icon("download")}
            </button>
            <button
              class="small-icon-button"
              type="button"
              data-action="delete-resource"
              data-id="${item.id}"
              aria-label="删除"
              title="删除"
            >
              ${icon("trash-2")}
            </button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderFeedback() {
  const poll = state.poll;
  const totalVotes = poll.options.reduce((sum, option) => sum + option.votes, 0);
  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">可以匿名说，也应该被公开回应</p>
          <h2>把意见变成班级改进项</h2>
          <p>不记录姓名，不显示账号。每条意见都会标注处理状态，让反馈不是单向倾诉。</p>
        </div>
        <div class="page-actions">
          <span class="badge green">${icon("shield-check")} 匿名提交</span>
        </div>
      </header>

      <section class="two-column-form">
        <div class="stack">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>写下需要改进的事</h3>
                <p>越具体，越容易形成行动方案</p>
              </div>
            </header>
            <form class="panel-body" id="feedback-form">
              <div class="form-grid">
                <div class="field">
                  <label for="feedback-category">事项类型</label>
                  <select id="feedback-category" name="category" required>
                    <option value="班级事务">班级事务</option>
                    <option value="学习互助">学习互助</option>
                    <option value="日常服务">日常服务</option>
                    <option value="活动建议">活动建议</option>
                    <option value="其他">其他</option>
                  </select>
                </div>
                <div class="field">
                  <label>提交方式</label>
                  <div class="checkbox-row">
                    <input id="anonymous" type="checkbox" checked disabled />
                    <label for="anonymous">匿名提交后不在公开展示中显示任何身份信息</label>
                  </div>
                </div>
              </div>
              <div class="field" style="margin-top: 14px">
                <label for="feedback-text">具体建议</label>
                <textarea
                  id="feedback-text"
                  name="text"
                  minlength="10"
                  maxlength="500"
                  placeholder="例如：希望班费每月公开一次收支明细"
                  required
                ></textarea>
              </div>
              <div class="panel-footer" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px">
                <label class="checkbox-row">
                  <input type="checkbox" name="urgent" />
                  <span>这件事已经影响较多同学，希望优先处理</span>
                </label>
                <button class="primary-button" type="submit">
                  ${icon("send")}
                  匿名提交
                </button>
              </div>
            </form>
          </article>

          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>最近的意见</h3>
                <p>按处理状态持续更新</p>
              </div>
              <span class="badge blue">${state.suggestions.length} 条</span>
            </header>
            <div class="panel-body suggestion-list">
              ${state.suggestions.map(renderSuggestionCard).join("")}
            </div>
          </article>
        </div>

        <aside class="stack">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>本周班级投票</h3>
                <p>${escapeHTML(poll.question)}</p>
              </div>
            </header>
            <div class="panel-body stack">
              ${poll.options
                .map((option, index) => {
                  const percentage = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0;
                  const selected = poll.userVote === index;
                  return `
                    <button
                      class="poll-option ${selected ? "is-selected" : ""}"
                      type="button"
                      data-action="vote-poll"
                      data-index="${index}"
                    >
                      <span class="poll-fill" style="width: ${percentage}%"></span>
                      <span>${escapeHTML(option.text)}</span>
                      <span>${percentage}% · ${option.votes} 票</span>
                    </button>
                  `;
                })
                .join("")}
              <p class="eyebrow" style="margin: 4px 0 0">共 ${totalVotes} 票</p>
            </div>
          </article>

          <article class="panel">
            <div class="panel-body">
              <span class="badge yellow">${icon("clipboard-list")} 处理口径</span>
              <h3 style="margin-top: 13px">每条意见都有状态</h3>
              <div class="activity-list">
                <div class="activity-item">
                  <span class="activity-icon blue">${icon("inbox")}</span>
                  <div class="activity-copy">
                    <strong>已收到</strong>
                    <p>24 小时内进入分类清单</p>
                  </div>
                </div>
                <div class="activity-item">
                  <span class="activity-icon yellow">${icon("loader-circle")}</span>
                  <div class="activity-copy">
                    <strong>处理中</strong>
                    <p>明确负责人和预计时间</p>
                  </div>
                </div>
                <div class="activity-item">
                  <span class="activity-icon green">${icon("circle-check-big")}</span>
                  <div class="activity-copy">
                    <strong>已回应</strong>
                    <p>公开结果，也说明暂时做不到的原因</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </aside>
      </section>
    </div>
  `;
}

function renderSuggestionCard(item) {
  const statusColor = item.status === "已纳入计划" ? "green" : item.status === "处理中" ? "yellow" : "blue";
  return `
    <article class="suggestion-card">
      <div class="card-top-row">
        <span class="badge ${item.urgent ? "red" : statusColor}">${escapeHTML(
          item.urgent ? "优先处理" : item.status
        )}</span>
        <span class="card-time">${formatRelativeTime(item.createdAt)}</span>
      </div>
      <p>${escapeHTML(item.text)}</p>
      <div class="suggestion-footer">
        <span>${escapeHTML(item.category)} · 匿名同学</span>
        <button
          class="small-icon-button"
          type="button"
          data-action="delete-suggestion"
          data-id="${item.id}"
          aria-label="删除意见"
          title="删除意见"
        >
          ${icon("trash-2")}
        </button>
      </div>
    </article>
  `;
}

function renderCandidate() {
  const candidate = state.candidate;
  const readiness = getReadiness();
  const totalResponses = state.posts.reduce((sum, item) => sum + item.responseCount, 0);
  const metrics = [
    { value: state.posts.length + state.teams.length, label: "公开需求与组队" },
    { value: state.resources.length, label: "沉淀共享资料" },
    { value: state.suggestions.length, label: "匿名意见进入处理" },
    { value: totalResponses + state.counters.responses, label: "同学之间的回应" }
  ];

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">这份竞选答卷可以被全班检验</p>
          <h2>不是一句“我会努力”，而是一套现在就能用的方案</h2>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="share-candidate">
            ${icon("share-2")}
            分享作品
          </button>
          <button class="secondary-button" type="button" data-action="print-candidate">
            ${icon("printer")}
            打印承诺
          </button>
          <button class="primary-button" type="button" data-action="open-profile">
            ${icon("pencil")}
            编辑资料
          </button>
        </div>
      </header>

      <section class="candidate-hero">
        <article class="candidate-profile">
          <span class="candidate-avatar">${escapeHTML(getInitials(candidate.name))}</span>
          <div>
            <p class="eyebrow">班级委员候选人</p>
            <h2>${escapeHTML(candidate.name)}</h2>
            <blockquote>“${escapeHTML(candidate.slogan)}”</blockquote>
            <p>${escapeHTML(candidate.intro)}</p>
          </div>
        </article>

        <aside class="promise-card">
          <div>
            <span class="badge green">${icon("gauge")} 竞选主页完成度</span>
            <h3 style="margin-top: 16px">${readiness}%</h3>
            <p>把姓名、简介和三条承诺改成本人的真实表达，竞选展示会更完整。</p>
          </div>
          <button class="secondary-button full-width" type="button" data-action="open-profile">
            ${icon("settings-2")}
            修改竞选资料
          </button>
        </aside>
      </section>

      <section class="promise-grid">
        ${candidate.promises
          .map(
            (promise, index) => `
              <article class="panel" style="padding: 20px">
                <span class="promise-number">${index + 1}</span>
                <h3>${escapeHTML(promise.title)}</h3>
                <p style="margin-bottom: 0; color: var(--ink-soft)">${escapeHTML(promise.text)}</p>
              </article>
            `
          )
          .join("")}
      </section>

      <section class="panel letter-panel">
        <p class="eyebrow">给全班同学的一封信</p>
        <h2>请把票投给愿意把问题做完的人</h2>
        <p>${nl2br(candidate.letter)}</p>
        <p class="letter-signature">${escapeHTML(candidate.name)}</p>
      </section>

      <section>
        <header class="section-header" style="margin-bottom: 12px">
          <div>
            <h2>作品的行动证据</h2>
            <p class="eyebrow">网站中的每次发布、加入、上传和反馈都会形成可见记录</p>
          </div>
        </header>
        <div class="evidence-grid">
          ${metrics
            .map(
              (metric) => `
                <article class="evidence-item">
                  <strong>${metric.value}</strong>
                  <span>${escapeHTML(metric.label)}</span>
                </article>
              `
            )
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function renderEmpty(iconName, title, text) {
  return `
    <div class="empty-state">
      ${icon(iconName)}
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(text)}</span>
    </div>
  `;
}

function renderNotificationPanel() {
  const panel = document.getElementById("notification-panel");
  const list = document.getElementById("notification-list");
  if (!panel || !list) return;
  list.innerHTML = state.notifications
    .map(
      (item) => `
        <div class="notification-row ${item.read ? "" : "is-unread"}">
          <span class="notification-icon">${icon(
            item.type === "deadline" ? "calendar-clock" : item.type === "help" ? "hand-heart" : "message-square-lock"
          )}</span>
          <div class="notification-copy">
            <strong>${escapeHTML(item.title)}</strong>
            <p>${escapeHTML(item.text)}</p>
            <time>${escapeHTML(item.time)}</time>
          </div>
        </div>
      `
    )
    .join("");
  panel.hidden = !ui.notificationsOpen;
  refreshIcons(panel);
}

function openModal(kind) {
  const modalRoot = document.getElementById("modal-root");
  const templates = {
    deadline: {
      title: "添加截止事项",
      subtitle: "让重要日期提前被看见",
      wide: false,
      body: `
        <form id="deadline-form">
          <div class="modal-body">
            <div class="modal-field">
              <label for="deadline-title">事项名称</label>
              <input id="deadline-title" name="title" maxlength="60" placeholder="例如：高数阶段测验" required />
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="deadline-category">类型</label>
                <select id="deadline-category" name="category">
                  <option value="课程">课程</option>
                  <option value="考试">考试</option>
                  <option value="材料">材料</option>
                  <option value="活动">活动</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div class="modal-field">
                <label for="deadline-date">截止时间</label>
                <input
                  id="deadline-date"
                  name="due"
                  type="date"
                  min="${toDateInputValue(new Date())}"
                  value="${toDateInputValue(new Date(Date.now() + 86400000))}"
                  required
                />
              </div>
            </div>
            <div class="modal-field">
              <label for="deadline-priority">优先级</label>
              <select id="deadline-priority" name="priority">
                <option value="高">高</option>
                <option value="中" selected>中</option>
                <option value="低">低</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("plus")} 添加事项</button>
          </div>
        </form>
      `
    },
    post: {
      title: "发布班级信息",
      subtitle: "求助、失物、借用和学习都可以发布",
      wide: false,
      body: `
        <form id="post-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="modal-field">
                <label for="post-type">信息类型</label>
                <select id="post-type" name="type">
                  <option value="求助">求助</option>
                  <option value="失物">失物</option>
                  <option value="借用">借用</option>
                  <option value="学习">学习</option>
                </select>
              </div>
              <div class="modal-field">
                <label for="post-place">地点</label>
                <input id="post-place" name="place" maxlength="30" placeholder="线上或具体地点" required />
              </div>
            </div>
            <div class="modal-field">
              <label for="post-title">一句话说明</label>
              <input id="post-title" name="title" maxlength="60" placeholder="例如：周五晚搬物资差一位同学" required />
            </div>
            <div class="modal-field">
              <label for="post-description">补充信息</label>
              <textarea
                id="post-description"
                name="description"
                maxlength="260"
                placeholder="时间、要求、联系方式或可提供的帮助"
                required
              ></textarea>
            </div>
            <div class="modal-field">
              <label for="post-author">发布人</label>
              <input id="post-author" name="author" maxlength="20" value="${escapeHTML(
                state.candidate.name === "候选人" ? "班级同学" : state.candidate.name
              )}" required />
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("send")} 立即发布</button>
          </div>
        </form>
      `
    },
    team: {
      title: "发起任务组队",
      subtitle: "把时间、地点和人数一次说清楚",
      wide: false,
      body: `
        <form id="team-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="modal-field">
                <label for="team-type">组队类型</label>
                <select id="team-type" name="type">
                  <option value="课程作业">课程作业</option>
                  <option value="运动">运动</option>
                  <option value="志愿">志愿</option>
                  <option value="学习">学习</option>
                  <option value="其他">其他</option>
                </select>
              </div>
              <div class="modal-field">
                <label for="team-date">活动时间</label>
                <input
                  id="team-date"
                  name="date"
                  type="datetime-local"
                  value="${toDateInputValue(new Date(Date.now() + 86400000))}T19:00"
                  required
                />
              </div>
            </div>
            <div class="modal-field">
              <label for="team-title">组队主题</label>
              <input id="team-title" name="title" maxlength="60" placeholder="例如：周末志愿活动集合" required />
            </div>
            <div class="modal-field">
              <label for="team-description">具体安排</label>
              <textarea
                id="team-description"
                name="description"
                maxlength="260"
                placeholder="任务内容、参与要求和注意事项"
                required
              ></textarea>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="team-place">集合地点</label>
                <input id="team-place" name="place" maxlength="30" required />
              </div>
              <div class="modal-field">
                <label for="team-capacity">招募人数</label>
                <input id="team-capacity" name="capacity" type="number" min="2" max="20" value="4" required />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("user-round-plus")} 发起组队</button>
          </div>
        </form>
      `
    },
    profile: {
      title: "编辑竞选资料",
      subtitle: "这些内容只保存在当前浏览器中，可随时继续修改",
      wide: true,
      body: `
        <form id="profile-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="modal-field">
                <label for="profile-name">姓名或称呼</label>
                <input id="profile-name" name="name" maxlength="20" value="${escapeHTML(
                  state.candidate.name
                )}" required />
              </div>
              <div class="modal-field">
                <label for="profile-slogan">竞选主张</label>
                <input id="profile-slogan" name="slogan" maxlength="60" value="${escapeHTML(
                  state.candidate.slogan
                )}" required />
              </div>
            </div>
            <div class="modal-field">
              <label for="profile-intro">个人简介</label>
              <textarea id="profile-intro" name="intro" maxlength="420" required>${escapeHTML(
                state.candidate.intro
              )}</textarea>
            </div>
            ${state.candidate.promises
              .map(
                (promise, index) => `
                  <div class="form-grid">
                    <div class="modal-field">
                      <label for="promise-title-${index}">承诺 ${index + 1} 标题</label>
                      <input
                        id="promise-title-${index}"
                        name="promiseTitle${index}"
                        maxlength="20"
                        value="${escapeHTML(promise.title)}"
                        required
                      />
                    </div>
                    <div class="modal-field">
                      <label for="promise-text-${index}">承诺 ${index + 1} 说明</label>
                      <input
                        id="promise-text-${index}"
                        name="promiseText${index}"
                        maxlength="100"
                        value="${escapeHTML(promise.text)}"
                        required
                      />
                    </div>
                  </div>
                `
              )
              .join("")}
            <div class="modal-field">
              <label for="profile-letter">给同学的一封信</label>
              <textarea id="profile-letter" name="letter" maxlength="1000" style="min-height: 180px" required>${escapeHTML(
                state.candidate.letter
              )}</textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("save")} 保存并更新</button>
          </div>
        </form>
      `
    },
    search: {
      title: "搜索班级内容",
      subtitle: "聚合互助、组队、资料、截止事项与匿名意见",
      wide: true,
      body: `
        <div class="modal-body">
          <label class="search-inline">
            ${icon("search")}
            <input id="global-search-input" type="search" autofocus placeholder="输入关键词" value="${escapeHTML(
              ui.globalQuery
            )}" />
          </label>
          <div class="search-result-list" id="global-search-results">
            ${renderGlobalSearchResults(ui.globalQuery)}
          </div>
        </div>
      `
    }
  };

  const config = templates[kind];
  if (!config) return;
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-action="modal-backdrop">
      <section class="modal ${config.wide ? "modal-wide" : ""}" role="dialog" aria-modal="true" aria-label="${escapeHTML(
        config.title
      )}">
        <header class="modal-header">
          <div>
            <h2>${escapeHTML(config.title)}</h2>
            <p>${escapeHTML(config.subtitle)}</p>
          </div>
          <button
            class="icon-button compact"
            type="button"
            data-action="close-modal"
            aria-label="关闭"
            title="关闭"
          >
            ${icon("x")}
          </button>
        </header>
        ${config.body}
      </section>
    </div>
  `;
  refreshIcons(modalRoot);

  requestAnimationFrame(() => {
    const firstInput = modalRoot.querySelector("input:not([type='hidden']), textarea, select");
    firstInput?.focus();
  });
}

function closeModal() {
  document.getElementById("modal-root").innerHTML = "";
}

function renderGlobalSearchResults(query) {
  const term = query.trim().toLowerCase();
  const records = [
    ...state.posts.map((item) => ({
      title: item.title,
      text: `互助广场 · ${item.type} · ${item.author}`,
      page: "mutual-aid",
      icon: "hand-heart"
    })),
    ...state.teams.map((item) => ({
      title: item.title,
      text: `任务搭子 · ${item.type} · ${item.members}/${item.capacity} 人`,
      page: "teams",
      icon: "users-round"
    })),
    ...state.resources.map((item) => ({
      title: item.title,
      text: `资源共享 · ${item.category} · ${item.size}`,
      page: "resources",
      icon: "library-big"
    })),
    ...state.deadlines.map((item) => ({
      title: item.title,
      text: `截止事项 · ${item.category} · ${dueLabel(item.due)}`,
      page: "today",
      icon: "calendar-clock"
    })),
    ...state.suggestions.map((item) => ({
      title: item.text,
      text: `匿名意见 · ${item.category} · ${item.status}`,
      page: "feedback",
      icon: "message-square-lock"
    }))
  ];

  const filtered = term
    ? records.filter((item) => `${item.title} ${item.text}`.toLowerCase().includes(term))
    : records.slice(0, 6);

  if (!filtered.length) {
    return renderEmpty("search-x", "没有匹配内容", "换一个更短的关键词试试。");
  }

  return filtered
    .slice(0, 12)
    .map(
      (item) => `
        <button class="search-result" type="button" data-action="navigate" data-page="${item.page}">
          <span class="radar-icon green">${icon(item.icon)}</span>
          <span>
            <strong>${escapeHTML(item.title)}</strong>
            <small>${escapeHTML(item.text)}</small>
          </span>
        </button>
      `
    )
    .join("");
}

function updateAidResults() {
  const container = document.getElementById("aid-results");
  if (!container) return;
  container.innerHTML = renderAidCards();
  refreshIcons(container);
}

function updateResourceResults() {
  const container = document.getElementById("resource-results");
  if (!container) return;
  container.innerHTML = renderResourceRows();
  refreshIcons(container);
}

function showToast(title, text) {
  const region = document.getElementById("toast-region");
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `
    <span class="toast-icon">${icon("circle-check")}</span>
    <span>
      <strong>${escapeHTML(title)}</strong>
      <span>${escapeHTML(text)}</span>
    </span>
  `;
  region.appendChild(toast);
  refreshIcons(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 180);
  }, 3200);
}

function hasSharedConfig() {
  return Boolean(sharedConfig.supabaseUrl && sharedConfig.supabaseAnonKey && sharedConfig.recordsTable);
}

function getVisitorId() {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const generated =
      crypto.randomUUID?.() ||
      "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });
    localStorage.setItem(VISITOR_KEY, generated);
    return generated;
  } catch (error) {
    return "00000000-0000-4000-8000-000000000000";
  }
}

function sharedHeaders(extra = {}) {
  return {
    apikey: sharedConfig.supabaseAnonKey,
    Authorization: `Bearer ${sharedConfig.supabaseAnonKey}`,
    Accept: "application/json",
    ...extra
  };
}

function createRequestTimeout(milliseconds) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), milliseconds);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timeout)
  };
}

function getCachedSharedRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SHARED_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cacheSharedRecords(records) {
  try {
    localStorage.setItem(SHARED_CACHE_KEY, JSON.stringify(records.slice(0, 300)));
  } catch (error) {
    // Cloud cache is best-effort when browser storage is unavailable.
  }
}

function getPendingSharedRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PENDING_SHARED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function savePendingSharedRecords(records) {
  try {
    localStorage.setItem(PENDING_SHARED_KEY, JSON.stringify(records.slice(-100)));
  } catch (error) {
    showToast("暂存失败", "当前浏览器无法保存待同步内容。");
  }
}

function setSyncStatus(status, detail = "") {
  const dot = document.getElementById("sync-dot");
  const label = document.getElementById("sync-status");
  if (!dot || !label) return;
  dot.classList.remove("is-syncing", "is-online", "is-offline", "is-unavailable");
  dot.classList.add(
    status === "online"
      ? "is-online"
      : status === "syncing"
        ? "is-syncing"
        : status === "unavailable"
          ? "is-unavailable"
          : "is-offline"
  );
  const messages = {
    syncing: "正在同步班级云...",
    online: detail || "云端已同步",
    offline: "云端较慢 · 已启用本地缓存",
    unavailable: "本地模式 · 云端表未初始化",
    error: "本地模式 · 稍后自动重试"
  };
  label.textContent = messages[status] || messages.offline;
}

function applySharedRecords(records) {
  let changed = false;
  for (const record of records) {
    const payload = record?.payload;
    if (!payload?.id) continue;
    const id = String(payload.id);

    if (record.record_type === "post" && !state.posts.some((item) => item.id === id)) {
      state.posts.push({ ...payload, id, shared: true });
      changed = true;
    }

    if (record.record_type === "team" && !state.teams.some((item) => item.id === id)) {
      state.teams.push({ ...payload, id, shared: true });
      changed = true;
    }

    if (record.record_type === "suggestion" && !state.suggestions.some((item) => item.id === id)) {
      state.suggestions.push({ ...payload, id, shared: true });
      changed = true;
    }

    if (record.record_type === "deadline" && !state.deadlines.some((item) => item.id === id)) {
      state.deadlines.push({ ...payload, id, shared: true });
      changed = true;
    }
  }

  if (changed) {
    state.posts.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
    state.teams.sort((a, b) => parseDate(a.date) - parseDate(b.date));
    state.suggestions.sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
    state.deadlines.sort((a, b) => parseDate(a.due) - parseDate(b.due));
  }

  return changed;
}

async function readSharedRecords(attempt = 1) {
  const endpoint = new URL(
    `/rest/v1/${encodeURIComponent(sharedConfig.recordsTable)}`,
    sharedConfig.supabaseUrl
  );
  endpoint.searchParams.set("select", "record_key,record_type,payload,created_at");
  endpoint.searchParams.set("status", "eq.published");
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "300");

  const request = createRequestTimeout(18_000);
  try {
    const response = await fetch(endpoint, {
      headers: sharedHeaders(),
      credentials: "omit",
      signal: request.signal
    }).finally(request.clear);
    if (!response.ok) {
      const error = new Error(`Shared record read failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } catch (error) {
    request.clear();
    if (attempt < 3 && error.status !== 404) {
      await new Promise((resolve) => window.setTimeout(resolve, 650 * attempt));
      return readSharedRecords(attempt + 1);
    }
    throw error;
  }
}

async function writeSharedRecord(record) {
  const endpoint = new URL(
    `/rest/v1/${encodeURIComponent(sharedConfig.recordsTable)}`,
    sharedConfig.supabaseUrl
  );
  const request = createRequestTimeout(22_000);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: sharedHeaders({
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    }),
    body: JSON.stringify(record),
    credentials: "omit",
    signal: request.signal
  }).finally(request.clear);

  if (!response.ok) {
    const error = new Error(`Shared record write failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
}

function queueSharedRecord(recordType, payload) {
  if (!hasSharedConfig() || !payload?.id) return;
  const recordKey = `${recordType}:${payload.id}`;
  const pending = getPendingSharedRecords().filter((item) => item.record_key !== recordKey);
  pending.push({
    record_key: recordKey,
    record_type: recordType,
    payload,
    visitor_id: getVisitorId(),
    status: "published"
  });
  savePendingSharedRecords(pending);
  void flushPendingSharedRecords()
    .then(() => {
      syncState.available = true;
      setSyncStatus("online", "已同步到班级云");
    })
    .catch((error) => {
      if (error.status === 404) {
        syncState.available = false;
        setSyncStatus("unavailable");
      } else {
        setSyncStatus("offline");
        scheduleSharedSync();
      }
    });
}

async function flushPendingSharedRecords() {
  if (!hasSharedConfig()) return 0;
  const pending = getPendingSharedRecords();
  if (!pending.length) return 0;
  let uploaded = 0;

  for (const record of pending) {
    try {
      await writeSharedRecord(record);
      uploaded += 1;
      const remaining = getPendingSharedRecords().filter(
        (item) => item.record_key !== record.record_key
      );
      savePendingSharedRecords(remaining);
    } catch (error) {
      throw error;
    }
  }

  return uploaded;
}

function scheduleSharedSync(delay = 12_000) {
  if (syncState.retryTimer) return;
  syncState.retryTimer = window.setTimeout(() => {
    syncState.retryTimer = null;
    void syncSharedRecords();
  }, delay);
}

async function syncSharedRecords() {
  if (syncState.inFlight || !hasSharedConfig()) {
    if (!hasSharedConfig()) setSyncStatus("unavailable");
    return;
  }

  syncState.inFlight = true;
  setSyncStatus("syncing");
  try {
    await flushPendingSharedRecords();
    const records = await readSharedRecords();
    cacheSharedRecords(records);
    const changed = applySharedRecords(records);
    syncState.available = true;
    if (changed) {
      saveState();
      render();
    }
    setSyncStatus("online", `云端已同步 · ${records.length} 条`);
  } catch (error) {
    if (error.status === 404) {
      syncState.available = false;
      setSyncStatus("unavailable");
    } else {
      syncState.available = false;
      setSyncStatus("offline");
      scheduleSharedSync();
    }
  } finally {
    syncState.inFlight = false;
  }
}

function openFileDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FILE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FILE_STORE_NAME)) {
        database.createObjectStore(FILE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeFile(key, file) {
  const database = await openFileDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).put(file, key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function readStoredFile(key) {
  const database = await openFileDatabase();
  const file = await new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readonly");
    const request = transaction.objectStore(FILE_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return file;
}

async function deleteStoredFile(key) {
  const database = await openFileDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(FILE_STORE_NAME, "readwrite");
    transaction.objectStore(FILE_STORE_NAME).delete(key);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

function readableFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleFileUpload(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    showToast("文件过大", "单个文件请控制在 15 MB 以内。");
    input.value = "";
    return;
  }

  const id = uid("file");
  try {
    await storeFile(id, file);
    state.resources.unshift({
      id,
      title: file.name.replace(/\.[^.]+$/, ""),
      fileName: file.name,
      category: "同学上传",
      size: readableFileSize(file.size),
      uploader: state.candidate.name === "候选人" ? "班级同学" : state.candidate.name,
      uploadedAt: new Date().toISOString(),
      stored: true
    });
    saveState();
    render();
    showToast("资料已上传", "班级同学现在可以在资源页下载。");
  } catch (error) {
    showToast("上传失败", "当前浏览器未能保存文件，请确认未禁用本地存储。");
  } finally {
    input.value = "";
  }
}

async function downloadResource(id) {
  const resource = state.resources.find((item) => item.id === id);
  if (!resource) return;
  let blob;
  let fileName;
  if (resource.stored) {
    const file = await readStoredFile(id);
    if (!file) {
      showToast("文件不可用", "原始文件已被清理，请重新上传。");
      return;
    }
    blob = file;
    fileName = file.name || resource.fileName || resource.title;
  } else {
    blob = new Blob([resource.content || ""], { type: "text/markdown;charset=utf-8" });
    fileName = `${resource.title}.md`;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  showToast("开始下载", fileName);
}

function handleClick(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === "modal-backdrop") {
    if (event.target === actionElement) closeModal();
    return;
  }

  if (action === "navigate") {
    navigate(actionElement.dataset.page);
    return;
  }

  if (action === "close-modal") {
    closeModal();
    return;
  }

  if (action === "toggle-sidebar") {
    document.body.classList.toggle("sidebar-open");
    return;
  }

  if (action === "close-sidebar") {
    document.body.classList.remove("sidebar-open");
    return;
  }

  if (action === "open-profile") {
    openModal("profile");
    return;
  }

  if (action === "open-modal") {
    openModal(actionElement.dataset.modal);
    return;
  }

  if (action === "toggle-notifications") {
    ui.notificationsOpen = !ui.notificationsOpen;
    renderNotificationPanel();
    return;
  }

  if (action === "mark-notifications-read") {
    state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
    saveState();
    renderNotificationPanel();
    updateShell();
    showToast("通知已读完", "新的班级动态会继续提醒你。");
    return;
  }

  if (action === "open-search") {
    ui.globalQuery = "";
    openModal("search");
    return;
  }

  if (action === "filter-aid") {
    ui.aidFilter = actionElement.dataset.filter;
    render();
    return;
  }

  if (action === "filter-resource") {
    ui.resourceFilter = actionElement.dataset.filter;
    render();
    return;
  }

  if (action === "toggle-deadline") {
    const item = state.deadlines.find((deadline) => deadline.id === actionElement.dataset.id);
    if (item) {
      item.done = !item.done;
      if (item.done) state.counters.solved += 1;
      saveState();
      render();
      showToast(item.done ? "事项已完成" : "已恢复待办", item.title);
    }
    return;
  }

  if (action === "delete-deadline") {
    state.deadlines = state.deadlines.filter((deadline) => deadline.id !== actionElement.dataset.id);
    saveState();
    render();
    showToast("事项已删除", "列表已经更新。");
    return;
  }

  if (action === "respond-post") {
    const item = state.posts.find((post) => post.id === actionElement.dataset.id);
    if (item) {
      item.responseCount += 1;
      item.status = "resolved";
      state.counters.responses += 1;
      state.counters.solved += 1;
      saveState();
      render();
      showToast("回应已送达", "这项互助已标记为解决。");
    }
    return;
  }

  if (action === "join-team") {
    const item = state.teams.find((team) => team.id === actionElement.dataset.id);
    if (item && item.members < item.capacity) {
      item.members += 1;
      saveState();
      render();
      showToast("已加入搭子", item.title);
    }
    return;
  }

  if (action === "trigger-upload") {
    document.getElementById("resource-file")?.click();
    return;
  }

  if (action === "download-resource") {
    downloadResource(actionElement.dataset.id);
    return;
  }

  if (action === "delete-resource") {
    const item = state.resources.find((resource) => resource.id === actionElement.dataset.id);
    if (!item) return;
    state.resources = state.resources.filter((resource) => resource.id !== item.id);
    if (item.stored) {
      deleteStoredFile(item.id).catch(() => {});
    }
    saveState();
    render();
    showToast("资料已移除", item.title);
    return;
  }

  if (action === "vote-poll") {
    const nextIndex = Number(actionElement.dataset.index);
    const previousIndex = state.poll.userVote;
    if (previousIndex !== null && state.poll.options[previousIndex]) {
      state.poll.options[previousIndex].votes = Math.max(0, state.poll.options[previousIndex].votes - 1);
    }
    state.poll.options[nextIndex].votes += 1;
    state.poll.userVote = nextIndex;
    saveState();
    render();
    showToast("投票已记录", "结果已经更新。");
    return;
  }

  if (action === "delete-suggestion") {
    state.suggestions = state.suggestions.filter((item) => item.id !== actionElement.dataset.id);
    saveState();
    render();
    showToast("意见已归档", "列表中不再展示这条内容。");
    return;
  }

  if (action === "share-candidate") {
    const shareUrl = location.href;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(shareUrl)
        .then(() => showToast("链接已复制", "可以发给班级同学查看。"))
        .catch(() => showToast("分享地址", shareUrl));
    } else {
      showToast("分享地址", shareUrl);
    }
    return;
  }

  if (action === "print-candidate") {
    window.print();
  }
}

function handleSubmit(event) {
  const form = event.target;

  if (form.id === "deadline-form") {
    event.preventDefault();
    const data = new FormData(form);
    const item = {
      id: uid("deadline"),
      title: String(data.get("title")).trim(),
      category: String(data.get("category")),
      due: new Date(`${data.get("due")}T20:00:00`).toISOString(),
      priority: String(data.get("priority")),
      done: false
    };
    state.deadlines.push(item);
    queueSharedRecord("deadline", item);
    saveState();
    closeModal();
    render();
    showToast("事项已添加", "截止提醒会出现在首页。");
    return;
  }

  if (form.id === "post-form") {
    event.preventDefault();
    const data = new FormData(form);
    const item = {
      id: uid("post"),
      type: String(data.get("type")),
      title: String(data.get("title")).trim(),
      description: String(data.get("description")).trim(),
      place: String(data.get("place")).trim(),
      author: String(data.get("author")).trim(),
      createdAt: new Date().toISOString(),
      responseCount: 0,
      status: "open"
    };
    state.posts.unshift(item);
    queueSharedRecord("post", item);
    saveState();
    closeModal();
    navigate("mutual-aid");
    showToast("信息已发布", "新的班级需求已经出现在互助广场。");
    return;
  }

  if (form.id === "team-form") {
    event.preventDefault();
    const data = new FormData(form);
    const item = {
      id: uid("team"),
      type: String(data.get("type")),
      title: String(data.get("title")).trim(),
      description: String(data.get("description")).trim(),
      date: new Date(String(data.get("date"))).toISOString(),
      place: String(data.get("place")).trim(),
      members: 1,
      capacity: Number(data.get("capacity")),
      owner: state.candidate.name === "候选人" ? "班级同学" : state.candidate.name
    };
    state.teams.unshift(item);
    queueSharedRecord("team", item);
    saveState();
    closeModal();
    navigate("teams");
    showToast("组队已发起", "同学现在可以查看并加入。");
    return;
  }

  if (form.id === "feedback-form") {
    event.preventDefault();
    const data = new FormData(form);
    const item = {
      id: uid("suggestion"),
      category: String(data.get("category")),
      text: String(data.get("text")).trim(),
      urgent: data.get("urgent") === "on",
      createdAt: new Date().toISOString(),
      status: "已收到"
    };
    state.suggestions.unshift(item);
    queueSharedRecord("suggestion", item);
    saveState();
    render();
    showToast("匿名意见已收到", "它会进入班级改进清单。");
    return;
  }

  if (form.id === "profile-form") {
    event.preventDefault();
    const data = new FormData(form);
    state.candidate = {
      name: String(data.get("name")).trim(),
      slogan: String(data.get("slogan")).trim(),
      intro: String(data.get("intro")).trim(),
      letter: String(data.get("letter")).trim(),
      promises: [0, 1, 2].map((index) => ({
        title: String(data.get(`promiseTitle${index}`)).trim(),
        text: String(data.get(`promiseText${index}`)).trim()
      }))
    };
    saveState();
    closeModal();
    render();
    showToast("竞选资料已更新", "首页与竞选页已经同步。");
  }
}

function handleInput(event) {
  const target = event.target;
  if (target.id === "aid-search") {
    ui.aidQuery = target.value;
    updateAidResults();
    return;
  }

  if (target.id === "resource-search") {
    ui.resourceQuery = target.value;
    updateResourceResults();
    return;
  }

  if (target.id === "global-search-input") {
    ui.globalQuery = target.value;
    const results = document.getElementById("global-search-results");
    if (results) {
      results.innerHTML = renderGlobalSearchResults(ui.globalQuery);
      refreshIcons(results);
    }
  }
}

function handleChange(event) {
  if (event.target.id === "resource-file") {
    handleFileUpload(event);
  }
}

function handleKeydown(event) {
  if (event.key === "Escape") {
    closeModal();
    ui.notificationsOpen = false;
    renderNotificationPanel();
    document.body.classList.remove("sidebar-open");
  }
}

function initialize() {
  const hashPage = location.hash.replace("#", "");
  if (PAGE_INFO[hashPage]) {
    ui.page = hashPage;
  }

  applySharedRecords(getCachedSharedRecords());
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("input", handleInput);
  document.addEventListener("change", handleChange);
  document.addEventListener("keydown", handleKeydown);
  window.addEventListener("hashchange", () => {
    const page = location.hash.replace("#", "");
    if (PAGE_INFO[page] && page !== ui.page) {
      navigate(page);
    }
  });

  render();
  void syncSharedRecords();
}

initialize();
