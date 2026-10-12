const STORAGE_KEY = "banji-state-v1";
const FILE_DB_NAME = "banji-shared-files";
const FILE_STORE_NAME = "files";
const SHARED_CACHE_KEY = "banji-shared-cache-v1";
const PENDING_SHARED_KEY = "banji-shared-pending-v1";
const VISITOR_KEY = "banji-visitor-v1";
const AUTH_SESSION_KEY = "banji-auth-session-v1";
const LOCAL_ACCOUNTS_KEY = "banji-local-accounts-v1";
const DEFAULT_CLASS_ID = "ahu-ic-2026";
const DEFAULT_CLASS_CODE = "AHU-IC-2026";
const sharedConfig = window.BANJI_CONFIG || {};
const authState = {
  ready: false,
  mode: "login",
  error: "",
  busy: false,
  session: null,
  passwordVisible: false,
  role: "student",
  identityNote: "",
  classCode: DEFAULT_CLASS_CODE
};
// 登录/注册表单里用户已经敲进去的密码。提交、切换“登录/注册”、点“显示密码”都会整表重建
// 登录界面，而密码框出于安全考虑不带 value 属性，重建后就会变空——用户会看到“密码突然全部
// 消失”，接着被 required 卡住导致注册失败。这里在重建前把密码抓出来、渲染完填回去。
const authPasswordDraft = { "auth-password": "", "auth-confirm": "" };

function captureAuthDraft() {
  Object.keys(authPasswordDraft).forEach((id) => {
    const field = document.getElementById(id);
    if (field) authPasswordDraft[id] = field.value;
  });
}

function restoreAuthDraft() {
  Object.keys(authPasswordDraft).forEach((id) => {
    const field = document.getElementById(id);
    if (field) field.value = authPasswordDraft[id];
  });
}

function clearAuthDraft() {
  Object.keys(authPasswordDraft).forEach((id) => {
    authPasswordDraft[id] = "";
  });
}

const syncState = {
  inFlight: false,
  retryTimer: null,
  available: null,
  accountChecked: false,
  localImported: false,
  usageFailed: false
};
// 本轮刚刚上传成功的记录：即使列表接口暂时还没返回它们，也不能被对账误删。
const recentlyUploadedSharedKeys = new Set();

const PAGE_INFO = {
  today: { title: "今日班级", eyebrow: "班级服务台" },
  sports: { title: "IC-4 运动会", eyebrow: "一片晶圆，全员通电" },
  "mutual-aid": { title: "互助广场", eyebrow: "让问题更快被看见" },
  teams: { title: "任务搭子", eyebrow: "找同伴，也找行动力" },
  resources: { title: "资源共享", eyebrow: "让好资料在班级里流动" },
  profile: { title: "个人中心", eyebrow: "我的身份与发布记录" },
  history: { title: "历史记录", eyebrow: "已经过期但可以继续查看" },
  classes: { title: "班级管理", eyebrow: "按班级隔离成员与内容" },
  members: { title: "成员身份", eyebrow: "让每个人知道自己该找谁" },
  feedback: { title: "匿名意见箱", eyebrow: "认真收集，公开改进" },
  candidate: { title: "我的竞选页", eyebrow: "用作品证明行动力" }
};

const POST_TYPE_META = {
  求助: { color: "orange", icon: "circle-help" },
  失物: { color: "red", icon: "search-check" },
  借用: { color: "blue", icon: "package-open" },
  学习: { color: "green", icon: "book-open-check" }
};

const ROLE_META = {
  student: { label: "普通同学", icon: "graduation-cap", color: "blue", group: "student" },
  monitor: { label: "班长", icon: "crown", color: "green", group: "committee" },
  vice_monitor: { label: "副班长", icon: "badge-check", color: "green", group: "committee" },
  league_secretary: { label: "团支书", icon: "flag", color: "orange", group: "committee" },
  study: { label: "学习委员", icon: "book-open-check", color: "blue", group: "committee" },
  life: { label: "生活委员", icon: "heart-handshake", color: "yellow", group: "committee" },
  sports: { label: "体育委员", icon: "dumbbell", color: "orange", group: "committee" },
  arts: { label: "文艺委员", icon: "music", color: "red", group: "committee" },
  psychology: { label: "心理委员", icon: "heart-pulse", color: "green", group: "committee" },
  publicity: { label: "宣传委员", icon: "megaphone", color: "blue", group: "committee" },
  organization: { label: "组织委员", icon: "clipboard-list", color: "yellow", group: "committee" },
  discipline: { label: "纪律委员", icon: "shield", color: "red", group: "committee" },
  labor: { label: "劳动委员", icon: "hammer", color: "green", group: "committee" },
  teacher: { label: "任课老师", icon: "presentation", color: "blue", group: "faculty" },
  head_teacher: { label: "班主任", icon: "school", color: "orange", group: "faculty" },
  counselor: { label: "辅导员", icon: "briefcase-business", color: "green", group: "faculty" },
  admin: { label: "管理员", icon: "shield-check", color: "red", group: "faculty" }
};

const ROLE_GROUPS = {
  faculty: "教师、辅导员与管理员",
  committee: "班级委员会",
  student: "普通同学"
};

const PUBLISH_LIMITS = {
  total: 10,
  post: 5,
  team: 5,
  suggestion: 5,
  deadline: 5
};

const TASK_PUBLISH_ROLES = [
  "monitor",
  "vice_monitor",
  "league_secretary",
  "study",
  "life",
  "sports",
  "arts",
  "psychology",
  "publicity",
  "organization",
  "discipline",
  "labor",
  "teacher",
  "head_teacher",
  "counselor"
];

const SCHEDULE_EDIT_ROLES = [
  "monitor",
  "vice_monitor",
  "teacher",
  "head_teacher",
  "counselor"
];

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
  memberFilter: "全部",
  memberQuery: "",
  members: [],
  membersLoading: false,
  membersLoaded: false,
  dailyUsage: null,
  dailyUsageLoading: false,
  history: [],
  historyLoading: false,
  historyLoaded: false,
  classes: [],
  classAccounts: [],
  classesLoading: false,
  classesLoaded: false,
  schedule: null,
  scheduleLoading: false,
  scheduleLoaded: false,
  scheduleImportMessage: "",
  scheduleImportBookmarklet: "",
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
    const saved = JSON.parse(localStorage.getItem(currentStorageKey) || "null");
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
    // 本地数据损坏时不能静默回默认值，否则用户会以为内容丢了。
    try {
      showToast("本地数据解析失败，已重置", "已恢复为初始数据。");
    } catch (notifyError) {
      // 启动早期通知区域可能尚未就绪，忽略。
    }
    return defaults;
  }
}

let currentStorageKey = STORAGE_KEY;
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
    localStorage.setItem(currentStorageKey, JSON.stringify(state));
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

function formatTimeRemaining(value) {
  if (!value) return "长期保留";
  const milliseconds = parseDate(value).getTime() - Date.now();
  if (milliseconds <= 0) return "已到归档时间";
  const hours = Math.max(1, Math.ceil(milliseconds / 3600000));
  return `${hours} 小时后归档`;
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

function getRoleMeta(role) {
  return ROLE_META[role] || ROLE_META.student;
}

function normalizeRole(role) {
  return ROLE_META[role] ? role : "student";
}

function isAdminUsername(username) {
  const key = localUsernameKey(username);
  return (sharedConfig.adminUsernames || []).some(
    (adminName) => localUsernameKey(adminName) === key
  );
}

function resolveAccountRole(account) {
  if (isAdminUsername(account?.username)) return "admin";
  return normalizeRole(account?.role);
}

function isCurrentAdmin() {
  return (
    authState.session?.role === "admin" ||
    isAdminUsername(authState.session?.username)
  );
}

function canViewCampaign() {
  const username = authState.session?.username;
  return (sharedConfig.campaignUsernames || []).some(
    (campaignName) => localUsernameKey(campaignName) === localUsernameKey(username)
  );
}

function normalizeClassCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function classIdFromCode(value) {
  return normalizeClassCode(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
}

function currentClassId() {
  return authState.session?.classId || DEFAULT_CLASS_ID;
}

function canManageClasses() {
  return (
    isCurrentAdmin() ||
    ["head_teacher", "counselor", "teacher"].includes(authState.session?.role)
  );
}

function hasRolePermission(roles) {
  return isCurrentAdmin() || roles.includes(authState.session?.role);
}

function canPublishTask() {
  return hasRolePermission(TASK_PUBLISH_ROLES);
}

function canEditSchedule() {
  return hasRolePermission(SCHEDULE_EDIT_ROLES);
}

function isRecordExpired(payload) {
  if (!payload?.expiresAt) return false;
  return parseDate(payload.expiresAt).getTime() <= Date.now();
}

function normalizeUsername(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < 2 || username.length > 20) {
    return "账号名称需要 2 到 20 个字符。";
  }
  if (!/^[\p{L}\p{N}_\-\u00b7\s]+$/u.test(username)) {
    return "账号名称只能包含文字、数字、空格、下划线、短横线或间隔点。";
  }
  return "";
}

function fallbackHash(value) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 16777619);
    second ^= code + index;
    second = Math.imul(second, 2246822519);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value) {
  const pairs = String(value || "").match(/.{2}/g) || [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
}

function getLocalAccounts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveLocalAccounts(accounts) {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function localUsernameKey(username) {
  return normalizeUsername(username).toLocaleLowerCase("zh-CN");
}

// 口令派生。新账号用 60 万次迭代；老账号记录里没有 iterations 字段，按其历史上使用的
// 12 万次校验，登录成功后再静默升级（见 loginAccount）。
const PASSWORD_ITERATIONS = 600000;
const LEGACY_PASSWORD_ITERATIONS = 120000;
const PASSWORD_MIN_LENGTH = 8;

async function deriveLocalPassword(password, saltHex, algorithm, iterations) {
  if (algorithm === "fallback") {
    // 历史遗留：极早期在没有 WebCrypto 的环境里注册的账号，只能用这个非密码学散列验证，
    // 否则那些账号会永久登不进来。新注册一律走 PBKDF2（见 deriveNewPassword）。
    return fallbackHash(`${saltHex}:${password}`);
  }
  if (!crypto.subtle?.importKey) {
    throw new Error(
      "当前浏览器不支持 WebCrypto，无法安全校验口令。请改用 https 打开本站。"
    );
  }
  const rounds = Number(iterations) || LEGACY_PASSWORD_ITERATIONS;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: rounds,
      hash: "SHA-256"
    },
    key,
    256
  );
  return bytesToHex(new Uint8Array(bits));
}

async function deriveNewPassword(password, saltHex) {
  if (!crypto.subtle?.importKey) {
    // 不要退回非密码学散列：那只会给出"看起来加密过"的错觉。
    throw new Error(
      "当前浏览器不支持 WebCrypto，无法安全保存口令。请改用 https 打开本站。"
    );
  }
  return deriveLocalPassword(password, saltHex, "pbkdf2", PASSWORD_ITERATIONS);
}

function createLocalSession(account) {
  return {
    access_token: "",
    refresh_token: "",
    expires_at: 4102444800,
    user: {
      id: account.id,
      email: ""
    },
    username: account.username,
    role: resolveAccountRole(account),
    pendingRole: account.pendingRole ? normalizeRole(account.pendingRole) : "",
    identityNote: String(account.identityNote || ""),
    identityStatus: account.identityStatus || "student",
    classId: account.classId || DEFAULT_CLASS_ID,
    classCode: account.classCode || DEFAULT_CLASS_CODE,
    className: account.className || "安徽大学集成电路专业班级",
    local: true,
    offline: false
  };
}

function saveAuthSession(session) {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    // The active session can continue in memory even if storage is blocked.
  }
}

function stateStorageKey(userId, classId = DEFAULT_CLASS_ID) {
  return `${STORAGE_KEY}:${userId}:${classId || DEFAULT_CLASS_ID}`;
}

function activateClassState() {
  const userId = authState.session?.user.id;
  const classId = currentClassId();
  const legacyKey = `${STORAGE_KEY}:${userId}`;
  const nextKey = stateStorageKey(userId, classId);
  if (
    classId === DEFAULT_CLASS_ID &&
    !localStorage.getItem(nextKey) &&
    localStorage.getItem(legacyKey)
  ) {
    localStorage.setItem(nextKey, localStorage.getItem(legacyKey));
  }
  currentStorageKey = nextKey;
  state = loadState();
  if (classId !== DEFAULT_CLASS_ID) {
    state.posts = [];
    state.teams = [];
    state.suggestions = [];
    state.deadlines = [];
    state.resources = [];
  }
  applySharedRecords(getCachedSharedRecords());
  state.candidate.name = authState.session?.username || state.candidate.name;
  saveState();
}

function getSavedAuthSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || "null");
    return parsed?.user?.id ? parsed : null;
  } catch (error) {
    return null;
  }
}

async function restoreAuthSession() {
  const saved = getSavedAuthSession();
  if (!saved) return null;
  if (!saved.local) {
    localStorage.removeItem(AUTH_SESSION_KEY);
    return null;
  }
  authState.session = saved;
  return saved;
}

async function activateAccount(session) {
  authState.session = session;
  authState.error = "";
  authState.busy = false;
  authState.ready = true;
  syncState.accountChecked = false;
  syncState.localImported = false;
  ui.membersLoaded = false;
  ui.members = [];
  ui.dailyUsage = null;
  ui.historyLoaded = false;
  ui.history = [];
  ui.classesLoaded = false;
  ui.classes = [];
  ui.classAccounts = [];
  ui.scheduleLoaded = false;
  ui.schedule = null;
  saveAuthSession(session);
  activateClassState();
  ui.page = "today";
  history.replaceState(null, "", "#today");
  render();
  void syncSharedRecords();
}

