"use server";

import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { getLiveLogos, invalidateBrandingCache } from "@/lib/branding";
import { publish } from "@/lib/centrifugo";
import { BRANDING_PUSHED_EVENT, globalPresenceChannel } from "@/lib/channels";
import { generateR2Key, uploadToR2, deleteFromR2, downloadFromR2 } from "@/lib/r2";
import {
  getBrandingSlot,
  storageSlotsFor,
  validateBrandingFile,
  MAX_BRANDING_FILE_BYTES,
  type BrandingSlotId,
} from "@/lib/branding-slots";
import { generatePwaSetFromSource } from "@/lib/pwa-icon-generate";

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
    "homeScreenSource",
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

/**
 * Every asset derived from one square source, in the order they are written.
 * `platform` is what the admin screen reports after a push — the file names
 * alone don't say which device they end up on.
 */
function derivedTargets(set: Awaited<ReturnType<typeof generatePwaSetFromSource>>) {
  return [
    {
      slot: "androidAny192",
      platform: "Android icon 192",
      bytes: set.any192,
      mime: "image/png",
      fileName: "icon-192.png",
      width: 192,
      height: 192,
    },
    {
      slot: "androidAny512",
      platform: "Android icon 512",
      bytes: set.any512,
      mime: "image/png",
      fileName: "icon-512.png",
      width: 512,
      height: 512,
    },
    {
      slot: "androidMaskable192",
      platform: "Android maskable 192",
      bytes: set.maskable192,
      mime: "image/png",
      fileName: "icon-maskable-192.png",
      width: 192,
      height: 192,
    },
    {
      slot: "androidMaskable512",
      platform: "Android maskable 512",
      bytes: set.maskable512,
      mime: "image/png",
      fileName: "icon-maskable-512.png",
      width: 512,
      height: 512,
    },
    {
      slot: "appleTouchIcon",
      platform: "iOS home screen",
      bytes: set.appleTouch,
      mime: "image/png",
      fileName: "apple-touch-icon.png",
      width: 180,
      height: 180,
    },
    {
      slot: "favicon",
      platform: "Browser tab",
      bytes: set.faviconIco,
      mime: "image/x-icon",
      fileName: "favicon.ico",
      width: 32,
      height: 32,
    },
  ] as const;
}

async function applyGeneratedPwaSet(set: Awaited<ReturnType<typeof generatePwaSetFromSource>>) {
  for (const t of derivedTargets(set)) {
    await upsertAsset(t.slot, {
      bytes: t.bytes,
      mime: t.mime,
      fileName: t.fileName,
      width: t.width,
      height: t.height,
    });
  }
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

  if (slot.id === "webLogo") {
    await upsertAsset("webLogo", {
      bytes: finalBytes,
      mime,
      fileName: file.name,
      width: dims.width,
      height: dims.height,
    });
    try {
      const set = await generatePwaSetFromSource(bytes);
      await applyGeneratedPwaSet(set);
    } catch {
      // SVG/odd artwork still saves as the sidebar logo even if derivatives fail.
    }
    invalidateBrandingCache();
    return;
  }

  if (slot.id === "homeScreenSource") {
    const set = await generatePwaSetFromSource(bytes);
    await upsertAsset("homeScreenSource", {
      bytes,
      mime: "image/png",
      fileName: file.name,
      width: dims.width,
      height: dims.height,
    });
    await applyGeneratedPwaSet(set);
    invalidateBrandingCache();
    return;
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
    invalidateBrandingCache();
    return;
  }

  await upsertAsset(slot.id, {
    bytes: finalBytes,
    mime,
    fileName: file.name,
    width: dims.width,
    height: dims.height,
  });
  invalidateBrandingCache();
}

export type BrandingPushResult = {
  /** Which upload the platform icons were rebuilt from. */
  sourceName: string;
  sourceSlot: "homeScreenSource" | "webLogo";
  /** Platform labels of everything that was rewritten. */
  rebuilt: string[];
  /** The push reached open tabs and installed apps over the realtime channel. */
  deliveredLive: boolean;
};

/**
 * Send the current logo to every surface at once: browser tab, iOS home screen,
 * and the Android manifest icons.
 *
 * Every derived slot is rewritten from the source, the same way uploading a new
 * source does — the source is what the platforms are meant to agree on, so a
 * push that left some of them behind would defeat the point. That rewrite is
 * also what moves the icons: Chrome treats an icon href as immutable, and each
 * fresh row lands on a new `/pwa-icons/<stamp>/…` path and lifts the manifest
 * query, which is the only thing an installed app notices.
 *
 * Assets that are never derived — the dark favicon, monochrome glyph, splash,
 * OG image, sidebar mark — are left untouched, artwork and URL both.
 */
export async function pushBrandingToAllPlatforms(): Promise<BrandingPushResult> {
  await requireBrandingEditor();

  const rows = await prisma.brandingAsset.findMany();
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  const source = bySlot.get("homeScreenSource") ?? bySlot.get("webLogo");
  if (!source) {
    throw new Error(
      "Nothing to push yet — upload the home screen source or the app logo first.",
    );
  }

  const sourceBytes = await downloadFromR2(source.r2Key);
  let set: Awaited<ReturnType<typeof generatePwaSetFromSource>>;
  try {
    set = await generatePwaSetFromSource(sourceBytes);
  } catch {
    throw new Error(
      `Could not read ${source.fileName} as an icon. Upload a square PNG as the home screen source, then push again.`,
    );
  }

  const rebuilt: string[] = [];
  for (const target of derivedTargets(set)) {
    await upsertAsset(target.slot, {
      bytes: target.bytes,
      mime: target.mime,
      fileName: target.fileName,
      width: target.width,
      height: target.height,
    });
    rebuilt.push(target.platform);
  }

  invalidateBrandingCache();

  let deliveredLive = false;
  try {
    await publish(globalPresenceChannel(), {
      type: BRANDING_PUSHED_EVENT,
      logos: await getLiveLogos(),
    });
    deliveredLive = true;
  } catch {
    // Realtime is best-effort: clients still converge on their next poll.
  }

  return {
    sourceName: source.fileName,
    sourceSlot: source.slot === "webLogo" ? "webLogo" : "homeScreenSource",
    rebuilt,
    deliveredLive,
  };
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
  invalidateBrandingCache();
}
