import { brandingIconResponse } from "@/lib/branding-icon-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return brandingIconResponse(
    req,
    "androidMaskable512",
    "icon-maskable-512.png",
    "image/png",
  );
}