async function registerAccount(
  username,
  password,
  confirmPassword,
  role,
  identityNote,
  classCode
) {
  const nameError = validateUsername(username);
  if (nameError) throw new Error(nameError);
  if (password.length < PASSWORD_MIN_LENGTH || password.length > 72) {
    throw new Error(
      `密码需要 ${PASSWORD_MIN_LENGTH} 到 72 个字符，并且不要使用你在其他网站用过的密码。`
    );
  }
  if (password !== confirmPassword) {
    throw new Error("两次输入的密码不一致。");
  }

  const cleanName = normalizeUsername(username);
  const usernameKey = localUsernameKey(cleanName);
  const normalizedClassCode = normalizeClassCode(classCode || DEFAULT_CLASS_CODE);
  const classInfo = await readRemoteClassByCode(normalizedClassCode);
  if (!classInfo) {
    throw new Error("班级编码不存在，请向管理员确认后重新输入。");
  }
  const requestedRole = normalizeRole(role);
  const normalizedRole = isAdminUsername(cleanName)
    ? "admin"
    : requestedRole === "student"
      ? "student"
      : "student";
  const pendingRole =
    isAdminUsername(cleanName) || requestedRole === "student" ? "" : requestedRole;
  const identityStatus = isAdminUsername(cleanName)
    ? "approved"
    : requestedRole === "student"
      ? "student"
      : "pending";
  const cleanIdentityNote = String(identityNote || "").trim().slice(0, 60);
  let remoteAccount = null;
  try {
    remoteAccount = await readRemoteAccount(usernameKey);
  } catch (error) {
    throw new Error("暂时无法连接账号服务，请检查网络后重试。");
  }
  const accounts = getLocalAccounts();
  if (
    remoteAccount ||
    accounts.some((account) => account.usernameKey === usernameKey)
  ) {
    throw new Error("这个账号名称已经被使用。");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = bytesToHex(salt);
  const passwordHash = await deriveNewPassword(password, saltHex);
  const account = {
    id: crypto.randomUUID?.() || `local-${Date.now().toString(36)}`,
    username: cleanName,
    usernameKey,
    salt: saltHex,
    passwordHash,
    algorithm: "pbkdf2",
    iterations: PASSWORD_ITERATIONS,
    role: normalizedRole,
    pendingRole,
    identityNote: cleanIdentityNote,
    identityStatus,
    classId: classInfo.id,
    classCode: classInfo.code,
    className: classInfo.name,
    createdAt: new Date().toISOString()
  };
  accounts.push(account);
  saveLocalAccounts(accounts);
  try {
    await writeRemoteAccount(account);
  } catch (error) {
    saveLocalAccounts(accounts.filter((item) => item.usernameKey !== usernameKey));
    throw new Error("账号暂时无法保存到共享数据库，请稍后重试。");
  }
  const session = createLocalSession(account);
  await activateAccount(session);
  showToast(
    pendingRole ? "账号已创建，身份待审核" : "账号已创建",
    pendingRole
      ? `你申请的“${getRoleMeta(pendingRole).label}”需要管理员确认。`
      : `欢迎你，${cleanName}。`
  );
}

async function loginAccount(username, password) {
  const nameError = validateUsername(username);
  if (nameError) throw new Error(nameError);
  if (!password) throw new Error("请输入密码。");
  const cleanName = normalizeUsername(username);
  const usernameKey = localUsernameKey(cleanName);
  let account = null;
  try {
    account = await readRemoteAccount(usernameKey);
  } catch (error) {
    account = getLocalAccounts().find((item) => item.usernameKey === usernameKey) || null;
  }
  if (!account) {
    account = getLocalAccounts().find((item) => item.usernameKey === usernameKey) || null;
  }
  if (!account) throw new Error("账号名称或密码不正确。");
  const passwordHash = await deriveLocalPassword(
    password,
    account.salt,
    account.algorithm,
    account.iterations
  );
  if (passwordHash !== account.passwordHash) {
    throw new Error("账号名称或密码不正确。");
  }

  // 老账号用的是更少的迭代次数：这次登录成功后顺手升到当前标准。
  // 升级失败（例如离线）不影响本次登录。
  let storedAccount = account;
  const currentRounds = Number(account.iterations || LEGACY_PASSWORD_ITERATIONS);
  if (account.algorithm === "pbkdf2" && currentRounds < PASSWORD_ITERATIONS) {
    try {
      storedAccount = {
        ...account,
        passwordHash: await deriveNewPassword(password, account.salt),
        algorithm: "pbkdf2",
        iterations: PASSWORD_ITERATIONS
      };
    } catch (error) {
      storedAccount = account;
    }
  }

  const localAccounts = getLocalAccounts().filter(
    (item) => item.usernameKey !== usernameKey
  );
  localAccounts.push({ ...storedAccount, salt: storedAccount.salt });
  saveLocalAccounts(localAccounts);
  if (storedAccount !== account && hasSharedConfig()) {
    void writeRemoteAccount(storedAccount).catch(() => {});
  }
  await activateAccount(createLocalSession(storedAccount));
  showToast("登录成功", `欢迎回来，${storedAccount.username}。`);
}

function logoutAccount(renderAfter = true) {
  authState.session = null;
  authState.error = "";
  authState.mode = "login";
  authState.busy = false;
  localStorage.removeItem(AUTH_SESSION_KEY);
  currentStorageKey = STORAGE_KEY;
  state = loadState();
  ui.membersLoaded = false;
  ui.members = [];
  ui.dailyUsage = null;
  ui.historyLoaded = false;
  ui.history = [];
  ui.classesLoaded = false;
  ui.classes = [];
  ui.classAccounts = [];
  ui.scheduleLoaded = false;
  ui.schedule = null;
  closeModal();
  ui.notificationsOpen = false;
  if (renderAfter) {
    render();
  }
}

function renderAuthScreen() {
  if (!authState.ready) {
    return `
      <div class="auth-loading">
        <span class="loading-mark">班</span>
        <span>正在识别本机账号...</span>
      </div>
    `;
  }

  const isRegister = authState.mode === "register";
  return `
    <div class="auth-page">
      <section class="auth-visual">
        <div class="auth-visual-content">
          <div class="auth-brand">
            <span class="brand-mark">班</span>
            <span>班集 · 班级共建站</span>
          </div>
          <h1>让每个同学都能被看见，也让每件事都有回音。</h1>
          <p>登录后进入班级互助、组队、资源共享、截止提醒和匿名意见空间。</p>
        </div>
      </section>
      <section class="auth-form-side">
        <div class="auth-card">
          <p class="eyebrow">${isRegister ? "第一次使用" : "本机身份识别"}</p>
          <h2>${isRegister ? "创建班级账号" : "欢迎回到班集"}</h2>
          <p>${isRegister ? "账号名称不能重复，密码至少 6 位。" : "输入账号名称和密码即可继续。"}</p>
          <div class="auth-tabs" role="tablist" aria-label="账号操作">
            <button
              class="auth-tab ${isRegister ? "" : "is-active"}"
              type="button"
              role="tab"
              aria-selected="${!isRegister}"
              data-action="auth-mode"
              data-mode="login"
            >
              登录
            </button>
            <button
              class="auth-tab ${isRegister ? "is-active" : ""}"
              type="button"
              role="tab"
              aria-selected="${isRegister}"
              data-action="auth-mode"
              data-mode="register"
            >
              注册
            </button>
          </div>
          <form class="auth-form" id="auth-form">
            <div class="auth-field">
              <label for="auth-username">账号名称</label>
              <div class="auth-input-wrap">
                ${icon("user-round")}
                <input
                  id="auth-username"
                  name="username"
                  maxlength="20"
                  autocomplete="username"
                  value="${escapeHTML(authState.username || "")}"
                  placeholder="你的名字"
                  required
                />
              </div>
            </div>
            <div class="auth-field">
              <label for="auth-password">密码</label>
              <div class="auth-input-wrap">
                ${icon("lock-keyhole")}
                <input
                  id="auth-password"
                  name="password"
                  type="${authState.passwordVisible ? "text" : "password"}"
                  maxlength="72"
                  autocomplete="${isRegister ? "new-password" : "current-password"}"
                  placeholder="至少 6 位"
                  required
                />
                <button
                  class="auth-password-toggle"
                  type="button"
                  data-action="toggle-password"
                  aria-label="${authState.passwordVisible ? "隐藏密码" : "显示密码"}"
                  title="${authState.passwordVisible ? "隐藏密码" : "显示密码"}"
                >
                  ${icon(authState.passwordVisible ? "eye-off" : "eye")}
                </button>
              </div>
            </div>
            ${
              isRegister
                ? `
                  <div class="auth-field">
                    <label for="auth-confirm">确认密码</label>
                    <div class="auth-input-wrap">
                      ${icon("shield-check")}
                      <input
                        id="auth-confirm"
                        name="confirmPassword"
                        type="${authState.passwordVisible ? "text" : "password"}"
                        maxlength="72"
                        autocomplete="new-password"
                        placeholder="再次输入密码"
                        required
                      />
                    </div>
                  </div>
                  <div class="auth-field">
                    <label for="auth-class-code">班级编码</label>
                    <div class="auth-input-wrap">
                      ${icon("key-round")}
                      <input
                        id="auth-class-code"
                        name="classCode"
                        maxlength="40"
                        value="${escapeHTML(authState.classCode || DEFAULT_CLASS_CODE)}"
                        placeholder="例如：AHU-IC-2026"
                        required
                      />
                    </div>
                  </div>
                  <div class="auth-field">
                    <label for="auth-role">班级身份</label>
                    <div class="auth-input-wrap">
                      ${icon("badge-check")}
                      <select id="auth-role" name="role">
                        ${Object.entries(ROLE_GROUPS)
                          .map(
                            ([group, groupLabel]) => `
                              <optgroup label="${escapeHTML(groupLabel)}">
                                ${Object.entries(ROLE_META)
                                  .filter(([role, meta]) => meta.group === group && role !== "admin")
                                  .map(
                                    ([role, meta]) => `
                                      <option value="${role}" ${
                                        normalizeRole(authState.role) === role ? "selected" : ""
                                      }>
                                        ${escapeHTML(meta.label)}
                                      </option>
                                    `
                                  )
                                  .join("")}
                              </optgroup>
                            `
                          )
                          .join("")}
                      </select>
                    </div>
                  </div>
                  <div class="auth-field">
                    <label for="auth-identity-note">职务、课程或负责事项</label>
                    <div class="auth-input-wrap">
                      ${icon("notebook-pen")}
                      <input
                        id="auth-identity-note"
                        name="identityNote"
                        maxlength="60"
                        value="${escapeHTML(authState.identityNote || "")}"
                        placeholder="例如：负责高等数学答疑"
                      />
                    </div>
                  </div>
                `
                : ""
            }
            <p class="auth-error" id="auth-error">${escapeHTML(authState.error)}</p>
            <button class="primary-button auth-submit" type="submit" ${authState.busy ? "disabled" : ""}>
              ${icon(authState.busy ? "loader-circle" : isRegister ? "user-round-plus" : "log-in")}
              ${authState.busy ? "正在处理..." : isRegister ? "创建并进入" : "登录并进入"}
            </button>
          </form>
          <div class="auth-footnote">
            ${icon("shield-check")}
            <span>登录状态保存在这台设备中，下次打开会自动识别；退出登录后才需要重新输入。</span>
          </div>
        </div>
      </section>
    </div>
  `;
}

function describeAuthError(error) {
  const message = String(error?.message || "");
  if (/already registered|already been registered|user already registered/i.test(message)) {
    return "这个账号名称已经被使用，请换一个名字。";
  }
  if (/invalid login|invalid credentials|invalid_grant/i.test(message)) {
    return "账号名称或密码不正确。";
  }
  if (/password/i.test(message)) {
    return "密码不符合要求，请使用至少 6 个字符。";
  }
  if (/fetch|network|load failed|failed to fetch/i.test(message)) {
    return "暂时无法连接账号服务，请检查网络后重试。";
  }
  return message || "操作没有完成，请稍后重试。";
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
  const candidateName = authState.session?.username || state.candidate.name || "候选人";
  const roleMeta = getRoleMeta(authState.session?.role);
  const roleLabel = roleMeta.label;
  const initials = getInitials(candidateName);
  const readiness = getReadiness();
  const unreadCount = state.notifications.filter((item) => !item.read).length;

  document.getElementById("top-candidate-name").textContent = candidateName;
  document.getElementById("top-role-label").textContent = authState.session?.pendingRole
    ? `${roleLabel} · 待审核`
    : roleLabel;
  document.getElementById("readiness-label").textContent =
    roleMeta.group === "faculty" ? "身份资料完整度" : "竞选主页";
  document.getElementById("campaign-progress-card").hidden = !canViewCampaign();
  document.getElementById("nav-class-manager").hidden = !canManageClasses();
  document.getElementById("top-avatar").textContent = initials;
  document.getElementById("nav-post-count").textContent = String(openPosts);
  document.getElementById("candidate-readiness").textContent = `${readiness}%`;
  document.getElementById("candidate-progress-bar").style.width = `${readiness}%`;
  document.getElementById("notification-dot").classList.toggle("is-read", unreadCount === 0);
}

function applyIdentityTheme() {
  const roleMeta = getRoleMeta(authState.session?.role);
  document.body.classList.remove(
    "identity-student",
    "identity-committee",
    "identity-faculty",
    "is-admin",
    "is-special-role"
  );
  document.body.classList.add(`identity-${roleMeta.group}`);
  if (roleMeta.group !== "student") {
    document.body.classList.add("is-special-role");
  }
  if (isCurrentAdmin()) {
    document.body.classList.add("is-admin");
  }
}

function render() {
  const authRoot = document.getElementById("auth-root");
  if (authState.session) clearAuthDraft();
  if (!authState.ready || !authState.session) {
    document.body.classList.add("is-auth-required");
    document.getElementById("page-title").textContent = "登录班集";
    document.getElementById("page-eyebrow").textContent = "本机账号识别";
    if (authState.ready) captureAuthDraft();
    authRoot.innerHTML = renderAuthScreen();
    restoreAuthDraft();
    document.getElementById("notification-panel").hidden = true;
    refreshIcons(authRoot);
    return;
  }

  document.body.classList.remove("is-auth-required");
  authRoot.innerHTML = "";
  applyIdentityTheme();
  const info = PAGE_INFO[ui.page] || PAGE_INFO.today;
  document.getElementById("page-title").textContent = info.title;
  document.getElementById("page-eyebrow").textContent = info.eyebrow;
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.page === ui.page);
  });

  const renderers = {
    today: renderDashboard,
    sports: renderSports,
    "mutual-aid": renderMutualAid,
    teams: renderTeams,
    resources: renderResources,
    profile: renderPersonalCenter,
    history: renderHistory,
    classes: renderClassManager,
    members: renderMembers,
    feedback: renderFeedback,
    candidate: renderCandidate
  };

  const app = document.getElementById("app");
  const focusSnapshot = captureFocusState();
  app.innerHTML = (renderers[ui.page] || renderDashboard)();
  updateShell();
  renderNotificationPanel();
  refreshIcons(app);
  if (ui.page === "sports") {
    mountSports();
  } else {
    unmountSports();
  }
  restoreFocusState(focusSnapshot);
}

