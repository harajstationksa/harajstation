// Generates the PWA icon set (192/512 PNG) from src/app/icon.png using a
// pure-Node bilinear resampler (no native image deps). Run once:
//   node scripts/gen-pwa-icons.mjs
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import zlib from "node:zlib";

const SRC = join(process.cwd(), "src", "app", "icon.png");
const OUT_DIR = join(process.cwd(), "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

// ── minimal PNG decode (RGBA8, non-interlaced) ──
function decodePng(buf) {
  let pos = 8; // skip signature
  let width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw new Error("only 8-bit RGBA non-interlaced PNGs supported");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const px = Buffer.alloc(width * height * 4);
  // un-filter scanlines
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[x - 4] : 0;
      const b = prev[x];
      const c = x >= 4 ? prev[x - 4] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      out[x] = v;
    }
    prev = out;
  }
  return { width, height, px };
}

// ── bilinear resample ──
function resize(img, w) {
  const h = w;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) * (img.height / h) - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(img.height - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * (img.width / w) - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(img.width - 1, x0 + 1);
      const fx = sx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = img.px[(y0 * img.width + x0) * 4 + c];
        const p01 = img.px[(y0 * img.width + x1) * 4 + c];
        const p10 = img.px[(y1 * img.width + x0) * 4 + c];
        const p11 = img.px[(y1 * img.width + x1) * 4 + c];
        out[(y * w + x) * 4 + c] = Math.round(
          p00 * (1 - fx) * (1 - fy) + p01 * fx * (1 - fy) + p10 * (1 - fx) * fy + p11 * fx * fy
        );
      }
    }
  }
  return { width: w, height: h, px: out };
}

// ── minimal PNG encode (RGBA8, filter 0) ──
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(img) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // RGBA8
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    img.px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const src = decodePng(readFileSync(SRC));
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(resize(src, size)));
  console.log("✓", file);
}
// the original also serves as the push-notification icon at /icon.png
copyFileSync(SRC, join(process.cwd(), "public", "icon.png"));
console.log("✓ public/icon.png");
