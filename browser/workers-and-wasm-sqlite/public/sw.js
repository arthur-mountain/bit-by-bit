/**
 * Service Worker（服務工作執行緒）
 * ─────────────────────────────────────────────────────────
 * 基礎知識：
 * - Service Worker 是瀏覽器與網路之間的「可程式化代理」，
 *   註冊後即使關閉分頁也會持續存在（除非被瀏覽器回收），
 *   可攔截同源的 fetch 請求，決定要走快取還是走網路。
 * - 生命週期固定三階段：install → activate → fetch（idle 時可能被終止，
 *   下次事件觸發會重新喚醒，因此「不可以」用一般模組級變數保存長期狀態）。
 * - 沒有 DOM 存取權，只能用 postMessage 與頁面溝通。
 * - 必須在安全情境（HTTPS 或 localhost）下才能註冊。
 *   來源：MDN Web Docs, ServiceWorkerRegistration /
 *   ServiceWorkerContainer.register()「Baseline Widely available，
 *   自 2018 年 4 月起主流瀏覽器已全面支援」［高信心，官方文件，
 *   屬長期穩定的 Baseline 功能，非快速變動子領域，不受 6 個月時效門檻限制］。
 *
 * 本示範採用「執行時快取（runtime cache）＋ Cache-First 回退 Network」
 * 的簡化策略，而非正式產品常見的建置期預快取清單（precache manifest），
 * 純粹是為了讓 `npm run dev` 就能直接示範離線效果。
 * 正式專案建議改用 vite-plugin-pwa 或 Workbox 產生精準的 precache 清單。
 */

const CACHE_NAME = "notes-app-shell-v1";

self.addEventListener("install", (event) => {
  // skipWaiting()：不等待舊版 Service Worker 的分頁全部關閉，
  // 立刻讓新版本進入 activate 階段，方便 MVP 開發時快速迭代。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 清掉舊版本快取，避免快取無限膨脹
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
      );
      // clients.claim()：立刻接管目前已開啟、尚未被任何 Service Worker
      // 控制的分頁，不用重新整理就能生效。
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 只處理 GET，且只處理同源請求；其餘（例如 SharedWorker/Worker 的
  // 內部通訊、POST 表單）一律略過交給瀏覽器預設行為。
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== location.origin
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);

      // Cache-First：有快取先回應（離線時仍可用），
      // 背景仍嘗試打一次網路把快取更新到最新（stale-while-revalidate 精神）。
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => undefined);

      return (
        cached ||
        (await networkFetch) ||
        new Response("離線中，且無快取可用", { status: 503 })
      );
    })(),
  );
});