// 全量重渲染会重建输入框，这里记住并恢复焦点与光标位置。
function focusSelector(node) {
  if (!node || node === document.body) return null;
  const escape = (value) => String(value).replace(/["\\]/g, "\\$&");
  if (node.id) return `[id="${escape(node.id)}"]`;
  const action = node.dataset ? node.dataset.action : "";
  if (!action) return null;
  const parts = [`data-action="${escape(action)}"`];
  ["page", "id", "key"].forEach((name) => {
    const value = node.dataset[name];
    if (value) parts.push(`data-${name}="${escape(value)}"`);
  });
  return `[${parts.join("][")}]`;
}

function captureFocusState() {
  const node = document.activeElement;
  const selector = focusSelector(node);
  if (!selector) return null;
  const snapshot = { selector };
  try {
    if (typeof node.selectionStart === "number") {
      snapshot.selectionStart = node.selectionStart;
      snapshot.selectionEnd = node.selectionEnd;
    }
  } catch (error) {
    // 部分输入类型不支持读取选区，忽略即可。
  }
  return snapshot;
}

function restoreFocusState(snapshot) {
  if (!snapshot || !snapshot.selector) return;
  try {
    const node = document.querySelector(snapshot.selector);
    if (!node) return;
    node.focus({ preventScroll: true });
    if (
      typeof snapshot.selectionStart === "number" &&
      typeof node.setSelectionRange === "function"
    ) {
      node.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  } catch (error) {
    // 恢复焦点失败不影响渲染。
  }
}

function navigate(page) {
  if (!PAGE_INFO[page]) return;
  if (page === "candidate" && !canViewCampaign()) {
    showToast("没有访问权限", "竞选栏目仅对作品作者账号开放。");
    page = "profile";
  }
  if (page === "classes" && !canManageClasses()) {
    showToast("没有管理权限", "班级管理仅对管理员、教师和辅导员开放。");
    page = "profile";
  }
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
  void syncSharedRecords();
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
  const roleMeta = getRoleMeta(authState.session?.role);
  const isSpecialRole = roleMeta.group !== "student";
  const heroTitle = canViewCampaign()
    ? state.candidate.slogan || "让每个声音有回应，让每件小事有结果"
    : isSpecialRole
      ? `${roleMeta.label}工作台：把班级事务处理到位`
      : "今天，班级有什么需要一起解决？";
  const heroText = canViewCampaign()
    ? "把同学每天会遇到的小麻烦，变成有入口、有进度、有结果的服务。"
    : isSpecialRole
      ? "集中处理任务、日程、成员身份与反馈，让每项安排都有负责人和结果。"
      : "查看互助、共享资源、任务搭子和班级安排，也可以发布自己的真实需求。";

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
          <span class="hero-badge">${icon(canViewCampaign() ? "flag" : "layout-dashboard")} ${
            canViewCampaign()
              ? "竞选作品 · 班级共建站"
              : `${escapeHTML(roleMeta.label)} · ${escapeHTML(
                  authState.session?.className || "班级服务台"
                )}`
          }</span>
          <h2>${escapeHTML(heroTitle)}</h2>
          <p>${escapeHTML(heroText)}</p>
          <div class="hero-actions">
            <button class="primary-button" type="button" data-action="open-modal" data-modal="post">
              ${icon("plus")}
              发布班级需求
            </button>
            <button class="secondary-button" type="button" data-action="navigate" data-page="members">
              ${icon("users-round")}
              查看成员身份
            </button>
          </div>
        </div>
      </section>

      ${
        isSpecialRole
          ? `
            <section class="role-workbench">
              <div class="role-workbench-copy">
                <span class="badge ${roleMeta.color}">${icon(roleMeta.icon)} ${escapeHTML(roleMeta.label)}</span>
                <h2>${escapeHTML(roleMeta.label)}工作台</h2>
                <p>${escapeHTML(
                  isCurrentAdmin()
                    ? "管理员拥有全部权限，可审核身份、发布任务、编辑日程和清理历史记录。"
                    : "这里集中展示与你职责相关的管理和编辑入口。"
                )}</p>
              </div>
              <div class="role-workbench-actions">
                ${
                  canPublishTask()
                    ? `
                      <button class="secondary-button" type="button" data-action="open-modal" data-modal="team">
                        ${icon("user-round-plus")}
                        发布任务
                      </button>
                    `
                    : ""
                }
                ${
                  canEditSchedule()
                    ? `
                      <button class="secondary-button" type="button" data-action="open-modal" data-modal="deadline">
                        ${icon("calendar-plus")}
                        编辑日程
                      </button>
                    `
                    : ""
                }
                ${
                  isCurrentAdmin()
                    ? `
                      <button class="secondary-button" type="button" data-action="navigate" data-page="members">
                        ${icon("shield-check")}
                        身份审核
                      </button>
                      <button class="secondary-button" type="button" data-action="navigate" data-page="history">
                        ${icon("archive")}
                        历史记录
                      </button>
                    `
                    : ""
                }
              </div>
            </section>
          `
          : ""
      }

      <section class="metric-grid" aria-label="班级服务概况">
        <button class="metric metric-button" type="button" data-action="navigate" data-page="mutual-aid">
          <span class="metric-icon orange">${icon("inbox")}</span>
          <div>
            <strong class="metric-value">${openPosts}</strong>
            <span class="metric-label">进行中的互助</span>
          </div>
        </button>
        <button class="metric metric-button" type="button" data-action="navigate" data-page="profile">
          <span class="metric-icon green">${icon("circle-check-big")}</span>
          <div>
            <strong class="metric-value">${state.counters.solved}</strong>
            <span class="metric-label">累计解决的问题</span>
          </div>
        </button>
        <button class="metric metric-button" type="button" data-action="navigate" data-page="resources">
          <span class="metric-icon blue">${icon("library-big")}</span>
          <div>
            <strong class="metric-value">${resourceCount}</strong>
            <span class="metric-label">班级共享资料</span>
          </div>
        </button>
        <button class="metric metric-button" type="button" data-action="scroll-to" data-target="deadline-panel">
          <span class="metric-icon yellow">${icon("calendar-days")}</span>
          <div>
            <strong class="metric-value">${pendingDeadlines}</strong>
            <span class="metric-label">待关注的截止日</span>
          </div>
        </button>
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

          <article class="panel" id="deadline-panel">
            <header class="panel-header">
              <div>
                <h3>即将截止</h3>
                <p>课程、材料、考试和活动统一提醒</p>
              </div>
              ${
                canEditSchedule()
                  ? `
                    <button class="secondary-button" type="button" data-action="open-modal" data-modal="deadline">
                      ${icon("calendar-plus")}
                      添加事项
                    </button>
                  `
                  : `
                    <span class="badge yellow">${icon("lock-keyhole")} 班长、副班长、辅导员或教师可编辑</span>
                  `
              }
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
              ${
                canEditSchedule()
                  ? `
                    <button class="secondary-button" type="button" data-action="open-modal" data-modal="deadline">
                      ${icon("pencil")}
                      编辑未来 7 天
                    </button>
                  `
                  : `
                    <span class="badge blue">${icon("lock-keyhole")} 指定班委与教师可编辑</span>
                  `
              }
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
        <span>${escapeHTML(item.category)} · ${escapeHTML(dueLabel(item.due))} · ${escapeHTML(
          formatTimeRemaining(item.expiresAt)
        )}</span>
      </div>
      <div class="row-actions">
        <button
          class="small-icon-button"
          type="button"
          data-action="toggle-deadline"
          data-id="${escapeHTML(item.id)}"
          aria-label="${item.done ? "标记为未完成" : "标记为完成"}"
          title="${item.done ? "标记为未完成" : "标记为完成"}"
        >
          ${icon(item.done ? "rotate-ccw" : "check")}
        </button>
        ${
          canManageItem(item)
            ? `
              <button
                class="small-icon-button"
                type="button"
                data-action="delete-shared-record"
                data-record-type="deadline"
                data-id="${escapeHTML(item.id)}"
                aria-label="删除事项"
                title="删除事项"
              >
                ${icon("trash-2")}
              </button>
            `
            : ""
        }
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
        <div class="row-actions">
          ${
            canManageItem(item)
              ? `
                <button
                  class="small-icon-button"
                  type="button"
                  data-action="delete-shared-record"
                  data-record-type="post"
                  data-id="${escapeHTML(item.id)}"
                  aria-label="删除信息"
                  title="删除信息"
                >
                  ${icon("trash-2")}
                </button>
              `
              : ""
          }
          <button
            class="${resolved ? "secondary-button" : "primary-button"}"
            type="button"
            data-action="respond-post"
            data-id="${escapeHTML(item.id)}"
            ${resolved ? "disabled" : ""}
          >
            ${icon(resolved ? "circle-check" : "hand-heart")}
            ${resolved ? "已解决" : "我能帮忙"}
          </button>
        </div>
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
          ${
            canPublishTask()
              ? `
                <button class="primary-button" type="button" data-action="open-modal" data-modal="team">
                  ${icon("user-round-plus")}
                  发起组队
                </button>
              `
              : `
                <span class="badge yellow">${icon("lock-keyhole")} 班委、教师、辅导员或管理员可发布</span>
              `
          }
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
        <span>${icon("clock-3")} ${escapeHTML(formatTimeRemaining(item.expiresAt))}</span>
      </div>
      <div class="team-progress" aria-label="招募进度 ${percentage}%">
        <span style="width: ${percentage}%"></span>
      </div>
      <div class="team-footer">
        <span class="team-slots">${item.members}/${item.capacity} 人已加入</span>
        <div class="row-actions">
          ${
            canManageItem(item)
              ? `
                <button
                  class="small-icon-button"
                  type="button"
                  data-action="delete-shared-record"
                  data-record-type="team"
                  data-id="${escapeHTML(item.id)}"
                  aria-label="删除组队"
                  title="删除组队"
                >
                  ${icon("trash-2")}
                </button>
              `
              : ""
          }
          <button
            class="${full ? "secondary-button" : "primary-button"}"
            type="button"
            data-action="join-team"
            data-id="${escapeHTML(item.id)}"
            ${full ? "disabled" : ""}
          >
            ${icon(full ? "circle-check" : "plus")}
            ${full ? "已满员" : "加入搭子"}
          </button>
        </div>
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
              data-id="${escapeHTML(item.id)}"
              aria-label="下载"
              title="下载"
            >
              ${icon("download")}
            </button>
            <button
              class="small-icon-button"
              type="button"
              data-action="delete-resource"
              data-id="${escapeHTML(item.id)}"
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

function canManageItem(item) {
  return (
    isCurrentAdmin() ||
    Boolean(
      item?.authorId &&
        authState.session?.user?.id &&
        item.authorId === authState.session.user.id
    )
  );
}

async function deleteSharedRecord(recordType, id) {
  const collections = {
    post: state.posts,
    team: state.teams,
    suggestion: state.suggestions,
    deadline: state.deadlines
  };
  const collection = collections[recordType];
  const item = collection?.find((entry) => entry.id === id);
  if (!item || !canManageItem(item)) {
    showToast("没有删除权限", "只能删除本人发布的内容，管理员可以删除全部内容。");
    return;
  }

  if (item.shared && hasSharedConfig()) {
    const recordKey = item.recordKey || `${recordType}:${id}`;
    await mantleRequest(
      mantleEntryUrl(`records/${encodeURIComponent(recordKey)}`),
      { method: "DELETE" }
    );
  }
  if (collection) {
    collection.splice(collection.indexOf(item), 1);
  }
  saveState();
  render();
  showToast("内容已删除", isCurrentAdmin() ? "管理员已移除这条无用内容。" : "你的发布记录已删除。");
}

async function loadDailyUsage(force = false) {
  if (ui.dailyUsageLoading || (ui.dailyUsage && !force)) return;
  ui.dailyUsageLoading = true;
  try {
    ui.dailyUsage = await readDailyUsage();
  } catch (error) {
    ui.dailyUsage = { total: 0, post: 0, team: 0, suggestion: 0, deadline: 0 };
  } finally {
    ui.dailyUsageLoading = false;
    if (ui.page === "profile") render();
  }
}

function scheduleStoragePath() {
  return `schedules/${encodeURIComponent(authState.session.user.id)}`;
}

async function readRemoteSchedule() {
  if (!authState.session || !hasSharedConfig()) return null;
  return mantleRequest(mantleEntryUrl(scheduleStoragePath()));
}

async function writeRemoteSchedule(schedule) {
  if (!authState.session || !hasSharedConfig()) return;
  await mantleRequest(mantleEntryUrl(scheduleStoragePath()), {
    method: "POST",
    body: JSON.stringify({
      ...schedule,
      version: 1,
      ownerId: authState.session.user.id,
      classId: authState.session.classId || DEFAULT_CLASS_ID,
      updatedAt: new Date().toISOString()
    })
  });
}

async function loadSchedule(force = false) {
  if (ui.scheduleLoading || (ui.scheduleLoaded && !force)) return;
  ui.scheduleLoading = true;
  try {
    try {
      ui.schedule = await readRemoteSchedule();
    } catch (error) {
      // 读取失败时保留已有课表，不要整页清空。
      if (ui.schedule) {
        showToast("课表同步失败", "当前显示的是本地缓存的课表。");
      } else {
        showToast("课表读取失败", "暂时无法显示课表，稍后可再试。");
      }
    }
    if (!ui.schedule) {
      ui.schedule = {
        version: 1,
        ownerId: authState.session?.user.id || "",
        classId: authState.session?.classId || DEFAULT_CLASS_ID,
        source: "手动添加",
        semester: null,
        currentWeek: 1,
        courses: [],
        sessions: []
      };
    }
    ui.schedule.courses = Array.isArray(ui.schedule.courses)
      ? ui.schedule.courses
      : [];
    ui.schedule.sessions = Array.isArray(ui.schedule.sessions)
      ? ui.schedule.sessions
      : [];
    ui.schedule.currentWeek = Math.max(1, Number(ui.schedule.currentWeek || 1));
    ui.scheduleLoaded = true;
    if (ui.page === "profile") render();
  } finally {
    // 任何异常都不能让课表永久停在加载中。
    ui.scheduleLoading = false;
  }
}

function formatClock(value) {
  const number = Number(value);
  if (!number) return "";
  const text = String(number).padStart(4, "0");
  return `${text.slice(0, 2)}:${text.slice(2, 4)}`;
}

function manualUnitTimes(startUnit, endUnit) {
  const startTimes = [800, 855, 950, 1045, 1140, 1400, 1455, 1550, 1645, 1740, 1900, 1955, 2050];
  const endTimes = [845, 940, 1035, 1130, 1215, 1445, 1540, 1635, 1730, 1825, 1945, 2040, 2135];
  return {
    startTime: startTimes[Math.max(0, Number(startUnit) - 1)] || 800,
    endTime: endTimes[Math.max(0, Number(endUnit) - 1)] || 845
  };
}

function dateForScheduleWeek(weekIndex, weekday) {
  const semesterStart = ui.schedule?.semester?.startDate
    ? parseDate(ui.schedule.semester.startDate)
    : new Date();
  const date = new Date(semesterStart);
  date.setDate(date.getDate() + (Number(weekIndex) - 1) * 7 + (Number(weekday) - 1));
  return date.toISOString().slice(0, 10);
}

async function addManualCourse(data) {
  const name = String(data.get("name") || "").trim();
  const teacher = String(data.get("teacher") || "").trim();
  const room = String(data.get("room") || "").trim();
  const weekday = Number(data.get("weekday"));
  const startUnit = Number(data.get("startUnit"));
  const endUnit = Number(data.get("endUnit"));
  const weekStart = Number(data.get("weekStart") || 1);
  const weekEnd = Number(data.get("weekEnd") || ui.schedule.semester?.weekCount || 16);
  if (!name || weekday < 1 || weekday > 7 || startUnit < 1 || endUnit < startUnit) {
    throw new Error("请完整填写课程名称、星期和节次。");
  }
  const courseId = `manual-${Date.now().toString(36)}`;
  const course = {
    id: courseId,
    code: String(data.get("code") || "").trim(),
    name,
    credits: null,
    teachers: teacher ? [teacher] : [],
    type: "手动添加",
    scheduleText: "",
    campus: ""
  };
  const times = manualUnitTimes(startUnit, endUnit);
  const sessions = [];
  for (let week = weekStart; week <= weekEnd; week += 1) {
    sessions.push({
      courseId,
      courseCode: course.code,
      courseName: name,
      weekday,
      weekIndex: week,
      date: dateForScheduleWeek(week, weekday),
      startUnit,
      endUnit,
      startTime: times.startTime,
      endTime: times.endTime,
      teacher,
      room,
      campus: "",
      lessonType: "MANUAL",
      state: "未完成"
    });
  }
  ui.schedule.courses.push(course);
  ui.schedule.sessions.push(...sessions);
  ui.schedule.source = ui.schedule.source || "个人课表";
  await writeRemoteSchedule(ui.schedule);
  render();
}

async function deleteScheduleCourse(courseId) {
  const course = ui.schedule?.courses?.find((item) => item.id === courseId);
  if (!course) return;
  ui.schedule.courses = ui.schedule.courses.filter((item) => item.id !== courseId);
  ui.schedule.sessions = ui.schedule.sessions.filter(
    (item) => item.courseId !== courseId
  );
  await writeRemoteSchedule(ui.schedule);
  render();
  showToast("课程已删除", course.name);
}

function buildAhuImportBookmarklet() {
  const updaterUrl = new URL("ahu-import.js", location.href);
  updaterUrl.searchParams.set("owner", authState.session.user.id);
  updaterUrl.searchParams.set("class", authState.session.classId || DEFAULT_CLASS_ID);
  updaterUrl.searchParams.set("namespace", sharedConfig.mantleNamespace || "");
  updaterUrl.searchParams.set("v", Date.now().toString(36));
  return `javascript:(()=>{const s=document.createElement('script');s.src=${JSON.stringify(
    updaterUrl.toString()
  )};document.body.appendChild(s);})()`;
}

function scheduleNeedsUpdate() {
  const schedule = ui.schedule;
  if (!schedule?.autoUpdate || !schedule?.updatedAt) return false;
  const intervalHours = Number(schedule.intervalHours || 24);
  return Date.now() - parseDate(schedule.updatedAt).getTime() > intervalHours * 3600000;
}

function processScheduleImport(text) {
  const value = String(text || "").trim();
  if (!value) {
    ui.scheduleImportMessage = "请粘贴安徽大学课表网址或更新代码。";
    ui.scheduleImportBookmarklet = "";
    return;
  }
  const recognizedUrl = /jwapp\.ahu\.edu\.cn/i.test(value) || /idToken=/i.test(value);
  const recognizedCode = /ahu-import\.js/i.test(value);
  if (recognizedUrl || recognizedCode) {
    ui.scheduleImportBookmarklet =
      recognizedCode && /^javascript:/i.test(value)
        ? value
        : buildAhuImportBookmarklet();
    ui.scheduleImportMessage =
      "已识别安徽大学课表来源。请复制更新代码，在教务课表页面执行一次，完成后刷新本页。";
  } else {
    ui.scheduleImportMessage = "没有识别到安徽大学课表网址或更新代码。";
    ui.scheduleImportBookmarklet = "";
  }
}

async function toggleScheduleAutoUpdate() {
  if (!ui.schedule) return;
  ui.schedule.autoUpdate = !ui.schedule.autoUpdate;
  ui.schedule.intervalHours = 24;
  if (ui.schedule.autoUpdate && !ui.schedule.updatedAt) {
    ui.schedule.updatedAt = new Date().toISOString();
  }
  await writeRemoteSchedule(ui.schedule);
  render();
  showToast(
    ui.schedule.autoUpdate ? "自动更新已开启" : "自动更新已关闭",
    ui.schedule.autoUpdate
      ? "课表超过 24 小时未更新时，个人中心会提示。"
      : "课表不会再提示自动更新。"
  );
}

function renderScheduleSection() {
  if (!ui.scheduleLoaded) {
    window.setTimeout(() => void loadSchedule(), 0);
    return `
      <article class="panel">
        <div class="panel-body">
          ${renderEmpty("loader-circle", "正在读取个人课表", "课表加载完成后会显示在这里。")}
        </div>
      </article>
    `;
  }

  const schedule = ui.schedule;
  const weekIndex = Number(schedule.currentWeek || 1);
  const weekdayNames = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const weekSessions = schedule.sessions.filter(
    (item) => Number(item.weekIndex) === weekIndex
  );
  const startDate = schedule.semester?.startDate
    ? parseDate(schedule.semester.startDate)
    : null;
  const weekStart = startDate ? new Date(startDate) : new Date();
  if (startDate) {
    weekStart.setDate(weekStart.getDate() + (weekIndex - 1) * 7);
  }

  return `
    <article class="panel schedule-panel">
      <header class="panel-header">
        <div>
          <h3>我的课表</h3>
          <p>${escapeHTML(schedule.semester?.name || "当前学期")} · ${escapeHTML(
            schedule.source || "个人课表"
          )}</p>
        </div>
        <div class="page-actions">
          <button
            class="${schedule.autoUpdate ? "secondary-button" : "ghost-button"}"
            type="button"
            data-action="toggle-schedule-auto"
          >
            ${icon(schedule.autoUpdate ? "refresh-cw" : "refresh-cw-off")}
            ${schedule.autoUpdate ? "自动更新已开启" : "开启自动更新"}
          </button>
          <button class="secondary-button" type="button" data-action="open-modal" data-modal="schedule-import">
            ${icon("link")}
            导入或更新
          </button>
          <button class="small-icon-button" type="button" data-action="schedule-week" data-delta="-1" title="上一周" aria-label="上一周">
            ${icon("chevron-left")}
          </button>
          <span class="badge blue">第 ${weekIndex} 周</span>
          <button class="small-icon-button" type="button" data-action="schedule-week" data-delta="1" title="下一周" aria-label="下一周">
            ${icon("chevron-right")}
          </button>
          <button class="primary-button" type="button" data-action="open-modal" data-modal="course">
            ${icon("plus")}
            添加课程
          </button>
        </div>
      </header>
      <div class="panel-body">
        ${
          scheduleNeedsUpdate()
            ? `
              <div class="schedule-update-callout">
                <span>${icon("triangle-alert")} 课表超过 24 小时没有更新</span>
                <button class="secondary-button" type="button" data-action="open-modal" data-modal="schedule-import">
                  立即更新
                </button>
              </div>
            `
            : ""
        }
        <div class="timetable-grid">
          ${weekdayNames
            .map((dayName, index) => {
              const day = index + 1;
              const date = new Date(weekStart);
              date.setDate(date.getDate() + index);
              const sessions = weekSessions
                .filter((item) => Number(item.weekday) === day)
                .sort((a, b) => Number(a.startUnit) - Number(b.startUnit));
              return `
                <section class="timetable-day">
                  <header>
                    <strong>${dayName}</strong>
                    <span>${date.getMonth() + 1}/${date.getDate()}</span>
                  </header>
                  ${
                    sessions.length
                      ? sessions
                          .map(
                            (item) => `
                              <div class="schedule-course">
                                <strong>${escapeHTML(item.courseName)}</strong>
                                <span>${item.startUnit}-${item.endUnit} 节 · ${escapeHTML(
                                  formatClock(item.startTime)
                                )}-${escapeHTML(formatClock(item.endTime))}</span>
                                <small>${escapeHTML(item.room || "地点待定")} · ${escapeHTML(
                                  item.teacher || "教师待定"
                                )}</small>
                              </div>
                            `
                          )
                          .join("")
                      : '<span class="schedule-empty">暂无课程</span>'
                  }
                </section>
              `;
            })
            .join("")}
        </div>
      </div>
      <div class="panel-body schedule-course-list">
        <div class="section-header">
          <div>
            <h3>本学期课程</h3>
            <p class="eyebrow">${schedule.courses.length} 门课程</p>
          </div>
        </div>
        ${
          schedule.courses.length
            ? schedule.courses
                .map(
                  (course) => `
                    <div class="schedule-course-row">
                      <div>
                        <strong>${escapeHTML(course.name)}</strong>
                        <span>${escapeHTML(
                          (course.teachers || []).join("、") || "教师待定"
                        )} · ${escapeHTML(course.code || "无课程代码")}</span>
                      </div>
                      <button
                        class="small-icon-button"
                        type="button"
                        data-action="delete-course"
                        data-course-id="${escapeHTML(course.id)}"
                        title="删除课程"
                        aria-label="删除课程"
                      >
                        ${icon("trash-2")}
                      </button>
                    </div>
                  `
                )
                .join("")
            : renderEmpty("calendar-days", "课表还没有课程", "可以手动添加，也可以使用已导入的教务处课表。")
        }
      </div>
    </article>
  `;
}

function renderPersonalCenter() {
  if (!ui.dailyUsage) {
    window.setTimeout(() => void loadDailyUsage(), 0);
  }

  const userId = authState.session?.user.id;
  const username = authState.session?.username || state.candidate.name;
  const roleMeta = getRoleMeta(authState.session?.role);
  const ownPosts = state.posts.filter(
    (item) => item.authorId === userId || (!item.shared && item.author === username)
  );
  const ownTeams = state.teams.filter(
    (item) => item.authorId === userId || (!item.shared && item.owner === username)
  );
  const ownSuggestions = state.suggestions.filter((item) => item.authorId === userId);
  const ownDeadlines = state.deadlines.filter((item) => item.authorId === userId);
  const ownResources = state.resources.filter((item) => item.uploader === username);
  const records = [
    ...ownPosts.map((item) => ({
      id: item.id,
      recordType: "post",
      title: item.title,
      meta: `互助广场 · ${item.type} · ${formatRelativeTime(item.createdAt)}`,
      item
    })),
    ...ownTeams.map((item) => ({
      id: item.id,
      recordType: "team",
      title: item.title,
      meta: `任务搭子 · ${item.type} · ${formatDateTime(item.date)}`,
      item
    })),
    ...ownSuggestions.map((item) => ({
      id: item.id,
      recordType: "suggestion",
      title: item.text,
      meta: `匿名意见 · ${item.category} · ${formatRelativeTime(item.createdAt)}`,
      item
    })),
    ...ownDeadlines.map((item) => ({
      id: item.id,
      recordType: "deadline",
      title: item.title,
      meta: `截止事项 · ${item.category} · ${dueLabel(item.due)}`,
      item
    }))
  ];
  const usage = ui.dailyUsage || { total: 0 };
  const remaining = Math.max(0, PUBLISH_LIMITS.total - usage.total);
  const usagePercent = Math.min(100, Math.round((usage.total / PUBLISH_LIMITS.total) * 100));

  return `
    <div class="page-stack">
      <section class="personal-hero">
        <article class="personal-profile">
          <span class="personal-avatar">${escapeHTML(getInitials(username))}</span>
          <div>
            <div class="member-name-row">
              <h2>${escapeHTML(username)}</h2>
              <span class="badge ${roleMeta.color}">${icon(roleMeta.icon)} ${escapeHTML(roleMeta.label)}</span>
              ${
                authState.session?.pendingRole
                  ? `<span class="badge yellow">${icon("clock-3")} 待审核：${escapeHTML(
                      getRoleMeta(authState.session.pendingRole).label
                    )}</span>`
                  : ""
              }
            </div>
            <p>${escapeHTML(authState.session?.identityNote || "还没有填写职务、课程或负责事项。")}</p>
            <span class="member-meta">${icon("shield-check")} ${
              authState.session?.pendingRole
                ? "特殊身份需要管理员审核，通过前保持普通同学权限"
                : "账号名称全局唯一，身份状态已同步"
            }</span>
          </div>
        </article>
        <aside class="personal-actions">
          <button class="primary-button full-width" type="button" data-action="open-profile">
            ${icon("pencil")}
            编辑个人信息
          </button>
          ${
            canViewCampaign()
              ? `
                <button class="secondary-button full-width" type="button" data-action="navigate" data-page="candidate">
                  ${icon("megaphone")}
                  查看我的竞选承诺
                </button>
              `
              : ""
          }
        </aside>
      </section>

      <section class="metric-grid">
        <article class="metric">
          <span class="metric-icon orange">${icon("hand-heart")}</span>
          <div><strong class="metric-value">${ownPosts.length}</strong><span class="metric-label">我的互助发布</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon green">${icon("users-round")}</span>
          <div><strong class="metric-value">${ownTeams.length}</strong><span class="metric-label">我的组队发布</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon yellow">${icon("message-square-lock")}</span>
          <div><strong class="metric-value">${ownSuggestions.length}</strong><span class="metric-label">我的匿名意见</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon blue">${icon("library-big")}</span>
          <div><strong class="metric-value">${ownResources.length}</strong><span class="metric-label">我上传的资料</span></div>
        </article>
      </section>

      ${renderScheduleSection()}

      <section class="personal-grid">
        <article class="panel">
          <header class="panel-header">
            <div>
              <h3>我的发布记录</h3>
              <p>可以查看和删除自己的内容</p>
            </div>
            <span class="badge blue">${records.length} 条</span>
          </header>
          <div class="panel-body personal-record-list">
            ${
              records.length
                ? records
                    .map(
                      (record) => `
                        <div class="personal-record">
                          <div>
                            <strong>${escapeHTML(record.title)}</strong>
                            <span>${escapeHTML(record.meta)}</span>
                          </div>
                          <button
                            class="small-icon-button"
                            type="button"
                            data-action="delete-shared-record"
                            data-record-type="${escapeHTML(record.recordType)}"
                            data-id="${escapeHTML(record.id)}"
                            aria-label="删除"
                            title="删除"
                          >
                            ${icon("trash-2")}
                          </button>
                        </div>
                      `
                    )
                    .join("")
                : renderEmpty("inbox", "还没有发布记录", "你发布的互助、组队、意见和截止事项会出现在这里。")
            }
          </div>
        </article>

        <aside class="stack">
          <article class="panel">
            <header class="panel-header">
              <div>
                <h3>今日发布额度</h3>
                <p>每天最多发布 ${PUBLISH_LIMITS.total} 条，防止重复浪费</p>
              </div>
              <span class="badge ${remaining > 0 ? "green" : "red"}">剩余 ${remaining} 条</span>
            </header>
            <div class="panel-body">
              <div class="progress-track" aria-label="今日发布额度使用 ${usagePercent}%">
                <span style="width: ${usagePercent}%"></span>
              </div>
              <p class="eyebrow" style="margin: 10px 0 0">
                今日已发布 ${usage.total} / ${PUBLISH_LIMITS.total} 条
              </p>
            </div>
          </article>

          <article class="panel">
            <div class="panel-body">
              <span class="badge ${isCurrentAdmin() ? "red" : "blue"}">
                ${icon(isCurrentAdmin() ? "shield-check" : "user-round")}
                ${isCurrentAdmin() ? "管理员权限已启用" : "当前身份"}
              </span>
              <h3 style="margin-top: 13px">${escapeHTML(roleMeta.label)}</h3>
              <p style="margin-bottom: 0; color: var(--ink-soft); font-size: 12px">
                ${
                  isCurrentAdmin()
                    ? "你可以在各个内容列表中删除无用消息。"
                    : "你可以删除自己发布的内容，管理员可以处理全部无用消息。"
                }
              </p>
            </div>
          </article>
        </aside>
      </section>
    </div>
  `;
}

async function loadHistory(force = false) {
  if (ui.historyLoading || (ui.historyLoaded && !force)) return;
  ui.historyLoading = true;
  if (ui.page === "history" && !ui.historyLoaded) render();
  try {
    ui.history = await readSharedHistory();
  } catch (error) {
    ui.history = [];
  } finally {
    ui.historyLoading = false;
    ui.historyLoaded = true;
    if (ui.page === "history") render();
  }
}

async function deleteHistoryRecord(recordKey) {
  if (!isCurrentAdmin()) {
    showToast("没有删除权限", "只有管理员可以删除历史记录。");
    return;
  }
  await mantleRequest(
    mantleEntryUrl(`history/${encodeURIComponent(recordKey)}`),
    { method: "DELETE" }
  );
  await loadHistory(true);
  showToast("历史记录已删除", "管理员已移除这条归档内容。");
}

function historyRecordTitle(record) {
  const payload = record?.payload || {};
  if (record.record_type === "deadline") return payload.title || "截止事项";
  if (record.record_type === "team") return payload.title || "任务组队";
  if (record.record_type === "post") return payload.title || "互助信息";
  if (record.record_type === "suggestion") return payload.text || "匿名意见";
  return "班级记录";
}

function renderHistory() {
  if (!ui.historyLoaded) {
    window.setTimeout(() => void loadHistory(), 0);
  }
  const records = [...ui.history].sort(
    (a, b) => parseDate(b.archived_at) - parseDate(a.archived_at)
  );

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">栏目中自动隐藏，历史中继续保留</p>
          <h2>已过期事项与任务记录</h2>
          <p>发布者设置的保留时间到期后，内容会自动从当前栏目移除，并归档到这里。</p>
        </div>
        <div class="page-actions">
          <span class="badge blue">${icon("archive")} ${records.length} 条历史记录</span>
        </div>
      </header>

      <section class="history-list" id="history-results">
        ${
          ui.historyLoading
            ? renderEmpty("loader-circle", "正在读取历史记录", "归档内容加载完成后会显示在这里。")
            : records.length
              ? records
                  .map(
                    (record) => `
                      <article class="history-card">
                        <div class="history-card-main">
                          <span class="history-icon">${icon("archive")}</span>
                          <div>
                            <div class="member-name-row">
                              <strong>${escapeHTML(historyRecordTitle(record))}</strong>
                              <span class="badge blue">${escapeHTML(record.record_type)}</span>
                            </div>
                            <p>${escapeHTML(record.payload?.description || record.payload?.category || "已归档班级内容")}</p>
                            <span class="member-meta">
                              ${icon("clock-3")}
                              过期时间：${formatDateTime(record.expired_at || record.payload?.expiresAt)}
                            </span>
                          </div>
                        </div>
                        ${
                          isCurrentAdmin()
                            ? `
                              <button
                                class="small-icon-button"
                                type="button"
                                data-action="delete-history-record"
                                data-record-key="${escapeHTML(record.record_key)}"
                                title="删除历史记录"
                                aria-label="删除历史记录"
                              >
                                ${icon("trash-2")}
                              </button>
                            `
                            : ""
                        }
                      </article>
                    `
                  )
                  .join("")
              : renderEmpty("archive", "暂无历史记录", "事项到期并归档后会显示在这里。")
        }
      </section>
    </div>
  `;
}

async function loadClassDirectory(force = false) {
  if (ui.classesLoading || (ui.classesLoaded && !force)) return;
  ui.classesLoading = true;
  if (ui.page === "classes" && !ui.classesLoaded) render();
  try {
    const list = await mantleRequest(mantleListUrl());
    const accountPaths = (list?.entries || [])
      .map((entry) => entry?.path)
      .filter((path) => typeof path === "string" && path.startsWith("accounts/"));
    const [classes, accounts] = await Promise.all([
      listRemoteClasses(),
      mapLimit(accountPaths, MANTLE_MAX_CONCURRENCY, (path) =>
        mantleRequest(mantleEntryUrl(path))
      )
    ]);
    ui.classes = classes;
    ui.classAccounts = accounts.filter((account) => account?.username);
  } catch (error) {
    // 失败时保留旧数据，并明确告诉用户，不要静默清空。
    setSyncStatus("offline");
    showToast("班级列表加载失败", "稍后再试，当前显示的是已有数据。");
  } finally {
    ui.classesLoading = false;
    ui.classesLoaded = true;
    if (ui.page === "classes") render();
  }
}

async function createRemoteClass({ code, name, school, major }) {
  if (!isCurrentAdmin()) {
    showToast("没有创建权限", "只有管理员可以创建新班级。");
    return;
  }
  const normalizedCode = normalizeClassCode(code);
  const classId = classIdFromCode(normalizedCode);
  if (!classId || !name.trim()) {
    throw new Error("请填写班级编码和班级名称。");
  }
  const existing = await readRemoteClassByCode(normalizedCode);
  if (existing) throw new Error("这个班级编码已经存在。");
  const classInfo = {
    id: classId,
    code: normalizedCode,
    name: name.trim(),
    school: school.trim(),
    major: major.trim(),
    createdAt: new Date().toISOString(),
    createdBy: authState.session.user.id
  };
  await writeRemoteClass(classInfo);
  await loadClassDirectory(true);
  showToast("班级已创建", `${classInfo.name} · ${classInfo.code}`);
}

async function switchCurrentClass(classId) {
  if (!canManageClasses()) {
    showToast("没有切换权限", "普通同学不能自主切换班级。");
    return;
  }
  const classInfo = ui.classes.find((item) => item.id === classId) ||
    (await mantleRequest(mantleEntryUrl(`classes/${encodeURIComponent(classId)}`)));
  if (!classInfo) throw new Error("Class not found");
  const account = getLocalAccounts().find(
    (item) => item.usernameKey === localUsernameKey(authState.session.username)
  );
  if (!account) throw new Error("Local account not found");
  account.classId = classInfo.id;
  account.classCode = classInfo.code;
  account.className = classInfo.name;
  account.updatedAt = new Date().toISOString();
  saveLocalAccounts(
    getLocalAccounts().map((item) =>
      item.usernameKey === account.usernameKey ? account : item
    )
  );
  await writeRemoteAccount(account);
  authState.session.classId = classInfo.id;
  authState.session.classCode = classInfo.code;
  authState.session.className = classInfo.name;
  saveAuthSession(authState.session);
  syncState.accountChecked = false;
  syncState.localImported = false;
  ui.membersLoaded = false;
  ui.members = [];
  ui.historyLoaded = false;
  ui.history = [];
  ui.dailyUsage = null;
  ui.page = "today";
  activateClassState();
  render();
  void syncSharedRecords();
  showToast("已进入班级", `${classInfo.name} · ${classInfo.code}`);
}

function renderClassManager() {
  if (!ui.classesLoaded) {
    window.setTimeout(() => void loadClassDirectory(), 0);
  }
  const currentClass =
    ui.classes.find((item) => item.id === currentClassId()) || null;
  const memberCountFor = (classId) =>
    ui.classAccounts.filter(
      (account) => (account.classId || DEFAULT_CLASS_ID) === classId
    ).length;

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">不同班级的数据互相隔离</p>
          <h2>班级创建与切换管理</h2>
          <p>成员只能查看当前班级的互助、动态、成员身份、任务与历史记录。</p>
        </div>
        <div class="page-actions">
          ${
            isCurrentAdmin()
              ? `
                <button class="primary-button" type="button" data-action="open-modal" data-modal="class">
                  ${icon("building-2")}
                  创建班级
                </button>
              `
              : ""
          }
          <span class="badge blue">${icon("key-round")} 当前：${escapeHTML(
            currentClass?.code || authState.session?.classCode || DEFAULT_CLASS_CODE
          )}</span>
        </div>
      </header>

      ${
        currentClass
          ? `
            <section class="panel current-class-panel">
              <div class="panel-body current-class-copy">
                <span class="metric-icon green">${icon("school")}</span>
                <div>
                  <p class="eyebrow">当前班级</p>
                  <h2>${escapeHTML(currentClass.name)}</h2>
                  <p>${escapeHTML(currentClass.school || "未填写学校")} · ${escapeHTML(
                    currentClass.major || "未填写专业"
                  )} · ${memberCountFor(currentClass.id)} 名成员</p>
                </div>
              </div>
            </section>
          `
          : ""
      }

      <section class="class-grid">
        ${
          ui.classesLoading
            ? renderEmpty("loader-circle", "正在读取班级", "班级列表加载完成后会显示在这里。")
            : ui.classes.length
              ? ui.classes
                  .map(
                    (classInfo) => `
                      <article class="class-card ${classInfo.id === currentClassId() ? "is-current" : ""}">
                        <div class="card-top-row">
                          <span class="badge ${classInfo.id === currentClassId() ? "green" : "blue"}">
                            ${icon("school")}
                            ${classInfo.id === currentClassId() ? "当前班级" : "可管理班级"}
                          </span>
                          <span class="card-time">${escapeHTML(classInfo.code)}</span>
                        </div>
                        <h3>${escapeHTML(classInfo.name)}</h3>
                        <p>${escapeHTML(classInfo.school || "未填写学校")} · ${escapeHTML(
                          classInfo.major || "未填写专业"
                        )}</p>
                        <div class="card-meta">
                          <span>${icon("users-round")} ${memberCountFor(classInfo.id)} 名成员</span>
                        </div>
                        <div class="card-footer">
                          <span class="member-meta">${icon("key-round")} ${escapeHTML(classInfo.code)}</span>
                          ${
                            classInfo.id === currentClassId()
                              ? `<span class="badge green">正在使用</span>`
                              : canManageClasses()
                                ? `
                                  <button
                                    class="primary-button"
                                    type="button"
                                    data-action="switch-class"
                                    data-class-id="${escapeHTML(classInfo.id)}"
                                  >
                                    ${icon("log-in")}
                                    进入管理
                                  </button>
                                `
                                : ""
                          }
                        </div>
                      </article>
                    `
                  )
                  .join("")
              : renderEmpty("building-2", "还没有班级", "管理员可以创建第一个班级。")
        }
      </section>
    </div>
  `;
}

function publicMemberFromAccount(account) {
  const role = resolveAccountRole(account);
  return {
    id: account?.id || "",
    username: normalizeUsername(account?.username) || "班级成员",
    usernameKey: account?.usernameKey || localUsernameKey(account?.username),
    role,
    roleLabel: getRoleMeta(role).label,
    pendingRole: account?.pendingRole ? normalizeRole(account.pendingRole) : "",
    identityNote: String(account?.identityNote || "").trim(),
    createdAt: account?.createdAt || "",
    identityStatus: account?.identityStatus || "student"
  };
}

async function loadMemberDirectory(force = false) {
  if (ui.membersLoading || (ui.membersLoaded && !force)) return;
  ui.membersLoading = true;
  if (ui.page === "members" && !ui.membersLoaded) render();

  try {
    if (hasSharedConfig()) {
      const list = await mantleRequest(mantleListUrl());
      const accountPaths = (list?.entries || [])
        .map((entry) => entry?.path)
        .filter((path) => typeof path === "string" && path.startsWith("accounts/"));
      const remoteAccounts = await mapLimit(accountPaths, MANTLE_MAX_CONCURRENCY, (path) =>
        mantleRequest(mantleEntryUrl(path))
      );
      ui.members = remoteAccounts
        .filter(
          (account) =>
            account?.username &&
            (account.classId || DEFAULT_CLASS_ID) === currentClassId()
        )
        .map(publicMemberFromAccount);
    } else {
      ui.members = getLocalAccounts().map(publicMemberFromAccount);
    }
  } catch (error) {
    ui.members = getLocalAccounts().map(publicMemberFromAccount);
    showToast("成员名单同步较慢", "当前先显示本机已经识别到的成员。");
  } finally {
    ui.membersLoading = false;
    ui.membersLoaded = true;
    if (ui.page === "members") render();
  }
}

function renderMembers() {
  if (!ui.membersLoading && !ui.membersLoaded) {
    window.setTimeout(() => void loadMemberDirectory(), 0);
  }

  const filters = ["全部", "教师、辅导员与管理员", "班级委员会", "普通同学"];
  const counts = ui.members.reduce(
    (result, member) => {
      result.total += 1;
      result[getRoleMeta(member.role).group] += 1;
      return result;
    },
    { total: 0, faculty: 0, committee: 0, student: 0 }
  );

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">身份公开，职责清楚，找人不再靠猜</p>
          <h2>班级成员与职责目录</h2>
          <p>集中展示任课老师、班主任、辅导员、各班委和普通同学，帮助班级事务快速找到对应负责人。</p>
        </div>
        <div class="page-actions">
          <button class="primary-button" type="button" data-action="open-profile">
            ${icon("badge-plus")}
            修改我的身份
          </button>
        </div>
      </header>

      <section class="metric-grid">
        <article class="metric">
          <span class="metric-icon green">${icon("users-round")}</span>
          <div><strong class="metric-value">${counts.total}</strong><span class="metric-label">已登记成员</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon orange">${icon("school")}</span>
          <div><strong class="metric-value">${counts.faculty}</strong><span class="metric-label">教师、辅导员与管理员</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon blue">${icon("landmark")}</span>
          <div><strong class="metric-value">${counts.committee}</strong><span class="metric-label">班委成员</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon yellow">${icon("graduation-cap")}</span>
          <div><strong class="metric-value">${counts.student}</strong><span class="metric-label">普通同学</span></div>
        </article>
      </section>

      <section class="filter-bar">
        ${filters
          .map(
            (filter) => `
              <button
                class="filter-chip ${ui.memberFilter === filter ? "is-active" : ""}"
                type="button"
                data-action="filter-member"
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
            id="member-search"
            type="search"
            placeholder="搜索姓名、身份或负责事项"
            value="${escapeHTML(ui.memberQuery)}"
          />
        </label>
      </section>

      <section class="member-directory" id="member-results">
        ${renderMemberCards()}
      </section>
    </div>
  `;
}

function renderMemberCards() {
  if (ui.membersLoading && !ui.membersLoaded) {
    return renderEmpty("loader-circle", "正在同步成员身份", "班级名单加载完成后会显示在这里。");
  }

  const query = ui.memberQuery.trim().toLowerCase();
  const filtered = ui.members
    .filter((member) => {
      const groupLabel = ROLE_GROUPS[getRoleMeta(member.role).group];
      const matchesFilter = ui.memberFilter === "全部" || groupLabel === ui.memberFilter;
      const pendingLabel = member.pendingRole
        ? getRoleMeta(member.pendingRole).label
        : "";
      const haystack = `${member.username} ${member.roleLabel} ${pendingLabel} ${member.identityNote}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    })
    .sort((a, b) => {
      const order = { faculty: 0, committee: 1, student: 2 };
      return order[getRoleMeta(a.role).group] - order[getRoleMeta(b.role).group] ||
        a.username.localeCompare(b.username, "zh-CN");
    });

  if (!filtered.length) {
    return renderEmpty("contact-round", "还没有匹配的成员", "可以修改筛选条件，或先完善自己的身份。");
  }

  return filtered
    .map((member) => {
      const meta = getRoleMeta(member.role);
      const pendingMeta = member.pendingRole ? getRoleMeta(member.pendingRole) : null;
      const isCurrent = member.id === authState.session?.user.id;
      return `
        <article class="member-card">
          <div class="member-card-main">
            <span class="member-avatar ${meta.color}">${escapeHTML(getInitials(member.username))}</span>
            <div class="member-copy">
              <div class="member-name-row">
                <strong>${escapeHTML(member.username)}</strong>
                <span class="badge ${meta.color}">${icon(meta.icon)} ${escapeHTML(meta.label)}</span>
                ${
                  pendingMeta
                    ? `<span class="badge yellow">${icon("clock-3")} 待审核：${escapeHTML(
                        pendingMeta.label
                      )}</span>`
                    : ""
                }
              </div>
              <p>${escapeHTML(member.identityNote || "暂未填写职责说明")}</p>
              <span class="member-meta">${icon("shield-check")} ${
                pendingMeta ? "管理员审核通过后身份才会生效" : "身份已进入班级身份目录"
              }</span>
            </div>
          </div>
          <div class="row-actions">
            ${
              isCurrent
                ? `
                  <button class="secondary-button" type="button" data-action="open-profile">
                    ${icon("pencil")}
                    申请修改身份
                  </button>
                `
                : ""
            }
            ${
              isCurrentAdmin() && pendingMeta
                ? `
                  <button
                    class="primary-button"
                    type="button"
                    data-action="approve-identity"
                    data-username-key="${escapeHTML(member.usernameKey)}"
                  >
                    ${icon("check")}
                    通过
                  </button>
                  <button
                    class="secondary-button"
                    type="button"
                    data-action="reject-identity"
                    data-username-key="${escapeHTML(member.usernameKey)}"
                  >
                    ${icon("x")}
                    驳回
                  </button>
                `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

async function reviewMemberIdentity(usernameKey, approved) {
  if (!isCurrentAdmin()) {
    showToast("没有审核权限", "只有管理员可以审核班级身份。");
    return;
  }
  const account = await readRemoteAccount(usernameKey);
  if (!account) throw new Error("Account not found");
  if (!account.pendingRole) {
    showToast("没有待审核申请", "该成员当前没有新的身份申请。");
    return;
  }

  if (approved) {
    account.role = normalizeRole(account.pendingRole);
    account.identityStatus = "approved";
    account.approvedAt = new Date().toISOString();
    account.approvedBy = authState.session.user.id;
  } else {
    account.role = "student";
    account.identityStatus = "rejected";
    account.rejectedAt = new Date().toISOString();
  }
  account.pendingRole = "";
  account.updatedAt = new Date().toISOString();
  await writeRemoteAccount(account);

  if (authState.session.username === account.username) {
    authState.session.role = resolveAccountRole(account);
    authState.session.pendingRole = "";
    authState.session.identityStatus = account.identityStatus;
    saveAuthSession(authState.session);
  }
  syncState.accountChecked = false;
  await loadMemberDirectory(true);
  render();
  showToast(
    approved ? "身份申请已通过" : "身份申请已驳回",
    `${account.username} · ${approved ? getRoleMeta(account.role).label : "普通同学"}`
  );
}

function updateMemberResults() {
  const container = document.getElementById("member-results");
  if (!container) return;
  container.innerHTML = renderMemberCards();
  refreshIcons(container);
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
          <span class="badge yellow">每日最多 5 条</span>
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
        ${
          canManageItem(item)
            ? `
              <button
                class="small-icon-button"
                type="button"
                data-action="delete-shared-record"
                data-record-type="suggestion"
                data-id="${escapeHTML(item.id)}"
                aria-label="删除意见"
                title="删除意见"
              >
                ${icon("trash-2")}
              </button>
            `
            : ""
        }
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
            <p class="eyebrow">${escapeHTML(getRoleMeta(authState.session?.role).label)} · 班级身份名片</p>
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
      subtitle: "让重要日期提前被看见，每日最多发布 5 条",
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
            ${
              authState.session?.pendingRole
                ? `
                  <div class="badge yellow" style="justify-self: start">
                    ${icon("clock-3")}
                    待审核身份：${escapeHTML(getRoleMeta(authState.session.pendingRole).label)}
                  </div>
                `
                : ""
            }
            <div class="modal-field">
              <label>当前班级</label>
              <input
                value="${escapeHTML(
                  `${authState.session?.className || "安徽大学集成电路专业班级"} · ${
                    authState.session?.classCode || DEFAULT_CLASS_CODE
                  }`
                )}"
                readonly
              />
            </div>
            <div class="modal-field">
              <label for="deadline-priority">优先级</label>
              <select id="deadline-priority" name="priority">
                <option value="高">高</option>
                <option value="中" selected>中</option>
                <option value="低">低</option>
              </select>
            </div>
            <div class="modal-field">
              <label for="deadline-retention">保留时间</label>
              <select id="deadline-retention" name="retention">
                <option value="6">6 小时</option>
                <option value="12">12 小时</option>
                <option value="24">24 小时</option>
                <option value="48" selected>48 小时</option>
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
      subtitle: "求助、失物、借用和学习都可以发布，每日最多 5 条",
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
      subtitle: "把时间、地点和人数一次说清楚，每日最多 5 条",
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
            <div class="modal-field">
              <label for="team-retention">保留时间</label>
              <select id="team-retention" name="retention">
                <option value="6">6 小时</option>
                <option value="12">12 小时</option>
                <option value="24">24 小时</option>
                <option value="48" selected>48 小时</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("user-round-plus")} 发起组队</button>
          </div>
        </form>
      `
    },
    class: {
      title: "创建新班级",
      subtitle: "班级编码将用于成员注册，请使用清晰且唯一的编号",
      wide: false,
      body: `
        <form id="class-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="modal-field">
                <label for="class-code">班级编码</label>
                <input id="class-code" name="code" maxlength="40" placeholder="例如：AHU-IC-2027" required />
              </div>
              <div class="modal-field">
                <label for="class-name">班级名称</label>
                <input id="class-name" name="name" maxlength="60" placeholder="例如：集成电路二班" required />
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="class-school">学校</label>
                <input id="class-school" name="school" maxlength="60" placeholder="例如：安徽大学" required />
              </div>
              <div class="modal-field">
                <label for="class-major">专业</label>
                <input id="class-major" name="major" maxlength="60" placeholder="例如：集成电路设计与集成系统" required />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("building-2")} 创建班级</button>
          </div>
        </form>
      `
    },
    course: {
      title: "添加课程",
      subtitle: "课程会保存到当前账号的个人课表中",
      wide: false,
      body: `
        <form id="course-form">
          <div class="modal-body">
            <div class="modal-field">
              <label for="course-name">课程名称</label>
              <input id="course-name" name="name" maxlength="60" required placeholder="例如：模拟电子技术" />
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="course-code">课程代码</label>
                <input id="course-code" name="code" maxlength="30" placeholder="可选" />
              </div>
              <div class="modal-field">
                <label for="course-teacher">任课教师</label>
                <input id="course-teacher" name="teacher" maxlength="40" placeholder="可选" />
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="course-weekday">星期</label>
                <select id="course-weekday" name="weekday">
                  <option value="1">周一</option>
                  <option value="2">周二</option>
                  <option value="3">周三</option>
                  <option value="4">周四</option>
                  <option value="5">周五</option>
                  <option value="6">周六</option>
                  <option value="7">周日</option>
                </select>
              </div>
              <div class="modal-field">
                <label for="course-room">地点</label>
                <input id="course-room" name="room" maxlength="60" placeholder="例如：博学北楼 A101" />
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="course-start-unit">开始节次</label>
                <input id="course-start-unit" name="startUnit" type="number" min="1" max="13" value="1" required />
              </div>
              <div class="modal-field">
                <label for="course-end-unit">结束节次</label>
                <input id="course-end-unit" name="endUnit" type="number" min="1" max="13" value="2" required />
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="course-week-start">开始周</label>
                <input id="course-week-start" name="weekStart" type="number" min="1" max="30" value="${Math.max(
                  1,
                  Number(ui.schedule?.currentWeek || 1)
                )}" required />
              </div>
              <div class="modal-field">
                <label for="course-week-end">结束周</label>
                <input id="course-week-end" name="weekEnd" type="number" min="1" max="30" value="${Math.max(
                  1,
                  Number(ui.schedule?.semester?.weekCount || ui.schedule?.currentWeek || 16)
                )}" required />
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="button" data-action="save-course">${icon("save")} 保存课程</button>
          </div>
        </form>
      `
    },
    "schedule-import": {
      title: "导入或更新课表",
      subtitle: "支持粘贴安徽大学课表网址，也支持识别班集更新代码",
      wide: true,
      body: `
        <div class="modal-body">
          <div class="modal-field">
            <label for="schedule-import-input">课表网址或更新代码</label>
            <textarea
              id="schedule-import-input"
              placeholder="粘贴 jwapp.ahu.edu.cn 课表链接，或粘贴班集生成的更新代码"
            ></textarea>
          </div>
          <div class="page-actions">
            <button class="primary-button" type="button" data-action="process-schedule-import">
              ${icon("scan-search")}
              识别来源
            </button>
            <button class="secondary-button" type="button" data-action="copy-schedule-updater">
              ${icon("copy")}
              复制更新代码
            </button>
          </div>
          <p class="schedule-import-message" id="schedule-import-message">${escapeHTML(
            ui.scheduleImportMessage
          )}</p>
          <div class="modal-field">
            <label for="schedule-updater-output">更新代码</label>
            <textarea id="schedule-updater-output" readonly>${escapeHTML(
              ui.scheduleImportBookmarklet
            )}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="secondary-button" type="button" data-action="close-modal">关闭</button>
        </div>
      `
    },
    profile: {
      title: "编辑账号身份与资料",
      subtitle: "账号名称不可重复，教师和班委身份目前采用自主申报",
      wide: true,
      body: `
        <form id="profile-form">
          <div class="modal-body">
            <div class="form-grid">
              <div class="modal-field">
                <label for="profile-name">账号名称</label>
                <input id="profile-name" name="name" maxlength="20" value="${escapeHTML(
                  authState.session?.username || state.candidate.name
                )}" readonly />
              </div>
              <div class="modal-field">
                <label for="profile-slogan">竞选主张</label>
                <input id="profile-slogan" name="slogan" maxlength="60" value="${escapeHTML(
                  state.candidate.slogan
                )}" required />
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="profile-role">班级身份</label>
                <select id="profile-role" name="role">
                  ${Object.entries(ROLE_GROUPS)
                    .map(
                      ([group, groupLabel]) => `
                        <optgroup label="${escapeHTML(groupLabel)}">
                          ${Object.entries(ROLE_META)
                            .filter(
                              ([role, meta]) =>
                                meta.group === group &&
                                (role !== "admin" || authState.session?.role === "admin")
                            )
                            .map(
                              ([role, meta]) => `
                                <option value="${role}" ${
                                  normalizeRole(authState.session?.role) === role ? "selected" : ""
                                }>
                                  ${escapeHTML(meta.label)}
                                </option>
                              `
                            )
                            .join("")}
                        </optgroup>
                      `
                    )
                    .join("")}
                </select>
              </div>
              <div class="modal-field">
                <label for="profile-identity-note">职务、课程或负责事项</label>
                <input
                  id="profile-identity-note"
                  name="identityNote"
                  maxlength="60"
                  value="${escapeHTML(authState.session?.identityNote || "")}"
                  placeholder="例如：负责班级学习与竞赛信息"
                />
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
  return Boolean(
    sharedConfig.cloudEnabled === true &&
      sharedConfig.provider === "mantle" &&
      sharedConfig.mantleApiBase &&
      sharedConfig.mantleNamespace
  );
}

