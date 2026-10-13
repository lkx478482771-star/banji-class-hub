/* 班集 · 离线外壳
 *
 * 目的只有一个：装到主屏幕后，地铁里/信号差的时候打开也能看到界面骨架，
 * 而不是一张「无法访问此网站」。
 *
 * 缓存策略（刻意选保守的那一档）：
 *   · 页面导航  → 网络优先。部署新版后刷新立刻是新版，不会被缓存卡住。
 *   · 站内静态资源 → 缓存优先 + 后台更新。资源 URL 都带 ?v=YYYYMMDD，
 *                    换了版本就是换了 URL，天然不会读到旧文件。
 *   · 跨域请求（共享库 mantledb.sh）→ 完全不碰，避免把业务数据缓存成旧值。
 *
 * 想停用：删掉这个文件，或把 app.js 里的 registerServiceWorker 调用去掉。
 */

const CACHE_NAME = "banji-shell-v1";

self.addEventListener("install", () => {
  // 新版本直接顶上，不等旧页面全部关掉。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function cachePut(request, response) {
  if (!response || !response.ok || response.status !== 200) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：网络优先，断网时回落到上一次成功打开的那份。
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          await cachePut(request, response);
          return response;
        } catch (error) {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match("./index.html");
          if (shell) return shell;
          throw error;
        }
      })()
    );
    return;
  }

  // 静态资源：先给缓存，同时后台拉新的留着下次用。
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          await cachePut(request, response);
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })()
  );
});
