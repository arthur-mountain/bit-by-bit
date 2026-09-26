import http from "node:http";

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    // 設定 headers，告訴 client 這是 chunked 傳輸
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let count = 0;

    // 每秒傳送一段資料
    const interval = setInterval(() => {
      count++;
      const chunk = `直播資料 chunk #${count}\n`;
      console.log(`送出: ${chunk.trim()}`);

      res.write(chunk);

      if (count >= 20) {
        // 模擬送 20 次後結束直播
        clearInterval(interval);
        res.end("直播結束\n");
      }
    }, 1000);
  })
  .listen(8080, () => {
    console.log("直播 stream 伺服器在 http://localhost:8080");
  });
