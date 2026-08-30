import type { Gender } from "@/generated/prisma/client";

export function parseGender(value: unknown): Gender {
  if (value === "MALE" || value === "FEMALE") return value;
  throw new Error("Gender is required");
}
