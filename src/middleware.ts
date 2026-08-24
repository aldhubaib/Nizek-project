import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const publicPaths = [
  "/",
  "/sign-in",
  "/sign-up",
  "/api/auth",
  "/api/webhooks",
  "/api/cron",
  "/api/health",
  "/api/version",
  "/manifest.json",
];

const uploadPath = "/api/upload";

function isPublicRoute(pathname: string): boolean {
  return publicPaths.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "("));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(uploadPath)) return NextResponse.next();

  if (!isPublicRoute(pathname)) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      console.warn(
        `[auth] unauthenticated access to ${pathname} — redirecting to sign-in`,
      );
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