function mantleEntryUrl(path) {
  return `${sharedConfig.mantleApiBase}/${encodeURIComponent(
    sharedConfig.mantleNamespace
  )}/${path}`;
}

function mantleListUrl() {
  return `${sharedConfig.mantleApiBase}/list/${encodeURIComponent(
    sharedConfig.mantleNamespace
  )}`;
}

const MANTLE_TIMEOUT_MS = 8000;
const MANTLE_CACHE_TTL_MS = 5000;
const MANTLE_MAX_CONCURRENCY = 6;
const mantleValueCache = new Map();
const mantleInFlight = new Map();
let mantleCacheEpoch = 0;

// 按并发上限跑任务，避免一次 list 后对几百条 path 同时发起请求。
async function mapLimit(items, limit, worker) {
  const list = Array.from(items || []);
  if (!list.length) return [];
  const results = new Array(list.length);
  let cursor = 0;
  const runners = [];
  const runnerCount = Math.max(1, Math.min(limit, list.length));
  for (let index = 0; index < runnerCount; index += 1) {
    runners.push(
      (async () => {
        while (cursor < list.length) {
          const current = cursor;
          cursor += 1;
          results[current] = await worker(list[current], current);
        }
      })()
    );
  }
  await Promise.all(runners);
  return results;
}

