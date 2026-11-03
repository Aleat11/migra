#!/usr/bin/env node
// Pure-Node PNG icon generator (zero extra dependencies) for PWA / Play Store TWA.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// CRC32 table for PNG chunks
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function makeIcon(size) {
  // raw scanlines: 1 filter byte + RGBA per pixel
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    raw[row] = 0; // filter None
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * size);
      // teal (#0d9488) -> indigo (#4f46e5) gradient
      let r = Math.round(13 + (79 - 13) * t);
      let g = Math.round(148 + (70 - 148) * t);
      let b = Math.round(136 + (229 - 136) * t);

      // white calm wave in the middle (safe inside maskable 80% circle)
      const nx = x / size;
      const ny = y / size;
      if (nx >= 0.2 && nx <= 0.8) {
        const u = (nx - 0.2) / 0.6;
        const wy = 0.5 + 0.09 * Math.sin(u * Math.PI * 2.2);
        const d = Math.abs(ny - wy);
        const stroke = 0.042;
        if (d < stroke) {
          const a = Math.max(0, Math.min(1, (stroke - d) / (stroke * 0.35)));
          r = Math.round(r + (255 - r) * a);
          g = Math.round(g + (255 - g) * a);
          b = Math.round(b + (255 - b) * a);
        }
      }
      const p = row + 1 + x * 4;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const s of [192, 512]) {
  writeFileSync(join(pub, `icon-${s}.png`), makeIcon(s));
}
console.log("Wrote public/icon-192.png and public/icon-512.png");
