# 变更记录

## 2026-10-13 — 数据安全进阶：自动本机快照 + 导出提醒

「导出」是要人记得点的，这一版补上不需要人记的那一半。

- 新增**自动本机快照**：管理员/班委打开「个人中心」时，若本机快照超过 20 小时没更新，
  就静默把共享库整份拉下来存进这台电脑的 `localStorage`
  （键 `banji-data-snapshot-v1:<classId>`，元数据 `banji-data-snapshot-meta-v1:<classId>`）。
  快照超过 2 MB 时自动跳过 `photos/` 开头的记录，并在卡片上说明「照片太多，快照里没放照片」；
  本机存储写不下时只提示、不报错。
- 数据安全卡片新增一行状态：`本机快照：刚刚 · 17 条　导出备份：3 天前`；
  导出超过 7 天（或从没导出过）时追加「（建议现在导出）」。
- 新增第三个按钮**从本机快照恢复**。原本的写回逻辑抽成 `writeBackRecords(records, confirmText)`，
  文件恢复与本机快照恢复共用同一条路径。
- 实测：打开「个人中心」后卡片显示「本机快照：刚刚 · 17 条」，`localStorage` 里出现
  `banji-data-snapshot-v1:ahu-ic-2026` 与对应的 meta 键。

### 为什么不 claim 命名空间

调研结论（实验见下）：claim 会让**全部既有读取变成 401**、写入与删除也需要 `X-Mantle-Key`。
纯前端站点的 key 只能公开写在 `config.js` 里，等于没有权限控制；而把密钥提交进公开仓库
又违反本仓库工作区的账户安全红线。所以保留期靠**导出 + 自动快照**对冲，不做 claim。

## 2026-10-13 — 运动会名单换成真实报名表（27 人）

- `SPORTS_ATHLETES` 从 20 条示例名单换成全院报名表里推导出的 **27 条真实名单**（每人可报多项）。
- 名单行布局改为 `38px auto minmax(0, 1fr)`：姓名不再换行（`white-space: nowrap`），
  项目列右对齐并 `text-overflow: ellipsis`，长项目名不再把姓名挤成两行。
- `scripts/check-size.mjs` 里 `app.js` 单文件上限 250 KB → 265 KB
  （真正的红线仍是首屏合计 470 KB，当前实测约 426 KB）。

## 2026-10-13 — 数据安全：一键导出备份 / 从备份恢复

全班数据都在 MantleDB 免费命名空间里，而它**不会自动备份**，30 天没有写入还会被清空。
这一版把「把数据拿到自己手里」做成两个按钮。

### 新增

- 「个人中心」右栏新增**数据安全**卡片（仅管理员与班委可见）：共享库容量进度条 +
  `N / 100 条` 徽章（≥60 变橙、≥80 变红），以及两个动作：
  - **导出全部数据**：清掉 5 秒短时缓存后遍历共享库，把全部记录打包成
    `banji-backup-<时间戳>.json`（含 `app` / `namespace` / `exportedAt` / `recordCount` /
    `failed` / `records`）并直接下载到本机。
  - **从备份恢复**：选择备份文件 → 解析 → 二次确认（显示备份时间与条数）→
    以并发 3 逐条写回。同路径记录被覆盖，**备份里没有的记录不会被删除**。
- `scripts/backup-mantle.py` 支持**无参数运行**：自动从 `config.js` 里读命名空间，
  把备份写到 `backups/banji-backup-<YYYYmmdd-HHMMSS>.json`；原来的
  `<namespace> <输出文件>` 用法保留。配套 `scripts/backup-mantle.cmd` 可双击运行。
- `backups/` 进 `.gitignore`：备份里有同学手机号和口令摘要，**永远不要提交**。

### 说明

- 口令在库里只存 PBKDF2 摘要，导出的是摘要而不是明文。
- 免费命名空间是公开的：`config.js` 里就写着命名空间，任何拿到它的人都能读写。
  因此这两个按钮的意义是**「别把数据弄丢」**，不是防篡改 —— 真正的权限控制需要后端。
- 建议每周导出一份，放到自己的网盘或 U 盘。

## 2026-10-13 — 运动会栏目视觉升级 + 首图换 WebP

### 性能（首屏约 415 KB，上限 470 KB）

- 首图 `assets/campus-collaboration.jpg`（1152×768 / 127,632 字节）换成
  `assets/campus-collaboration.webp`（76,182 字节，-40%）。`styles.css` 里 5 处引用与
  `scripts/check-size.mjs` 的白名单同步更新。省下的约 50 KB 正好用来承载下面的新界面。
- `scripts/check-size.mjs` 的 `app.js` 单文件上限由 240 KB 调到 250 KB。
  **首屏合计上限仍是 470 KB，那条才是红线。**

### 界面

