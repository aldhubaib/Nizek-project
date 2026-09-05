"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getImpersonation, getRealUser, requireUser } from "@/lib/auth";
import { clientRoster, latestPublishedAgreement } from "@/lib/client-agreement";
import { htmlToParagraphs } from "@/lib/note-content-diff";

const MAX_TITLE_LENGTH = 200;

export type AgreementDraftDTO = {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
} | null;

export type AgreementVersionDTO = {
  id: string;
  version: number;
  title: string;
  content: string;
  publishedAt: string;
  /** How many clients have accepted this particular version. */
  acceptedCount: number;
};

export type AgreementPersonDTO = {
  userId: string;
  userName: string;
  userImageUrl: string | null;
  /** Null in the "has not agreed yet" list. */
  acceptedAt: string | null;
  /** Set when an admin accepted for them; their own click leaves it null. */
  acceptedByName: string | null;
};

export type AgreementAdminView = {
  draft: AgreementDraftDTO;
  /** Published versions, newest first. */
  versions: AgreementVersionDTO[];
  /** How many people read the app as a client, so a version can show "3 of 5". */
  clientCount: number;
};

export type AgreementAcceptanceView = {
  version: number;
  /** True when this is the version clients are currently being asked for. */
  isInForce: boolean;
  /** Who has accepted it, most recently first. */
  accepted: AgreementPersonDTO[];
  /** Clients still outstanding. Empty for a superseded version. */
  pending: AgreementPersonDTO[];
};

async function requireAgreementAdmin() {
  const user = await requireUser();
  if (user.systemRole !== "ADMIN") throw new Error("Admin only");
  return user;
}

/** An agreement with no words in it is a mistake, whatever markup it carries. */
function hasText(content: string): boolean {
  return htmlToParagraphs(content).length > 0;
}

function personName(user: { name: string | null; email: string }): string {
  return user.name ?? user.email;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function getAgreementAdminView(): Promise<AgreementAdminView> {
  await requireAgreementAdmin();

  const [draft, published, roster] = await Promise.all([
    prisma.clientAgreementVersion.findFirst({
      where: { publishedAt: null },
      select: { id: true, title: true, content: true, updatedAt: true },
    }),
    prisma.clientAgreementVersion.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        title: true,
        content: true,
        publishedAt: true,
        _count: { select: { acceptances: true } },
      },
    }),
    clientRoster(),
  ]);

  const versions: AgreementVersionDTO[] = published.map((v) => ({
    id: v.id,
    version: v.version ?? 0,
    title: v.title,
    content: v.content,
    publishedAt: v.publishedAt!.toISOString(),
    acceptedCount: v._count.acceptances,
  }));

  return {
    draft: draft
      ? {
          id: draft.id,
          title: draft.title,
          content: draft.content,
          updatedAt: draft.updatedAt.toISOString(),
        }
      : null,
    versions,
    clientCount: roster.length,
  };
}

/**
 * Who has agreed to one particular version.
 *
 * Loaded when the admin opens that version rather than shipped with the list:
 * the roster is three lookups plus a dedupe, and most versions are never
 * opened.
 */
export async function getAgreementAcceptances(
  versionId: string,
): Promise<AgreementAcceptanceView> {
  await requireAgreementAdmin();

  const [version, acceptances, roster, latest] = await Promise.all([
    prisma.clientAgreementVersion.findUnique({
      where: { id: versionId },
      select: { version: true, publishedAt: true },
    }),
    prisma.clientAgreementAcceptance.findMany({
      where: { versionId },
      orderBy: { acceptedAt: "desc" },
      select: {
        userId: true,
        acceptedAt: true,
        user: { select: { name: true, email: true, imageUrl: true } },
        acceptedBy: { select: { name: true, email: true } },
      },
    }),
    clientRoster(),
    latestPublishedAgreement(),
  ]);

  if (!version?.publishedAt) {
    throw new Error("That version has not been published");
  }

  const accepted: AgreementPersonDTO[] = acceptances.map((a) => ({
    userId: a.userId,
    userName: personName(a.user),
    userImageUrl: a.user.imageUrl,
    acceptedAt: a.acceptedAt.toISOString(),
    acceptedByName: a.acceptedBy ? personName(a.acceptedBy) : null,
  }));

  // Only the version in force has anyone outstanding. A superseded document is
  // nobody's left to sign, so its list is the historical record and no more.
  const isInForce = latest?.id === versionId;
  const acceptedIds = new Set(acceptances.map((a) => a.userId));

  // Built from the roster rather than the acceptance rows, so a client who has
  // never signed in still shows up as outstanding.
  const pending: AgreementPersonDTO[] = isInForce
    ? roster
        .filter((u) => !acceptedIds.has(u.id))
        .map((u) => ({
          userId: u.id,
          userName: personName(u),
          userImageUrl: u.imageUrl,
          acceptedAt: null,
          acceptedByName: null,
        }))
    : [];

  return { version: version.version ?? 0, isInForce, accepted, pending };
}

