# IC-4 运动会页（不用登录）

集成电路 4 班运动会页：出战名单 + 晶圆图 + 倒计时 + **匿名加油墙** + **赛场原声**。
**打开就能看，不用登录、不用注册**；加油想写就写，但要经过负责人审核才会显示。

线上地址：https://lkx478482771-star.github.io/banji-class-hub/ic4-sports/
审核页（只有负责人用）：同目录下的 `admin.html`，默认口令 `ic4-2026`

## 页面上有什么

- 晶圆图：31 颗芯片 = 31 位选手，点一颗看他的出战参数
- 径赛 / 田赛筛选、出战名单、应援语
- 距开赛倒计时、一键通电 / 复位动画
- 加油墙：写完先进入「待审核」，负责人在 `admin.html` 里点「通过」才会上墙
- 赛场原声：直接播旧站 `assets/music/` 里那三首（不复制第二份）

**没有**：登录、账号、密码、照片上传、成绩录入。

## 加油墙是怎么放数据的

- 复用旧站同一个 Supabase 项目，但写在**两个专用分区**里：
  `banji-ic4-cheer-pending`（待审）、`banji-ic4-cheer-live`（已上墙）
- 旧站的代码只认它自己那批 `banji-ahu-*` 分区，所以这些留言不会跑到旧网站上
- **不需要跑任何 SQL**，也不需要新建表
- 代价要讲清楚：审核是「防君子」级别——口令页能挡住随手点进来的人，
  但理论上知道接口地址的人能把这两个分区里的留言删掉。想加固就跑可选的
  `supabase/ic4-cheers.sql`（把读写搬到服务端函数里），不跑也能正常用。

## 怎么换审核口令

`admin.js` 顶部有一行 `SECRET_HASH`。新口令的算法是
`sha256("ic4-cheer-admin|" + 新口令)`，在浏览器控制台里算出来替换那一行即可。

## 怎么更新名单 / 音乐

名单唯一真源是工作区里的 `运动会宣传/运动员名单.csv`；三首歌来自旧站 `banji-class-hub/assets/music/`
（歌名与时长从旧站 `app.js` 的 `SPORTS_BGM_TRACKS` 里读）。改完在本地工作区执行：

```
cd ic4-sports
node tools/build.mjs     # 重新生成 data.js / config.js / styles.css / assets/icons.js / sql.html
node tools/smoke.mjs     # 自检：文件齐全、不用登录、只连自己的 Supabase、名单 31 人、三首歌都在
```

再把 `index.html`、`app.js`、`data.js`、`config.js`、`cheer-api.js`、`styles.css`、
`assets/icons.js`、`admin.html`、`admin.js`、`sql.html`、`supabase/ic4-cheers.sql`
复制到 `banji-class-hub/ic4-sports/`，提交并推送。

`tools/` 里的脚本要在本地工作区（`banji-class-hub` 的旁边）运行，**只读旧站，不会改它**。

## 一个必须记住的坑：资源一定要带 `?v=`

旧站的 `banji-class-hub/sw.js` 注册的 service worker，**作用范围是整个 `/banji-class-hub/`**，
我们这一页也在里面。它的策略是：

- 页面导航 → 网络优先（部署新版，刷新就是新版）
- 站内静态资源 → **缓存优先**，它自己的注释写着「资源 URL 都带 `?v=YYYYMMDD`，
  换了版本就是换了 URL，天然不会读到旧文件」

所以 `index.html` 里每一处 `styles.css` / `app.js` / `cheer-api.js` … 都必须带 `?v=`
（`node tools/build.mjs` 会自动盖上，版本号 = 产物内容的 md5 前 8 位）。
**漏了 `?v=` 的后果**：同学浏览器一直吃旧缓存，现象是「新加的功能没出现」——
2026-10-16 就踩过：赛场原声没显示、加油墙报旧错误，全是因为资源没带版本号。

改完页面后如果同学还看到旧的，让他**关掉标签页重新打开**（或下拉刷新两次）即可。

