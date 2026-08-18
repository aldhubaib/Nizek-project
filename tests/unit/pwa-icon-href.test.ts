import { describe, expect, it } from "vitest";
import {
  PWA_ICON_FORCE_TOKEN,
  pwaIconHref,
  pwaIconToken,
} from "@/lib/pwa-icon-href";

describe("pwaIconHref", () => {
  it("puts the stamp in the path so Chrome sees a new URL after a logo upload", () => {
    const newer = PWA_ICON_FORCE_TOKEN + 1;
    expect(pwaIconHref("icon-192.png", newer)).toBe(
      `/pwa-icons/${newer}/icon-192.png`,
    );
    expect(pwaIconHref("/icon-192.png", newer)).toBe(
      `/pwa-icons/${newer}/icon-192.png`,
    );
  });

  it("floors older uploads to the force-publish token", () => {
    expect(pwaIconHref("icon-192.png", 1)).toBe(
      `/pwa-icons/${PWA_ICON_FORCE_TOKEN}/icon-192.png`,
    );
  });

  it("uses v=0 when nothing has been uploaded yet", () => {
    expect(pwaIconHref("icon-192.png", null)).toBe("/pwa-icons/0/icon-192.png");
    expect(pwaIconHref("icon-192.png", undefined)).toBe(
      "/pwa-icons/0/icon-192.png",
    );
    expect(pwaIconHref("icon-192.png", 0)).toBe("/pwa-icons/0/icon-192.png");
  });
});

describe("pwaIconToken", () => {
  it("is the max updatedAt across PWA icon slots, floored to the force token", () => {
    expect(
      pwaIconToken({
        webLogo: { updatedAt: 99 },
        androidAny512: { updatedAt: 50 },
        appleTouchIcon: { updatedAt: 80 },
      }),
    ).toBe(PWA_ICON_FORCE_TOKEN);
  });

  it("keeps a stamp newer than the force token", () => {
    const newer = PWA_ICON_FORCE_TOKEN + 5;
    expect(pwaIconToken({ androidAny512: { updatedAt: newer } })).toBe(newer);
  });

  it("is 0 when nothing is uploaded", () => {
    expect(pwaIconToken({})).toBe(0);
  });
});
