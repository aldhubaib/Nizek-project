/** Clipboard shapes we can read without a real DataTransfer in tests. */
export type ClipboardLike = {
  items?: ArrayLike<{
    kind: string;
    type: string;
    getAsFile: () => File | null;
  }>;
  files?: ArrayLike<File>;
};

const GENERIC_IMAGE_NAME = /^(image|blob|untitled)(\.(png|jpe?g|gif|webp|heic))?$/i;

function extensionFor(file: File): string {
  const fromType = file.type.split("/")[1]?.split("+")[0];
  if (fromType === "jpeg") return "jpg";
  if (fromType) return fromType;
  const fromName = file.name.split(".").pop();
  return fromName && fromName !== file.name ? fromName : "png";
}

/** Screenshots from Cmd+C / WhatsApp often arrive as nameless `image.png`. */
export function namePastedFile(file: File): File {
  if (!file.type.startsWith("image/")) return file;
  if (file.name && !GENERIC_IMAGE_NAME.test(file.name)) return file;
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  return new File([file], `Screenshot ${stamp}.${extensionFor(file)}`, {
    type: file.type,
  });
}

/**
 * Files sitting on the clipboard (screenshots, copied images, Finder copies).
 * Prefers `items` so a screenshot is not skipped when `files` is empty.
 */
export function filesFromClipboard(
  data: ClipboardLike | DataTransfer | null | undefined,
): File[] {
  if (!data) return [];

  const fromItems: File[] = [];
  if (data.items && data.items.length > 0) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file") continue;
      const file = item.getAsFile();
      if (file && file.size > 0) fromItems.push(namePastedFile(file));
    }
  }
  if (fromItems.length > 0) return fromItems;

  if (!data.files || data.files.length === 0) return [];
  return Array.from(data.files)
    .filter((file) => file.size > 0)
    .map(namePastedFile);
}

export function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  const type = target.type || "text";
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(type);
}
