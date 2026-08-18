import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  generatePwaSetFromSource,
  MASKABLE_SCALE,
  pngToIco,
} from "@/lib/pwa-icon-generate";

async function squarePng(size: number): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 74, g: 222, b: 128, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

describe("generatePwaSetFromSource", () => {
  it("emits every home-screen size from a 512 source", async () => {
    const set = await generatePwaSetFromSource(await squarePng(512));
    const dims = async (buf: Buffer) => {
      const m = await sharp(buf).metadata();
      return { w: m.width, h: m.height };
    };
    expect(await dims(set.any192)).toEqual({ w: 192, h: 192 });
    expect(await dims(set.any512)).toEqual({ w: 512, h: 512 });
    expect(await dims(set.maskable192)).toEqual({ w: 192, h: 192 });
    expect(await dims(set.maskable512)).toEqual({ w: 512, h: 512 });
    expect(await dims(set.appleTouch)).toEqual({ w: 180, h: 180 });
    expect(await dims(set.faviconPng)).toEqual({ w: 32, h: 32 });
    expect(set.faviconIco.readUInt16LE(2)).toBe(1);
    expect(set.faviconIco[6]).toBe(32);
    expect(set.faviconIco[7]).toBe(32);
  });

  it("pads maskable icons to the 0.8 inner scale", () => {
    expect(Math.round(512 * MASKABLE_SCALE)).toBe(410);
    expect(Math.round(192 * MASKABLE_SCALE)).toBe(154);
  });
});

describe("pngToIco", () => {
  it("writes a single ICONDIRENTRY", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const ico = pngToIco(png, 32);
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(1);
    expect(ico[6]).toBe(32);
    expect(ico.readUInt32LE(14)).toBe(png.length);
  });
});