/**
 * Create or update the single draft. Saving does not affect any client — the
 * gate only ever looks at published versions.
 */
export async function saveAgreementDraft(data: {
  title: string;
  content: string;
}): Promise<void> {
  const admin = await requireAgreementAdmin();

  const title = data.title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) throw new Error("Give the agreement a title");

  const existing = await prisma.clientAgreementVersion.findFirst({
    where: { publishedAt: null },
    select: { id: true },
  });

  if (existing) {
    await prisma.clientAgreementVersion.update({
      where: { id: existing.id },
      data: { title, content: data.content },
    });
  } else {
    await prisma.clientAgreementVersion.create({
      data: { title, content: data.content, createdById: admin.id },
    });
  }

  revalidatePath("/dashboard/admin");
}

/**
 * Publish the draft as the next numbered version.
 *
 * Every client is re-gated by this: the gate matches acceptance on the newest
 * published version's id, and nobody has a row for a version that did not exist
 * a moment ago. The number is drawn inside the transaction so two admins
 * publishing at once cannot land on the same one.
 */
export async function publishAgreementVersion(): Promise<number> {
  await requireAgreementAdmin();

  const version = await prisma.$transaction(async (tx) => {
    const draft = await tx.clientAgreementVersion.findFirst({
      where: { publishedAt: null },
      select: { id: true, title: true, content: true },
    });
    if (!draft) throw new Error("There is no draft to publish");
    if (!draft.title.trim()) throw new Error("Give the agreement a title before publishing");
    if (!hasText(draft.content)) {
      throw new Error("The agreement is empty — write it before publishing");
    }

    const highest = await tx.clientAgreementVersion.aggregate({
      _max: { version: true },
    });
    const next = (highest._max.version ?? 0) + 1;

    await tx.clientAgreementVersion.update({
      where: { id: draft.id },
      data: { version: next, publishedAt: new Date() },
    });
    return next;
  });

  // Gated clients are redirected by the dashboard layout, so every cached
  // dashboard render has to go.
  revalidatePath("/dashboard", "layout");
  return version;
}

export async function discardAgreementDraft(): Promise<void> {
  await requireAgreementAdmin();
  await prisma.clientAgreementVersion.deleteMany({ where: { publishedAt: null } });
  revalidatePath("/dashboard/admin");
}

// ─── Client ──────────────────────────────────────────────────────────────────

/**
 * Record that this person accepted the agreement.
 *
 * The id is checked against the version actually in force so a tab left open
 * across a publish cannot record consent to a document that has been replaced;
 * the client is told to reload and reads the new one instead.
 *
 * Upserting with an empty update keeps the original timestamp, so a double
 * submit cannot rewrite when they agreed.
 */
export async function acceptClientAgreement(versionId: string): Promise<void> {
  const user = await requireUser();

  // `requireUser` resolves to the impersonated client, so an admin viewing as
  // them would otherwise write a row indistinguishable from the client's own
  // click. Accepting on their behalf is allowed — an admin often walks a client
  // through onboarding, and testing the client's chat needs a way past this —
  // but it is recorded as what it was, and only an admin may do it.
  const impersonation = await getImpersonation();
  let acceptedById: string | null = null;
  if (impersonation) {
    const real = await getRealUser();
    if (real?.systemRole !== "ADMIN") {
      throw new Error("You are viewing as someone else — only they can accept this");
    }
    acceptedById = real.id;
  }

  const latest = await latestPublishedAgreement();
  if (!latest) throw new Error("There is no agreement to accept");
  if (latest.id !== versionId) {
    throw new Error("This agreement has been replaced — reload to read the current one");
  }

  await prisma.clientAgreementAcceptance.upsert({
    where: { versionId_userId: { versionId, userId: user.id } },
    create: { versionId, userId: user.id, acceptedById },
    update: {},
  });

  revalidatePath("/dashboard", "layout");
}

export type MyAgreementDTO = {
  version: number;
  title: string;
  content: string;
  /** Null if they are somehow reading it without having accepted. */
  acceptedAt: string | null;
} | null;

/**
 * The agreement in force plus when this person accepted it, for the "User
 * agreement" item in the chat menu. Loaded on demand rather than shipped with
 * every thread page — the document can be long and is rarely opened.
 */
export async function getMyAgreement(): Promise<MyAgreementDTO> {
  const user = await requireUser();

  const latest = await latestPublishedAgreement();
  if (!latest) return null;

  const acceptance = await prisma.clientAgreementAcceptance.findUnique({
    where: { versionId_userId: { versionId: latest.id, userId: user.id } },
    select: { acceptedAt: true },
  });

  return {
    version: latest.version ?? 1,
    title: latest.title,
    content: latest.content,
    acceptedAt: acceptance?.acceptedAt.toISOString() ?? null,
  };
}
