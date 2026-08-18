import { brandingIconResponse } from "@/lib/branding-icon-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return brandingIconResponse(
    req,
    "androidMaskable192",
    "icon-maskable-192.png",
    "image/png",
  );
}
