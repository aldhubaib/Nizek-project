import { describe, expect, it } from "vitest";
import {
  isClientMessageIdUniqueError,
  MAX_CLIENT_MESSAGE_ID_CHARS,
  normalizeClientMessageId,
} from "@/lib/client-message-id";

describe("normalizeClientMessageId", () => {
  it("returns null for empty, whitespace, or non-string values", () => {
    expect(normalizeClientMessageId(undefined)).toBeNull();
    expect(normalizeClientMessageId(null)).toBeNull();
    expect(normalizeClientMessageId("")).toBeNull();
    expect(normalizeClientMessageId("   ")).toBeNull();
  });

  it("trims valid ids and caps overly long ids", () => {
    expect(normalizeClientMessageId("  abc-123  ")).toBe("abc-123");
    const longId = "x".repeat(MAX_CLIENT_MESSAGE_ID_CHARS + 50);
    expect(normalizeClientMessageId(longId)?.length).toBe(MAX_CLIENT_MESSAGE_ID_CHARS);
  });
});

describe("isClientMessageIdUniqueError", () => {
  it("matches Prisma P2002 unique violations on clientMessageId", () => {
    expect(
      isClientMessageIdUniqueError({
        code: "P2002",
        meta: { target: ["authorId", "clientMessageId"] },
      }),
    ).toBe(true);
    expect(
      isClientMessageIdUniqueError({
        code: "P2002",
        meta: { target: "Message_authorId_clientMessageId_key" },
      }),
    ).toBe(true);
    expect(
      isClientMessageIdUniqueError({
        code: "P2002",
        meta: { target: ["email"] },
      }),
    ).toBe(false);
    expect(isClientMessageIdUniqueError({ code: "P2025" })).toBe(false);
  });
});
