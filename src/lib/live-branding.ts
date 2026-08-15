/**
 * Client-safe live branding helpers. Logo URLs are applied in the open
 * document without treating a swap as a new app deploy.
 */

export type LiveLogos = {
  favicon: string | null;
  faviconDark: string | null;
  appleTouchIcon: string | null;
  webLogo: string | null;
  iosSplash: string | null;
  /** Cache-busted manifest href so installed PWAs re-read icons. */
  manifest: string | null;
  /** Max PWA-icon updatedAt; used to prompt installed apps to review the glyph. */
  iconToken: string | null;
};

export const EMPTY_LIVE_LOGOS: LiveLogos = {
  favicon: null,
  faviconDark: null,
  appleTouchIcon: null,
  webLogo: null,
  iosSplash: null,
  manifest: null,
  iconToken: null,
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function tokenFromManifest(manifest: string | null): string | null {
  if (!manifest) return null;
  const match = manifest.match(/[?&]v=(\d+)/);
  return match?.[1] ?? null;
}

export function parseLiveLogos(data: unknown): LiveLogos | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { logos?: unknown; logo?: unknown };
  if (d.logos && typeof d.logos === "object") {
    const l = d.logos as Record<string, unknown>;
    const manifest = str(l.manifest);
    return {
      favicon: str(l.favicon),
      faviconDark: str(l.faviconDark),
      appleTouchIcon: str(l.appleTouchIcon),
      webLogo: str(l.webLogo),
      iosSplash: str(l.iosSplash),
      manifest,
      iconToken: str(l.iconToken) ?? tokenFromManifest(manifest),
    };
  }
  // Rolling-deploy compat: older /api/version only returned `logo`.
  if (typeof d.logo === "string" && d.logo) {
    return {
      ...EMPTY_LIVE_LOGOS,
      favicon: d.logo,
    };
  }
  return null;
}

export function logosEqual(a: LiveLogos, b: LiveLogos): boolean {
  return (
    a.favicon === b.favicon &&
    a.faviconDark === b.faviconDark &&
    a.appleTouchIcon === b.appleTouchIcon &&
    a.webLogo === b.webLogo &&
    a.iosSplash === b.iosSplash &&
    a.manifest === b.manifest &&
    a.iconToken === b.iconToken
  );
}

function upsertLink(
  rel: string,
  href: string,
  extra: { media?: string } = {},
) {
  const links = document.querySelectorAll<HTMLLinkElement>(`link[rel="${rel}"]`);
  let link = extra.media
    ? [...links].find((l) => l.media === extra.media)
    : [...links].find((l) => !l.media);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    if (extra.media) link.media = extra.media;
    document.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

/**
 * Swap document icons in place so a logo upload shows up without a reload.
 */
export function applyDocumentLogos(logos: LiveLogos) {
  if (typeof document === "undefined") return;

  if (logos.faviconDark && logos.favicon) {
    upsertLink("icon", logos.favicon, {
      media: "(prefers-color-scheme: light)",
    });
    upsertLink("icon", logos.faviconDark, {
      media: "(prefers-color-scheme: dark)",
    });
  } else if (logos.favicon) {
    const links = document.querySelectorAll<HTMLLinkElement>(
      "link[rel~='icon']",
    );
    if (links.length === 0) {
      upsertLink("icon", logos.favicon);
    } else {
      links.forEach((link) => {
        if (link.href !== logos.favicon) link.href = logos.favicon!;
      });
    }
  }

  if (logos.appleTouchIcon) {
    upsertLink("apple-touch-icon", logos.appleTouchIcon);
  }

  if (logos.iosSplash) {
    upsertLink("apple-touch-startup-image", logos.iosSplash);
  }

  if (logos.manifest) {
    upsertLink("manifest", logos.manifest);
  }
}