async function fetchMantle(url, options) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), MANTLE_TIMEOUT_MS);
  try {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        },
        cache: "no-store"
      });
    } catch (error) {
      throw toMantleTimeoutError(error, controller);
    }
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = new Error(`Shared storage request failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null;
    // 读取响应体也要在超时保护之内：只等头部是不够的，body 卡住同样会挂死同步。
    try {
      return await response.json();
    } catch (error) {
      throw toMantleTimeoutError(error, controller);
    }
  } finally {
    window.clearTimeout(timer);
  }
}

function toMantleTimeoutError(error, controller) {
  if (controller.signal.aborted) {
    const timeoutError = new Error("共享服务响应超时，请稍后再试。");
    timeoutError.name = "MantleTimeoutError";
    timeoutError.status = 0;
    timeoutError.timeout = true;
    return timeoutError;
  }
  return error;
}

async function mantleRequest(url, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  if (method !== "GET") {
    const result = await fetchMantle(url, options);
    // 写入成功后立刻让短时缓存失效，避免随后读到旧列表。
    mantleCacheEpoch += 1;
    mantleValueCache.clear();
    return result;
  }
  const key = String(url);
  const cached = mantleValueCache.get(key);
  if (cached && Date.now() - cached.at < MANTLE_CACHE_TTL_MS) {
    return cached.value;
  }
  const pending = mantleInFlight.get(key);
  if (pending) return pending;
  const epoch = mantleCacheEpoch;
  const request = fetchMantle(url, options).then(
    (value) => {
      mantleInFlight.delete(key);
      if (epoch === mantleCacheEpoch) {
        mantleValueCache.set(key, { at: Date.now(), value });
      }
      return value;
    },
    (error) => {
      mantleInFlight.delete(key);
      throw error;
    }
  );
  mantleInFlight.set(key, request);
  return request;
}

async function readRemoteAccount(usernameKey) {
  if (!hasSharedConfig()) return null;
  return mantleRequest(mantleEntryUrl(`accounts/${encodeURIComponent(usernameKey)}`));
}

async function writeRemoteAccount(account) {
  if (!hasSharedConfig()) return;
  await mantleRequest(mantleEntryUrl(`accounts/${encodeURIComponent(account.usernameKey)}`), {
    method: "POST",
    body: JSON.stringify(account)
  });
}

async function readRemoteClassByCode(classCode) {
  const classId = classIdFromCode(classCode);
  if (!classId) return null;
  return mantleRequest(mantleEntryUrl(`classes/${encodeURIComponent(classId)}`));
}

async function writeRemoteClass(classInfo) {
  await mantleRequest(
    mantleEntryUrl(`classes/${encodeURIComponent(classInfo.id)}`),
    {
      method: "POST",
      body: JSON.stringify(classInfo)
    }
  );
}

async function listRemoteClasses() {
  if (!hasSharedConfig()) return [];
  const list = await mantleRequest(mantleListUrl());
  const classPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("classes/"));
  const classes = await mapLimit(classPaths, MANTLE_MAX_CONCURRENCY, (path) =>
    mantleRequest(mantleEntryUrl(path))
  );
  return classes.filter((item) => item?.id && item?.code);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function dailyUsagePath() {
  return `usage/${encodeURIComponent(authState.session.user.id)}/${localDateKey()}`;
}

async function readDailyUsage() {
  if (!authState.session || !hasSharedConfig()) {
    return { total: 0, post: 0, team: 0, suggestion: 0, deadline: 0 };
  }
  const usage = await mantleRequest(mantleEntryUrl(dailyUsagePath()));
  return {
    total: Number(usage?.total || 0),
    post: Number(usage?.post || 0),
    team: Number(usage?.team || 0),
    suggestion: Number(usage?.suggestion || 0),
    deadline: Number(usage?.deadline || 0)
  };
}

async function ensurePublishQuota(recordType) {
  if (isCurrentAdmin()) return;
  if (!authState.session || !hasSharedConfig()) return;
  let usage;
  try {
    usage = await readDailyUsage();
  } catch (error) {
    // 配额读不到时放行：离线或网络故障不该阻止已经写好的离线队列。
    setSyncStatus("offline");
    scheduleSharedSync();
    return;
  }
  if (usage.total >= PUBLISH_LIMITS.total) {
    const limitError = new Error(`今天已经发布 ${PUBLISH_LIMITS.total} 条，请明天再试。`);
    limitError.quotaLimit = true;
    throw limitError;
  }
  if (usage[recordType] >= PUBLISH_LIMITS[recordType]) {
    const limitError = new Error(`今天这类信息最多发布 ${PUBLISH_LIMITS[recordType]} 条。`);
    limitError.quotaLimit = true;
    throw limitError;
  }
}

async function incrementDailyUsage(recordType) {
  if (!authState.session || !hasSharedConfig()) return;
  const usage = await readDailyUsage();
  const next = {
    userId: authState.session.user.id,
    date: localDateKey(),
    total: usage.total + 1,
    post: usage.post,
    team: usage.team,
    suggestion: usage.suggestion,
    deadline: usage.deadline,
    updatedAt: new Date().toISOString()
  };
  next[recordType] += 1;
  await mantleRequest(mantleEntryUrl(dailyUsagePath()), {
    method: "POST",
    body: JSON.stringify(next)
  });
  ui.dailyUsage = {
    total: next.total,
    post: next.post,
    team: next.team,
    suggestion: next.suggestion,
    deadline: next.deadline
  };
  if (ui.page === "profile") {
    render();
  }
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

function getCachedSharedRecords() {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(`${SHARED_CACHE_KEY}:${currentClassId()}`) || "[]"
    );
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function cacheSharedRecords(records) {
  try {
    localStorage.setItem(
      `${SHARED_CACHE_KEY}:${currentClassId()}`,
      JSON.stringify(records.slice(0, 300))
    );
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
        : status === "unavailable" || status === "local"
          ? "is-unavailable"
          : "is-offline"
  );
  const messages = {
    syncing: "正在同步班级共享数据...",
    online: detail || "班级共享数据已同步",
    offline: "共享服务较慢 · 内容已保存在本机",
    unavailable: "共享服务未配置",
    local: "本地模式 · 数据保存在当前设备",
    error: "共享服务暂不可用 · 稍后自动重试"
  };
  label.textContent = messages[status] || messages.offline;
}

function applySharedRecords(records, reconcile = false) {
  let changed = false;
  const remoteKeys = new Set();
  for (const record of records) {
    if (record?.record_key) remoteKeys.add(record.record_key);
    const payload = record?.payload;
    if (!payload?.id) continue;
    const id = String(payload.id);

    if (record.record_type === "post") {
      const existing = state.posts.find((item) => item.id === id);
      if (!existing) {
        state.posts.push({
          ...payload,
          id,
          shared: true,
          recordKey: record.record_key,
          authorId: record.author_id || ""
        });
        changed = true;
      } else if (record.author_id && existing.authorId !== record.author_id) {
        existing.authorId = record.author_id;
        existing.recordKey = record.record_key;
        changed = true;
      }
    }

    if (record.record_type === "team") {
      const existing = state.teams.find((item) => item.id === id);
      if (!existing) {
        state.teams.push({
          ...payload,
          id,
          shared: true,
          recordKey: record.record_key,
          authorId: record.author_id || ""
        });
        changed = true;
      } else if (record.author_id && existing.authorId !== record.author_id) {
        existing.authorId = record.author_id;
        existing.recordKey = record.record_key;
        changed = true;
      }
    }

    if (record.record_type === "suggestion") {
      const existing = state.suggestions.find((item) => item.id === id);
      if (!existing) {
        state.suggestions.push({
          ...payload,
          id,
          shared: true,
          recordKey: record.record_key,
          authorId: record.author_id || ""
        });
        changed = true;
      } else if (record.author_id && existing.authorId !== record.author_id) {
        existing.authorId = record.author_id;
        existing.recordKey = record.record_key;
        changed = true;
      }
    }

    if (record.record_type === "deadline") {
      const existing = state.deadlines.find((item) => item.id === id);
      if (!existing) {
        state.deadlines.push({
          ...payload,
          id,
          shared: true,
          recordKey: record.record_key,
          authorId: record.author_id || ""
        });
        changed = true;
      } else if (record.author_id && existing.authorId !== record.author_id) {
        existing.authorId = record.author_id;
        existing.recordKey = record.record_key;
        changed = true;
      }
    }
  }

  // 只在远端成功返回时做对账：本地已经缓存的共享记录若在远端消失，就一并移除。
  if (reconcile) {
    const pendingKeys = new Set(getPendingSharedRecords().map((item) => item.record_key));
    for (const collectionName of ["posts", "teams", "suggestions", "deadlines"]) {
      const collection = state[collectionName];
      const kept = collection.filter((item) => {
        if (!item?.shared || !item.recordKey) return true;
        if (remoteKeys.has(item.recordKey)) return true;
        // 还在待发队列里、或本轮刚上传成功的记录绝不能删，否则会真的丢内容。
        return (
          pendingKeys.has(item.recordKey) || recentlyUploadedSharedKeys.has(item.recordKey)
        );
      });
      if (kept.length !== collection.length) {
        state[collectionName] = kept;
        changed = true;
      }
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

async function readSharedRecords() {
  if (!hasSharedConfig()) return [];
  const list = await mantleRequest(mantleListUrl());
  const allPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("records/"));
  const recordPaths = allPaths.slice(0, 500);
  const records = await mapLimit(recordPaths, MANTLE_MAX_CONCURRENCY, (path) =>
    mantleRequest(mantleEntryUrl(path))
  );
  const visible = records.filter(
    (record) =>
      record?.record_key &&
      record?.payload &&
      (record.class_id || DEFAULT_CLASS_ID) === currentClassId()
  );
  // 超过 500 条时这份列表并不完整，不能据此删除本地缓存。
  visible.complete = allPaths.length <= 500;
  return visible;
}

async function readSharedHistory() {
  if (!hasSharedConfig()) return [];
  const list = await mantleRequest(mantleListUrl());
  const historyPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("history/"))
    .slice(0, 500);
  const records = await mapLimit(historyPaths, MANTLE_MAX_CONCURRENCY, (path) =>
    mantleRequest(mantleEntryUrl(path))
  );
  return records.filter(
    (record) =>
      record?.record_key &&
      record?.payload &&
      (record.class_id || DEFAULT_CLASS_ID) === currentClassId()
  );
}

async function archiveAndDeleteExpiredRecord(record) {
  if (!record?.record_key) return;
  const archiveEntry = {
    ...record,
    archived_at: new Date().toISOString(),
    expired_at: record.payload?.expiresAt || new Date().toISOString()
  };
  await mantleRequest(
    mantleEntryUrl(`history/${encodeURIComponent(record.record_key)}`),
    {
      method: "POST",
      body: JSON.stringify(archiveEntry)
    }
  );
  await mantleRequest(
    mantleEntryUrl(`records/${encodeURIComponent(record.record_key)}`),
    { method: "DELETE" }
  );
}

function purgeExpiredLocalRecords() {
  let changed = false;
  const collections = ["posts", "teams", "suggestions", "deadlines"];
  for (const collectionName of collections) {
    const before = state[collectionName].length;
    state[collectionName] = state[collectionName].filter(
      (item) => !isRecordExpired(item)
    );
    if (state[collectionName].length !== before) changed = true;
  }
  if (changed) saveState();
}

async function writeSharedRecord(record) {
  const { skip_quota, ...sharedRecord } = record;
  const isAnonymous = record.record_type === "suggestion";
  if (isAnonymous && sharedRecord.payload && typeof sharedRecord.payload === "object") {
    // 用副本剥掉身份字段，别动本地对象（作者还要靠它认出自己的内容）。
    const { authorId, ...anonymousPayload } = sharedRecord.payload;
    sharedRecord.payload = anonymousPayload;
  }
  await mantleRequest(mantleEntryUrl(`records/${encodeURIComponent(record.record_key)}`), {
    method: "POST",
    body: JSON.stringify({
      ...sharedRecord,
      author_id: isAnonymous ? null : authState.session?.user.id || null,
      visitor_id: isAnonymous ? null : record.visitor_id || null,
      class_id: record.class_id || authState.session?.classId || DEFAULT_CLASS_ID
    })
  });
}

function queueSharedRecord(recordType, payload, options = {}) {
  if (!authState.session || !hasSharedConfig() || !payload?.id) return;
  // 本地保留 authorId，方便作者在自己的设备上找到并删除自己的内容；
  // 但"匿名意见"上传时不带任何身份字段（见 outgoing / writeSharedRecord）。
  payload.authorId = authState.session.user.id;
  const isAnonymous = recordType === "suggestion";
  const outgoing = { ...payload };
  if (isAnonymous) delete outgoing.authorId;
  const recordKey = `${recordType}:${payload.id}`;
  const pending = getPendingSharedRecords().filter((item) => item.record_key !== recordKey);
  pending.push({
    record_key: recordKey,
    record_type: recordType,
    payload: outgoing,
    visitor_id: isAnonymous ? "" : getVisitorId(),
    class_id: authState.session?.classId || DEFAULT_CLASS_ID,
    status: "published",
    skip_quota: Boolean(options.skipQuota)
  });
  savePendingSharedRecords(pending);
  void flushPendingSharedRecords()
    .then(() => {
      syncState.available = true;
      setSyncStatus("online", "已同步到班级共享");
      void loadDailyUsage(true);
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

// 断网、超时、跨域这类没有 HTTP 状态码的失败都属于临时故障，不该计入「脏数据」次数。
function isTransientSyncError(error) {
  if (!error) return false;
  if (error.timeout === true) return true;
  return !Number(error.status || 0);
}

async function flushPendingSharedRecords() {
  if (!hasSharedConfig()) return 0;
  const pending = getPendingSharedRecords();
  if (!pending.length) return 0;
  let uploaded = 0;
  const skipped = [];
  recentlyUploadedSharedKeys.clear();

  for (const record of pending) {
    try {
      await writeSharedRecord(record);
      if (!record.skip_quota && !isCurrentAdmin()) {
        try {
          await incrementDailyUsage(record.record_type);
        } catch (error) {
          // 内容已经发布成功，只有今日用量没记上；只标记状态，不打断用户。
          syncState.usageFailed = true;
        }
      }
      uploaded += 1;
      recentlyUploadedSharedKeys.add(record.record_key);
      savePendingSharedRecords(
        getPendingSharedRecords().filter((item) => item.record_key !== record.record_key)
      );
    } catch (error) {
      // 单条失败不能让队头阻塞后面的内容。
      // 断网/超时属于临时故障：保留待发队列，等恢复网络后继续发，绝不能因此丢内容。
      if (isTransientSyncError(error)) {
        syncState.available = false;
        setSyncStatus("offline");
        scheduleSharedSync();
        continue;
      }
      // 服务端明确拒绝（脏数据）才计数，累计 5 次移出队列。
      const attempts = Number(record.attempts || 0) + 1;
      if (attempts >= 5) {
        skipped.push(record);
        savePendingSharedRecords(
          getPendingSharedRecords().filter((item) => item.record_key !== record.record_key)
        );
      } else {
        const next = getPendingSharedRecords().map((item) =>
          item.record_key === record.record_key ? { ...item, attempts } : item
        );
        savePendingSharedRecords(next);
      }
    }
  }

  if (skipped.length) {
    showToast("部分内容未能同步", `有 ${skipped.length} 条内容同步失败，已跳过。`);
    setSyncStatus("offline");
    scheduleSharedSync();
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

async function ensureCurrentAccountShared() {
  if (syncState.accountChecked || !authState.session || !hasSharedConfig()) return false;
  const usernameKey = localUsernameKey(authState.session.username);
  const localAccount = getLocalAccounts().find((account) => account.usernameKey === usernameKey);
  if (!localAccount) {
    syncState.accountChecked = true;
    return false;
  }
  const remoteAccount = await readRemoteAccount(usernameKey);
  if (!remoteAccount) {
    await writeRemoteAccount(localAccount);
    syncState.accountChecked = true;
    return false;
  } else {
    if (!remoteAccount.classId) {
      remoteAccount.classId = DEFAULT_CLASS_ID;
      remoteAccount.classCode = DEFAULT_CLASS_CODE;
      remoteAccount.className = "安徽大学集成电路专业班级";
      await writeRemoteAccount(remoteAccount);
    }
    let changed = false;
    const nextRole = resolveAccountRole(remoteAccount);
    const nextPendingRole = remoteAccount.pendingRole
      ? normalizeRole(remoteAccount.pendingRole)
      : "";
    const nextNote = String(remoteAccount.identityNote || "");
    if (authState.session.username !== remoteAccount.username) {
      authState.session.username = remoteAccount.username;
      changed = true;
    }
    if (authState.session.role !== nextRole) {
      authState.session.role = nextRole;
      changed = true;
    }
    if ((authState.session.pendingRole || "") !== nextPendingRole) {
      authState.session.pendingRole = nextPendingRole;
      changed = true;
    }
    if ((authState.session.identityNote || "") !== nextNote) {
      authState.session.identityNote = nextNote;
      changed = true;
    }
    if ((authState.session.identityStatus || "") !== (remoteAccount.identityStatus || "student")) {
      authState.session.identityStatus = remoteAccount.identityStatus || "student";
      changed = true;
    }
    if ((authState.session.classId || "") !== (remoteAccount.classId || DEFAULT_CLASS_ID)) {
      authState.session.classId = remoteAccount.classId || DEFAULT_CLASS_ID;
      changed = true;
    }
    if ((authState.session.classCode || "") !== (remoteAccount.classCode || DEFAULT_CLASS_CODE)) {
      authState.session.classCode = remoteAccount.classCode || DEFAULT_CLASS_CODE;
      changed = true;
    }
    if ((authState.session.className || "") !== (remoteAccount.className || "安徽大学集成电路专业班级")) {
      authState.session.className =
        remoteAccount.className || "安徽大学集成电路专业班级";
      changed = true;
    }
    state.candidate.name = authState.session.username;
    saveAuthSession(authState.session);
    saveState();
    syncState.accountChecked = true;
    return changed;
  }
}

function importLocalRecordsToShared() {
  if (syncState.localImported || !authState.session) return;
  const isSeedId = (id) => /^(p|t|d|s)-\d+$/.test(String(id || ""));
  const collections = [
    ["post", state.posts],
    ["team", state.teams],
    ["suggestion", state.suggestions],
    ["deadline", state.deadlines]
  ];

  for (const [recordType, records] of collections) {
    records
      .filter((record) => record?.id && !record.shared && !isSeedId(record.id))
      .forEach((record) => {
        record.shared = true;
        queueSharedRecord(recordType, record, { skipQuota: true });
      });
  }

  syncState.localImported = true;
  saveState();
}

async function syncSharedRecords() {
  if (!authState.session) {
    return;
  }
  if (syncState.inFlight || !hasSharedConfig()) {
    if (!hasSharedConfig()) setSyncStatus("local");
    return;
  }

  syncState.inFlight = true;
  setSyncStatus("syncing");
  try {
    syncState.usageFailed = false;
    const accountChanged = await ensureCurrentAccountShared();
    importLocalRecordsToShared();
    await flushPendingSharedRecords();
    purgeExpiredLocalRecords();
    const allRecords = await readSharedRecords();
    const expiredRecords = allRecords.filter((record) => isRecordExpired(record?.payload));
    const records = allRecords.filter((record) => !isRecordExpired(record?.payload));
    let archiveFailed = false;
    await Promise.all(
      expiredRecords.map((record) =>
        archiveAndDeleteExpiredRecord(record).catch(() => {
          // 归档失败：内容仍留在本地，只提示同步状态，不弹技术错误。
          archiveFailed = true;
        })
      )
    );
    if (expiredRecords.length) {
      ui.historyLoaded = false;
      if (ui.page === "history") void loadHistory(true);
    }
    cacheSharedRecords(records);
    // 只有本次请求完整成功返回时才按远端结果对账删除本地缓存。
    const reconcile = allRecords.complete !== false;
    const changed = applySharedRecords(records, reconcile);
    syncState.available = true;
    if (changed || accountChanged) {
      saveState();
      render();
    }
    if (archiveFailed || syncState.usageFailed) {
      setSyncStatus("offline");
      scheduleSharedSync();
    } else {
      setSyncStatus("online", `班级共享已同步 · ${records.length} 条`);
    }
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

// 上传限制：文件始终只存在你这台设备的 IndexedDB 里，不会上传到共享接口。
// 这里挡掉的是"浏览器会当成网页/脚本执行"的类型——它们下载后一旦被直接打开，
// 有可能在本站域名下跑起来；课程作业类文件（.v/.c/.sch 等）不受限制。
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  "html", "htm", "xhtml", "svg", "xml", "xht",
  "js", "mjs", "cjs", "jse", "exe", "msi", "bat", "cmd", "com", "scr",
  "ps1", "vbs", "vbe", "wsf", "wsh", "jar", "apk", "hta", "lnk", "reg"
]);

function uploadFileExtension(name) {
  const match = /\.([a-z0-9]+)$/i.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

async function handleFileUpload(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > MAX_UPLOAD_BYTES) {
    showToast("文件过大", "单个文件请控制在 15 MB 以内。");
    input.value = "";
    return;
  }
  const extension = uploadFileExtension(file.name);
  if (BLOCKED_UPLOAD_EXTENSIONS.has(extension)) {
    showToast(
      "这个类型的文件不能上传",
      `为了安全，.${extension} 这类会被浏览器当作网页或程序执行的格式不允许上传。`
    );
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

/* =========================================================================
   IC-4 运动会（班集站内栏目）
   名单数据来源：运动会宣传/运动员名单.csv —— 当前是占位名单，上线前需替换
   ========================================================================= */

const SPORTS_MEET = {
  meetTime: "2026-10-18T08:00:00+08:00",
  dateLabel: "2026.10.18 · 安徽大学 龙河校区",
  slogan: "集成电路，一路通电　·　四班四班，信号满格",
  supply: "集成电路 4 班 · 全体后援",
  status: "已通电 / READY",
  momentsManifest: "assets/moments/manifest.json",
  momentsDir: "assets/moments/"
};

/* ==== ATHLETES:BEGIN ==== 由「运动会宣传/tools/build_site.py」从 CSV 生成，手改会被覆盖 ==== */
const SPORTS_ATHLETES = [
  { name: "张明宇", event: "男子 100 米", pack: "预赛第 3 组 / 4 道", power: 5, cheer: "发令枪响，直接满频运行。" },
  { name: "李思远", event: "男子 200 米", pack: "预赛第 2 组 / 6 道", power: 4, cheer: "弯道超频，直道收敛。" },
  { name: "王雨桐", event: "女子 800 米", pack: "决赛", power: 4, cheer: "两圈不长，我们全程给你供电。" },
  { name: "赵子豪", event: "4×100 米接力", pack: "第 4 棒", power: 5, cheer: "最后一棒，交给你的都是最优解。" },
  { name: "陈嘉怡", event: "女子跳远", pack: "决赛", power: 3, cheer: "助跑起跳，落点写进纪录里。" },
  { name: "刘浩宇", event: "男子 1500 米", pack: "决赛", power: 4, cheer: "心率拉满，终点见。" },
  { name: "孙诗雨", event: "女子 400 米", pack: "预赛第 2 组", power: 4, cheer: "弯道不减速，直道不留情。" },
  { name: "周奕辰", event: "铅球", pack: "决赛", power: 3, cheer: "这一掷，突破封装极限。" },
  { name: "吴梦琪", event: "女子 100 米", pack: "预赛第 4 组 / 3 道", power: 4, cheer: "起跑即满速，冲线才断电。" },
  { name: "郑一鸣", event: "男子跳高", pack: "决赛", power: 4, cheer: "每一次起跳，都是一次升压。" },
  { name: "徐若涵", event: "女子 1500 米", pack: "决赛", power: 3, cheer: "慢一点没关系，别停就行。" },
  { name: "马俊杰", event: "4×400 米接力", pack: "第 2 棒", power: 4, cheer: "交棒快过信号传输。" },
  { name: "朱雅琳", event: "女子铅球", pack: "决赛", power: 3, cheer: "力量已经预加载完毕。" },
  { name: "胡文博", event: "男子 400 米", pack: "预赛第 1 组", power: 4, cheer: "一圈而已，全功率输出。" },
  { name: "林晓阳", event: "三级跳远", pack: "决赛", power: 3, cheer: "三步起飞，落点见真章。" },
  { name: "高子墨", event: "男子 800 米", pack: "决赛", power: 4, cheer: "最后 100 米，交给后援团。" },
  { name: "何欣怡", event: "女子跳高", pack: "决赛", power: 4, cheer: "横杆之上，还有余量。" },
  { name: "郭泽宇", event: "男子实心球", pack: "决赛", power: 3, cheer: "一掷定音，全场静默。" },
  { name: "罗佳宁", event: "女子 200 米", pack: "预赛第 3 组 / 5 道", power: 4, cheer: "零延迟启动，满带宽冲刺。" },
  { name: "梁天成", event: "男子跳远", pack: "决赛", power: 4, cheer: "这一跳，写进班级纪录。" }
];
/* ==== ATHLETES:END ==== */

const SPORTS_MOMENT_SLOTS = ["开幕式", "起跑", "冲线", "接力", "跳跃", "加油瞬间", "颁奖", "班级合影"];

const sportsUi = {
  selected: 0,
  lit: false,
  photos: null,
  timer: 0,
  lightbox: -1,
  onResize: null,
  photoDraft: null,
  photoBusy: false,
  photoNotice: ""
};

const SPORTS_PHOTO_PATH = "photos/";
const SPORTS_PHOTO_MAX_BYTES = 45000;
const SPORTS_PHOTO_REVIEW_ROLES = SCHEDULE_EDIT_ROLES.concat(["publicity", "league_secretary"]);
const sportsPhotos = { approved: [], pending: [] };

function sportsAthleteId(index) {
  return "IC4-" + String(index + 1).padStart(3, "0");
}

function sportsPowerLevel(value) {
  const level = Math.round(Number(value));
  if (!Number.isFinite(level)) return 5;
  return Math.max(1, Math.min(5, level));
}

// 在直径 1 的圆里铺一层六方网格（间距 = step），返回所有落在圆内的格子中心。
function sportsWaferPoints(step) {
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

// 把全班排成一片晶圆：二分找出"刚好装得下 count 颗、且间距最大"的网格步长，
// 间距越大芯片越大越好认；再把整团芯片居中、等比放大到填满晶圆。
// 坐标归一化到直径 1 的圆里，最终由 CSS 用百分比定位，所以任何屏幕尺寸都自适应。
function sportsWaferLayout(count) {
  const total = Math.max(1, count);
  const radius = 0.5;
  let tooSmall = 0.005;
  let tooBig = 1;

  for (let i = 0; i < 48; i += 1) {
    const mid = (tooSmall + tooBig) / 2;
    if (sportsWaferPoints(mid).length >= total) tooSmall = mid;
    else tooBig = mid;
  }

  const step = tooSmall;
  const points = sportsWaferPoints(step);
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

  // 先按"尽量铺满"放大，再反复收缩，直到最外那颗芯片的外沿也不越过圆边，
  // 否则芯片会压出晶圆轮廓外面，看起来像贴纸没贴牢。
  const maxDie = 0.3;
  const inner = radius - 0.008;
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

function renderSportsPanel(index) {
  const total = SPORTS_ATHLETES.length;
  if (!total) return `<div class="panel-body"><p>名单还没有数据。</p></div>`;
  const current = ((index % total) + total) % total;
  const athlete = SPORTS_ATHLETES[current];
  const level = sportsPowerLevel(athlete.power);
  const specs = [
    ["EVENT", athlete.event],
    ["PACKAGE", athlete.pack || "—"],
    ["POWER RATING", "★".repeat(level) + "☆".repeat(5 - level)],
    ["POWER SUPPLY", SPORTS_MEET.supply],
    ["STATUS", sportsUi.lit ? SPORTS_MEET.status : "待机 / STANDBY"]
  ];

  return `
    <header class="panel-header">
      <div>
        <h3>${sportsAthleteId(current)}</h3>
        <p>DATASHEET / Rev.1.0</p>
      </div>
      <span class="badge ${sportsUi.lit ? "green" : "yellow"}">${sportsUi.lit ? "已通电" : "待机"}</span>
    </header>
    <div class="panel-body sports-datasheet">
      <h4 class="sports-name">${escapeHTML(athlete.name)}</h4>
      <p class="sports-event">${escapeHTML(athlete.event)}</p>
      <dl class="sports-specs">
        ${specs
          .map(
            (item) => `
              <div class="sports-spec">
                <dt>${escapeHTML(item[0])}</dt>
                <dd>${escapeHTML(item[1])}</dd>
              </div>
            `
          )
          .join("")}
      </dl>
      <p class="sports-cheer">${escapeHTML(athlete.cheer || "信号满格，等你冲线。")}</p>
    </div>
  `;
}

function renderSportsRoster() {
  return SPORTS_ATHLETES.map((athlete, index) => {
    const active = index === sportsUi.selected;
    return `
      <button class="sports-roster-row${active ? " is-active" : ""}" type="button" data-action="sports-select" data-index="${index}">
        <span class="sports-roster-no">${String(index + 1).padStart(3, "0")}</span>
        <strong>${escapeHTML(athlete.name)}</strong>
        <span class="sports-roster-event">${escapeHTML(athlete.event)}</span>
        <span class="sports-roster-pack">${escapeHTML(athlete.pack || "")}</span>
      </button>
    `;
  }).join("");
}

function renderSportsMomentSlots() {
  return SPORTS_MOMENT_SLOTS.map(
    (label) => `
      <figure class="sports-moment is-empty">
        <div class="sports-moment-thumb">${icon("presentation")}</div>
        <figcaption>
          <strong>${escapeHTML(label)}</strong>
          <small>待收录</small>
        </figcaption>
      </figure>
    `
  ).join("");
}

function sportsPhotoId() {
  return "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function sportsMomentList() {
  const repo = (sportsUi.photos || []).map((photo) => ({
    src: SPORTS_MEET.momentsDir + photo.file,
    title: photo.title || "美好片刻",
    note: photo.date || SPORTS_MEET.dateLabel
  }));
  const shared = sportsPhotos.approved.map((record) => ({
    src: record.data_url,
    title: record.title || "美好片刻",
    note: `${record.uploader_name || "同学"} 投稿`
  }));
  return repo.concat(shared);
}

function renderSportsMomentsPanel() {
  const photos = sportsMomentList();
  const actions = [];
  if (authState.session) {
    actions.push(`<button class="primary-button" type="button" data-action="sports-photo-upload">${icon("cloud-upload")} 上传照片</button>`);
  }
  if (hasRolePermission(SPORTS_PHOTO_REVIEW_ROLES)) {
    actions.push(`<button class="secondary-button" type="button" data-action="sports-photo-review">${icon("check")} 审核投稿${sportsPhotos.pending.length ? `（${sportsPhotos.pending.length}）` : ""}</button>`);
  }
  const grid = photos.length
    ? photos.map((photo, index) => `<figure class="sports-moment"><button class="sports-moment-thumb" type="button" data-action="sports-photo" data-index="${index}"><img src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.title)}" loading="lazy" /></button><figcaption><strong>${escapeHTML(photo.title)}</strong><small>${escapeHTML(photo.note)}</small></figcaption></figure>`).join("")
    : renderSportsMomentSlots();
  return `<header class="panel-header"><div><h3>美好片刻</h3><p>全班可投稿，管理员/班委审核后显示</p></div><span class="badge${photos.length ? " green" : " yellow"}" id="sports-moments-state">${photos.length ? `${photos.length} 张` : "待收录"}</span></header><div class="panel-body">${actions.length ? `<div class="sports-photo-actions">${actions.join("")}</div>` : ""}${sportsUi.photoNotice ? `<p class="sports-photo-notice">${escapeHTML(sportsUi.photoNotice)}</p>` : ""}<div class="sports-moments-grid" id="sports-moments-grid">${grid}</div></div>`;
}

