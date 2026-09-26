/**
 * Shared Worker（共享工作執行緒）＋ SQLite Wasm（OPFS 持久化）
 * ─────────────────────────────────────────────────────────
 * 基礎知識：Shared Worker
 * - 與 Web Worker（Dedicated Worker）最大差異：Dedicated Worker 只屬於「一個」
 *   建立它的分頁；SharedWorker 屬於「同一來源（origin）」的所有分頁／
 *   iframe 共用同一個執行緒實例，用 SharedWorkerGlobalScope 的
 *   `onconnect` 事件搭配 MessagePort 各自通訊。
 * - 2026-05 起，SharedWorker 已在 Chromium／Firefox／Safari 全數支援，
 *   MDN 標示為「Baseline 2026 Newly available」
 *   （來源：MDN Web Docs, SharedWorker() constructor 條目
 *   ［高信心，官方文件，多分頁共用工作執行緒的跨瀏覽器支援屬於近期才補齊，
 *   建議部署前仍實測目標瀏覽器版本］）。
 * - 語法骨架：
 *     const worker = new SharedWorker(url, { type: 'module', name: '...' });
 *     worker.port.start();
 *     worker.port.postMessage(payload);
 *     worker.port.onmessage = (e) => {...};
 *   worker 端則是：
 *     self.onconnect = (event) => {
 *       const port = event.ports[0];
 *       port.onmessage = (e) => {...};
 *     };
 *
 * 為什麼「情境」要用 SharedWorker 集中管理 SQLite？
 * - SQLite 編譯成 Wasm 後，OPFS 後端的併發規則是：「可以同時開多個連線，
 *   但同一時間只能有一個讀／寫交易在進行」。若每個分頁各自開一條 OPFS
 *   連線，容易出現鎖定衝突（database is locked）或效能競爭。
 *   把唯一一條 DB 連線集中放進 SharedWorker，所有分頁改成透過訊息
 *   RPC 存取，就能天然避免多分頁搶鎖的問題，這也是官方文件與
 *   PowerSync（提供離線優先同步引擎的公司）2026-05 部落格文章
 *   〈The Current State Of SQLite Persistence On The Web〉中，
 *   對瀏覽器內 SQLite 併發限制的具體描述［中信心：PowerSync 為銷售
 *   相關同步服務的廠商，內容屬其官方部落格，故標註利益衝突 [利益衝突]，
 *   但技術描述與 sqlite.org 官方文件交叉一致，故信心不因此被打到「低」］。
 *
 * 為什麼不用官方附的 sqlite3-worker1-promiser？
 * - @sqlite.org/sqlite-wasm 官方倉庫已於 2026-04-15 將 Worker1／
 *   Promiser1 這組封裝 API 標示為「deprecated（不建議再用於任何非玩具
 *   等級的專案）」，作者原話大意是它太脆弱、效能不佳、彈性也不足，
 *   官方建議的「正確用法」改為直接在 Worker/SharedWorker 內
 *   `import sqlite3InitModule` 後自行設計訊息協定（也就是本檔案的做法）。
 *   （來源：github.com/sqlite/sqlite-wasm README［高信心，官方一手文件，
 *   且屬版本敏感內容，本檔已對齊 2026-04-15 之後的建議做法]）。
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";

/** 所有目前連上這個 SharedWorker 的分頁（MessagePort） */
const ports = new Set();

/** db 尚未初始化前，先把訊息暫存起來，初始化完成後再依序處理 */
let db = null;
const dbReadyPromise = initDb();

async function initDb() {
  const sqlite3 = await sqlite3InitModule({
    // 把 sqlite3 的內部訊息導到 SharedWorker 自己的 console，方便除錯
    print: (...args) => console.log("[sqlite3]", ...args),
    printErr: (...args) => console.error("[sqlite3]", ...args),
  });

  // OPFS 是否可用的官方偵測方式：檢查 sqlite3 物件上是否存在 'opfs' 屬性。
  // 只有在「Worker 情境」+「跨來源隔離（COOP/COEP）」都成立時，
  // sqlite3.oo1.OpfsDb 才會出現，這也是為何 DB 一定要放進 Worker 家族
  // （這裡放在 SharedWorker）而不能放在主執行緒的原因。
  const database =
    "opfs" in sqlite3
      ? new sqlite3.oo1.OpfsDb("/notes-app.sqlite3")
      : new sqlite3.oo1.DB("/notes-app.sqlite3", "ct"); // 降級：純記憶體，重整後不保留

  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      content    TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  console.log(
    "opfs" in sqlite3
      ? `[shared-db-worker] OPFS 持久化資料庫已就緒：${database.filename}`
      : `[shared-db-worker] OPFS 不可用，改用暫存記憶體資料庫（不會持久化）`,
  );

  db = database;
  return database;
}

function listNotes() {
  const rows = [];
  db.exec({
    sql: "SELECT id, content, created_at FROM notes ORDER BY id DESC",
    rowMode: "object",
    resultRows: rows,
  });
  return rows;
}

function addNote(content) {
  db.exec({
    sql: "INSERT INTO notes (content) VALUES (?)",
    bind: [content],
  });
  return listNotes();
}

function deleteNote(id) {
  db.exec({ sql: "DELETE FROM notes WHERE id = ?", bind: [id] });
  return listNotes();
}

/** 廣播給「所有」分頁（含發起請求的那個），用於即時同步筆記列表 */
function broadcast(message) {
  for (const port of ports) port.postMessage(message);
}

function broadcastTabCount() {
  broadcast({ type: "tab-count", count: ports.size });
}

/**
 * SharedWorker 專屬事件：每當有新分頁呼叫 `new SharedWorker(...)` 連進來，
 * 就會觸發一次 onconnect，event.ports[0] 就是與該分頁溝通用的 MessagePort。
 */
self.onconnect = (event) => {
  const port = event.ports[0];
  ports.add(port);
  port.start(); // 使用 addEventListener 的寫法時必須手動呼叫 start()

  port.onmessage = async (e) => {
    const { id, action, payload } = e.data;

    // 分頁自己主動宣告要離開（在 main.js 的 beforeunload 送出），
    // SharedWorker 本身沒有原生的「port 已中斷」事件，這是常見的替代做法。
    if (action === "bye") {
      ports.delete(port);
      broadcastTabCount();
      return;
    }

    try {
      await dbReadyPromise; // 確保 DB 已經 init 完成
      let result;
      switch (action) {
        case "init":
          ports.add(port); // 保底：重複 add 不影響 Set 的唯一性
          broadcastTabCount();
          result = listNotes();
          break;
        case "add":
          result = addNote(payload.content);
          broadcast({ type: "notes-changed", notes: result });
          break;
        case "delete":
          result = deleteNote(payload.id);
          broadcast({ type: "notes-changed", notes: result });
          break;
        default:
          throw new Error(`未知的 action: ${action}`);
      }
      port.postMessage({ id, ok: true, result });
    } catch (err) {
      port.postMessage({ id, ok: false, error: String(err?.message ?? err) });
    }
  };
};
