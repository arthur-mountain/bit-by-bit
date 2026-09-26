# Bit-by-Bit

> **From raw bytes to modern APIs: A bottom-up sandbox for core runtime mechanisms.**

個人的技術實驗室（Sandbox），**Bottom-up** 理解技術。沒有厚重的商業邏輯或現代前端 UI 框架，只有最純粹的核心機制探索。嘗試主要分為兩個面向：

1. **手工打造（Handcrafted Internals）**：拒絕黑盒子，直接用原生 API 手刻協定、拆解位元組（Bytes）與資料串流。

2. **現代特性能導（Modern Feature Demos）**：熟練駕馭現代 Runtimes 與 WebAPIs 的進階特性（如多執行緒、持久化、記憶體共享），並做出嚴謹的 MVP 概念驗證。

---

## 實驗項目索引 (Labs Catalog)

| 實驗主題 (Lab Name)                                    | 類型 / 核心技術                                       | 鑽研重點 / 解決的邊界問題                                                                                                                     |
| :----------------------------------------------------- | :---------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| [`workers-and-wasm-sqlite`](./workers-and-wasm-sqlite) | `Modern API` / `Shared Worker`, `OPFS`, `SQLite Wasm` | **Worker 組合包 MVP**：解決多視窗搶鎖問題。透過 Shared Worker 集中管理 SQLite 核心連線，並利用 `SharedArrayBuffer` 進行無損耗的高頻進度回報。 |
| [`video-stream`](./video-stream)                       | `Handcrafted` / `Node.js http`, `NDJSON Stream`       | **串流伺服器**：無框架手刻 HTTP 伺服器，啟用 `Transfer-Encoding: chunked`，實現基於二進位區塊（Chunked）的 NDJSON 逐字推送機制。              |
| [`identify-file-format`](./identify-file-format)       | `Handcrafted` / `Node.js fs`, `Magic Number`          | **二進位魔術位元組解析**：直接透過核心 `fs.read` 提取檔案前 8 個位元組，在位元組層級（Byte-level）透過十六進位特徵碼精準判斷檔案格式。        |

---

## Repository 結構 (Directory Structure)

專案不限於特定平台，依據運作環境與核心領域進行分類：

```plaintext
bit-by-bit/
├── browser/                  # Browser / Web APIs 核心嘗試
│   └── workers-and-wasm-sqlite/
├── node-runtime/             # Node Runtime
│   ├── video-stream/
│   └── identify-file-format/
└── README.md                 # 本索引文件
```
