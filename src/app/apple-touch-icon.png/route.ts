import { brandingIconResponse } from "@/lib/branding-icon-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return brandingIconResponse(
    req,
    "appleTouchIcon",
    "apple-touch-icon.png",
    "image/png",
  );
}