function refreshSportsMoments() {
  const panel = document.getElementById("sports-moments-panel");
  if (!panel) return;
  panel.innerHTML = renderSportsMomentsPanel();
  refreshIcons(panel);
}

function renderSports() {
  const total = SPORTS_ATHLETES.length;
  const layout = sportsWaferLayout(total);
  const sizePercent = Math.min(layout.spacing * 0.82 * 100, 30);
  const dice = SPORTS_ATHLETES.map((athlete, index) => {
    const point = layout.points[index];
    if (!point) return "";
    const length = athlete.name.length;
    const ratio = length >= 4 ? 0.17 : length === 3 ? 0.215 : 0.255;
    return `
      <button
        class="sports-die${index === sportsUi.selected ? " is-active" : ""}"
        type="button"
        data-action="sports-select"
        data-index="${index}"
        style="left: ${(50 + point.x * 100).toFixed(3)}%; top: ${(50 + point.y * 100).toFixed(3)}%; width: ${sizePercent.toFixed(3)}%; --die-ratio: ${ratio}"
        aria-label="${escapeHTML(athlete.name)} ${escapeHTML(athlete.event)}"
      >
        <span class="sports-die-name">${escapeHTML(athlete.name)}</span>
        <span class="sports-die-id">${sportsAthleteId(index)}</span>
      </button>
    `;
  }).join("");

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">安徽大学 · 集成电路学院</p>
          <h2>IC-4 出战名单</h2>
          <p>${escapeHTML(SPORTS_MEET.dateLabel)} · 全班 ${total} 位选手 · 一片晶圆，全员通电。</p>
        </div>
        <div class="page-actions">
          <span class="badge green" id="sports-countdown">距开赛 --</span>
          <span class="badge blue">${total} 位选手</span>
        </div>
      </header>

      <section class="content-grid">
        <div class="stack">
          <article class="panel sports-wafer-card">
            <header class="panel-header">
              <div>
                <h3>IC-4 WAFER · LOT 2026-10-18</h3>
                <p>点任意一颗芯片，看它的出战参数</p>
              </div>
              <span class="badge">${total} 颗在测</span>
            </header>
            <div class="panel-body">
              <div class="sports-wafer" id="sports-wafer">
                <div class="sports-wafer-grid" aria-hidden="true"></div>
                <div class="sports-wafer-notch" aria-hidden="true"></div>
                ${dice}
                <div class="sports-probe" aria-hidden="true"></div>
              </div>
              <div class="sports-wafer-actions">
                <button class="primary-button" type="button" data-action="sports-power">${icon("gauge")} 一键通电</button>
                <button class="secondary-button" type="button" data-action="sports-reset">复位</button>
                <span class="sports-hint">${escapeHTML(SPORTS_MEET.slogan)}</span>
              </div>
            </div>
          </article>
        </div>

        <aside class="stack">
          <section class="panel" id="sports-panel">${renderSportsPanel(sportsUi.selected)}</section>
          <section class="panel">
            <header class="panel-header">
              <div>
                <h3>出战名单</h3>
                <p>共 ${total} 人，点一行看详情</p>
              </div>
            </header>
            <div class="panel-body sports-roster">${renderSportsRoster()}</div>
          </section>
        </aside>
      </section>

      <section class="panel" id="sports-moments-panel">${renderSportsMomentsPanel()}</section>
    </div>
  `;
}

function selectSportsAthlete(index) {
  const total = SPORTS_ATHLETES.length;
  if (!total) return;
  const next = ((Number(index) || 0) % total + total) % total;
  sportsUi.selected = next;

  document.querySelectorAll("#app .sports-die.is-active").forEach((node) => node.classList.remove("is-active"));
  document.querySelectorAll("#app .sports-roster-row.is-active").forEach((node) => node.classList.remove("is-active"));

  const die = document.querySelector(`#app .sports-die[data-index="${next}"]`);
  if (die) die.classList.add("is-active");
  const row = document.querySelector(`#app .sports-roster-row[data-index="${next}"]`);
  if (row) row.classList.add("is-active");

  const panel = document.getElementById("sports-panel");
  if (panel) {
    panel.innerHTML = renderSportsPanel(next);
    refreshIcons(panel);
  }
}

