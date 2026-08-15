import sharp from "sharp";

/** Brand fill used when flattening alpha and padding maskable icons. */
export const PWA_ICON_BG = "#0e0e10";

/** Inner artwork scale for Android maskable (outer ~10% is cropped by the OS). */
export const MASKABLE_SCALE = 0.8;

export type PwaGeneratedSet = {
  any192: Buffer;
  any512: Buffer;
  maskable192: Buffer;
  maskable512: Buffer;
  appleTouch: Buffer;
  faviconPng: Buffer;
  faviconIco: Buffer;
};

/** Wrap a PNG buffer in a single-image .ico container. */
export function pngToIco(pngBuf: Buffer, dim: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(dim >= 256 ? 0 : dim, 0);
  entry.writeUInt8(dim >= 256 ? 0 : dim, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

function padForMaskable(size: number): {
  inner: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const inner = Math.round(size * MASKABLE_SCALE);
  const pad = size - inner;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  const top = Math.floor(pad / 2);
  const bottom = pad - top;
  return { inner, top, bottom, left, right };
}

async function flattenResize(source: Buffer, size: number): Promise<Buffer> {
  return sharp(source)
    .flatten({ background: PWA_ICON_BG })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
}

async function maskableSquare(source: Buffer, size: number): Promise<Buffer> {
  const { inner, top, bottom, left, right } = padForMaskable(size);
  return sharp(source)
    .flatten({ background: PWA_ICON_BG })
    .resize(inner, inner, { fit: "contain", background: PWA_ICON_BG })
    .extend({ top, bottom, left, right, background: PWA_ICON_BG })
    .png()
    .toBuffer();
}

/**
 * Derive every home-screen / favicon size the OS fetches from one square PNG.
 * Does not produce webLogo, ogImage, splash, or monochrome — those stay
 * independent overrides.
 */
export async function generatePwaSetFromSource(
  source: Buffer,
): Promise<PwaGeneratedSet> {
  const [any192, any512, maskable192, maskable512, appleTouch, faviconPng] =
    await Promise.all([
      flattenResize(source, 192),
      flattenResize(source, 512),
      maskableSquare(source, 192),
      maskableSquare(source, 512),
      flattenResize(source, 180),
      flattenResize(source, 32),
    ]);

  return {
    any192,
    any512,
    maskable192,
    maskable512,
    appleTouch,
    faviconPng,
    faviconIco: pngToIco(faviconPng, 32),
  };
}

export { padForMaskable };
