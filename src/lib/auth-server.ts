import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";

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
    },
  },

  account: {
    modelName: "Account",
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          return { data: { ...user, email: user.email.toLowerCase() } };
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
