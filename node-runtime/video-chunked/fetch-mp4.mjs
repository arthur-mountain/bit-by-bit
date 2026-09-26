import fs from "node:fs/promises";

async function parseMP4Boxes(url) {
  // 先用 fetch 把檔案讀成 ArrayBuffer
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  const view = new DataView(buffer);
  let offset = 0;

  while (offset < buffer.byteLength) {
    // 讀 4 bytes 當長度（big endian）
    const boxSize = view.getUint32(offset, false); // false = big endian

    // 讀接下來 4 bytes 當 box type (ASCII code)
    const typeArray = [];
    for (let i = 0; i < 4; i++) {
      typeArray.push(String.fromCharCode(view.getUint8(offset + 4 + i)));
    }
    const boxType = typeArray.join("");

    console.log(`Box: ${boxType}, Size: ${boxSize} bytes, Offset: ${offset}`);

    // 跳到下一個 box
    if (boxSize === 0) {
      // boxSize=0 代表到檔案結尾
      break;
    }
    if (boxSize < 8) {
      console.warn(`Invalid box size ${boxSize} at offset ${offset}`);
      break;
    }
    offset += boxSize;
  }
}

async function parseMP4BoxesLocally(filePath) {
  // 用 fs 讀取檔案
  const buffer = await fs.readFile(filePath);

  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );

  let offset = 0;
  while (offset < buffer.byteLength) {
    // 安全檢查：剩餘資料不足 8 bytes 就跳出
    if (offset + 8 > buffer.byteLength) {
      console.warn(`剩餘資料不足 8 bytes，offset=${offset}`);
      break;
    }

    const boxSize = view.getUint32(offset, false); // big endian
    const typeArray = [];
    for (let i = 0; i < 4; i++) {
      typeArray.push(String.fromCharCode(view.getUint8(offset + 4 + i)));
    }
    const boxType = typeArray.join("");

    console.log(`Box: ${boxType}, Size: ${boxSize} bytes, Offset: ${offset}`);

    if (boxSize === 0) break; // 到檔案尾端
    if (boxSize < 8) {
      console.warn(`Invalid box size ${boxSize} at offset ${offset}`);
      break;
    }

    offset += boxSize;
  }
}

if (process.argv[2]) {
  if (
    process.argv[2].startsWith("http://") ||
    process.argv[2].startsWith("https://")
  ) {
    parseMP4Boxes(process.argv[2]);
  } else if (
    process.argv[2].startsWith("./") ||
    process.argv[2].startsWith("/")
  ) {
    parseMP4BoxesLocally(process.argv[2]);
  }
} else {
  console.error("請指定 MP4 檔案位置");
}