function powerOnSports() {
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

  sportsUi.lit = true;
  dice.forEach((item, order) => {
    item.node.classList.remove("is-lit");
    window.setTimeout(() => {
      item.node.classList.add("is-lit");
      if (order === dice.length - 1) {
        sportsUi.lit = true;
        const panel = document.getElementById("sports-panel");
        if (panel) {
          panel.innerHTML = renderSportsPanel(sportsUi.selected);
          refreshIcons(panel);
        }
      }
    }, 60 + order * 38);
  });
}

function resetSportsPower() {
  sportsUi.lit = false;
  document.querySelectorAll("#app .sports-die.is-lit").forEach((node) => node.classList.remove("is-lit"));
  const panel = document.getElementById("sports-panel");
  if (panel) {
    panel.innerHTML = renderSportsPanel(sportsUi.selected);
    refreshIcons(panel);
  }
}

function startSportsCountdown() {
  if (sportsUi.timer) window.clearInterval(sportsUi.timer);
  const target = new Date(SPORTS_MEET.meetTime).getTime();

  const tick = () => {
    const node = document.getElementById("sports-countdown");
    if (!node) {
      if (sportsUi.timer) window.clearInterval(sportsUi.timer);
      sportsUi.timer = 0;
      return;
    }
    const rest = target - Date.now();
    if (!Number.isFinite(rest) || rest <= 0) {
      node.textContent = "已开赛 · 全员通电";
      return;
    }
    const days = Math.floor(rest / 86400000);
    const hours = Math.floor((rest % 86400000) / 3600000);
    const minutes = Math.floor((rest % 3600000) / 60000);
    const seconds = Math.floor((rest % 60000) / 1000);
    node.textContent = days > 0
      ? `距开赛 ${days} 天 ${hours} 时 ${minutes} 分`
      : `距开赛 ${hours} 时 ${minutes} 分 ${seconds} 秒`;
  };

  tick();
  sportsUi.timer = window.setInterval(tick, 1000);
}

function sizeSportsWafer() {
  const wafer = document.getElementById("sports-wafer");
  if (!wafer) return;
  const side = wafer.clientWidth;
  if (!side) return;
  const layout = sportsWaferLayout(SPORTS_ATHLETES.length);
  const die = Math.max(30, Math.min(layout.spacing * side * 0.82, side * 0.3));
  wafer.style.setProperty("--die-size", die.toFixed(2) + "px");
}

function loadSportsMoments() {
  if (!document.getElementById("sports-moments-grid")) return;
  loadSportsPhotos()
    .catch(() => [])
    .then(() => refreshSportsMoments());
  fetch(SPORTS_MEET.momentsManifest, { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((data) => {
      sportsUi.photos = data && Array.isArray(data.photos) ? data.photos.filter((photo) => photo && photo.file) : [];
      refreshSportsMoments();
    })
    .catch(() => {});
}

async function loadSportsPhotos() {
  if (!hasSharedConfig()) return [];
  const list = await mantleRequest(mantleListUrl());
  const paths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.indexOf(SPORTS_PHOTO_PATH) === 0)
    .slice(0, 300);
  const records = await mapLimit(paths, MANTLE_MAX_CONCURRENCY, (path) =>
    mantleRequest(mantleEntryUrl(path)).catch(() => null)
  );
  const all = records.filter(
    (record) => record && record.photo_id && (record.class_id || DEFAULT_CLASS_ID) === currentClassId()
  );
  all.sort((a, b) => parseDate(b.created_at) - parseDate(a.created_at));
  sportsPhotos.approved = all.filter((record) => record.status === "approved" && record.data_url);
  sportsPhotos.pending = all.filter((record) => record.status !== "approved" && record.status !== "rejected");
  return all;
}

function sportsLoadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("这张图读不出来，请换一张 JPG 或 PNG。")); };
    image.src = url;
  });
}

function sportsReadDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("照片读取失败，请重试。"));
    reader.readAsDataURL(blob);
  });
}

async function sportsCompressPhoto(file) {
  if (!file || String(file.type || "").indexOf("image/") !== 0) {
    throw new Error("请选择图片文件（JPG 或 PNG）。");
  }
  const source = await sportsLoadImage(file);
  const srcWidth = source.naturalWidth || source.width;
  const srcHeight = source.naturalHeight || source.height;
  let smallest = null;
  for (const edge of [1280, 1000, 800, 640, 480]) {
    const ratio = Math.min(1, edge / Math.max(srcWidth, srcHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(srcWidth * ratio));
    canvas.height = Math.max(1, Math.round(srcHeight * ratio));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.68, 0.56, 0.46]) {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) continue;
      if (!smallest || blob.size < smallest.bytes) {
        smallest = { blob, width: canvas.width, height: canvas.height, bytes: blob.size };
      }
      if (blob.size <= SPORTS_PHOTO_MAX_BYTES) {
        return { dataUrl: await sportsReadDataUrl(blob), width: canvas.width, height: canvas.height, bytes: blob.size };
      }
    }
  }
  if (!smallest) throw new Error("照片压缩失败，请换一张再试。");
  return {
    dataUrl: await sportsReadDataUrl(smallest.blob),
    width: smallest.width,
    height: smallest.height,
    bytes: smallest.bytes
  };
}

function closeSportsDialog() {
  const box = document.getElementById("sports-dialog");
  if (box) box.remove();
}

function sportsDialogShell(title, body) {
  closeSportsDialog();
  const box = document.createElement("div");
  box.className = "sports-dialog";
  box.id = "sports-dialog";
  box.setAttribute("role", "dialog");
  box.innerHTML = `<div class="sports-dialog-card"><header class="sports-dialog-head"><h3>${escapeHTML(title)}</h3><button class="sports-dialog-close" type="button" data-action="sports-dialog-close" aria-label="关闭">${icon("x")}</button></header>${body}</div>`;
  box.addEventListener("click", (event) => { if (event.target === box) closeSportsDialog(); });
  document.body.appendChild(box);
  refreshIcons(box);
  return box;
}

function pickSportsPhoto() {
  if (!authState.session) {
    sportsUi.photoNotice = "请先登录再投稿。";
    refreshSportsMoments();
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  document.body.appendChild(input);
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (!file) return;
    sportsUi.photoNotice = "正在压缩…";
    refreshSportsMoments();
    try {
      sportsUi.photoDraft = await sportsCompressPhoto(file);
      sportsUi.photoNotice = "";
      openSportsUploadDialog();
    } catch (error) {
      sportsUi.photoNotice = error?.message || "照片处理失败，请重试。";
    }
    refreshSportsMoments();
  });
  input.click();
}

function openSportsUploadDialog() {
  const draft = sportsUi.photoDraft;
  if (!draft) return;
  sportsDialogShell(
    "提交照片",
    `<img class="sports-dialog-preview" src="${escapeHTML(draft.dataUrl)}" alt="待提交的照片" /><p class="sports-dialog-hint">已压到 ${Math.round(draft.bytes / 1024)} KB（${draft.width}×${draft.height}）。共享库一条只放 64 KB，原图不会上传。</p><label class="sports-dialog-field">照片说明<input type="text" id="sports-photo-title" maxlength="24" placeholder="例如：接力交棒瞬间" /></label><div class="sports-dialog-actions"><button class="secondary-button" type="button" data-action="sports-dialog-close">取消</button><button class="primary-button" type="button" data-action="sports-photo-submit">${icon("cloud-upload")} 提交投稿</button></div>`
  );
  document.getElementById("sports-photo-title")?.focus();
}

