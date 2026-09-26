import fs from "node:fs";

function readMagicNumber(filePath, length = 8) {
  return new Promise((resolve, reject) => {
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(filePath, "r");
    fs.read(fd, buffer, 0, length, 0, (err, bytesRead, buf) => {
      fs.closeSync(fd);
      if (err) {
        reject(err);
        return;
      }
      resolve(buf.slice(0, bytesRead));
    });
  });
}

async function identifyFileFormat(filePath) {
  try {
    const magic = await readMagicNumber(filePath, 8);

    console.log(`Magic Number: ${magic}`);

    const hex = magic.toString("hex").toUpperCase();

    console.log(`Magic Number (hex): ${hex}`);

    if (hex.startsWith("89504E47")) {
      console.log("File format: PNG");
    } else if (hex.startsWith("FFD8FF")) {
      console.log("File format: JPEG");
    } else if (hex.includes("66747970")) {
      // 'ftyp' in ASCII is 66 74 79 70
      console.log("File format: MP4 (ISO BMFF)");
    } else {
      console.log("Unknown or unsupported file format.");
    }
  } catch (error) {
    console.error("Error reading file:", error);
  }
}

if (process.argv[2]) {
  identifyFileFormat(process.argv[2]);
} else {
  console.error("請指定 MP4 檔案位置");
}
