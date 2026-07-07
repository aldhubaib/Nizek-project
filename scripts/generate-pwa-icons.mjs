// Generates the static PWA / favicon assets shipped in /public so the app is
// installable out of the box (before any custom branding is uploaded).
// Run: node scripts/generate-pwa-icons.mjs
import sharp from "sharp";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const BG = "#0a0a0a";
const FG = "#4ade80";

// Bold "N" mark drawn as a vector path in a 100x100 space.
const N_PATH =
  "M18,80 L18,20 L34,20 L66,62 L66,20 L82,20 L82,80 L66,80 L34,38 L34,80 Z";

function svg({ size, rounded, scale }) {
  // `scale` shrinks the mark for maskable safe zones. Center after scaling.
  const s = scale ?? 1;
  const translate = (100 * (1 - s)) / 2;
  const radius = rounded ? 22 : 0;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${radius}" ry="${radius}" fill="${BG}"/>
  <g transform="translate(${translate}, ${translate}) scale(${s})">
    <path d="${N_PATH}" fill="${FG}"/>
  </g>
</svg>`);
}

async function png(svgBuf, size, out) {
  const buf = await sharp(svgBuf).resize(size, size).png().toBuffer();
  await writeFile(join(publicDir, out), buf);
  return buf;
}

// Wraps a PNG buffer in a single-image .ico container.
function pngToIco(pngBuf, dim) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count
  const entry = Buffer.alloc(16);
  entry.writeUInt8(dim >= 256 ? 0 : dim, 0); // width
  entry.writeUInt8(dim >= 256 ? 0 : dim, 1); // height
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngBuf.length, 8); // size of image data
  entry.writeUInt32LE(6 + 16, 12); // offset of image data
  return Buffer.concat([header, entry, pngBuf]);
}

async function main() {
  await png(svg({ size: 192, rounded: true }), 192, "icon-192.png");
  await png(svg({ size: 512, rounded: true }), 512, "icon-512.png");
  await png(svg({ size: 192, scale: 0.7 }), 192, "icon-maskable-192.png");
  await png(svg({ size: 512, scale: 0.7 }), 512, "icon-maskable-512.png");
  await png(svg({ size: 180, rounded: true }), 180, "apple-touch-icon.png");

  const fav = await png(svg({ size: 32, rounded: true }), 32, "favicon.png");
  await writeFile(join(publicDir, "favicon.ico"), pngToIco(fav, 32));

  console.log("PWA icons written to /public");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
