import { defineConfig } from "vite";

// ────────────────────────────────────────────────────────────────
// 為什麼一定要有這段設定？
//
// SharedArrayBuffer 自 2018 年 Spectre 漏洞後被瀏覽器預設停用，
// 2020 年起改為：只要頁面滿足「Cross-Origin Isolation（跨來源隔離）」
// 這兩個 HTTP 回應標頭，就能重新啟用。
//   - Cross-Origin-Opener-Policy: same-origin
//   - Cross-Origin-Embedder-Policy: require-corp
// 來源：MDN Web Docs, SharedArrayBuffer 條目「安全需求」章節［高信心，一手/二手技術文件交叉驗證］。
//
// 同一組標頭也是 @sqlite.org/sqlite-wasm 官方 README 明確要求的前提，
// 因為 OPFS 的 createSyncAccessHandle()（同步存取控制代碼）只有在
// 跨來源隔離環境下才會啟用最完整的併發語意（多連線 + 單一寫入交易）。
// 來源：sqlite.org/wasm 官方文件、@sqlite.org/sqlite-wasm npm README［高信心，官方一手文件］。
// ────────────────────────────────────────────────────────────────
export default defineConfig({
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  optimizeDeps: {
    // 官方 README 建議：排除 sqlite-wasm，避免 Vite 的預打包
    // 破壞其內部載入 .wasm 檔案的相對路徑邏輯。
    exclude: ["@sqlite.org/sqlite-wasm"],
  },
  worker: {
    // Worker 內也要用 import 語法（ESM），才能在 SharedWorker /
    // 一般 Worker 裡面 import sqlite3InitModule。
    format: "es",
  },
});
