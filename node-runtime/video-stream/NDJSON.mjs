import http from "node:http";

http
  .createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const message = "Hello, this is a streamed AI-style response!";
    let i = 0;

    const interval = setInterval(() => {
      if (i >= message.length) {
        res.write(JSON.stringify({ done: true }) + "\n");
        res.end(); // 傳完結束 stream
        clearInterval(interval);
        return;
      }

      const chunk = {
        token: message[i],
      };

      res.write(JSON.stringify(chunk) + "\n");
      i++;
    }, 100); // 每 100ms 傳一個字
  })
  .listen(8081, () => {
    console.log("AI 模擬 stream server 在 http://localhost:8081");
  });
