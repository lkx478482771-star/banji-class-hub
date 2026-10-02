const STORAGE_KEY = "banji-state-v1";
const FILE_DB_NAME = "banji-shared-files";
const FILE_STORE_NAME = "files";
const SHARED_CACHE_KEY = "banji-shared-cache-v1";
const PENDING_SHARED_KEY = "banji-shared-pending-v1";
const VISITOR_KEY = "banji-visitor-v1";
const AUTH_SESSION_KEY = "banji-auth-session-v1";
const LOCAL_ACCOUNTS_KEY = "banji-local-accounts-v1";
const CLASSES_CACHE_KEY = "banji-classes-cache-v1";
const DEFAULT_CLASS_ID = "class-default";
const DEFAULT_CLASS_CODE = "BANJI-2026";
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
const syncState = {
  inFlight: false,
  retryTimer: null,
  available: null,
  accountChecked: false,
  localImported: false,
  classesLoaded: false,
  classesInFlight: false
};

const PAGE_INFO = {
  today: { title: "今日班级", eyebrow: "班级服务台" },
  "mutual-aid": { title: "互助广场", eyebrow: "让问题更快被看见" },
  teams: { title: "任务搭子", eyebrow: "找同伴，也找行动力" },
  resources: { title: "资源共享", eyebrow: "让好资料在班级里流动" },
  profile: { title: "个人中心", eyebrow: "我的身份与发布记录" },
  history: { title: "历史记录", eyebrow: "已经过期但可以继续查看" },
  members: { title: "成员身份", eyebrow: "让每个人知道自己该找谁" },
  classes: { title: "班级管理", eyebrow: "按班级隔离成员、内容与权限" },
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

const CLASS_MANAGER_ROLES = [
  "monitor",
  "vice_monitor",
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
  directoryMembers: [],
  membersLoading: false,
  membersLoaded: false,
  classes: [],
  classesLoading: false,
  classesLoaded: false,
  dailyUsage: null,
  dailyUsageLoading: false,
  history: [],
  historyLoading: false,
  historyLoaded: false,
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
    classId: DEFAULT_CLASS_ID,
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
    const legacyUserKey =
      authState.session?.user?.id && getCurrentClassId() === DEFAULT_CLASS_ID
        ? `${STORAGE_KEY}:${authState.session.user.id}`
        : "";
    const saved = JSON.parse(
      localStorage.getItem(currentStorageKey) ||
        (legacyUserKey ? localStorage.getItem(legacyUserKey) : "") ||
        "null"
    );
    if (!saved) {
      return defaults;
    }

    return {
      ...defaults,
      ...saved,
      classId: getCurrentClassId(),
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

let currentStorageKey = STORAGE_KEY;
let state = loadState();
ui.classes = getCachedClasses();
ui.classesLoaded = ui.classes.length > 0;

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

function normalizeClassCode(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

function validateClassCode(value) {
  const code = normalizeClassCode(value);
  if (code.length < 4 || code.length > 24) {
    return "班级邀请码需要 4 到 24 个字符。";
  }
  if (!/^[\p{L}\p{N}_-]+$/u.test(code)) {
    return "班级邀请码只能包含文字、数字、下划线或短横线。";
  }
  return "";
}

function getAccountMemberships(account) {
  return Array.isArray(account?.classMemberships)
    ? account.classMemberships
    : Array.isArray(account?.memberships)
      ? account.memberships
      : [];
}

function getCurrentClassId(account = authState.session) {
  return (
    String(account?.currentClassId || "").trim() ||
    getAccountMemberships(account)[0]?.classId ||
    DEFAULT_CLASS_ID
  );
}

function getMembershipForClass(account, classId) {
  const targetClassId = String(classId || "").trim();
  if (!targetClassId) return null;
  return (
    getAccountMemberships(account).find(
      (membership) =>
        membership?.classId === targetClassId &&
        membership.status !== "removed" &&
        membership.status !== "disabled"
    ) || null
  );
}

function getActiveMembershipForClass(account, classId) {
  const membership = getMembershipForClass(account, classId);
  return membership?.status === "active" ? membership : null;
}

function getCurrentMembership(account = authState.session) {
  return getMembershipForClass(account, getCurrentClassId(account));
}

function isAdminUsername(username) {
  const key = localUsernameKey(username);
  return (sharedConfig.adminUsernames || []).some(
    (adminName) => localUsernameKey(adminName) === key
  );
}

function resolveAccountRole(account) {
  if (isAdminUsername(account?.username)) return "admin";
  const membership = getCurrentMembership(account);
  return normalizeRole(membership?.role || account?.role);
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

function getCurrentClass() {
  const classId = getCurrentClassId();
  return (
    ui.classes.find((classItem) => classItem.id === classId) || {
      id: classId,
      name: authState.session?.className || "默认班级",
      code: authState.session?.classCode || "",
      active: true
    }
  );
}

function isClassManagerFor(classId) {
  if (isCurrentAdmin()) return true;
  const membership = getMembershipForClass(authState.session, classId);
  return (
    membership?.status === "active" &&
    CLASS_MANAGER_ROLES.includes(normalizeRole(membership.role))
  );
}

function canManageClass(classId = getCurrentClassId()) {
  return Boolean(classId) && isClassManagerFor(classId);
}

function hasRolePermission(roles) {
  if (isCurrentAdmin()) return true;
  const membership = getCurrentMembership();
  return (
    membership?.status === "active" &&
    roles.includes(normalizeRole(membership.role))
  );
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

function normalizeNickname(value) {
  return String(value || "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "");
}

function validateNickname(value) {
  const nickname = normalizeNickname(value);
  if (!/^[\u3007\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]{2,8}$/u.test(nickname)) {
    return "昵称只能使用 2 到 8 个汉字。";
  }
  return "";
}

function getAccountNickname(account) {
  return (
    normalizeNickname(account?.nickname) ||
    normalizeUsername(account?.username) ||
    "班级成员"
  );
}

function getCurrentNickname() {
  return getAccountNickname(authState.session) || "班级成员";
}

function getNicknameChangeInfo(account = authState.session) {
  const lastChangedDate = String(account?.nicknameUpdatedDate || "").trim();
  const today = localDateKey();
  if (!lastChangedDate || lastChangedDate !== today) {
    return { allowed: true, nextChangeAt: "", message: "" };
  }
  const nextChange = new Date();
  nextChange.setHours(24, 0, 0, 0);
  return {
    allowed: false,
    nextChangeAt: nextChange.toISOString(),
    message: `今天已经修改过昵称，请在 ${formatShortDate(
      nextChange.toISOString()
    )} 后再试。`
  };
}

function applyLatestNickname(account, localAccount, remoteAccount) {
  const localChangedAt = Date.parse(localAccount?.nicknameUpdatedAt || "");
  const remoteChangedAt = Date.parse(remoteAccount?.nicknameUpdatedAt || "");
  if (
    localAccount?.nickname &&
    (!remoteAccount?.nickname || localChangedAt > remoteChangedAt)
  ) {
    account.nickname = normalizeNickname(localAccount.nickname);
    account.nicknameUpdatedAt = localAccount.nicknameUpdatedAt || "";
    account.nicknameUpdatedDate = localAccount.nicknameUpdatedDate || "";
  }
  account.nickname = getAccountNickname(account);
  account.nicknameUpdatedAt = String(account.nicknameUpdatedAt || "");
  account.nicknameUpdatedDate = String(account.nicknameUpdatedDate || "");
  return account;
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

async function deriveLocalPassword(password, saltHex, algorithm) {
  if (algorithm === "pbkdf2" && crypto.subtle?.importKey) {
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
        iterations: 120000,
        hash: "SHA-256"
      },
      key,
      256
    );
    return bytesToHex(new Uint8Array(bits));
  }
  return fallbackHash(`${saltHex}:${password}`);
}

function ensureAccountMemberships(account, classId = "") {
  if (!account) return [];
  const memberships = getAccountMemberships(account).slice();
  if (!memberships.length) {
    memberships.push({
      classId: classId || account.currentClassId || DEFAULT_CLASS_ID,
      role: isAdminUsername(account.username) ? "admin" : normalizeRole(account.role),
      pendingRole: account.pendingRole ? normalizeRole(account.pendingRole) : "",
      identityNote: String(account.identityNote || "").trim(),
      identityStatus: account.identityStatus || "student",
      status: "active",
      joinedAt: account.createdAt || new Date().toISOString()
    });
  }
  account.classMemberships = memberships;
  account.memberships = memberships;
  if (!account.currentClassId) {
    account.currentClassId = memberships[0]?.classId || DEFAULT_CLASS_ID;
  }
  return memberships;
}

function setAccountMembership(account, classId, changes = {}) {
  const memberships = ensureAccountMemberships(account, classId).slice();
  const existingIndex = memberships.findIndex(
    (membership) => membership?.classId === classId
  );
  const existing = existingIndex >= 0 ? memberships[existingIndex] : {};
  const next = {
    classId,
    role: "student",
    pendingRole: "",
    identityNote: "",
    identityStatus: "student",
    status: "active",
    joinedAt: new Date().toISOString(),
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString()
  };
  if (existingIndex >= 0) {
    memberships[existingIndex] = next;
  } else {
    memberships.push(next);
  }
  account.classMemberships = memberships;
  account.memberships = memberships;
  account.currentClassId = classId;
  account.role = next.role;
  account.pendingRole = next.pendingRole;
  account.identityNote = next.identityNote;
  account.identityStatus = next.identityStatus;
  account.updatedAt = new Date().toISOString();
  return next;
}

function createLocalSession(account) {
  const memberships = ensureAccountMemberships(account);
  const currentClassId =
    account.currentClassId || memberships[0]?.classId || DEFAULT_CLASS_ID;
  const membership = memberships.find((item) => item.classId === currentClassId);
  const classInfo = ui.classes.find((item) => item.id === currentClassId);
  return {
    access_token: "",
    refresh_token: "",
    expires_at: 4102444800,
    user: {
      id: account.id,
      email: ""
    },
    username: account.username,
    nickname: getAccountNickname(account),
    role: resolveAccountRole({ ...account, currentClassId }),
    pendingRole: membership?.pendingRole ? normalizeRole(membership.pendingRole) : "",
    identityNote: String(membership?.identityNote || ""),
    identityStatus: membership?.identityStatus || "student",
    currentClassId,
    className: classInfo?.name || account.className || "默认班级",
    classCode: classInfo?.code || account.classCode || "",
    classMemberships: memberships,
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
  let nextSession = session;
  try {
    nextSession = await prepareAccountForSession(session);
  } catch (error) {
    nextSession = session;
  }
  authState.session = nextSession;
  authState.error = "";
  authState.busy = false;
  authState.ready = true;
  syncState.accountChecked = false;
  syncState.localImported = false;
  ui.membersLoaded = false;
  ui.members = [];
  ui.directoryMembers = [];
  ui.dailyUsage = null;
  ui.historyLoaded = false;
  ui.history = [];
  saveAuthSession(nextSession);
  currentStorageKey = `${STORAGE_KEY}:${nextSession.user.id}:${getCurrentClassId(
    nextSession
  )}`;
  state = loadState();
  applySharedRecords(getCachedSharedRecords());
  state.candidate.name = getAccountNickname(nextSession) || state.candidate.name;
  saveState();
  ui.page = "today";
  history.replaceState(null, "", "#today");
  render();
  void loadClasses();
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
  const classCodeError = validateClassCode(classCode);
  if (classCodeError) throw new Error(classCodeError);
  if (password.length < 6 || password.length > 72) {
    throw new Error("密码需要 6 到 72 个字符。");
  }
  if (password !== confirmPassword) {
    throw new Error("两次输入的密码不一致。");
  }

  const cleanName = normalizeUsername(username);
  const usernameKey = localUsernameKey(cleanName);
  const targetClass = await findClassByCode(classCode);
  if (!targetClass) {
    throw new Error("没有找到这个班级邀请码，请向班委或辅导员确认。");
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
  const algorithm = crypto.subtle?.importKey ? "pbkdf2" : "fallback";
  const saltHex = bytesToHex(salt);
  const passwordHash = await deriveLocalPassword(password, saltHex, algorithm);
  const createdAt = new Date().toISOString();
  const account = {
    id: crypto.randomUUID?.() || `local-${Date.now().toString(36)}`,
    username: cleanName,
    usernameKey,
    salt: saltHex,
    passwordHash,
    algorithm,
    nickname: cleanName,
    nicknameUpdatedAt: "",
    nicknameUpdatedDate: "",
    role: normalizedRole,
    pendingRole,
    identityNote: cleanIdentityNote,
    identityStatus,
    currentClassId: targetClass.id,
    classMemberships: [
      {
        classId: targetClass.id,
        role: normalizedRole,
        pendingRole,
        identityNote: cleanIdentityNote,
        identityStatus,
        status: "active",
        joinedAt: createdAt
      }
    ],
    createdAt
  };
  account.memberships = account.classMemberships;
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
    pendingRole ? "已加入班级，身份待审核" : "账号已创建并加入班级",
    pendingRole
      ? `已加入“${targetClass.name}”，你申请的“${getRoleMeta(
          pendingRole
        ).label}”需要班级管理员确认。`
      : `欢迎你，${cleanName}。当前班级：${targetClass.name}。`
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
  const passwordHash = await deriveLocalPassword(password, account.salt, account.algorithm);
  if (passwordHash !== account.passwordHash) {
    throw new Error("账号名称或密码不正确。");
  }
  const localAccounts = getLocalAccounts().filter(
    (item) => item.usernameKey !== usernameKey
  );
  localAccounts.push({ ...account, passwordHash, salt: account.salt, algorithm: account.algorithm });
  saveLocalAccounts(localAccounts);
  await activateAccount(createLocalSession(account));
  showToast("登录成功", `欢迎回来，${getAccountNickname(account)}。`);
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
  ui.directoryMembers = [];
  ui.dailyUsage = null;
  ui.historyLoaded = false;
  ui.history = [];
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
          <p>${
            isRegister
              ? "注册时需要班级邀请码；加入后只能看到本班成员与内容。"
              : "输入账号名称和密码即可继续。"
          }</p>
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
                    <label for="auth-class-code">班级邀请码</label>
                    <div class="auth-input-wrap">
                      ${icon("key-round")}
                      <input
                        id="auth-class-code"
                        name="classCode"
                        maxlength="24"
                        autocomplete="off"
                        value="${escapeHTML(authState.classCode || DEFAULT_CLASS_CODE)}"
                        placeholder="例如：BANJI-2026"
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
            <span>登录状态保存在这台设备中；账号、班级与权限均由共享数据库同步。首次使用可向班委获取邀请码。</span>
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
  const candidateName = getCurrentNickname() || state.candidate.name || "候选人";
  const roleMeta = getRoleMeta(authState.session?.role);
  const roleLabel = roleMeta.label;
  const initials = getInitials(candidateName);
  const readiness = getReadiness();
  const unreadCount = state.notifications.filter((item) => !item.read).length;
  const currentClass = getCurrentClass();
  const classManagementNav = document.getElementById("class-management-nav");

  document.getElementById("top-candidate-name").textContent = candidateName;
  document.getElementById("top-role-label").textContent = authState.session?.pendingRole
    ? `${roleLabel} · 待审核`
    : roleLabel;
  document.getElementById("readiness-label").textContent =
    roleMeta.group === "faculty" ? "身份资料完整度" : "竞选主页";
  document.getElementById("campaign-progress-card").hidden = !canViewCampaign();
  document.getElementById("top-avatar").textContent = initials;
  document.getElementById("nav-post-count").textContent = String(openPosts);
  document.getElementById("candidate-readiness").textContent = `${readiness}%`;
  document.getElementById("candidate-progress-bar").style.width = `${readiness}%`;
  document.getElementById("notification-dot").classList.toggle("is-read", unreadCount === 0);
  document.getElementById("current-class-name").textContent = currentClass.name;
  document.getElementById("current-class-code").textContent =
    currentClass.code || "未设置邀请码";
  if (classManagementNav) {
    classManagementNav.hidden = !canManageClass(currentClass.id);
  }
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
  if (!authState.ready || !authState.session) {
    document.body.classList.add("is-auth-required");
    document.getElementById("page-title").textContent = "登录班集";
    document.getElementById("page-eyebrow").textContent = "本机账号识别";
    authRoot.innerHTML = renderAuthScreen();
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
    "mutual-aid": renderMutualAid,
    teams: renderTeams,
    resources: renderResources,
    profile: renderPersonalCenter,
    history: renderHistory,
    members: renderMembers,
    classes: renderClassManagement,
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
  if (page === "candidate" && !canViewCampaign()) {
    showToast("没有访问权限", "竞选栏目仅对作品作者账号开放。");
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
          <span class="hero-badge">${icon(canViewCampaign() ? "flag" : "school")} ${escapeHTML(
            canViewCampaign()
              ? `${getCurrentClass().name} · 竞选作品`
              : `${getCurrentClass().name} · ${roleMeta.label}服务台`
          )}</span>
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
                    ? "管理员拥有全站权限，可管理所有班级、审核身份、发布任务、编辑日程和清理历史记录。"
                    : `这里集中展示你在“${getCurrentClass().name}”内可使用的管理入口。`
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
                  canManageClass()
                    ? `
                      <button class="secondary-button" type="button" data-action="navigate" data-page="classes">
                        ${icon("building-2")}
                        班级管理
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
          data-id="${item.id}"
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
                data-id="${item.id}"
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
                  data-id="${item.id}"
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
            data-id="${item.id}"
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
                  data-id="${item.id}"
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
            data-id="${item.id}"
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

function canManageItem(item) {
  return (
    isCurrentAdmin() ||
    canManageClass(item?.classId || getCurrentClassId()) ||
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
    showToast("没有删除权限", "只能删除本人发布的内容；本班管理员和站点管理员可以维护全部内容。");
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

function renderPersonalCenter() {
  if (!ui.dailyUsage) {
    window.setTimeout(() => void loadDailyUsage(), 0);
  }

  const userId = authState.session?.user.id;
  const nickname = getCurrentNickname();
  const loginName = authState.session?.username || nickname;
  const roleMeta = getRoleMeta(authState.session?.role);
  const ownPosts = state.posts.filter(
    (item) => item.authorId === userId || (!item.shared && item.author === nickname)
  );
  const ownTeams = state.teams.filter(
    (item) => item.authorId === userId || (!item.shared && item.owner === nickname)
  );
  const ownSuggestions = state.suggestions.filter((item) => item.authorId === userId);
  const ownDeadlines = state.deadlines.filter((item) => item.authorId === userId);
  const ownResources = state.resources.filter((item) => item.uploader === nickname);
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
          <span class="personal-avatar">${escapeHTML(getInitials(nickname))}</span>
          <div>
            <div class="member-name-row">
              <h2>${escapeHTML(nickname)}</h2>
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
                ? "班级身份需要本班管理员审核，通过前保持普通同学权限"
                : `登录账号：${escapeHTML(loginName)} · 昵称每天最多修改一次`
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
                            data-record-type="${record.recordType}"
                            data-id="${record.id}"
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
                ${
                  isCurrentAdmin()
                    ? "站点管理员权限"
                    : canManageClass()
                      ? "本班管理权限"
                      : "当前身份"
                }
              </span>
              <h3 style="margin-top: 13px">${escapeHTML(roleMeta.label)}</h3>
              <p style="margin-bottom: 0; color: var(--ink-soft); font-size: 12px">
                ${
                  isCurrentAdmin()
                    ? "你可以管理所有班级、审核身份并维护全部内容。"
                    : canManageClass()
                      ? `你可以管理“${getCurrentClass().name}”的成员身份与班级内容。`
                      : "你可以删除自己发布的内容，本班管理员可以维护全部无用消息。"
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
  if (!canManageClass()) {
    showToast("没有删除权限", "只有本班管理员或站点管理员可以删除历史记录。");
    return;
  }
  await mantleRequest(
    mantleEntryUrl(`history/${encodeURIComponent(recordKey)}`),
    { method: "DELETE" }
  );
  await loadHistory(true);
  showToast("历史记录已删除", "本班管理员已移除这条归档内容。");
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
                          canManageClass()
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

function getMemberDisplayName(member) {
  return (
    normalizeNickname(member?.nickname) ||
    normalizeUsername(member?.username) ||
    "班级成员"
  );
}

function publicMembersFromAccount(account) {
  const accountCopy = { ...account };
  const memberships = ensureAccountMemberships(accountCopy);
  return memberships
    .filter(
      (membership) =>
        membership?.classId &&
        membership.status !== "removed" &&
        membership.status !== "disabled"
    )
    .map((membership) => {
      const role = isAdminUsername(accountCopy.username)
        ? "admin"
        : normalizeRole(membership.role);
      return {
        id: accountCopy?.id || "",
        accountId: accountCopy?.id || "",
        username: normalizeUsername(accountCopy?.username) || "班级成员",
        nickname: getAccountNickname(accountCopy),
        usernameKey:
          accountCopy?.usernameKey || localUsernameKey(accountCopy?.username),
        classId: membership.classId,
        role,
        roleLabel: getRoleMeta(role).label,
        pendingRole: membership?.pendingRole
          ? normalizeRole(membership.pendingRole)
          : "",
        identityNote: String(membership?.identityNote || "").trim(),
        joinedAt: membership?.joinedAt || accountCopy?.createdAt || "",
        createdAt: accountCopy?.createdAt || "",
        identityStatus: membership?.identityStatus || "student",
        membershipStatus: membership?.status || "active"
      };
    });
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
      const remoteAccounts = await Promise.all(
        accountPaths.map((path) => mantleRequest(mantleEntryUrl(path)))
      );
      ui.directoryMembers = remoteAccounts
        .filter((account) => account?.username)
        .flatMap(publicMembersFromAccount);
    } else {
      ui.directoryMembers = getLocalAccounts().flatMap(publicMembersFromAccount);
    }
    ui.members = ui.directoryMembers.filter(
      (member) => member.classId === getCurrentClassId()
    );
  } catch (error) {
    ui.directoryMembers = getLocalAccounts().flatMap(publicMembersFromAccount);
    ui.members = ui.directoryMembers.filter(
      (member) => member.classId === getCurrentClassId()
    );
    showToast("成员名单同步较慢", "当前先显示本机已经识别到的成员。");
  } finally {
    ui.membersLoading = false;
    ui.membersLoaded = true;
    if (ui.page === "members" || ui.page === "classes") render();
  }
}

function renderMembers() {
  if (!ui.membersLoading && !ui.membersLoaded) {
    window.setTimeout(() => void loadMemberDirectory(), 0);
  }

  const currentClass = getCurrentClass();
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
          <h2>${escapeHTML(currentClass.name)} · 成员与职责目录</h2>
          <p>这里只展示当前班级成员。班委、教师与辅导员的权限也仅在本班生效。</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="open-modal" data-modal="join-class">
            ${icon("door-open")}
            加入或切换班级
          </button>
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
      const haystack = `${getMemberDisplayName(member)} ${member.username} ${member.roleLabel} ${pendingLabel} ${member.identityNote}`.toLowerCase();
      return matchesFilter && (!query || haystack.includes(query));
    })
    .sort((a, b) => {
      const order = { faculty: 0, committee: 1, student: 2 };
      return order[getRoleMeta(a.role).group] - order[getRoleMeta(b.role).group] ||
        getMemberDisplayName(a).localeCompare(getMemberDisplayName(b), "zh-CN");
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
            <span class="member-avatar ${meta.color}">${escapeHTML(getInitials(getMemberDisplayName(member)))}</span>
            <div class="member-copy">
              <div class="member-name-row">
                <strong>${escapeHTML(getMemberDisplayName(member))}</strong>
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
              canManageClass(member.classId) && pendingMeta
                ? `
                  <button
                    class="primary-button"
                    type="button"
                    data-action="approve-identity"
                    data-username-key="${escapeHTML(member.usernameKey)}"
                    data-class-id="${escapeHTML(member.classId)}"
                  >
                    ${icon("check")}
                    通过
                  </button>
                  <button
                    class="secondary-button"
                    type="button"
                    data-action="reject-identity"
                    data-username-key="${escapeHTML(member.usernameKey)}"
                    data-class-id="${escapeHTML(member.classId)}"
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

async function reviewMemberIdentity(usernameKey, approved, classId = getCurrentClassId()) {
  if (!canManageClass(classId)) {
    showToast("没有审核权限", "只有本班班委、辅导员或站点管理员可以审核身份。");
    return;
  }
  const account = await readRemoteAccount(usernameKey);
  if (!account) throw new Error("Account not found");
  ensureAccountMemberships(account, classId);
  const membership = getMembershipForClass(account, classId);
  if (!membership?.pendingRole) {
    showToast("没有待审核申请", "该成员当前没有新的身份申请。");
    return;
  }

  if (approved) {
    setAccountMembership(account, classId, {
      role: normalizeRole(membership.pendingRole),
      pendingRole: "",
      identityStatus: "approved",
      approvedAt: new Date().toISOString(),
      approvedBy: authState.session.user.id
    });
  } else {
    setAccountMembership(account, classId, {
      role: "student",
      pendingRole: "",
      identityStatus: "rejected",
      rejectedAt: new Date().toISOString()
    });
  }
  account.updatedAt = new Date().toISOString();
  await commitAccount(account);

  if (authState.session.username === account.username) {
    authState.session.classMemberships = getAccountMemberships(account);
    const currentMembership = getMembershipForClass(account, classId);
    authState.session.role = resolveAccountRole({
      ...account,
      currentClassId: classId
    });
    authState.session.pendingRole = currentMembership?.pendingRole || "";
    authState.session.identityStatus = currentMembership?.identityStatus || "student";
    saveAuthSession(authState.session);
  }
  syncState.accountChecked = false;
  await loadMemberDirectory(true);
  render();
  showToast(
    approved ? "身份申请已通过" : "身份申请已驳回",
    `${getAccountNickname(account)} · ${
      approved ? getRoleMeta(getMembershipForClass(account, classId)?.role).label : "普通同学"
    }`
  );
}

function updateMemberResults() {
  const container = document.getElementById("member-results");
  if (!container) return;
  container.innerHTML = renderMemberCards();
  refreshIcons(container);
}

async function updateClassMemberRole(usernameKey, classId, role) {
  if (!canManageClass(classId)) {
    showToast("没有管理权限", "你只能管理自己所在班级的成员身份。");
    return;
  }
  const nextRole = normalizeRole(role);
  const account = await readRemoteAccount(usernameKey);
  if (!account) throw new Error("Account not found");
  setAccountMembership(account, classId, {
    role: nextRole,
    pendingRole: "",
    identityStatus: nextRole === "student" ? "student" : "approved",
    approvedAt: new Date().toISOString(),
    approvedBy: authState.session.user.id
  });
  await commitAccount(account);
  if (authState.session.username === account.username) {
    authState.session.classMemberships = getAccountMemberships(account);
    authState.session.role = resolveAccountRole({
      ...account,
      currentClassId: classId
    });
    authState.session.pendingRole = "";
    authState.session.identityStatus = nextRole === "student" ? "student" : "approved";
    saveAuthSession(authState.session);
  }
  syncState.accountChecked = false;
  await loadMemberDirectory(true);
  render();
  showToast("成员身份已更新", `${getAccountNickname(account)} · ${getRoleMeta(nextRole).label}`);
}

async function removeClassMember(usernameKey, classId) {
  if (!canManageClass(classId)) {
    showToast("没有管理权限", "你只能管理自己所在班级的成员。");
    return;
  }
  const account = await readRemoteAccount(usernameKey);
  if (!account) throw new Error("Account not found");
  if (localUsernameKey(account.username) === localUsernameKey(authState.session.username)) {
    showToast("不能移除自己", "请联系其他班级管理员或站点管理员处理。");
    return;
  }
  setAccountMembership(account, classId, { status: "removed" });
  await commitAccount(account);
  await loadMemberDirectory(true);
  render();
  showToast("成员已移出班级", getAccountNickname(account));
}

async function toggleClassActive(classId) {
  if (!isCurrentAdmin()) {
    showToast("没有管理权限", "只有站点管理员可以停用或恢复班级。");
    return;
  }
  const classItem = ui.classes.find((item) => item.id === classId);
  if (!classItem) return;
  const next = { ...classItem, active: classItem.active === false, updatedAt: new Date().toISOString() };
  await writeRemoteClass(next);
  render();
  showToast(next.active ? "班级已恢复" : "班级已停用", classItem.name);
}

function renderClassManagement() {
  if (!ui.classesLoaded) {
    window.setTimeout(() => void loadClasses(), 0);
  }
  if (!ui.membersLoaded) {
    window.setTimeout(() => void loadMemberDirectory(), 0);
  }

  const currentClass = getCurrentClass();
  if (!canManageClass(currentClass.id)) {
    return `
      <div class="page-stack">
        <header class="page-intro">
          <div>
            <p class="eyebrow">班级权限按成员身份自动生效</p>
            <h2>当前账号没有班级管理权限</h2>
            <p>普通同学可以查看本班成员和内容；班长、副班长、辅导员、班主任与站点管理员可以审核身份和维护成员。</p>
          </div>
          <button class="primary-button" type="button" data-action="open-modal" data-modal="join-class">
            ${icon("door-open")}
            切换班级
          </button>
        </header>
      </div>
    `;
  }

  const classMembers = ui.directoryMembers.filter(
    (member) => member.classId === currentClass.id
  );
  const pendingMembers = classMembers.filter((member) => member.pendingRole);
  const committeeCount = classMembers.filter(
    (member) => getRoleMeta(member.role).group === "committee"
  ).length;
  const facultyCount = classMembers.filter(
    (member) => getRoleMeta(member.role).group === "faculty"
  ).length;
  const roleOptions = Object.entries(ROLE_META).filter(
    ([role]) => role !== "admin"
  );

  const renderMemberRow = (member) => {
    const isSiteAdmin = member.role === "admin";
    const memberRoleOptions = isSiteAdmin
      ? [["admin", ROLE_META.admin], ...roleOptions]
      : roleOptions;
    return `
      <div class="class-member-row">
        <div class="class-member-person">
          <span class="member-avatar ${getRoleMeta(member.role).color}">${escapeHTML(
            getInitials(getMemberDisplayName(member))
          )}</span>
          <div>
            <strong>${escapeHTML(getMemberDisplayName(member))}</strong>
            <span>${escapeHTML(member.identityNote || "未填写职责说明")}</span>
          </div>
        </div>
        <select
          class="role-select"
          data-action="set-member-role"
          data-username-key="${escapeHTML(member.usernameKey)}"
          data-class-id="${escapeHTML(member.classId)}"
          aria-label="设置 ${escapeHTML(getMemberDisplayName(member))} 的班级身份"
          ${isSiteAdmin ? "disabled" : ""}
        >
          ${memberRoleOptions
            .map(
              ([role, meta]) => `
                <option value="${role}" ${member.role === role ? "selected" : ""}>
                  ${escapeHTML(meta.label)}
                </option>
              `
            )
            .join("")}
        </select>
        ${
          isSiteAdmin
            ? `<span class="badge red">${icon("shield-check")} 站点管理员</span>`
            : `
              <button
                class="small-icon-button"
                type="button"
                data-action="remove-class-member"
                data-username-key="${escapeHTML(member.usernameKey)}"
                data-class-id="${escapeHTML(member.classId)}"
                title="移出班级"
                aria-label="将 ${escapeHTML(getMemberDisplayName(member))} 移出班级"
              >
                ${icon("user-minus")}
              </button>
            `
        }
      </div>
    `;
  };

  return `
    <div class="page-stack">
      <header class="page-intro">
        <div>
          <p class="eyebrow">班级范围清晰，管理责任不越界</p>
          <h2>${escapeHTML(currentClass.name)} · 班级管理</h2>
          <p>本班班委与辅导员只能审核本班申请、调整本班成员身份；站点管理员可以管理全部班级。</p>
        </div>
        <div class="page-actions">
          <button class="secondary-button" type="button" data-action="open-modal" data-modal="join-class">
            ${icon("door-open")}
            加入或切换班级
          </button>
          ${
            isCurrentAdmin()
              ? `
                <button class="primary-button" type="button" data-action="open-modal" data-modal="create-class">
                  ${icon("plus")}
                  新建班级
                </button>
              `
              : ""
          }
        </div>
      </header>

      <section class="class-overview">
        <article class="panel class-overview-main">
          <div>
            <span class="badge ${currentClass.active === false ? "red" : "green"}">
              ${icon(currentClass.active === false ? "ban" : "circle-check")}
              ${currentClass.active === false ? "已停用" : "正常开放"}
            </span>
            <h3>${escapeHTML(currentClass.name)}</h3>
            <p>${escapeHTML(currentClass.description || "班级成员共享互助、资料、组队和班级日程。")}</p>
          </div>
          <div class="class-invite">
            <span>班级邀请码</span>
            <strong>${escapeHTML(currentClass.code || "未设置")}</strong>
            <button class="secondary-button" type="button" data-action="copy-class-code">
              ${icon("copy")}
              复制邀请码
            </button>
          </div>
        </article>
        <article class="metric">
          <span class="metric-icon green">${icon("users-round")}</span>
          <div><strong class="metric-value">${classMembers.length}</strong><span class="metric-label">本班成员</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon blue">${icon("landmark")}</span>
          <div><strong class="metric-value">${committeeCount}</strong><span class="metric-label">班委成员</span></div>
        </article>
        <article class="metric">
          <span class="metric-icon orange">${icon("briefcase-business")}</span>
          <div><strong class="metric-value">${facultyCount}</strong><span class="metric-label">教师与辅导员</span></div>
        </article>
      </section>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h3>待审核身份</h3>
            <p>通过后成员在本班获得对应管理或发布权限</p>
          </div>
          <span class="badge ${pendingMembers.length ? "yellow" : "green"}">${pendingMembers.length} 项待处理</span>
        </header>
        <div class="panel-body">
          ${
            pendingMembers.length
              ? `<div class="class-member-list">${pendingMembers
                  .map(
                    (member) => `
                      <div class="class-member-row">
                        <div class="class-member-person">
                          <span class="member-avatar yellow">${escapeHTML(
                            getInitials(getMemberDisplayName(member))
                          )}</span>
                          <div>
                            <strong>${escapeHTML(getMemberDisplayName(member))}</strong>
                            <span>申请：${escapeHTML(
                              getRoleMeta(member.pendingRole).label
                            )}</span>
                          </div>
                        </div>
                        <div class="row-actions">
                          <button class="primary-button" type="button" data-action="approve-identity" data-username-key="${escapeHTML(
                            member.usernameKey
                          )}" data-class-id="${escapeHTML(member.classId)}">
                            ${icon("check")}
                            通过
                          </button>
                          <button class="secondary-button" type="button" data-action="reject-identity" data-username-key="${escapeHTML(
                            member.usernameKey
                          )}" data-class-id="${escapeHTML(member.classId)}">
                            ${icon("x")}
                            驳回
                          </button>
                        </div>
                      </div>
                    `
                  )
                  .join("")}</div>`
              : renderEmpty("badge-check", "没有待审核申请", "成员提交新身份后会自动出现在这里。")
          }
        </div>
      </section>

      <section class="panel">
        <header class="panel-header">
          <div>
            <h3>本班成员与权限</h3>
            <p>身份修改只影响 ${escapeHTML(currentClass.name)}</p>
          </div>
          <span class="badge blue">${classMembers.length} 人</span>
        </header>
        <div class="panel-body">
          ${
            classMembers.length
              ? `<div class="class-member-list">${classMembers
                  .sort(
                    (a, b) =>
                      getRoleMeta(a.role).group.localeCompare(getRoleMeta(b.role).group) ||
                      a.username.localeCompare(b.username, "zh-CN")
                  )
                  .map(renderMemberRow)
                  .join("")}</div>`
              : renderEmpty("users-round", "本班暂时没有成员", "分享邀请码后，成员加入就会显示在这里。")
          }
        </div>
      </section>

      ${
        isCurrentAdmin()
          ? `
            <section>
              <header class="section-header" style="margin-bottom: 12px">
                <div>
                  <h2>全部班级</h2>
                  <p class="eyebrow">站点管理员可以进入任意班级并查看成员</p>
                </div>
              </header>
              <div class="class-card-grid">
                ${
                  ui.classesLoading && !ui.classes.length
                    ? renderEmpty("loader-circle", "正在读取班级", "共享班级列表加载后显示在这里。")
                    : ui.classes
                        .map((classItem) => {
                          const count = ui.directoryMembers.filter(
                            (member) => member.classId === classItem.id
                          ).length;
                          const isCurrent = classItem.id === currentClass.id;
                          return `
                            <article class="class-card ${isCurrent ? "is-current" : ""}">
                              <div class="card-top-row">
                                <span class="badge ${classItem.active === false ? "red" : "green"}">
                                  ${icon(classItem.active === false ? "ban" : "school")}
                                  ${classItem.active === false ? "已停用" : "开放中"}
                                </span>
                                ${isCurrent ? `<span class="badge blue">当前班级</span>` : ""}
                              </div>
                              <h3>${escapeHTML(classItem.name)}</h3>
                              <p>${escapeHTML(classItem.description || "暂无班级说明")}</p>
                              <div class="class-card-footer">
                                <span>${icon("key-round")} ${escapeHTML(classItem.code)}</span>
                                <span>${icon("users-round")} ${count} 人</span>
                              </div>
                              <div class="row-actions">
                                <button class="primary-button" type="button" data-action="switch-class" data-class-id="${escapeHTML(
                                  classItem.id
                                )}">
                                  ${icon("arrow-right-left")}
                                  进入班级
                                </button>
                                ${
                                  classItem.id !== DEFAULT_CLASS_ID
                                    ? `
                                      <button class="secondary-button" type="button" data-action="toggle-class-active" data-class-id="${escapeHTML(
                                        classItem.id
                                      )}">
                                        ${icon(classItem.active === false ? "rotate-ccw" : "ban")}
                                        ${classItem.active === false ? "恢复" : "停用"}
                                      </button>
                                    `
                                    : ""
                                }
                              </div>
                            </article>
                          `;
                        })
                        .join("")
                }
              </div>
            </section>
          `
          : ""
      }
    </div>
  `;
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
                data-id="${item.id}"
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
  const currentAccount =
    getLocalAccounts().find(
      (account) =>
        account.usernameKey === localUsernameKey(authState.session?.username)
    ) || authState.session;
  const currentNickname = getAccountNickname(currentAccount);
  const nicknameChange = getNicknameChangeInfo(currentAccount);
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
    "join-class": {
      title: "加入或切换班级",
      subtitle: "凭班级邀请码加入；账号可同时属于多个班级",
      wide: false,
      body: `
        <form id="join-class-form">
          <div class="modal-body">
            <div class="current-class-note">
              <span>${icon("school")}</span>
              <div>
                <strong>${escapeHTML(getCurrentClass().name)}</strong>
                <small>当前班级 · ${escapeHTML(getCurrentClass().code || "未设置邀请码")}</small>
              </div>
            </div>
            <div class="modal-field">
              <label for="join-class-code">班级邀请码</label>
              <input
                id="join-class-code"
                name="classCode"
                maxlength="24"
                autocomplete="off"
                placeholder="例如：BANJI-2026"
                required
              />
            </div>
            <div class="modal-field">
              <label for="join-class-role">加入身份</label>
              <select id="join-class-role" name="role">
                ${Object.entries(ROLE_GROUPS)
                  .map(
                    ([group, groupLabel]) => `
                      <optgroup label="${escapeHTML(groupLabel)}">
                        ${Object.entries(ROLE_META)
                          .filter(
                            ([role, meta]) => meta.group === group && role !== "admin"
                          )
                          .map(
                            ([role, meta]) => `
                              <option value="${role}" ${role === "student" ? "selected" : ""}>
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
              <label for="join-class-note">职务、课程或负责事项</label>
              <input
                id="join-class-note"
                name="identityNote"
                maxlength="60"
                placeholder="例如：负责班级学习与竞赛信息"
              />
            </div>
            <p class="form-hint">普通同学凭邀请码直接加入；申请班委、教师或辅导员身份后，需要本班管理员审核。</p>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("door-open")} 加入班级</button>
          </div>
        </form>
      `
    },
    "create-class": {
      title: "创建新班级",
      subtitle: "仅站点管理员可创建，创建后自动进入该班级",
      wide: false,
      body: `
        <form id="create-class-form">
          <div class="modal-body">
            <div class="modal-field">
              <label for="create-class-name">班级名称</label>
              <input
                id="create-class-name"
                name="name"
                maxlength="40"
                placeholder="例如：2026级软件工程1班"
                required
              />
            </div>
            <div class="modal-field">
              <label for="create-class-code">班级邀请码</label>
              <input
                id="create-class-code"
                name="code"
                maxlength="24"
                autocomplete="off"
                placeholder="例如：SE-2026-01"
                required
              />
            </div>
            <div class="modal-field">
              <label for="create-class-description">班级说明</label>
              <textarea
                id="create-class-description"
                name="description"
                maxlength="100"
                placeholder="例如：用于本班互助、任务与资源共享"
              ></textarea>
            </div>
            <p class="form-hint">邀请码在全部班级中必须唯一，建议同时包含学院、年级和班号。</p>
          </div>
          <div class="modal-footer">
            <button class="secondary-button" type="button" data-action="close-modal">取消</button>
            <button class="primary-button" type="submit">${icon("plus")} 创建班级</button>
          </div>
        </form>
      `
    },
    profile: {
      title: "编辑昵称与账号资料",
      subtitle: "昵称每天最多修改一次，班级身份按班级保存并需要审核",
      wide: true,
      body: `
        <form id="profile-form">
          <div class="modal-body">
            <div class="current-class-note">
              <span>${icon("school")}</span>
              <div>
                <strong>${escapeHTML(getCurrentClass().name)}</strong>
                <small>本次修改只影响当前班级的身份与职责</small>
              </div>
            </div>
            <div class="form-grid">
              <div class="modal-field">
                <label for="profile-name">登录账号</label>
                <input id="profile-name" name="username" maxlength="20" value="${escapeHTML(
                  authState.session?.username || ""
                )}" readonly />
              </div>
              <div class="modal-field">
                <label for="profile-nickname">昵称</label>
                <input
                  id="profile-nickname"
                  name="nickname"
                  maxlength="8"
                  value="${escapeHTML(currentNickname)}"
                  placeholder="请输入 2 到 8 个汉字"
                  aria-describedby="profile-nickname-hint"
                  ${nicknameChange.allowed ? "" : "readonly"}
                  required
                />
                <small class="form-hint" id="profile-nickname-hint">
                  ${escapeHTML(
                    nicknameChange.allowed
                      ? "昵称仅限 2 到 8 个汉字，每天最多修改一次。"
                      : nicknameChange.message
                  )}
                </small>
              </div>
            </div>
            <div class="modal-field">
              <label for="profile-slogan">竞选主张</label>
              <input id="profile-slogan" name="slogan" maxlength="60" value="${escapeHTML(
                state.candidate.slogan
              )}" required />
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
                                role !== "admin"
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

async function mantleRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    },
    cache: "no-store"
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error(`Shared storage request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

async function readRemoteAccount(usernameKey) {
  if (!hasSharedConfig()) {
    return (
      getLocalAccounts().find((account) => account.usernameKey === usernameKey) ||
      null
    );
  }
  const remoteAccount = await mantleRequest(
    mantleEntryUrl(`accounts/${encodeURIComponent(usernameKey)}`)
  );
  return (
    remoteAccount ||
    getLocalAccounts().find((account) => account.usernameKey === usernameKey) ||
    null
  );
}

async function writeRemoteAccount(account) {
  if (!hasSharedConfig()) return;
  await mantleRequest(mantleEntryUrl(`accounts/${encodeURIComponent(account.usernameKey)}`), {
    method: "POST",
    body: JSON.stringify(account)
  });
}

async function commitAccount(account) {
  const accounts = getLocalAccounts().filter(
    (item) => item.usernameKey !== account.usernameKey
  );
  accounts.push(account);
  saveLocalAccounts(accounts);
  await writeRemoteAccount(account);
}

function getCachedClasses() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CLASSES_CACHE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function saveCachedClasses(classes) {
  const unique = new Map();
  classes
    .filter((classItem) => classItem?.id && classItem?.name && classItem?.code)
    .forEach((classItem) => unique.set(classItem.id, classItem));
  ui.classes = [...unique.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name), "zh-CN")
  );
  ui.classesLoaded = true;
  try {
    localStorage.setItem(CLASSES_CACHE_KEY, JSON.stringify(ui.classes));
  } catch (error) {
    // Class caching is best effort when browser storage is unavailable.
  }
  return ui.classes;
}

async function readRemoteClasses() {
  if (!hasSharedConfig()) return getCachedClasses();
  const list = await mantleRequest(mantleListUrl());
  const classPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("classes/"))
    .slice(0, 200);
  const classes = await Promise.all(
    classPaths.map((path) => mantleRequest(mantleEntryUrl(path)))
  );
  return classes.filter((classItem) => classItem?.id && classItem?.name && classItem?.code);
}

async function writeRemoteClass(classItem) {
  saveCachedClasses([...ui.classes.filter((item) => item.id !== classItem.id), classItem]);
  if (!hasSharedConfig()) return;
  await mantleRequest(
    mantleEntryUrl(`classes/${encodeURIComponent(classItem.id)}`),
    {
      method: "POST",
      body: JSON.stringify(classItem)
    }
  );
}

function createDefaultClass() {
  const createdAt = new Date().toISOString();
  return {
    id: DEFAULT_CLASS_ID,
    name: "默认班级",
    code: DEFAULT_CLASS_CODE,
    description: "旧数据与首批同学默认加入的班级，管理员可继续创建其他班级。",
    active: true,
    createdBy: "system",
    createdAt
  };
}

async function ensureDefaultClass() {
  let classes = [];
  try {
    classes = await readRemoteClasses();
  } catch (error) {
    classes = getCachedClasses();
  }
  let defaultClass = classes.find((classItem) => classItem.id === DEFAULT_CLASS_ID);
  if (!defaultClass && !classes.some((classItem) => classItem.code === DEFAULT_CLASS_CODE)) {
    defaultClass = createDefaultClass();
    classes = [...classes, defaultClass];
    if (hasSharedConfig()) {
      await mantleRequest(
        mantleEntryUrl(`classes/${encodeURIComponent(defaultClass.id)}`),
        {
          method: "POST",
          body: JSON.stringify(defaultClass)
        }
      ).catch(() => {});
    }
  }
  saveCachedClasses(classes);
  return defaultClass || classes[0] || null;
}

async function findClassByCode(value) {
  const code = normalizeClassCode(value);
  const codeError = validateClassCode(code);
  if (codeError) return null;
  let classes = [];
  try {
    classes = await readRemoteClasses();
  } catch (error) {
    classes = getCachedClasses();
  }
  if (!classes.length && code === DEFAULT_CLASS_CODE) {
    await ensureDefaultClass();
    classes = ui.classes;
  }
  saveCachedClasses(classes);
  return classes.find((classItem) => normalizeClassCode(classItem.code) === code) || null;
}

async function loadClasses(force = false) {
  if (
    syncState.classesInFlight ||
    (syncState.classesLoaded && ui.classesLoaded && !force)
  ) {
    return ui.classes;
  }
  syncState.classesInFlight = true;
  ui.classesLoading = true;
  if (ui.page === "classes" && !ui.classesLoaded) render();
  try {
    const classes = await readRemoteClasses();
    saveCachedClasses(classes);
    syncState.classesLoaded = true;
  } catch (error) {
    saveCachedClasses(getCachedClasses());
  } finally {
    syncState.classesInFlight = false;
    ui.classesLoading = false;
    if (ui.page === "classes") render();
  }
  return ui.classes;
}

async function prepareAccountForSession(session) {
  const usernameKey = localUsernameKey(session?.username);
  const localAccount =
    getLocalAccounts().find((account) => account.usernameKey === usernameKey) || null;
  let remoteAccount = null;
  try {
    remoteAccount = await readRemoteAccount(usernameKey);
  } catch (error) {
    remoteAccount = null;
  }
  const account = {
    ...(localAccount || {}),
    ...(remoteAccount || {}),
    id: session.user.id,
    username: session.username,
    usernameKey
  };
  applyLatestNickname(account, localAccount, remoteAccount);
  await ensureDefaultClass();
  ensureAccountMemberships(account, DEFAULT_CLASS_ID);
  let currentClassId =
    session.currentClassId || remoteAccount?.currentClassId || localAccount?.currentClassId;
  if (!getMembershipForClass(account, currentClassId)) {
    currentClassId = getAccountMemberships(account)[0]?.classId || DEFAULT_CLASS_ID;
  }
  if (!getMembershipForClass(account, currentClassId)) {
    setAccountMembership(account, currentClassId, {
      role: isAdminUsername(account.username) ? "admin" : "student",
      status: "active"
    });
  }
  account.currentClassId = currentClassId;
  const classInfo =
    ui.classes.find((classItem) => classItem.id === currentClassId) ||
    ui.classes.find((classItem) => classItem.code === DEFAULT_CLASS_CODE);
  const membership = getMembershipForClass(account, currentClassId);
  const localAccounts = getLocalAccounts().filter(
    (item) => item.usernameKey !== usernameKey
  );
  localAccounts.push({ ...(localAccount || {}), ...account, currentClassId });
  saveLocalAccounts(localAccounts);
  if (remoteAccount) {
    void writeRemoteAccount(account).catch(() => {});
  }
  return {
    ...session,
    username: account.username,
    nickname: getAccountNickname(account),
    role: resolveAccountRole({ ...account, currentClassId }),
    pendingRole: membership?.pendingRole ? normalizeRole(membership.pendingRole) : "",
    identityNote: String(membership?.identityNote || ""),
    identityStatus: membership?.identityStatus || "student",
    currentClassId,
    className: classInfo?.name || "默认班级",
    classCode: classInfo?.code || "",
    classMemberships: getAccountMemberships(account)
  };
}

async function switchClass(classId) {
  const classItem =
    ui.classes.find((item) => item.id === classId) ||
    (await loadClasses(true)).find((item) => item.id === classId);
  if (!classItem) {
    showToast("班级不存在", "请刷新班级列表后再试。");
    return;
  }
  if (!isCurrentAdmin() && !getActiveMembershipForClass(authState.session, classId)) {
    openModal("join-class");
    return;
  }
  const membership = isCurrentAdmin()
    ? getActiveMembershipForClass(authState.session, classId) || {
        role: "admin"
      }
    : getActiveMembershipForClass(authState.session, classId);
  authState.session = {
    ...authState.session,
    currentClassId: classId,
    className: classItem.name,
    classCode: classItem.code,
    role: resolveAccountRole({
      ...authState.session,
      currentClassId: classId
    }),
    pendingRole: membership?.pendingRole ? normalizeRole(membership.pendingRole) : "",
    identityNote: String(membership?.identityNote || ""),
    identityStatus: membership?.identityStatus || "student"
  };
  saveAuthSession(authState.session);
  const accounts = getLocalAccounts();
  const account = accounts.find(
    (item) => item.usernameKey === localUsernameKey(authState.session.username)
  );
  if (account) {
    if (isCurrentAdmin() && !getMembershipForClass(account, classId)) {
      setAccountMembership(account, classId, {
        role: "admin",
        identityStatus: "approved",
        status: "active"
      });
    } else {
      account.currentClassId = classId;
    }
    account.updatedAt = new Date().toISOString();
    saveLocalAccounts(accounts);
    authState.session.classMemberships = getAccountMemberships(account);
    void writeRemoteAccount(account).catch(() => {});
  }
  currentStorageKey = `${STORAGE_KEY}:${authState.session.user.id}:${classId}`;
  state = loadState();
  applySharedRecords(getCachedSharedRecords());
  ui.membersLoaded = false;
  ui.members = [];
  ui.directoryMembers = [];
  ui.historyLoaded = false;
  ui.history = [];
  ui.dailyUsage = null;
  ui.page = "today";
  closeModal();
  render();
  showToast("已切换班级", `当前进入：${classItem.name}`);
  void syncSharedRecords();
}

async function joinClassByCode(classCode, role = "student", identityNote = "") {
  const classItem = await findClassByCode(classCode);
  if (!classItem) {
    throw new Error("没有找到这个班级邀请码。");
  }
  const usernameKey = localUsernameKey(authState.session.username);
  const accounts = getLocalAccounts();
  const account = accounts.find((item) => item.usernameKey === usernameKey);
  if (!account) throw new Error("本机账号资料不可用，请重新登录。");
  const existing = getActiveMembershipForClass(account, classItem.id);
  if (existing) {
    await switchClass(classItem.id);
    showToast("已进入班级", classItem.name);
    return;
  }
  const requestedRole = normalizeRole(role);
  const activeRole =
    isAdminUsername(account.username) || requestedRole === "student"
      ? requestedRole
      : "student";
  const pendingRole =
    isAdminUsername(account.username) || requestedRole === "student"
      ? ""
      : requestedRole;
  setAccountMembership(account, classItem.id, {
    role: activeRole,
    pendingRole,
    identityNote: String(identityNote || "").trim().slice(0, 60),
    identityStatus: isAdminUsername(account.username)
      ? "approved"
      : requestedRole === "student"
        ? "student"
        : "pending",
    status: "active"
  });
  account.currentClassId = classItem.id;
  saveLocalAccounts(accounts);
  await writeRemoteAccount(account);
  const session = createLocalSession(account);
  await activateAccount(session);
  closeModal();
  showToast(
    pendingRole ? "已加入班级，身份待审核" : "已加入班级",
    `当前班级：${classItem.name}`
  );
}

async function createClass(name, code, description) {
  if (!isCurrentAdmin()) {
    throw new Error("只有站点管理员可以创建班级。");
  }
  const cleanName = String(name || "").trim().slice(0, 40);
  if (cleanName.length < 2) throw new Error("班级名称至少需要 2 个字符。");
  const classCodeError = validateClassCode(code);
  if (classCodeError) throw new Error(classCodeError);
  const normalizedCode = normalizeClassCode(code);
  const classes = await readRemoteClasses().catch(() => ui.classes);
  if (classes.some((classItem) => normalizeClassCode(classItem.code) === normalizedCode)) {
    throw new Error("这个班级邀请码已经被使用。");
  }
  const classItem = {
    id: uid("class"),
    name: cleanName,
    code: normalizedCode,
    description: String(description || "").trim().slice(0, 100),
    active: true,
    createdBy: authState.session.user.id,
    createdAt: new Date().toISOString()
  };
  await writeRemoteClass(classItem);
  await switchClass(classItem.id);
  showToast("班级已创建", `${classItem.name} · ${classItem.code}`);
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function dailyUsagePath() {
  return `usage/${encodeURIComponent(
    getCurrentClassId()
  )}/${encodeURIComponent(authState.session.user.id)}/${localDateKey()}`;
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
  const usage = await readDailyUsage();
  if (usage.total >= PUBLISH_LIMITS.total) {
    throw new Error(`今天已经发布 ${PUBLISH_LIMITS.total} 条，请明天再试。`);
  }
  if (usage[recordType] >= PUBLISH_LIMITS[recordType]) {
    throw new Error(`今天这类信息最多发布 ${PUBLISH_LIMITS[recordType]} 条。`);
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

function applySharedRecords(records) {
  let changed = false;
  for (const record of records) {
    const payload = record?.payload;
    if (!payload?.id) continue;
    const id = String(payload.id);
    const recordClassId = String(
      record.class_id || payload.classId || DEFAULT_CLASS_ID
    );
    if (recordClassId !== getCurrentClassId()) continue;
    payload.classId = recordClassId;

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
  const recordPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("records/"))
    .slice(0, 500);
  const records = await Promise.all(
    recordPaths.map((path) => mantleRequest(mantleEntryUrl(path)))
  );
  return records.filter((record) => record?.record_key && record?.payload);
}

async function readSharedHistory() {
  if (!hasSharedConfig()) return [];
  const list = await mantleRequest(mantleListUrl());
  const historyPaths = (list?.entries || [])
    .map((entry) => entry?.path)
    .filter((path) => typeof path === "string" && path.startsWith("history/"))
    .slice(0, 500);
  const records = await Promise.all(
    historyPaths.map((path) => mantleRequest(mantleEntryUrl(path)))
  );
  return records.filter(
    (record) =>
      record?.record_key &&
      record?.payload &&
      String(record.class_id || record.payload?.classId || DEFAULT_CLASS_ID) ===
        getCurrentClassId()
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
  const classId = String(
    record.class_id || record.payload?.classId || DEFAULT_CLASS_ID
  );
  await mantleRequest(mantleEntryUrl(`records/${encodeURIComponent(record.record_key)}`), {
    method: "POST",
    body: JSON.stringify({
      ...sharedRecord,
      class_id: classId,
      payload: {
        ...sharedRecord.payload,
        classId
      },
      author_id: authState.session?.user.id || null
    })
  });
}

function queueSharedRecord(recordType, payload, options = {}) {
  if (!authState.session || !hasSharedConfig() || !payload?.id) return;
  payload.authorId = authState.session.user.id;
  payload.classId = String(payload.classId || getCurrentClassId());
  const recordKey = `${recordType}:${payload.id}`;
  const pending = getPendingSharedRecords().filter((item) => item.record_key !== recordKey);
  pending.push({
    record_key: recordKey,
    record_type: recordType,
    payload,
    class_id: payload.classId,
    visitor_id: getVisitorId(),
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

async function flushPendingSharedRecords() {
  if (!hasSharedConfig()) return 0;
  const pending = getPendingSharedRecords();
  if (!pending.length) return 0;
  let uploaded = 0;

  for (const record of pending) {
    try {
      await writeSharedRecord(record);
      if (!record.skip_quota && !isCurrentAdmin()) {
        try {
          await incrementDailyUsage(record.record_type);
        } catch (error) {
          // Publishing succeeded; usage accounting can retry independently.
        }
      }
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
    let changed = false;
    const account = {
      ...localAccount,
      ...remoteAccount,
      classMemberships: getAccountMemberships(remoteAccount).length
        ? getAccountMemberships(remoteAccount)
        : getAccountMemberships(localAccount)
    };
    applyLatestNickname(account, localAccount, remoteAccount);
    let needsAccountWrite =
      getAccountNickname(account) !== getAccountNickname(remoteAccount);
    ensureAccountMemberships(account, getCurrentClassId());
    let currentClassId = getCurrentClassId();
    if (!getMembershipForClass(account, currentClassId)) {
      const fallbackMembership = getAccountMemberships(account).find(
        (membership) => membership.status === "active"
      );
      currentClassId =
        fallbackMembership?.classId ||
        getAccountMemberships(account)[0]?.classId ||
        DEFAULT_CLASS_ID;
      if (!getMembershipForClass(account, currentClassId)) {
        setAccountMembership(account, currentClassId, {
          role: isAdminUsername(account.username) ? "admin" : "student"
        });
      }
      changed = true;
      needsAccountWrite = true;
    }
    const membership = getMembershipForClass(account, currentClassId);
    const classInfo = ui.classes.find((classItem) => classItem.id === currentClassId);
    const nextRole = resolveAccountRole({ ...account, currentClassId });
    const nextPendingRole = membership?.pendingRole
      ? normalizeRole(membership.pendingRole)
      : "";
    const nextNote = String(membership?.identityNote || "");
    if (authState.session.username !== account.username) {
      authState.session.username = account.username;
      changed = true;
    }
    if (authState.session.nickname !== getAccountNickname(account)) {
      authState.session.nickname = getAccountNickname(account);
      changed = true;
    }
    if (getCurrentClassId() !== currentClassId) {
      authState.session.currentClassId = currentClassId;
      currentStorageKey = `${STORAGE_KEY}:${authState.session.user.id}:${currentClassId}`;
      state = loadState();
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
    if ((authState.session.identityStatus || "") !== (membership?.identityStatus || "student")) {
      authState.session.identityStatus = membership?.identityStatus || "student";
      changed = true;
    }
    if (authState.session.className !== (classInfo?.name || "默认班级")) {
      authState.session.className = classInfo?.name || "默认班级";
      changed = true;
    }
    if (authState.session.classCode !== (classInfo?.code || "")) {
      authState.session.classCode = classInfo?.code || "";
      changed = true;
    }
    authState.session.classMemberships = getAccountMemberships(account);
    state.candidate.name = getAccountNickname(authState.session);
    saveAuthSession(authState.session);
    const localAccounts = getLocalAccounts().filter(
      (item) => item.usernameKey !== usernameKey
    );
    localAccounts.push({ ...(localAccount || {}), ...account, currentClassId });
    saveLocalAccounts(localAccounts);
    if (!getAccountMemberships(remoteAccount).length || needsAccountWrite) {
      await writeRemoteAccount({ ...account, currentClassId });
    }
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
    if (!ui.classesLoaded) {
      await loadClasses();
    }
    const accountChanged = await ensureCurrentAccountShared();
    importLocalRecordsToShared();
    await flushPendingSharedRecords();
    purgeExpiredLocalRecords();
    const allRecords = await readSharedRecords();
    const expiredRecords = allRecords.filter((record) => isRecordExpired(record?.payload));
    const records = allRecords.filter((record) => !isRecordExpired(record?.payload));
    await Promise.all(
      expiredRecords.map((record) => archiveAndDeleteExpiredRecord(record).catch(() => {}))
    );
    if (expiredRecords.length) {
      ui.historyLoaded = false;
      if (ui.page === "history") void loadHistory(true);
    }
    cacheSharedRecords(records);
    const changed = applySharedRecords(records);
    syncState.available = true;
    if (changed || accountChanged) {
      saveState();
      render();
    }
    setSyncStatus("online", `班级共享已同步 · ${records.length} 条`);
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

  if (action === "auth-mode") {
    const usernameInput = document.getElementById("auth-username");
    const roleInput = document.getElementById("auth-role");
    const identityNoteInput = document.getElementById("auth-identity-note");
    const classCodeInput = document.getElementById("auth-class-code");
    authState.username = usernameInput?.value || authState.username || "";
    authState.role = normalizeRole(roleInput?.value || authState.role);
    authState.identityNote = identityNoteInput?.value || authState.identityNote || "";
    authState.classCode =
      normalizeClassCode(classCodeInput?.value || authState.classCode) ||
      DEFAULT_CLASS_CODE;
    authState.mode = actionElement.dataset.mode === "register" ? "register" : "login";
    authState.error = "";
    authState.busy = false;
    render();
    requestAnimationFrame(() => document.getElementById("auth-username")?.focus());
    return;
  }

  if (action === "toggle-password") {
    authState.passwordVisible = !authState.passwordVisible;
    render();
    requestAnimationFrame(() => document.getElementById("auth-password")?.focus());
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

  if (action === "copy-class-code") {
    const code = getCurrentClass().code || "";
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(code)
        .then(() => showToast("邀请码已复制", `${getCurrentClass().name} · ${code}`))
        .catch(() => showToast("班级邀请码", code));
    } else {
      showToast("班级邀请码", code);
    }
    return;
  }

  if (action === "switch-class") {
    void switchClass(actionElement.dataset.classId).catch(() => {
      showToast("切换失败", "班级列表暂时不可用，请稍后重试。");
    });
    return;
  }

  if (action === "toggle-class-active") {
    void toggleClassActive(actionElement.dataset.classId).catch(() => {
      showToast("操作失败", "共享服务暂时不可用，请稍后重试。");
    });
    return;
  }

  if (action === "remove-class-member") {
    void removeClassMember(
      actionElement.dataset.usernameKey,
      actionElement.dataset.classId
    ).catch(() => {
      showToast("移除失败", "共享服务暂时不可用，请稍后重试。");
    });
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
      action === "approve-identity",
      actionElement.dataset.classId || getCurrentClassId()
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
    authState.classCode = classCode || DEFAULT_CLASS_CODE;
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
            authState.classCode
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
      showToast("今日发布次数已用完", error.message);
      return;
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
      showToast("今日发布次数已用完", error.message);
      return;
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
      showToast("今日发布次数已用完", error.message);
      return;
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
      showToast("今日发布次数已用完", error.message);
      return;
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

  if (form.id === "join-class-form") {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await joinClassByCode(
        data.get("classCode"),
        data.get("role"),
        data.get("identityNote")
      );
    } catch (error) {
      showToast("加入班级失败", error.message || "请检查邀请码后重试。");
    }
    return;
  }

  if (form.id === "create-class-form") {
    event.preventDefault();
    const data = new FormData(form);
    try {
      await createClass(
        data.get("name"),
        data.get("code"),
        data.get("description")
      );
    } catch (error) {
      showToast("创建班级失败", error.message || "请检查填写内容后重试。");
    }
    return;
  }

  if (form.id === "profile-form") {
    event.preventDefault();
    const data = new FormData(form);
    const currentClassId = getCurrentClassId();
    const accounts = getLocalAccounts();
    const account = accounts.find(
      (item) => item.usernameKey === localUsernameKey(authState.session.username)
    );
    const currentNickname = getAccountNickname(account || authState.session);
    const requestedNickname = normalizeNickname(
      data.get("nickname") || currentNickname
    );
    const nicknameChanged = requestedNickname !== currentNickname;
    if (nicknameChanged) {
      const nicknameError = validateNickname(requestedNickname);
      if (nicknameError) {
        showToast("昵称格式不正确", nicknameError);
        requestAnimationFrame(() => document.getElementById("profile-nickname")?.focus());
        return;
      }
      const nicknameChange = getNicknameChangeInfo(account || authState.session);
      if (!nicknameChange.allowed) {
        showToast("今天不能再次修改昵称", nicknameChange.message);
        requestAnimationFrame(() => document.getElementById("profile-nickname")?.focus());
        return;
      }
      if (!account) {
        showToast("昵称保存失败", "本机账号资料不可用，请重新登录后再试。");
        return;
      }
    }
    const currentMembership = getCurrentMembership();
    const requestedRole = normalizeRole(data.get("role"));
    const alreadyApproved = normalizeRole(currentMembership?.role) === requestedRole;
    const role = isCurrentAdmin() || alreadyApproved ? requestedRole : "student";
    const pendingRole =
      isCurrentAdmin() || alreadyApproved || requestedRole === "student"
        ? ""
        : requestedRole;
    const identityStatus = isCurrentAdmin()
      ? requestedRole === "student"
        ? "student"
        : "approved"
      : requestedRole === "student"
        ? "student"
        : alreadyApproved
          ? "approved"
          : "pending";
    const identityNote = String(data.get("identityNote") || "").trim().slice(0, 60);
    state.candidate = {
      name: requestedNickname,
      slogan: String(data.get("slogan")).trim(),
      intro: String(data.get("intro")).trim(),
      letter: String(data.get("letter")).trim(),
      promises: [0, 1, 2].map((index) => ({
        title: String(data.get(`promiseTitle${index}`)).trim(),
        text: String(data.get(`promiseText${index}`)).trim()
      }))
    };
    if (account) {
      if (nicknameChanged) {
        const changedAt = new Date().toISOString();
        const previousNickname = currentNickname;
        account.nickname = requestedNickname;
        account.nicknameUpdatedAt = changedAt;
        account.nicknameUpdatedDate = localDateKey();
        authState.session.nickname = requestedNickname;
        state.candidate.name = requestedNickname;
        const userId = authState.session.user.id;
        state.posts.forEach((item) => {
          if (item.authorId === userId || (!item.shared && item.author === previousNickname)) {
            item.author = requestedNickname;
            if (item.shared) queueSharedRecord("post", item, { skipQuota: true });
          }
        });
        state.teams.forEach((item) => {
          if (item.authorId === userId || (!item.shared && item.owner === previousNickname)) {
            item.owner = requestedNickname;
            if (item.shared) queueSharedRecord("team", item, { skipQuota: true });
          }
        });
        state.resources.forEach((item) => {
          if (item.uploader === previousNickname) {
            item.uploader = requestedNickname;
          }
        });
      }
      setAccountMembership(account, currentClassId, {
        role,
        pendingRole,
        identityNote,
        identityStatus
      });
      saveLocalAccounts(accounts);
      authState.session.classMemberships = getAccountMemberships(account);
      authState.session.role = resolveAccountRole({
        ...account,
        currentClassId
      });
      authState.session.pendingRole = pendingRole;
      authState.session.identityNote = identityNote;
      authState.session.identityStatus = identityStatus;
      saveAuthSession(authState.session);
      saveState();
      void writeRemoteAccount(account)
        .then(() => {
          syncState.accountChecked = true;
          void loadMemberDirectory(true);
          showToast(
            pendingRole ? "身份申请已提交" : "身份资料已同步",
            pendingRole
              ? `你申请的“${getRoleMeta(
                  pendingRole
                ).label}”需要本班班委、辅导员或站点管理员审核。`
              : "当前班级的成员身份目录已经更新。"
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
    showToast(
      nicknameChanged ? "昵称已修改" : "账号资料已更新",
      nicknameChanged
        ? "昵称每天只能修改一次，其他资料也已同步。"
        : "首页、竞选页和身份标签已经同步。"
    );
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
    return;
  }
  if (event.target.dataset.action === "set-member-role") {
    void updateClassMemberRole(
      event.target.dataset.usernameKey,
      event.target.dataset.classId,
      event.target.value
    ).catch(() => {
      showToast("身份更新失败", "共享服务暂时不可用，请稍后重试。");
    });
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
      if (ui.page === "members" || ui.page === "classes") {
        void loadMemberDirectory(true);
      }
      if (ui.page === "classes") {
        void loadClasses(true);
      }
      if (ui.page === "history") {
        void loadHistory(true);
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
