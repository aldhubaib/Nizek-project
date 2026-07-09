"use server";

import sharp from "sharp";
import { updateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { BRANDING_CACHE_TAG } from "@/lib/branding";
import { generateR2Key, uploadToR2, deleteFromR2 } from "@/lib/r2";
import {
  getBrandingSlot,
  storageSlotsFor,
  validateBrandingFile,
  MAX_BRANDING_FILE_BYTES,
  type BrandingSlotId,
} from "@/lib/branding-slots";

export type BrandingAssetDTO = {
  slot: BrandingSlotId;
  url: string;
  name: string;
  mime: string;
  width: number;
  height: number;
  size: number;
  updatedAt: number;
};

async function requireBrandingEditor() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Permission denied");
  return user;
}

// Authenticated read for the settings screen.
export async function getBrandingAssets(): Promise<
  Partial<Record<BrandingSlotId, BrandingAssetDTO>>
> {
  await requireBrandingEditor();

  const rows = await prisma.brandingAsset.findMany();
  const bySlot = new Map(rows.map((r) => [r.slot, r]));

  const result: Partial<Record<BrandingSlotId, BrandingAssetDTO>> = {};
  for (const slot of [
    "favicon",
    "faviconDark",
    "appleTouchIcon",
    "androidAny",
    "androidMaskable",
    "webLogo",
    "ogImage",
    "androidMonochrome",
    "iosSplash",
  ] as BrandingSlotId[]) {
    // For the Android slots prefer the 512 row (better preview quality).
    const row = storageSlotsFor(slot)
      .slice()
      .reverse()
      .map((s) => bySlot.get(s))
      .find(Boolean);
    if (!row) continue;
    result[slot] = {
      slot,
      url: row.url,
      name: row.fileName,
      mime: row.contentType,
      width: row.width,
      height: row.height,
      size: row.size,
      updatedAt: row.updatedAt.getTime(),
    };
  }
  return result;
}

// ICO isn't supported by sharp — read the first ICONDIRENTRY from the header.
function icoDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 8) return null;
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  return {
    width: buf[6] === 0 ? 256 : buf[6],
    height: buf[7] === 0 ? 256 : buf[7],
  };
}

// Detect the real format from the file bytes (magic numbers) — the browser's
// reported mime type comes from the file extension and can be spoofed.
function sniffMime(bytes: Buffer): string | null {
  if (bytes.length >= 8 && bytes.readUInt32BE(0) === 0x89504e47) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes.readUInt16LE(0) === 0 &&
    bytes.readUInt16LE(2) === 1
  ) {
    return "image/x-icon";
  }
  const head = bytes
    .subarray(0, 512)
    .toString("utf8")
    .replace(/^\uFEFF/, "")
    .trimStart();
  if (
    head.startsWith("<svg") ||
    ((head.startsWith("<?xml") || head.startsWith("<!DOCTYPE svg")) &&
      head.includes("<svg"))
  ) {
    return "image/svg+xml";
  }
  return null;
}

async function measureBytes(
  bytes: Buffer,
  mime: string,
): Promise<{ width: number; height: number }> {
  if (mime === "image/svg+xml") return { width: 0, height: 0 };
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") {
    const dims = icoDimensions(bytes);
    if (!dims) throw new Error("Could not read image dimensions");
    return dims;
  }
  const meta = await sharp(bytes).metadata();
  if (!meta.width || !meta.height)
    throw new Error("Could not read image dimensions");
  return { width: meta.width, height: meta.height };
}

async function upsertAsset(
  slot: string,
  data: {
    bytes: Buffer;
    mime: string;
    fileName: string;
    width: number;
    height: number;
  },
) {
  const key = generateR2Key("branding", data.fileName || "logo.png");
  const url = await uploadToR2(data.bytes, key, data.mime);

  const existing = await prisma.brandingAsset.findUnique({ where: { slot } });
  await prisma.brandingAsset.upsert({
    where: { slot },
    create: {
      slot,
      url,
      r2Key: key,
      contentType: data.mime,
      fileName: data.fileName,
      width: data.width,
      height: data.height,
      size: data.bytes.byteLength,
    },
    update: {
      url,
      r2Key: key,
      contentType: data.mime,
      fileName: data.fileName,
      width: data.width,
      height: data.height,
      size: data.bytes.byteLength,
    },
  });
  if (existing) await deleteFromR2(existing.r2Key).catch(() => {});
}

export async function setBrandingAsset(formData: FormData): Promise<void> {
  await requireBrandingEditor();

  const slotId = String(formData.get("slot") || "");
  const slot = getBrandingSlot(slotId);
  if (!slot) throw new Error("Unknown logo slot");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("No image provided");
  }
  if (file.size > MAX_BRANDING_FILE_BYTES) {
    throw new Error(
      `File is too large. Maximum is ${MAX_BRANDING_FILE_BYTES / (1024 * 1024)} MB.`,
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  // Validate against the real (sniffed) format, not the browser-reported one.
  const mime = sniffMime(bytes);
  if (!mime) {
    throw new Error(`Wrong format. Expected ${slot.formatsLabel}.`);
  }
  const dims = await measureBytes(bytes, mime);

  const error = validateBrandingFile(slot, mime, file.name, dims);
  if (error) throw new Error(error);

  // iOS ignores alpha on home-screen icons and fills transparency with solid
  // black, which mangles most artwork — flatten onto the brand background so
  // the Settings preview shows exactly what the home screen will show.
  let finalBytes = bytes;
  if (slot.id === "appleTouchIcon" && mime === "image/png") {
    finalBytes = await sharp(bytes)
      .flatten({ background: "#0e0e10" })
      .png()
      .toBuffer();
  }

  if (slot.id === "androidAny" || slot.id === "androidMaskable") {
    // Store both manifest sizes of the same artwork; the size that wasn't
    // uploaded is generated with sharp.
    for (const size of [192, 512]) {
      const resized =
        dims.width === size
          ? bytes
          : await sharp(bytes).resize(size, size).png().toBuffer();
      await upsertAsset(`${slot.id}${size}`, {
        bytes: resized,
        mime: "image/png",
        fileName: file.name,
        width: size,
        height: size,
      });
    }
    updateTag(BRANDING_CACHE_TAG);
    return;
  }

  await upsertAsset(slot.id, {
    bytes: finalBytes,
    mime,
    fileName: file.name,
    width: dims.width,
    height: dims.height,
  });
  updateTag(BRANDING_CACHE_TAG);
}

export async function removeBrandingAsset(
  slotId: BrandingSlotId,
): Promise<void> {
  await requireBrandingEditor();

  const slot = getBrandingSlot(slotId);
  if (!slot) throw new Error("Unknown logo slot");

  const storageSlots = storageSlotsFor(slot.id);
  const rows = await prisma.brandingAsset.findMany({
    where: { slot: { in: storageSlots } },
  });
  if (rows.length === 0) return;

  await Promise.all(rows.map((r) => deleteFromR2(r.r2Key).catch(() => {})));
  await prisma.brandingAsset.deleteMany({
    where: { slot: { in: rows.map((r) => r.slot) } },
  });
  updateTag(BRANDING_CACHE_TAG);
}
