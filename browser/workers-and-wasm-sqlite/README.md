# Worker 組合包 MVP：多分頁協作筆記

一個刻意做得很小的示範專案，目標是把以下五個知識點放進「同一個、可以真的跑起來」的情境：

| 知識點                         | 在本專案的角色                                                           |
| ------------------------------ | ------------------------------------------------------------------------ |
| Web Worker（Dedicated Worker） | `src/stats-worker.js`：背景做字元頻率統計，不卡住 UI                     |
| Shared Worker                  | `src/shared-db-worker.js`：所有分頁共用「同一個」SQLite 連線             |
| Service Worker                 | `public/sw.js`：快取 app shell，離線也能開啟頁面                         |
| SQLite Wasm（OPFS 持久化）     | 跑在 Shared Worker 裡，資料實際落地在瀏覽器的 Origin Private File System |
| SharedArrayBuffer + Atomics    | 主執行緒與 stats-worker 之間，用共享記憶體回報進度，取代高頻 postMessage |

## 為什麼是「筆記 App」這個情境？

多分頁共用同一份資料是最容易讓人「有感」的情境：使用者常常會同時開兩三個分頁，
如果每個分頁各自對同一個 OPFS 檔案開一條 SQLite 連線，容易撞到
「同一時間只能有一個讀／寫交易」的限制（官方文件、以及提供離線優先同步引擎的
公司 PowerSync 在 2026-05 的技術部落格都描述了同一個限制）。
解法是把「唯一一條」DB 連線集中放進 Shared Worker，所有分頁改成送訊息請它代為讀寫，
天然避開多分頁搶鎖的問題——這也是這個 MVP 想示範的核心賣點，而不只是把五個 API 硬湊在一起。

## 執行方式

```bash
npm install
npm run dev
```

打開瀏覽器主控台看到的網址（預設 `http://localhost:5173`），建議：

1. **多開一個分頁**貼上同一個網址 → 觀察「目前開啟中的分頁數」即時 +1，
   在任一分頁新增筆記，另一分頁的清單也會即時同步（靠 Shared Worker 廣播）。
2. 打開 DevTools → Application → Service Workers，確認已註冊；接著切到
   Network 面板勾選「Offline」，重新整理仍能看到頁面（離線 app shell）。
3. 打開 DevTools → Application → Storage → Origin Private File System，
   可以看到實際的 `notes-app.sqlite3` 檔案（代表資料真的持久化了，不是純記憶體）。
4. 點「分析所有筆記的字元頻率」，觀察進度條——若主控台印出
   `crossOriginIsolated: true`，代表走的是 SharedArrayBuffer 路徑。

## 已知限制與版本備註（誠實列出，避免過度宣稱）

- **`@sqlite.org/sqlite-wasm` 版本**：官方 npm 頁面在不同時間點快取顯示的版本
  不一致（曾看到 `3.46.1-build4`、`3.50.3-build1` 等），而 sqlite.org 核心專案
  的變更記錄顯示 2026-04-09 已發布到 3.53.0（含新的 `opfs-wl` VFS）。
  `package.json` 裡先寫 `^3.50.0` 當佔位，**安裝前請自行執行
  `npm view @sqlite.org/sqlite-wasm version` 確認當下最新版本並鎖定**，
  這點屬於版本敏感內容，本文件不代為斷言確切版號〔版本未對齊，需自行核對〕。
- **Worker1 / Promiser1 API 已不建議使用**：官方倉庫已於 2026-04-15 將這組
  舊式封裝標示為 deprecated，本專案改用官方文件中「正確」的做法——直接在
  Worker/SharedWorker 內 `import sqlite3InitModule` 並自訂訊息協定。
- **OPFS 的 `createSyncAccessHandle` 瀏覽器支援**：依 caniuse 資料，Chrome、
  Firefox（111+）、Safari（15.2+）目前均已支援，但 Safari 早期版本一度有
  「寫入後讀回檔案大小為 0 bytes」的已知 bug 回報，正式產品建議在目標瀏覽器
  上實測，而不要只信任版本號［中信心：單一 GitHub issue 佐證，未見官方
  釐清是否已修復，本文件不代為斷言目前是否仍存在此問題〕。
- **多視窗的「分頁數統計」是概估值**，靠 `beforeunload` 主動通知，
  若分頁是被瀏覽器強制終止（例如電腦當機、手機記憶體回收）不會收到通知，
  數字可能會比實際多。正式產品建議搭配定期心跳（heartbeat）機制校正。
- Service Worker 採「執行時快取」而非建置期預快取清單，是為了讓 `npm run dev`
  就能示範，正式上線建議改用 `vite-plugin-pwa` 或 Workbox 產生精準清單。

## 檔案結構

```
worker-sqlite-demo/
├── index.html              主頁面
├── vite.config.js           COOP/COEP 標頭設定（SharedArrayBuffer / OPFS 前提）
├── package.json
├── public/
│   └── sw.js                Service Worker
└── src/
    ├── main.js               主執行緒：整合五個知識點
    ├── shared-db-worker.js    Shared Worker：集中管理 SQLite(OPFS)
    └── stats-worker.js        Web Worker：背景統計 + SharedArrayBuffer 回報進度
```
