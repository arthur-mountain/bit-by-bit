// ═══════════════════════════════════════════════════════════
// main.js — 主執行緒（UI 執行緒）
// 負責把畫面上看到的 5 個知識點兜在一起：
//   1) Service Worker：離線 app shell
//   2) Shared Worker：跨分頁共用同一個 SQLite(OPFS) 連線
//   3) （Shared Worker 內部使用）WASM SQLite + OPFS：真正落地存資料
//   4) Web Worker：背景統計運算
//   5) SharedArrayBuffer + Atomics：worker → 主執行緒的高頻進度回報
// ═══════════════════════════════════════════════════════════

const $ = (sel) => document.querySelector(sel);

// ── 1) Service Worker ────────────────────────────────────────
// 基礎語法：navigator.serviceWorker.register(scriptURL) 回傳 Promise，
// resolve 後拿到 ServiceWorkerRegistration。
async function setupServiceWorker() {
  const statusEl = $("#sw-status");
  if (!("serviceWorker" in navigator)) {
    statusEl.innerHTML = '瀏覽器不支援 <span class="badge bad">不支援</span>';
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    statusEl.innerHTML = `已註冊，scope=${reg.scope} <span class="badge ok">離線可用</span>`;
  } catch (err) {
    statusEl.innerHTML = `註冊失敗：${err} <span class="badge bad">失敗</span>`;
  }

  const netEl = $("#net-status");
  const updateNet = () => {
    netEl.innerHTML = navigator.onLine
      ? '線上 <span class="badge ok">online</span>'
      : '離線（改由 Service Worker 快取回應）<span class="badge warn">offline</span>';
  };
  window.addEventListener("online", updateNet);
  window.addEventListener("offline", updateNet);
  updateNet();
}

// ── 2) + 3) Shared Worker（內部跑 SQLite/OPFS）─────────────────
// 基礎語法：
//   const sw = new SharedWorker(url, { type: 'module', name: '...' });
//   sw.port.start();
//   sw.port.postMessage(data);
//   sw.port.onmessage = (e) => {...};
// 這裡額外包一層「RPC」：每次呼叫都帶一個遞增的 id，
// 靠 Promise + Map 把「送出請求」跟「收到對應回應」配對起來，
// 讓呼叫端可以直接 `await callDb('add', {...})`。
let rpcSeq = 0;
const pendingRpc = new Map();

function setupSharedDbWorker() {
  const worker = new SharedWorker(
    new URL("./shared-db-worker.js", import.meta.url),
    { type: "module", name: "notes-db" },
  );
  worker.port.start();

  worker.port.onmessage = (e) => {
    const data = e.data;

    // 有 id → 這是某次 RPC 呼叫的回應，去 Map 裡找出對應的 resolve/reject
    if (data && typeof data.id === "number" && pendingRpc.has(data.id)) {
      const { resolve, reject } = pendingRpc.get(data.id);
      pendingRpc.delete(data.id);
      data.ok ? resolve(data.result) : reject(new Error(data.error));
      return;
    }

    // 沒有 id → 這是 SharedWorker 主動廣播的訊息（非請求—回應模式）
    if (data.type === "notes-changed") renderNotes(data.notes);
    if (data.type === "tab-count") $("#tab-count").textContent = data.count;
  };

  function callDb(action, payload) {
    const id = ++rpcSeq;
    return new Promise((resolve, reject) => {
      pendingRpc.set(id, { resolve, reject });
      worker.port.postMessage({ id, action, payload });
    });
  }

  // 分頁關閉前，主動通知 SharedWorker「我要離開了」，
  // 讓分頁數統計盡量準確（SharedWorker 沒有原生的斷線事件）。
  window.addEventListener("beforeunload", () => {
    worker.port.postMessage({ action: "bye" });
  });

  return { callDb };
}

function renderNotes(notes) {
  const ul = $("#notes");
  ul.innerHTML = "";
  for (const n of notes) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${escapeHtml(n.content)}<br><small class="hint">${n.created_at}</small></span>`;
    const btn = document.createElement("button");
    btn.textContent = "刪除";
    btn.onclick = () =>
      window.__db.callDb("delete", { id: n.id }).then(renderNotes);
    li.appendChild(btn);
    ul.appendChild(li);
  }
}

function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// ── 4) + 5) Web Worker + SharedArrayBuffer/Atomics ────────────
function setupStatsWorker() {
  const coiEl = $("#coi-status");
  const supportsSAB =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  coiEl.innerHTML = supportsSAB
    ? 'true <span class="badge ok">SharedArrayBuffer 可用</span>'
    : 'false <span class="badge warn">退回 postMessage 回報進度</span>';

  const worker = new Worker(new URL("./stats-worker.js", import.meta.url), {
    type: "module",
  });
  const progressEl = $("#stats-progress");
  const resultEl = $("#stats-result");

  let sab = null;
  let progressView = null;
  let rafId = null;

  function pollSharedProgress() {
    progressEl.value = Atomics.load(progressView, 0);
    rafId = requestAnimationFrame(pollSharedProgress);
  }

  worker.onmessage = (e) => {
    const { type, percent, top } = e.data;
    if (type === "progress") progressEl.value = percent; // 退化路徑（無 SAB）
    if (type === "result") {
      cancelAnimationFrame(rafId);
      progressEl.value = 100;
      resultEl.textContent = top.map(([ch, n]) => `${ch}\t${n} 次`).join("\n");
    }
  };

  return {
    run(text) {
      resultEl.textContent = "分析中…";
      progressEl.value = 0;

      const payload = { text };
      if (supportsSAB) {
        // 官方建議寫法：只有 crossOriginIsolated 為 true 才建立 SharedArrayBuffer，
        // 否則直接建立就會丟出例外。
        sab = new SharedArrayBuffer(4); // 1 個 32-bit 整數：目前進度百分比
        progressView = new Int32Array(sab);
        Atomics.store(progressView, 0, 0);
        payload.progressBuffer = sab;
        pollSharedProgress();
      }
      worker.postMessage(payload);
    },
  };
}

// ── 兜起來 ─────────────────────────────────────────────────────
async function main() {
  await setupServiceWorker();

  const dbApi = setupSharedDbWorker();
  window.__db = dbApi; // 給 renderNotes 裡的刪除按鈕使用
  const initialNotes = await dbApi.callDb("init", {});
  renderNotes(initialNotes);

  $("#add-note").addEventListener("click", async () => {
    const input = $("#note-input");
    const content = input.value.trim();
    if (!content) return;
    input.value = "";
    await dbApi.callDb("add", { content });
    // 畫面更新其實會透過 SharedWorker 的 broadcast('notes-changed') 觸發，
    // 這裡不用手動 renderNotes，其他分頁也會同步收到。
  });

  const stats = setupStatsWorker();
  $("#run-stats").addEventListener("click", async () => {
    const notes = await dbApi.callDb("init", {}); // 重新取一次最新筆記
    const text = notes.map((n) => n.content).join("\n");
    stats.run(text || "（目前沒有筆記，仍會示範進度條與 Worker 流程）");
  });
}

main();
