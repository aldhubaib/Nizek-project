import { describe, expect, it } from "vitest";
import { pwaIconHref } from "@/lib/pwa-icon-href";

describe("pwaIconHref", () => {
  it("stamps the icon path so Chrome sees a new URL after a logo upload", () => {
    expect(pwaIconHref("/icon-192.png", 1786701407746)).toBe(
      "/icon-192.png?v=1786701407746",
    );
  });

  it("uses v=0 when nothing has been uploaded yet", () => {
    expect(pwaIconHref("/icon-192.png", null)).toBe("/icon-192.png?v=0");
    expect(pwaIconHref("/icon-192.png", undefined)).toBe("/icon-192.png?v=0");
    expect(pwaIconHref("/icon-192.png", 0)).toBe("/icon-192.png?v=0");
  });
});
