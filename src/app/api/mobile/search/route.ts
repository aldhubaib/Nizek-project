import { searchMessages } from "@/actions/message-search";
import { mobileRoute } from "@/lib/mobile/route";

export const runtime = "nodejs";

/** GET ?q=&before=&beforeId= → message hits in rooms this person can open. */
export const GET = mobileRoute(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const before = req.nextUrl.searchParams.get("before");
  const beforeId = req.nextUrl.searchParams.get("beforeId");
  return searchMessages({ q, before, beforeId });
});
