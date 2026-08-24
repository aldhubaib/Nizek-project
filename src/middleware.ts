import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
  "/api/cron(.*)",
  "/api/health",
  "/api/version",
  "/manifest.json",
]);

const isUploadRoute = createRouteMatcher(["/api/upload(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (isUploadRoute(request)) return;
  if (!isPublicRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      console.warn(
        `[auth] unauthenticated access to ${request.nextUrl.pathname} — redirecting to sign-in`,
      );
    }
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
