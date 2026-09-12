import { describe, it, expect } from "vitest";
import { COUNTRY_CODES } from "@/lib/countries";
import {
  DIAL_CODES,
  dialCode,
  formatPhone,
  isDialCountry,
  normalizePhoneNumber,
  phoneHref,
} from "@/lib/dial-codes";

describe("the dialling code table", () => {
  it("names every country the picker can offer", () => {
    const missing = COUNTRY_CODES.filter((code) => !isDialCountry(code));
    expect(missing).toEqual([]);
  });

  it("stores codes as bare digits, so callers control the plus", () => {
    for (const code of Object.values(DIAL_CODES)) {
      expect(code).toMatch(/^\d+$/);
    }
  });

  it("is empty rather than wrong for something that is not a country", () => {
    expect(dialCode("ZZ")).toBe("");
  });
});

describe("normalizePhoneNumber", () => {
  it("keeps only digits", () => {
    expect(normalizePhoneNumber("KW", "5012 3456")).toBe("50123456");
    expect(normalizePhoneNumber("US", "(415) 555-0123")).toBe("4155550123");
  });

  it("drops a dialling code that was pasted in with the number", () => {
    expect(normalizePhoneNumber("KW", "+965 50123456")).toBe("50123456");
    expect(normalizePhoneNumber("GB", "+44 7700 900123")).toBe("7700900123");
  });

  it("keeps digits that only look like the dialling code", () => {
    // A Kuwaiti number genuinely starting 965… is 8 digits long. Stripping the
    // prefix would leave 5, which is not a number anybody can ring.
    expect(normalizePhoneNumber("KW", "96512345")).toBe("96512345");
  });

  it("drops the trunk zero people type out of habit", () => {
    expect(normalizePhoneNumber("GB", "07700900123")).toBe("7700900123");
  });
});

describe("formatting the stored pair", () => {
  it("joins the code and the number for display", () => {
    expect(formatPhone("KW", "50123456")).toBe("+965 50123456");
  });

  it("shows just the code while the number is still empty", () => {
    expect(formatPhone("KW", "")).toBe("+965");
  });

  it("takes the spaces back out for a tel: link", () => {
    expect(phoneHref("KW", "50123456")).toBe("tel:+96550123456");
  });
});
