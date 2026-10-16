# IC-4 出战名单（只读页 · 不用登录）

2026-10-17「IC-4 运动会」的出战名单展示页：晶圆图 + 名单 + 倒计时 + 应援语。
**打开就能看，不需要登录**，页面只读，不接收任何提交，也没有照片上传入口。

线上地址：<https://lkx478482771-star.github.io/banji-class-hub/ic4-sports/>

## 这个目录是什么

生成产物。**不要手改** `app.js` / `data.js` / `styles.css` / `assets/icons.js`。

源码与构建脚本在：`default-workspace\ic4-sports`（含 `tools\build.mjs`、`tools\smoke.mjs`）。

## 名单要改了怎么办

1. 改 `运动会宣传\运动员名单.csv`；
2. 在 `default-workspace\ic4-sports` 里跑 `node tools/build.mjs`，再跑 `node tools/smoke.mjs`（应显示"全部通过"）；
3. 把 `index.html`、`app.js`、`data.js`、`styles.css`、`assets\icons.js` 复制到本目录覆盖。

## 和其它文件的关系

本目录以外的文件（旧站的 `index.html`、`guide.html`、`app.js` 等）一律没有改动。
页面只有展示功能：不含登录、不含云端读写、不含照片、不发任何外部请求。
