window.BANJI_CONFIG = {
  cloudEnabled: true,
  provider: "mantle",
  mantleApiBase: "https://mantledb.sh/v2",
  // 免费档每个命名空间最多 100 条 entry、每 24 小时 10000 次请求。
  // 全班 40 人光「账号 + 课表」就有 80 条，再加记录/归档/照片当天必炸，
  // 所以按用途分片：每片有各自独立的 100 条与 10000 次额度，互不挤占。
  // 分片只影响存放在哪，不影响任何页面行为；改这里之前先看 README 的「存储分片」一节。
  mantleNamespace: "banji-ahu-ic-33cf9d5cd38f93f5",
  mantleNamespaceMap: {
    "accounts/": "banji-ahu-ic-33cf9d5cd38f93f5", // 账号（身份册）
    "classes/": "banji-ahu-ic-33cf9d5cd38f93f5", // 班级
    "meta/": "banji-ahu-ic-33cf9d5cd38f93f5", // 元信息
    "schedules/": "banji-ahu-user-33cf9d5cd38f93f5", // 个人课表
    "usage/": "banji-ahu-usage-33cf9d5cd38f93f5", // 每日发布额度
    "records/": "banji-ahu-live-33cf9d5cd38f93f5", // 在架内容
    "history/": "banji-ahu-live-33cf9d5cd38f93f5", // 归档（有上限）
    "photos/": "banji-ahu-photos-33cf9d5cd38f93f5" // 运动会照片（最大头）
  },
  adminUsernames: ["刘凯翔"],
  campaignUsernames: ["刘凯翔"]
};
