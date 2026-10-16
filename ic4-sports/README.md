# IC-4 运动会页（不用登录）

集成电路 4 班运动会页：出战名单 + 晶圆图 + 倒计时 + **匿名加油墙**。
**打开就能看，不用登录、不用注册**；加油想写就写，但要经过负责人审核才会显示。

线上地址：https://lkx478482771-star.github.io/banji-class-hub/ic4-sports/
审核页（只有负责人用）：同目录下的 `admin.html`

## 页面上有什么

- 晶圆图：31 颗芯片 = 31 位选手，点一颗看他的出战参数
- 径赛 / 田赛筛选、出战名单、应援语
- 距开赛倒计时、一键通电 / 复位动画
- 加油墙：写完先进入「待审核」，负责人在 `admin.html` 里点「通过」才会上墙

**没有**：登录、账号、密码、照片上传、成绩录入、背景音乐。

## 加油墙是怎么保护的

- 数据放在 Supabase 的两张小表里，**匿名用户没有直接读写权**（表上开了 RLS 且收回了权限）
- 页面只能调两个函数：`ic4_cheer_submit`（提交，限频：同一网络 10 秒一条、1 小时 20 条）、`ic4_cheer_list`（只读已通过的）
- 审核函数 `ic4_cheer_review` 需要口令，口令只以打码值存在数据库里
- 也就是说：**别人删不掉、改不了墙上的内容**，最多只能提交待审的留言

数据库脚本：`supabase/ic4-cheers.sql`（在 Supabase 的 SQL Editor 里跑一次即可，可重复运行）。

## 怎么更新名单

名单唯一真源是工作区里的 `运动会宣传/运动员名单.csv`。改完 CSV 后，在本地工作区执行：

```
cd ic4-sports
node tools/build.mjs     # 重新生成 data.js / config.js / styles.css / assets/icons.js
node tools/smoke.mjs     # 自检：文件齐全、不用登录、只连自己的 Supabase、名单 31 人
```

再把 `index.html`、`app.js`、`data.js`、`config.js`、`cheer-api.js`、`styles.css`、
`assets/icons.js`、`admin.html`、`admin.js` 复制到 `banji-class-hub/ic4-sports/`，提交并推送。

`tools/` 里的脚本要在本地工作区（`banji-class-hub` 的旁边）运行，**只读旧站，不会改它**。
