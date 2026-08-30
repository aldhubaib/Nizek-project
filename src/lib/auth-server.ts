import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { prisma } from "@/lib/prisma";
import { applyPendingInvite, logPendingInviteError } from "@/lib/pending-invite";
import { joinDisplayName } from "@/lib/display-name";

export const auth = betterAuth({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 365, // 1 year
    updateAge: 60 * 60 * 24, // refresh daily
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },

  user: {
    modelName: "User",
    fields: {
      image: "imageUrl",
    },
    additionalFields: {
      systemRole: {
        type: "string",
        required: false,
        defaultValue: "DEVELOPER",
        input: false,
        returned: true,
      },
      blocked: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
        returned: true,
      },
      clerkId: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
      gender: {
        type: "string",
        required: false,
        input: false,
        returned: true,
      },
      excludeFromAlias: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
        returned: true,
      },
    },
  },

  account: {
    modelName: "Account",
    // Pre-provisioned invitees (admin "view as" before first Google login)
    // share the same User row. Google must be trusted so the later real
    // sign-in links instead of failing on the unique email.
    accountLinking: {
      enabled: true,
      trustedProviders: ["google"],
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const email = user.email.toLowerCase().trim();
          const allowed = await prisma.allowedEmail.findUnique({ where: { email } });
          if (!allowed) {
            throw new APIError("FORBIDDEN", {
              message: "Access is restricted to approved accounts only.",
            });
          }

          const pending = await prisma.pendingTeamInvite.findFirst({
            where: { email: { equals: email, mode: "insensitive" } },
          });
          let inviteName = joinDisplayName(pending?.firstName, pending?.lastName);
          if (!inviteName) {
            const projectInvite = await prisma.invitation.findFirst({
              where: {
                email: { equals: email, mode: "insensitive" },
                status: "PENDING",
                name: { not: null },
              },
              select: { name: true },
              orderBy: { createdAt: "desc" },
            });
            inviteName = projectInvite?.name?.trim() ?? "";
          }

          return {
            data: {
              ...user,
              email,
              ...(inviteName ? { name: inviteName } : {}),
              ...(pending ? { systemRole: pending.systemRole } : {}),
              ...(pending?.gender ? { gender: pending.gender } : {}),
              ...(pending ? { excludeFromAlias: pending.excludeFromAlias } : {}),
            },
          };
        },
        after: async (user) => {
          try {
            await applyPendingInvite(user.id, user.email.toLowerCase().trim());
          } catch (error) {
            logPendingInviteError(
              "Post-create assignment failed; will retry on next signed-in request",
              { userId: user.id, email: user.email, error },
            );
          }
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { blocked: true },
          });
          if (user?.blocked) return false;
          return { data: session };
        },
      },
    },
  },

  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