- 「IC-4 运动会」页头改成深色英雄区：学院名 + 大标题 + 口号胶囊 + 三格大号倒计时。
- 新增四张数据卡：参赛选手 / 比赛项目 / 径赛人次 / 田赛人次。
- 晶圆加虚线导引环与图例（待机 / 已通电 / 当前查看）；去掉会和底部芯片相撞的缺口装饰，
  芯片外沿改为离圆边留约 3% 余量。LOT 日期不再写死，由 `SPORTS_MEET.meetTime` 推导。
- 出战名单新增「全部 / 径赛 / 田赛」筛选，编号仍对应原始序号。

## 2026-10-05 — 性能、可靠性、安全与工程化整备

针对线上站（GitHub Pages，从本仓库 main 根目录部署）与本地克隆长期分叉、首屏过重、
同步会卡死、以及"没有服务端却把权限判断全放在前端"等问题做的一轮整备。
**没有引入任何构建步骤、框架或运行时依赖**，仍然是零构建的纯静态站点。

### 性能（首屏约 876 KB → 约 400 KB）

- 首图 `assets/campus-collaboration.jpg` 由 1800×1200 / 324,771 字节压到 1152×768 / 127,632 字节（-60.7%）。
  这张图在 `styles.css` 里始终被 90% 以上不透明度的深色渐变盖住，尺寸和质量压狠一点看不出来。
- **删除 358 KB 的 lucide 全量包**（1743 个图标），改为 `assets/icons.js`（93 个图标 / 约 31 KB）。
  该文件由 `scripts/build-icons.mjs` 生成，内含一个与 `lucide.createIcons` 兼容的垫片。
- `index.html` 的三条脚本加 `defer`，不再阻塞首屏解析。
- 新增 `scripts/check-size.mjs` 体积预算守卫（首屏合计 + 单文件上限），CI 里超限即失败。

### 可靠性

- `fetchMantle` 加 8 秒 `AbortController` 超时，**并且覆盖响应体读取**：原先只要请求挂起，
  `syncState.inFlight` 就永远复位不了，全站再也不同步、只能刷新页面。
- 发布额度读不到时**放行**而不是拦死。原先拉取额度失败会被显示成"今日发布次数已用完"，
  导致已经写好的离线待发队列永远走不到。
- `applySharedRecords` 改为按 `recordKey` 对账：远端删除现在会传播到其他设备
  （仅在该次拉取完整成功时生效，且绝不删待发队列里的内容）。
- 待发队列单条失败改为 `continue` 并计次，超过 5 次移出并提示；网络类瞬时错误不计次，
  避免离线内容被误丢。
- `render()` 前后保存/恢复焦点与选区，后台同步不再把正在输入的搜索框打断。
- MantleDB 请求加并发上限（6）、5 秒结果缓存与 in-flight 去重，消掉每 15 秒一轮的 N+1 请求风暴。
- 补齐 `loadSchedule` 的 `finally`（原先异常后永久 loading）、`loadState` 解析失败的提示，
  以及班级列表拉取失败时保留旧数据而不是清空。

### 安全与隐私

- 口令派生：新账号改用 PBKDF2-SHA256 **60 万次**迭代（原 12 万次），老账号按记录里的
  迭代次数照常登录并在登录成功后**静默升级**；移除"没有 WebCrypto 就退回非密码学散列"的降级分支；
  口令最小长度由 6 提到 8，并在提示里要求不要复用其他站点的密码。
- 匿名意见箱**不再上传任何身份字段**：不再写入 `authorId` 和 `visitor_id`。
  作者仍能在自己设备上认出并删除自己的内容，但服务端与其他同学看不到作者。
- 统一属性插值转义：所有 `data-id` / `data-record-type` 等属性改为走 `escapeHTML`，
  堵住"远端记录里带引号就能注入属性"的路径。
- 上传增加危险类型黑名单（`html`/`svg`/`js`/`exe`/`bat`/`ps1` 等浏览器会当作网页或程序执行的格式）。
  刻意用黑名单而不是白名单：`.v`/`.c`/`.sch` 这类课程作业文件不该被误拦，
  且上传文件只存在本地 IndexedDB、下载走 `anchor.download`，不会在本站域名下渲染。
- `ahu-import.js` 增加域名守卫（只在 `*.ahu.edu.cn` 上运行）与执行前的明确 `confirm` 说明。
- `README.md` 新增「安全边界与已知限制」一节，如实写明：没有服务端所以没有真正的权限校验、
  口令摘要放在公共命名空间里、课表公开可读、现阶段定位是班级内部小规模试用。

### 体验与无障碍

- `prefers-reduced-motion` 动效降级；`viewport-fit=cover` + `env(safe-area-inset-*)`（toast、抽屉、模态底栏）。
- `100vh` 补 `100dvh` 回退；图标按钮用 `::after` 扩展点击区到 ≥44px。
- 正文字号 14px → 15px，移动端 16px；输入框 16px（避免 iOS 聚焦自动缩放）；日历小字 10px → 12px。
- `--ink-faint` 由 `#7d8981`（约 3.5:1）改为 `#5f6b63`（约 5.57:1）；字体栈补 `system-ui` 与中文字体回退。
- `#nav-class-manager` 改为 HTML 里默认 `hidden`，消除普通同学首帧闪见「班级管理」的问题。

