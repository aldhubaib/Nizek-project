import { describe, expect, it } from "vitest";
import {
  decideHomeScreenBanner,
  isIosUserAgent,
} from "@/lib/home-screen-icon-update";

describe("decideHomeScreenBanner", () => {
  it("hides in a regular browser tab", () => {
    expect(
      decideHomeScreenBanner({
        currentToken: "9",
        storedToken: "1",
        standalone: false,
      }),
    ).toBe("hide");
  });

  it("seeds on first open of an installed app", () => {
    expect(
      decideHomeScreenBanner({
        currentToken: "9",
        storedToken: null,
        standalone: true,
      }),
    ).toBe("seed");
  });

  it("shows when the token advanced after a logo upload", () => {
    expect(
      decideHomeScreenBanner({
        currentToken: "20",
        storedToken: "9",
        standalone: true,
      }),
    ).toBe("show");
  });

  it("hides when the user already acknowledged this token", () => {
    expect(
      decideHomeScreenBanner({
        currentToken: "9",
        storedToken: "9",
        standalone: true,
      }),
    ).toBe("hide");
  });

  it("hides when no custom icons exist", () => {
    expect(
      decideHomeScreenBanner({
        currentToken: "0",
        storedToken: null,
        standalone: true,
      }),
    ).toBe("hide");
  });
});

describe("isIosUserAgent", () => {
  it("detects iPhone and iPadOS-as-Mac", () => {
    expect(isIosUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)")).toBe(
      true,
    );
    expect(isIosUserAgent("Mozilla/5.0", "MacIntel", 5)).toBe(true);
    expect(isIosUserAgent("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });
});
