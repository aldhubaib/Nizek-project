import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth";
import { localDevLoginEmail, localDevSignInEmail } from "@/lib/local-dev-login";
import { prisma } from "@/lib/prisma";
import * as z from "zod";

/**
 * POST /api/auth/dev-sign-in creates a real session for LOCAL_DEV_LOGIN_EMAIL.
 * GET reports that account so the app can show one button. Both answer 404
 * whenever localDevLoginEmail() declines.
 */
export function localDevLoginPlugin(): BetterAuthPlugin {
  return {
    id: "local-dev-login",
    endpoints: {
      getLocalDevLogin: createAuthEndpoint(
        "/dev-sign-in",
        { method: "GET" },
        async (ctx) => {
          const email = allowedEmail(ctx.request);
          if (!email) throw new APIError("NOT_FOUND", { message: "Not found" });
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!found) throw new APIError("NOT_FOUND", { message: "Not found" });
          const people = await prisma.user.findMany({
            where: { blocked: false },
            select: { email: true, name: true },
            orderBy: { name: "asc" },
          });
          return ctx.json({
            email: found.user.email,
            name: found.user.name,
            people: people.map((person) => ({
              email: person.email,
              name: person.name ?? person.email,
            })),
          });
        },
      ),
      signInLocalDev: createAuthEndpoint(
        "/dev-sign-in",
        {
          method: "POST",
          body: z.object({
            email: z.string().optional(),
          }),
        },
        async (ctx) => {
          const email = localDevSignInEmail(allowedEmail(ctx.request), ctx.body?.email);
          if (!email) throw new APIError("NOT_FOUND", { message: "Not found" });
          const found = await ctx.context.internalAdapter.findUserByEmail(email);
          if (!found) throw new APIError("NOT_FOUND", { message: "Not found" });
          const session = await ctx.context.internalAdapter.createSession(found.user.id);
          if (!session) {
            throw new APIError("FORBIDDEN", { message: "Could not start a session" });
          }
          await setSessionCookie(ctx, { session, user: found.user });
          return ctx.json({ token: session.token, user: found.user });
        },
      ),
    },
  };
}

function allowedEmail(request: Request | undefined): string | null {
  return localDevLoginEmail({
    nodeEnv: process.env.NODE_ENV,
    enabled: process.env.LOCAL_DEV_LOGIN,
    email: process.env.LOCAL_DEV_LOGIN_EMAIL,
    host: request?.headers.get("host") ?? null,
  });
}