### 工程化与文档

- 缓存失效：`index.html` 里所有静态引用加 `?v=<日期>`。GitHub Pages 无法自定义响应头、
  默认只给约 10 分钟缓存，不加版本号同学刷新会拿到旧脚本。
- 新增 `.github/workflows/ci.yml`：语法检查（`node --check`）、图标名一致性、图标渲染自检、体积预算。
- 新增脚本：`scripts/build-icons.mjs`（生成图标子集）、`scripts/check-icons.mjs`、
  `scripts/check-size.mjs`、`scripts/verify-icons.mjs`（最小 DOM 桩自检）、
  `scripts/optimize-hero-image.py`（首图重压，对已压缩文件会跳过以免反复有损重压）、
  `scripts/backup-mantle.py`（导出 MantleDB 全量 JSON）。
- `supabase/migrations/*.sql` 移到 `legacy/supabase/`：它定义了早期设计的表结构与 RLS 策略，
  但当前代码完全没引用，将来迁到自建后端时可以直接复用。
- `README.md` 纠正三处与代码不符的说明（`outputs` 目录、数据到底存在哪、"不请求 Supabase"），
  补充「开发与检查」与「备份」两节。
- 新增 `.gitignore`，确保导出的备份文件（含同学真实信息与口令摘要）不会被提交。

### 尚未完成 / 需要你参与

- **课表导入仍是「在教务页面执行本站托管的远程脚本」**。已加域名守卫与确认提示，
  但彻底的做法是改成完全内联的书签，这需要先在真实教务会话里验证，故未擅自改动。
- **迁到自建后端**（可用 `legacy/supabase/` 直接起步）尚未开始。触发条件：
  出现一次数据丢失、同学数超过 60、开始存任何敏感字段、需要审计或删除请求。
- 本地旧克隆 `C:\Users\lenovo\Documents\Codex\2026-09-30\new-chat\work\banji-class-hub`
  与上游 main 仍是分叉状态（当时网络不可用，fetch 失败），其独有内容
  （昵称子系统、一人多班成员制、国庆微站）尚未移植。
- `LICENSE` 与版本 tag 未定，`assets/icons.js` 里的 93 个图标中包含若干字面量误报，
  可后续用更精确的扫描收紧。

### 2026-10-13 深夜：修掉「删掉的内容重新登录后又冒出来」

- **现象**：管理员删掉一条内容，第二次登录它又出现，怎么删都删不干净。
- **根因**：`deleteSharedRecord()` 只删了「服务器那条 + 本机列表那条」，本机还留着两份旧副本——
  云缓存 `banji-shared-cache-v1:<班级>`（每次登录 `applySharedRecords(getCachedSharedRecords())`
  会把它贴回列表）和待发队列 `banji-shared-pending-v1`（下次同步会把它重新上传）。
  两份旧副本只要还剩一份，删掉的内容就会自己长回来。
- **修法**：新增删除墓碑（`DELETED_SHARED_KEY` / `DELETED_ITEMS_KEY`，保留 120 天）。
  ① `deleteSharedRecord()` 先立墓碑，再清掉云缓存与待发队列里的同名副本；服务器删除失败不再
  抛出异常，改为排进下次同步重试；② `applySharedRecords()` 跳过墓碑上的记录，云缓存或服务器
  旧副本送来也不接收；③ `syncSharedRecords()` 每次同步对墓碑上残留的服务器副本补删一次；
  ④ `importLocalRecordsToShared()` 不再导入墓碑上的内容；⑤ 大事记（chronicle）是「一条记录里
  装着多条」，额外按条目立墓碑，`deleteMilestone()` 与 `mergeChronicleItems()` 配合，
  删掉的条目不会被并集合并回来。
- **验证**：写了定向回归页（拦掉真服务器，种入「列表 + 云缓存 + 待发队列」三份旧副本）对比修复前后：
  修复前删除后 `cache=1 pending=1`、重放旧副本后 `state=1`（FAIL）；修复后 `cache=0 pending=0
  墓碑=true`、重放后 `state=0`（PASS）。临时文件已清理。
- **已知局限**：墓碑存在本机。换设备或换浏览器登录时，那台设备上的旧副本仍可能把它传回来。
  彻底根治要在服务器侧记墓碑（或先 claim 命名空间，用服务端权限兜底）。
- **体积**：app.js 从 348 KB 放宽到 356 KB（这次是修 bug，不是加功能）；`check-size.mjs` 里那条
  「下一轮动手前先做 `applySharedRecords` 去重瘦身」的硬任务依然欠着。
