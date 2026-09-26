/**
 * Web Worker（一般所稱的 Dedicated Worker）＋ SharedArrayBuffer / Atomics
 * ─────────────────────────────────────────────────────────
 * 基礎知識：Web Worker
 * - 在背景執行緒執行 JS，避免耗時運算卡住主執行緒（UI 執行緒）。
 * - 預設與主執行緒之間用 postMessage() 溝通，資料會被「結構化複製
 *   （structured clone）」——也就是複製一份，不是共享同一塊記憶體。
 * - 可用 `new URL('./xxx.js', import.meta.url)` 搭配 `{ type: 'module' }`
 *   讓 worker 內也能使用 ESM 的 import/export。
 *
 * 基礎知識：SharedArrayBuffer + Atomics
 * - 一般 postMessage 是「複製」資料；SharedArrayBuffer 則是讓主執行緒與
 *   worker「真的共用同一塊記憶體」，任一方寫入，另一方幾乎立刻看得到，
 *   常用來做「不想每個影格都 postMessage 一次」的高頻率進度回報、
 *   或多執行緒共同讀寫同一份數值狀態。
 * - 因 2018 年 Spectre 漏洞，必須頁面滿足跨來源隔離
 *   （crossOriginIsolated === true）才能建立 SharedArrayBuffer；
 *   否則 `new SharedArrayBuffer(...)` 會直接丟例外。
 *   官方建議寫法：
 *     if (crossOriginIsolated) {
 *       const buffer = new SharedArrayBuffer(16);
 *     } else {
 *       const buffer = new ArrayBuffer(16); // 退化為一般、不可共享的記憶體
 *     }
 *   （來源：MDN Web Docs, SharedArrayBuffer「安全需求」章節
 *   ［高信心，官方文件，屬長期穩定的安全規範，非快速變動內容］）。
 * - Atomics.store / Atomics.load：對共享記憶體做「原子」讀寫，
 *   避免兩個執行緒同時寫同一格造成的資料競爭（race condition）。
 *
 * 本檔案的示範情境：
 * 對「所有筆記內容」做一次字元頻率統計（模擬耗時運算），
 * 每算完一小段就回報百分比進度：
 *   - 若頁面 crossOriginIsolated 為 true → 直接把進度寫進
 *     SharedArrayBuffer，主執行緒用 requestAnimationFrame 輪詢讀取，
 *     完全不需要額外的 postMessage 訊息。
 *   - 若為 false（例如某些嵌入式情境沒有設定 COOP/COEP）→ 退回用
 *     postMessage 回報進度，維持功能可用但頻率較低、有額外訊息開銷。
 */

self.onmessage = (e) => {
  const { text, progressBuffer } = e.data;

  // progressBuffer 若存在，代表主執行緒判斷 crossOriginIsolated 為 true，
  // 傳進來的是一個 SharedArrayBuffer 包出來的 Int32Array 檢視。
  const progressView = progressBuffer ? new Int32Array(progressBuffer) : null;

  const freq = Object.create(null);
  const total = Math.max(text.length, 1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch.trim() === "") continue; // 忽略空白字元，只統計有意義的字元
    freq[ch] = (freq[ch] || 0) + 1;

    // 用 setTimeout(0) 人為切成很多小任務，模擬「真的很耗時」的運算，
    // 並每隔一小段距離回報一次進度，方便肉眼觀察進度條變化。
    if (i % 400 === 0) {
      const percent = Math.floor((i / total) * 100);
      if (progressView) {
        // Atomics.store：原子寫入索引 0，主執行緒那邊用 Atomics.load 讀
        Atomics.store(progressView, 0, percent);
      } else {
        self.postMessage({ type: "progress", percent });
      }
    }
  }

  if (progressView) Atomics.store(progressView, 0, 100);
  else self.postMessage({ type: "progress", percent: 100 });

  // 依出現次數排序，只取前 15 名字元，避免結果太長
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  self.postMessage({ type: "result", top });
};
