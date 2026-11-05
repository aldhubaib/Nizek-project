import type { Gender } from "@/generated/prisma/client";

/**
 * Gender is an optional profile field: a blank choice is recorded as nothing,
 * and anything that is not one of the two known values is refused rather than
 * stored.
 */
export function parseGender(value: unknown): Gender | null {
  if (value === "MALE" || value === "FEMALE") return value;
  if (value === "" || value === null || value === undefined) return null;
  throw new Error("Unknown gender");
}
