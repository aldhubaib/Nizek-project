// Shared (client + server) definitions for the Settings → App Logo slots.
// Each slot enforces its format and dimensions before the file is accepted.

export type BrandingSlotId =
  | "favicon"
  | "faviconDark"
  | "appleTouchIcon"
  | "androidAny"
  | "androidMaskable"
  | "webLogo"
  | "ogImage"
  | "androidMonochrome"
  | "iosSplash";

// R2/DB rows are stored per concrete served asset. The two Android slots fan
// out into a 192 and a 512 row (the missing size is generated with sharp) so
// the PWA manifest always has both sizes of the same artwork.
export type BrandingStorageSlot =
  | "favicon"
  | "faviconDark"
  | "appleTouchIcon"
  | "androidAny192"
  | "androidAny512"
  | "androidMaskable192"
  | "androidMaskable512"
  | "webLogo"
  | "ogImage"
  | "androidMonochrome"
  | "iosSplash";

export function storageSlotsFor(slot: BrandingSlotId): BrandingStorageSlot[] {
  if (slot === "androidAny") return ["androidAny192", "androidAny512"];
  if (slot === "androidMaskable")
    return ["androidMaskable192", "androidMaskable512"];
  return [slot];
}

export type BrandingSlotConfig = {
  id: BrandingSlotId;
  title: string;
  optional?: boolean;
  formats: string[]; // mime types
  formatsLabel: string;
  accept: string; // input accept
  sizes: { w: number; h: number }[]; // acceptable dimensions
  sizesLabel: string;
  previewClass: string; // tailwind styling for preview surface
  previewShape?: "square" | "rounded" | "circle" | "wide";
  note?: string;
};

export const BRANDING_SLOTS: BrandingSlotConfig[] = [
  {
    id: "favicon",
    title: "Favicon (browser tab)",
    formats: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"],
    formatsLabel: "PNG or ICO",
    accept: ".png,.ico,image/png,image/x-icon,image/vnd.microsoft.icon",
    sizes: [
      { w: 32, h: 32 },
      { w: 16, h: 16 },
      { w: 48, h: 48 },
    ],
    sizesLabel: "32×32 (optionally 16×16, 48×48)",
    previewClass: "h-16 w-16",
    previewShape: "square",
  },
  {
    id: "faviconDark",
    title: "Favicon — dark mode (browser tab)",
    optional: true,
    formats: ["image/png", "image/x-icon", "image/vnd.microsoft.icon"],
    formatsLabel: "PNG or ICO",
    accept: ".png,.ico,image/png,image/x-icon,image/vnd.microsoft.icon",
    sizes: [
      { w: 32, h: 32 },
      { w: 16, h: 16 },
      { w: 48, h: 48 },
    ],
    sizesLabel: "32×32 (optionally 16×16, 48×48)",
    previewClass: "h-16 w-16",
    previewShape: "square",
    note: "Shown when the browser or OS uses a dark theme. If empty, the regular favicon is used everywhere.",
  },
  {
    id: "appleTouchIcon",
    title: "iOS PWA icon (apple-touch-icon)",
    formats: ["image/png"],
    formatsLabel: "PNG",
    accept: ".png,image/png",
    sizes: [{ w: 180, h: 180 }],
    sizesLabel: "180×180",
    previewClass: "h-20 w-20",
    previewShape: "rounded",
  },
  {
    id: "androidAny",
    title: "Android PWA icon — purpose: any",
    formats: ["image/png"],
    formatsLabel: "PNG",
    accept: ".png,image/png",
    sizes: [
      { w: 192, h: 192 },
      { w: 512, h: 512 },
    ],
    sizesLabel: "192×192 and 512×512",
    previewClass: "h-20 w-20",
    previewShape: "rounded",
    note: "Upload either size — the other is generated automatically.",
  },
  {
    id: "androidMaskable",
    title: "Android PWA icon — purpose: maskable",
    formats: ["image/png"],
    formatsLabel: "PNG",
    accept: ".png,image/png",
    sizes: [
      { w: 192, h: 192 },
      { w: 512, h: 512 },
    ],
    sizesLabel: "192×192 and 512×512",
    previewClass: "h-20 w-20",
    previewShape: "circle",
    note: "Leave a safe zone — outer 10% may be masked by the device.",
  },
  {
    id: "webLogo",
    title: "Web app logo (sidebar / login)",
    formats: ["image/svg+xml", "image/png"],
    formatsLabel: "SVG or PNG",
    accept: ".svg,.png,image/svg+xml,image/png",
    sizes: [{ w: 512, h: 512 }],
    sizesLabel: "Flexible, ~512×512 or SVG",
    previewClass: "h-20 w-20",
    previewShape: "square",
  },
  {
    id: "ogImage",
    title: "Social share image (OG image)",
    optional: true,
    formats: ["image/png", "image/jpeg"],
    formatsLabel: "PNG or JPG",
    accept: ".png,.jpg,.jpeg,image/png,image/jpeg",
    sizes: [{ w: 1200, h: 630 }],
    sizesLabel: "1200×630",
    previewClass: "h-[105px] w-[200px]",
    previewShape: "wide",
  },
  {
    id: "androidMonochrome",
    title: "Android monochrome icon",
    optional: true,
    formats: ["image/png"],
    formatsLabel: "PNG (white on transparent)",
    accept: ".png,image/png",
    sizes: [{ w: 512, h: 512 }],
    sizesLabel: "512×512",
    previewClass: "h-20 w-20",
    previewShape: "rounded",
  },
  {
    id: "iosSplash",
    title: "iOS splash screen",
    optional: true,
    formats: ["image/png"],
    formatsLabel: "PNG",
    accept: ".png,image/png",
    sizes: [
      { w: 1170, h: 2532 },
      { w: 1179, h: 2556 },
      { w: 1284, h: 2778 },
      { w: 828, h: 1792 },
    ],
    sizesLabel: "Many sizes per device",
    previewClass: "h-24 w-[54px]",
    previewShape: "rounded",
    note: "Upload one representative size; iOS uses many.",
  },
];

export function getBrandingSlot(id: string): BrandingSlotConfig | undefined {
  return BRANDING_SLOTS.find((s) => s.id === id);
}

// Generous cap — the largest legit asset (iOS splash PNG) stays well under
// this. Checked client-side for fast feedback and re-checked on the server.
export const MAX_BRANDING_FILE_BYTES = 10 * 1024 * 1024;

// Same validation on both sides: the client checks before uploading (inline
// error), the server re-checks the real bytes before storing.
export function validateBrandingFile(
  slot: BrandingSlotConfig,
  mime: string,
  fileName: string,
  dims: { width: number; height: number },
): string | null {
  const mimeOk =
    slot.formats.includes(mime) ||
    (mime === "" && /\.(ico|svg|png|jpe?g)$/i.test(fileName));
  if (!mimeOk) {
    return `Wrong format. Expected ${slot.formatsLabel}.`;
  }
  // SVG has no meaningful pixel size — skip dim check
  if (mime === "image/svg+xml") return null;
  const sizeOk = slot.sizes.some(
    (s) => s.w === dims.width && s.h === dims.height,
  );
  if (!sizeOk) {
    return `Wrong dimensions (${dims.width}×${dims.height}). Expected ${slot.sizesLabel}.`;
  }
  return null;
}