async function submitSportsPhoto() {
  const draft = sportsUi.photoDraft;
  if (!draft || !authState.session || sportsUi.photoBusy) return;
  const record = {
    photo_id: sportsPhotoId(),
    class_id: currentClassId(),
    title: (document.getElementById("sports-photo-title")?.value || "").trim().slice(0, 24),
    data_url: draft.dataUrl,
    width: draft.width,
    height: draft.height,
    bytes: draft.bytes,
    uploader_id: authState.session.user?.id || "",
    uploader_name: authState.session.username || "",
    uploader_role: authState.session.role || "student",
    status: "pending",
    created_at: new Date().toISOString()
  };
  if (JSON.stringify(record).length > 65536) {
    sportsUi.photoDraft = null;
    sportsUi.photoNotice = "照片太大，请换一张更小的。";
    closeSportsDialog();
    refreshSportsMoments();
    return;
  }
  sportsUi.photoBusy = true;
  try {
    await mantleRequest(mantleEntryUrl(SPORTS_PHOTO_PATH + encodeURIComponent(record.photo_id)), {
      method: "POST",
      body: JSON.stringify(record)
    });
    sportsUi.photoDraft = null;
    sportsUi.photoNotice = "已提交，等管理员或班委审核后就会出现。";
    closeSportsDialog();
    await loadSportsPhotos();
  } catch (error) {
    sportsUi.photoNotice = `提交失败：${error?.message || "请检查网络后重试。"}`;
  }
  sportsUi.photoBusy = false;
  refreshSportsMoments();
}

function openSportsReviewDialog() {
  if (!hasRolePermission(SPORTS_PHOTO_REVIEW_ROLES)) return;
  const pending = sportsPhotos.pending;
  const rows = pending.length
    ? pending.map((record) => `<div class="sports-review-item"><img src="${escapeHTML(record.data_url)}" alt="待审核照片" loading="lazy" /><div class="sports-review-meta"><strong>${escapeHTML(record.title || "未命名照片")}</strong><small>${escapeHTML(record.uploader_name || "同学")} 投稿</small></div><div class="sports-review-actions"><button class="primary-button" type="button" data-action="sports-photo-approve" data-id="${escapeHTML(record.photo_id)}">通过</button><button class="danger-button" type="button" data-action="sports-photo-reject" data-id="${escapeHTML(record.photo_id)}">驳回</button></div></div>`).join("")
    : `<p class="sports-dialog-hint">暂无待审核投稿。</p>`;
  sportsDialogShell(`审核投稿（${pending.length}）`, `<div class="sports-review-list">${rows}</div>`);
}

async function reviewSportsPhoto(id, approve) {
  if (!hasRolePermission(SPORTS_PHOTO_REVIEW_ROLES) || sportsUi.photoBusy) return;
  sportsUi.photoBusy = true;
  const url = mantleEntryUrl(SPORTS_PHOTO_PATH + encodeURIComponent(id));
  try {
    if (approve) {
      const record = sportsPhotos.pending.find((item) => item.photo_id === id);
      if (!record) throw new Error("这条投稿已不在待审核里。");
      await mantleRequest(url, {
        method: "POST",
        body: JSON.stringify({ ...record, status: "approved", reviewed_by: authState.session?.username || "", reviewed_at: new Date().toISOString() })
      });
      sportsUi.photoNotice = "已通过 1 张投稿。";
    } else {
      await mantleRequest(url, { method: "DELETE" });
      sportsUi.photoNotice = "已驳回 1 张投稿。";
    }
    await loadSportsPhotos();
  } catch (error) {
    sportsUi.photoNotice = `操作失败：${error?.message || "请检查网络后重试。"}`;
  }
  sportsUi.photoBusy = false;
  refreshSportsMoments();
  if (sportsPhotos.pending.length) openSportsReviewDialog();
  else closeSportsDialog();
}

function openSportsPhoto(index) {
  const photo = sportsMomentList()[Number(index)];
  if (!photo) return;
  closeSportsPhoto();

  const box = document.createElement("div");
  box.className = "sports-lightbox";
  box.id = "sports-lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.innerHTML = `
    <button class="sports-lightbox-close" type="button" data-action="sports-close-photo" aria-label="关闭">${icon("x")}</button>
    <figure>
      <img src="${escapeHTML(photo.src)}" alt="${escapeHTML(photo.title || "运动会照片")}" />
      <figcaption>${escapeHTML(photo.title || "美好片刻")}</figcaption>
    </figure>
  `;
  box.addEventListener("click", (event) => {
    if (event.target === box) closeSportsPhoto();
  });
  document.body.appendChild(box);
  sportsUi.lightbox = Number(index);
  refreshIcons(box);
}

function closeSportsPhoto() {
  const box = document.getElementById("sports-lightbox");
  if (box) box.remove();
  sportsUi.lightbox = -1;
}

function mountSports() {
  sizeSportsWafer();
  if (sportsUi.onResize) window.removeEventListener("resize", sportsUi.onResize);
  sportsUi.onResize = () => sizeSportsWafer();
  window.addEventListener("resize", sportsUi.onResize);
  startSportsCountdown();
  loadSportsMoments();
}

function unmountSports() {
  if (sportsUi.onResize) {
    window.removeEventListener("resize", sportsUi.onResize);
    sportsUi.onResize = null;
  }
  if (sportsUi.timer) {
    window.clearInterval(sportsUi.timer);
    sportsUi.timer = 0;
  }
  closeSportsPhoto();
  closeSportsDialog();
}

function handleClick(event) {
  const actionElement = event.target.closest("[data-action]");
  if (!actionElement) return;
  const action = actionElement.dataset.action;

  if (action === "modal-backdrop") {
    if (event.target === actionElement) closeModal();
    return;
  }

  if (action === "auth-mode") {
    const usernameInput = document.getElementById("auth-username");
    const roleInput = document.getElementById("auth-role");
    const identityNoteInput = document.getElementById("auth-identity-note");
    const classCodeInput = document.getElementById("auth-class-code");
    authState.username = usernameInput?.value || authState.username || "";
    authState.role = normalizeRole(roleInput?.value || authState.role);
    authState.identityNote = identityNoteInput?.value || authState.identityNote || "";
    authState.classCode = classCodeInput?.value || authState.classCode || DEFAULT_CLASS_CODE;
    authState.mode = actionElement.dataset.mode === "register" ? "register" : "login";
    authState.error = "";
    authState.busy = false;
    render();
    requestAnimationFrame(() => document.getElementById("auth-username")?.focus());
    return;
  }

  if (action === "toggle-password") {
    authState.passwordVisible = !authState.passwordVisible;
    // 只切输入框类型和眼睛图标，不要整表重渲染——重渲染会把用户已经输入的密码清空。
    const passwordField = document.getElementById("auth-password");
    if (passwordField) {
      passwordField.type = authState.passwordVisible ? "text" : "password";
      const caret = passwordField.value.length;
      passwordField.focus();
      try {
        passwordField.setSelectionRange(caret, caret);
      } catch (error) {
        // 个别浏览器不允许对 password 类型设置光标位置，忽略即可。
      }
    }
    if (actionElement) {
      const label = authState.passwordVisible ? "隐藏密码" : "显示密码";
      actionElement.setAttribute("aria-label", label);
      actionElement.setAttribute("title", label);
      actionElement.innerHTML = icon(authState.passwordVisible ? "eye-off" : "eye");
      refreshIcons(actionElement);
    }
    return;
  }

  if (action === "logout") {
    logoutAccount();
    return;
  }

  if (action === "navigate") {
    navigate(actionElement.dataset.page);
    return;
  }

  if (action === "scroll-to") {
    document
      .getElementById(actionElement.dataset.target)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  if (action === "sports-select") {
    selectSportsAthlete(Number(actionElement.dataset.index) || 0);
    return;
  }

  if (action === "sports-power") {
    powerOnSports();
    return;
  }

  if (action === "sports-reset") {
    resetSportsPower();
    return;
  }

  if (action === "sports-photo") {
    openSportsPhoto(Number(actionElement.dataset.index));
    return;
  }

  if (action === "sports-close-photo") {
    closeSportsPhoto();
    return;
  }

  if (action === "sports-photo-upload") {
    pickSportsPhoto();
    return;
  }

  if (action === "sports-photo-submit") {
    submitSportsPhoto();
    return;
  }

  if (action === "sports-dialog-close") {
    closeSportsDialog();
    return;
  }

  if (action === "sports-photo-review") {
    openSportsReviewDialog();
    return;
  }

  if (action === "sports-photo-approve") {
    reviewSportsPhoto(actionElement.dataset.id || "", true);
    return;
  }

  if (action === "sports-photo-reject") {
    reviewSportsPhoto(actionElement.dataset.id || "", false);
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

  if (action === "filter-member") {
    ui.memberFilter = actionElement.dataset.filter;
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

  if (action === "delete-shared-record") {
    void deleteSharedRecord(
      actionElement.dataset.recordType,
      actionElement.dataset.id
    ).catch(() => {
      showToast("删除失败", "共享服务暂时不可用，请稍后重试。");
    });
    return;
  }

  if (action === "approve-identity" || action === "reject-identity") {
    void reviewMemberIdentity(
      actionElement.dataset.usernameKey,
      action === "approve-identity"
    ).catch(() => {
      showToast("审核失败", "共享服务暂时不可用，请稍后重试。");
    });
    return;
  }

  if (action === "delete-history-record") {
    void deleteHistoryRecord(actionElement.dataset.recordKey).catch(() => {
      showToast("删除失败", "历史记录暂时无法删除，请稍后重试。");
    });
    return;
  }

  if (action === "switch-class") {
    void switchCurrentClass(actionElement.dataset.classId).catch(() => {
      showToast("切换失败", "班级暂时无法切换，请稍后重试。");
    });
    return;
  }

  if (action === "schedule-week") {
    const delta = Number(actionElement.dataset.delta || 0);
    const maxWeek = Math.max(
      1,
      Number(ui.schedule?.semester?.weekCount || ui.schedule?.currentWeek || 20)
    );
    ui.schedule.currentWeek = Math.min(
      maxWeek,
      Math.max(1, Number(ui.schedule?.currentWeek || 1) + delta)
    );
    void writeRemoteSchedule(ui.schedule);
    render();
    return;
  }

  if (action === "delete-course") {
    void deleteScheduleCourse(actionElement.dataset.courseId).catch(() => {
      showToast("删除失败", "课程暂时无法删除，请稍后重试。");
    });
    return;
  }

  if (action === "save-course") {
    const form = document.getElementById("course-form");
    if (!form) return;
    void addManualCourse(new FormData(form))
      .then(() => {
        closeModal();
        showToast("课程已添加", "个人课表已经更新。");
      })
      .catch((error) => {
        showToast("添加失败", error.message || "课程未能添加。");
      });
    return;
  }

  if (action === "toggle-schedule-auto") {
    void toggleScheduleAutoUpdate().catch(() => {
      showToast("设置失败", "自动更新设置暂时无法保存。");
    });
    return;
  }

  if (action === "process-schedule-import") {
    const input = document.getElementById("schedule-import-input");
    processScheduleImport(input?.value || "");
    const message = document.getElementById("schedule-import-message");
    const output = document.getElementById("schedule-updater-output");
    if (message) message.textContent = ui.scheduleImportMessage;
    if (output) output.value = ui.scheduleImportBookmarklet;
    return;
  }

  if (action === "copy-schedule-updater") {
    const code = ui.scheduleImportBookmarklet || buildAhuImportBookmarklet();
    ui.scheduleImportBookmarklet = code;
    const output = document.getElementById("schedule-updater-output");
    if (output) output.value = code;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(() => showToast("更新代码已复制", "在教务课表页面执行一次即可更新。"))
        .catch(() => showToast("复制失败", "请手动复制下方更新代码。"));
    } else {
      showToast("请手动复制", "浏览器不允许自动复制更新代码。");
    }
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

async function handleSubmit(event) {
  const form = event.target;

  if (form.id === "auth-form") {
    event.preventDefault();
    const data = new FormData(form);
    const username = normalizeUsername(data.get("username"));
    const password = String(data.get("password") || "");
    const confirmPassword = String(data.get("confirmPassword") || "");
    const role = normalizeRole(data.get("role") || authState.role);
    const identityNote = String(data.get("identityNote") || "").trim().slice(0, 60);
    const classCode = normalizeClassCode(data.get("classCode") || authState.classCode);
    authState.username = username;
    authState.role = role;
    authState.identityNote = identityNote;
    authState.classCode = classCode;
    authState.error = "";
    authState.busy = true;
    render();

    const action =
      authState.mode === "register"
        ? registerAccount(
            username,
            password,
            confirmPassword,
            role,
            identityNote,
            classCode
          )
        : loginAccount(username, password);

    action
      .catch((error) => {
        authState.error = describeAuthError(error);
        authState.busy = false;
        render();
        requestAnimationFrame(() => {
          const input =
            authState.mode === "register"
              ? document.getElementById("auth-confirm")
              : document.getElementById("auth-password");
          input?.focus();
        });
      });
    return;
  }

  if (form.id === "deadline-form") {
    event.preventDefault();
    if (!canEditSchedule()) {
      showToast("没有编辑权限", "只有班长、副班长、辅导员、教师或管理员可以编辑日程。");
      return;
    }
    const data = new FormData(form);
    try {
      await ensurePublishQuota("deadline");
    } catch (error) {
      if (error?.quotaLimit) {
        showToast("今日发布次数已用完", error.message);
        return;
      }
      // 额度读不到（离线/网络故障）时不拦截，内容进入离线待同步队列。
      setSyncStatus("offline");
      scheduleSharedSync();
    }
    const item = {
      id: uid("deadline"),
      title: String(data.get("title")).trim(),
      category: String(data.get("category")),
      due: new Date(`${data.get("due")}T20:00:00`).toISOString(),
      priority: String(data.get("priority")),
      expiresAt: new Date(
        Date.now() + Number(data.get("retention") || 48) * 60 * 60 * 1000
      ).toISOString(),
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
    try {
      await ensurePublishQuota("post");
    } catch (error) {
      if (error?.quotaLimit) {
        showToast("今日发布次数已用完", error.message);
        return;
      }
      // 额度读不到（离线/网络故障）时不拦截，内容进入离线待同步队列。
      setSyncStatus("offline");
      scheduleSharedSync();
    }
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
    if (!canPublishTask()) {
      showToast("没有发布权限", "任务事项只能由班委、教师、辅导员或管理员发布。");
      return;
    }
    const data = new FormData(form);
    try {
      await ensurePublishQuota("team");
    } catch (error) {
      if (error?.quotaLimit) {
        showToast("今日发布次数已用完", error.message);
        return;
      }
      // 额度读不到（离线/网络故障）时不拦截，内容进入离线待同步队列。
      setSyncStatus("offline");
      scheduleSharedSync();
    }
    const item = {
      id: uid("team"),
      type: String(data.get("type")),
      title: String(data.get("title")).trim(),
      description: String(data.get("description")).trim(),
      date: new Date(String(data.get("date"))).toISOString(),
      place: String(data.get("place")).trim(),
      members: 1,
      capacity: Number(data.get("capacity")),
      expiresAt: new Date(
        Date.now() + Number(data.get("retention") || 48) * 60 * 60 * 1000
      ).toISOString(),
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
    try {
      await ensurePublishQuota("suggestion");
    } catch (error) {
      if (error?.quotaLimit) {
        showToast("今日发布次数已用完", error.message);
        return;
      }
      // 额度读不到（离线/网络故障）时不拦截，内容进入离线待同步队列。
      setSyncStatus("offline");
      scheduleSharedSync();
    }
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

  if (form.id === "class-form") {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await createRemoteClass({
        code: data.get("code"),
        name: data.get("name"),
        school: data.get("school"),
        major: data.get("major")
      });
      closeModal();
      render();
    } catch (error) {
      showToast("创建失败", error.message || "班级未能创建。");
    }
    return;
  }

  if (form.id === "course-form") {
    event.preventDefault();
    try {
      await addManualCourse(new FormData(form));
      closeModal();
      showToast("课程已添加", "个人课表已经更新。");
    } catch (error) {
      showToast("添加失败", error.message || "课程未能添加。");
    }
    return;
  }

  if (form.id === "profile-form") {
    event.preventDefault();
    const data = new FormData(form);
    const requestedRole = normalizeRole(data.get("role"));
    const role = isCurrentAdmin()
      ? "admin"
      : requestedRole === "student"
        ? "student"
        : "student";
    const pendingRole =
      isCurrentAdmin() || requestedRole === "student" ? "" : requestedRole;
    const identityStatus = isCurrentAdmin()
      ? "approved"
      : requestedRole === "student"
        ? "student"
        : "pending";
    const identityNote = String(data.get("identityNote") || "").trim().slice(0, 60);
    state.candidate = {
      name: authState.session?.username || String(data.get("name")).trim(),
      slogan: String(data.get("slogan")).trim(),
      intro: String(data.get("intro")).trim(),
      letter: String(data.get("letter")).trim(),
      promises: [0, 1, 2].map((index) => ({
        title: String(data.get(`promiseTitle${index}`)).trim(),
        text: String(data.get(`promiseText${index}`)).trim()
      }))
    };
    saveState();
    authState.session.role = role;
    authState.session.pendingRole = pendingRole;
    authState.session.identityNote = identityNote;
    authState.session.identityStatus = identityStatus;
    saveAuthSession(authState.session);
    const accounts = getLocalAccounts();
    const account = accounts.find(
      (item) => item.usernameKey === localUsernameKey(authState.session.username)
    );
    if (account) {
      account.role = role;
      account.pendingRole = pendingRole;
      account.identityNote = identityNote;
      account.identityStatus = identityStatus;
      account.updatedAt = new Date().toISOString();
      saveLocalAccounts(accounts);
      void writeRemoteAccount(account)
        .then(() => {
          syncState.accountChecked = true;
          void loadMemberDirectory(true);
          showToast(
            pendingRole ? "身份申请已提交" : "身份资料已同步",
            pendingRole
              ? `你申请的“${getRoleMeta(pendingRole).label}”需要管理员审核。`
              : "成员身份目录已经更新。"
          );
        })
        .catch(() => {
          setSyncStatus("offline");
          scheduleSharedSync();
          showToast("身份已保存在本机", "网络恢复后会自动同步到成员目录。");
        });
    }
    closeModal();
    render();
    showToast("账号资料已更新", "首页、竞选页和身份标签已经同步。");
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

  if (target.id === "member-search") {
    ui.memberQuery = target.value;
    updateMemberResults();
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
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && authState.session) {
      void syncSharedRecords();
    }
  });
  window.setInterval(() => {
    if (authState.session && document.visibilityState === "visible") {
      void syncSharedRecords();
      if (ui.page === "members") {
        void loadMemberDirectory(true);
      }
      if (ui.page === "history") {
        void loadHistory(true);
      }
      if (ui.page === "classes") {
        void loadClassDirectory(true);
      }
    }
  }, 15_000);

  render();
  restoreAuthSession()
    .then((session) => {
      if (session) {
        void activateAccount(session);
      } else {
        authState.ready = true;
        render();
      }
    })
    .catch(() => {
      authState.ready = true;
      authState.session = null;
      render();
    });
}

initialize();
