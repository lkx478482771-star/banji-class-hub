window.BANJI_CONFIG = {
  cloudEnabled: true,
  provider: "supabase", // "supabase" = 当前（真 Postgres + 照片走对象存储）；改回 "mantle" 即回退
  // 建库脚本见 supabase/*.sql；anon key 本就是公开密钥，安全边界是库里的 RLS 策略。
  supabaseUrl: "https://klbrofzbfnmxravbwdhq.supabase.co", // Project URL（不带路径）
  supabaseAnonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtsYnJvZnpiZm5teHJhdmJ3ZGhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwODIyNDMsImV4cCI6MjEwNzY1ODI0M30.pbUfj8vYuAmAK-c0-5rwkQ7lmia0fcTVENJ1a_1Py_U", // Project Settings → API → anon public
  mantleApiBase: "https://mantledb.sh/v2",
  // 免费档每命名空间 100 条 / 每天 10000 次请求，所以按用途分片互不挤占。
  // 分片只影响存哪、不影响页面行为；改这里前先看 README 的「存储分片」一节。
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
