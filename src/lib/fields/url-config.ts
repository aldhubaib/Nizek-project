/**
 * Extra settings for URL fields, stored in CustomField.options as `{ icon }`.
 */

export const URL_ICONS = [
  "x",
  "linkedin",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "whatsapp",
  "telegram",
  "github",
  "website",
  "nizek",
] as const;

export type UrlIconId = (typeof URL_ICONS)[number];

export const URL_ICON_LABEL: Record<UrlIconId, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  github: "GitHub",
  website: "Website",
  nizek: "Nizek website",
};

export const URL_ICON_PLACEHOLDER: Record<UrlIconId, string> = {
  x: "https://x.com/",
  linkedin: "https://www.linkedin.com/in/",
  instagram: "https://www.instagram.com/",
  facebook: "https://www.facebook.com/",
  youtube: "https://www.youtube.com/",
  tiktok: "https://www.tiktok.com/@",
  whatsapp: "https://wa.me/",
  telegram: "https://t.me/",
  github: "https://github.com/",
  website: "https://",
  nizek: "https://nizek.com",
};

export type UrlFieldConfig = {
  icon: UrlIconId | null;
};

export function isUrlIconId(value: string): value is UrlIconId {
  return (URL_ICONS as readonly string[]).includes(value);
}

export function parseUrlConfig(raw: string | null | undefined): UrlFieldConfig {
  if (!raw) return { icon: null };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { icon: null };
    }
    const icon = (parsed as { icon?: unknown }).icon;
    return {
      icon: typeof icon === "string" && isUrlIconId(icon) ? icon : null,
    };
  } catch {
    return { icon: null };
  }
}

export function stringifyUrlConfig(config: UrlFieldConfig): string | null {
  return config.icon ? JSON.stringify({ icon: config.icon }) : null;
}
