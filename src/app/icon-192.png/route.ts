import { brandingIconResponse } from "@/lib/branding-icon-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET(req: Request) {
  return brandingIconResponse(req, "androidAny192", "icon-192.png", "image/png");
}
