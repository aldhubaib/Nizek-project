import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { getImpersonation } from "@/lib/auth";
import { isClientUser } from "@/lib/client-chat";
import { needsAcceptance } from "@/lib/client-agreement-gate";

/**
 * Lookups behind the client user agreement. The two decisions themselves live
 * in `@/lib/client-agreement-gate` (no Prisma, unit tested) and are re-exported
 * here so app code has a single import.
 */

export * from "@/lib/client-agreement-gate";

/** Everything a client needs shown to them, and nothing more. */
export type AgreementForClient = {
  id: string;
  version: number;
  title: string;
  content: string;
  publishedAt: string;
  /**
   * True when an admin is reading it through a client's eyes. They see the
   * document exactly as the client does, but cannot accept it — the row would
   * record consent the client never gave.
   */
  preview: boolean;
};

const CLIENT_TEAM_NAME = "Clients";

/**
 * The version currently in force, or null if nothing has been published.
 *
 * Ordered by version rather than publishedAt: the number is what a client is
 * shown and what the admin history is keyed by, so "newest" has to mean the
 * highest number even if two versions were published in the same instant.
 */
export const latestPublishedAgreement = cache(async () => {
  return prisma.clientAgreementVersion.findFirst({
    where: { publishedAt: { not: null } },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      title: true,
      content: true,
      publishedAt: true,
    },
  });
});

/**
 * The agreement this person still has to accept, or null to let them through.
 *
 * Staff are never gated — this is a client document.
 *
 * An admin viewing as a client is not waved through, because then "view as
 * client" would be the one place the gate is invisible and there would be no
 * way to see what a client is actually facing. They are shown it and stopped
 * from accepting instead (`preview`), which keeps the acceptance record honest
 * without hiding the gate. The impersonation banner on that page is their way
 * back out.
 */
export async function pendingAgreementFor(
  user: { id: string; systemRole: string } | null | undefined,
): Promise<AgreementForClient | null> {
  if (!user) return null;
  if (!isClientUser(user)) return null;

  const latest = await latestPublishedAgreement();
  if (!latest) return null;

  const acceptance = await prisma.clientAgreementAcceptance.findUnique({
    where: { versionId_userId: { versionId: latest.id, userId: user.id } },
    select: { versionId: true },
  });
  if (!needsAcceptance(latest, acceptance)) return null;

  return {
    id: latest.id,
    version: latest.version ?? 1,
    title: latest.title,
    content: latest.content,
    publishedAt: latest.publishedAt!.toISOString(),
    preview: !!(await getImpersonation()),
  };
}

/**
 * Every user who reads the app as a client, for the admin's "who has agreed"
 * list.
 *
 * The stored systemRole is not the test on its own: `withEffectiveClientRole`
 * promotes anyone holding a client seat for the duration of a request, so a
 * user whose stored role had drifted would be gated by the agreement and yet
 * missing from the list of people expected to sign it.
 */
export async function clientRoster(): Promise<
  { id: string; name: string | null; email: string; imageUrl: string | null }[]
> {
  const select = { id: true, name: true, email: true, imageUrl: true } as const;

  const [byRole, bySeat, byTeam] = await Promise.all([
    prisma.user.findMany({ where: { systemRole: "CLIENT" }, select }),
    prisma.user.findMany({
      where: {
        systemRole: { not: "ADMIN" },
        projects: { some: { OR: [{ role: "CLIENT" }, { projectRole: { isClient: true } }] } },
      },
      select,
    }),
    prisma.user.findMany({
      where: {
        systemRole: { not: "ADMIN" },
        teams: { some: { team: { name: CLIENT_TEAM_NAME, isDefault: true } } },
      },
      select,
    }),
  ]);

  const byId = new Map(
    [...byRole, ...bySeat, ...byTeam].map((u) => [u.id, u] as const),
  );
  return [...byId.values()].sort((a, b) =>
    (a.name ?? a.email).localeCompare(b.name ?? b.email),
  );
}
