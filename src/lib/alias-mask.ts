import type { Gender, Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Client-facing identity masking, with no dependency on the Prisma singleton so
 * it stays unit testable. `@/lib/alias` re-exports all of this alongside the
 * query helpers — import from there in app code.
 *
 * Clients only ever reach /dashboard/messages and /dashboard/account (see
 * lib/client-routes.ts), so masking at the server-action boundary for those
 * surfaces is enough to keep real employee names and photos off the wire
 * entirely — nothing is filtered in the browser.
 */

/** Either the singleton client or an interactive-transaction client. */
export type AliasDb = PrismaClient | Prisma.TransactionClient;

/** The one AppSettings row's fixed id. */
export const APP_SETTINGS_ID = "global";

/**
 * Whether the alias mechanism is switched on at all (admin → Aliases).
 *
 * Takes its client rather than reaching for the singleton so a claim running
 * inside a transaction reads the switch through that same transaction, and so
 * this is testable with a stub.
 *
 * Absent row, absent column, unreachable — all read as on. Every default here
 * leans towards masking, because the failure worth avoiding is a client being
 * shown a real employee name because a settings lookup came back empty.
 */
export async function aliasesEnabled(db: AliasDb): Promise<boolean> {
  const row = await db.appSettings.findUnique({
    where: { id: APP_SETTINGS_ID },
    select: { aliasesEnabled: true },
  });
  return row?.aliasesEnabled ?? true;
}

/**
 * What a client sees instead of a person. `realName` comes along so already
 * rendered text (notification titles, quoted comment bodies) can be scrubbed
 * too — those strings carry no user id to key off.
 */
export type AliasIdentity = {
  name: string;
  imageUrl: string | null;
  realName: string | null;
};

/** Thrown when no unclaimed alias of the required gender is left in the pool. */
export class AliasPoolExhaustedError extends Error {
  readonly gender: Gender;

  constructor(gender: Gender) {
    super(
      `No unused ${gender === "MALE" ? "male" : "female"} aliases left. Upload more in Settings → Aliases.`,
    );
    this.name = "AliasPoolExhaustedError";
    this.gender = gender;
  }
}

export function isAliasPoolExhausted(err: unknown): err is AliasPoolExhaustedError {
  return err instanceof AliasPoolExhaustedError;
}

/**
 * Thrown when someone needs an alias but has no gender on record. Aliases are
 * drawn to match gender, so there is nothing to hand them — and seating them
 * anyway would show a client their real name, which is the outcome the whole
 * feature exists to prevent.
 */
export class AliasGenderMissingError extends Error {
  constructor(who?: string) {
    super(
      `${who ? `${who} has` : "This person has"} no gender recorded, so no alias can be assigned. Set it on the Members tab first.`,
    );
    this.name = "AliasGenderMissingError";
  }
}

export function isAliasGenderMissing(err: unknown): err is AliasGenderMissingError {
  return err instanceof AliasGenderMissingError;
}

/** Either error means the same thing to a caller: do not seat this member. */
export function isAliasBlocked(
  err: unknown,
): err is AliasPoolExhaustedError | AliasGenderMissingError {
  return isAliasPoolExhausted(err) || isAliasGenderMissing(err);
}

export type AliasSubject = {
  systemRole: string;
  excludeFromAlias: boolean;
  gender: Gender | null;
};

/** How this person joins the project being asked about. */
export type AliasMembership = {
  memberRole?: string;
  /** The project's own exception: shown to its client by real name. */
  showRealName?: boolean;
};

/**
 * Where this person stands on needing an alias for a project.
 *
 * "exempt" — clients see the aliases so they never get one, excluded users
 * (founders, public-facing staff) keep their real identity on purpose, and a
 * member this project shows by name has nothing to hide behind either.
 * "no-gender" — they should have one but nothing can be drawn for them.
 * "required" — claim one.
 */
export function aliasRequirement(
  user: AliasSubject,
  membership?: AliasMembership,
): "exempt" | "no-gender" | "required" {
  if (user.systemRole === "CLIENT" || membership?.memberRole === "CLIENT") return "exempt";
  if (user.excludeFromAlias) return "exempt";
  // Before the gender check: someone shown by name needs no alias, so a missing
  // gender is not a problem worth refusing the membership over.
  if (membership?.showRealName) return "exempt";
  if (user.gender === null) return "no-gender";
  return "required";
}

/**
 * Whether a claim would succeed for this person. Deliberately false for a
 * missing gender: this answers "is there an alias to hand out", which is what
 * the pool stats and the backfill list ask.
 */
export function needsAlias(user: AliasSubject, membership?: AliasMembership): boolean {
  return aliasRequirement(user, membership) === "required";
}

function isRootClient(db: AliasDb): db is PrismaClient {
  return typeof (db as PrismaClient).$transaction === "function";
}

/**
 * Claim an alias for a person on a project, or return the one they already
 * hold. Always runs in a transaction, opening one if the caller had not.
 */
export async function claimAlias(
  db: AliasDb,
  input: { userId: string; projectId: string; gender: Gender },
): Promise<{ id: string; aliasId: string }> {
  if (isRootClient(db)) {
    return db.$transaction((tx) => claimInTransaction(tx, input));
  }
  return claimInTransaction(db, input);
}

/**
 * The claim takes locks up front instead of writing optimistically and
 * recovering from a collision, because recovery is impossible here: Postgres
 * aborts a transaction on its first constraint violation, so a caught unique
 * error cannot be followed by "then try the next alias" — every later statement
 * in the transaction fails too. Two claims must therefore never pick the same
 * row in the first place.
 */
async function claimInTransaction(
  tx: Prisma.TransactionClient,
  input: { userId: string; projectId: string; gender: Gender },
): Promise<{ id: string; aliasId: string }> {
  const { userId, projectId, gender } = input;

  // Serialises concurrent claims for this one person on this one project, so
  // the read below can be trusted. Released when the transaction ends. The lock
  // function returns void and Prisma cannot deserialise a void column, hence
  // selecting a boolean over it rather than calling it directly.
  await tx.$queryRaw`
    SELECT true AS locked
    FROM pg_advisory_xact_lock(hashtext(${`alias:${userId}:${projectId}`})::bigint)
  `;

  const existing = await tx.aliasAssignment.findUnique({
    where: { userId_projectId: { userId, projectId } },
    select: { id: true, aliasId: true },
  });
  if (existing) return existing;

  // Ordered by the random shuffleKey, never by createdAt: a pool imported in
  // alphabetical order would otherwise be handed out alphabetically, which is a
  // pattern a client could notice across a project's members. SKIP LOCKED sends
  // a concurrent claimer to the next row rather than the one being taken, and
  // the row stays locked until this transaction commits.
  const picked = await tx.$queryRaw<{ id: string }[]>`
    SELECT a."id"
    FROM "Alias" a
    WHERE a."gender" = ${gender}::"Gender"
      AND a."active"
      AND NOT EXISTS (
        SELECT 1 FROM "AliasAssignment" s WHERE s."aliasId" = a."id"
      )
    ORDER BY a."shuffleKey"
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  `;

  const alias = picked[0];
  if (!alias) throw new AliasPoolExhaustedError(gender);

  return tx.aliasAssignment.create({
    data: { aliasId: alias.id, userId, projectId },
    select: { id: true, aliasId: true },
  });
}

/**
 * Claim an alias for a project member if they need one. Returns null only when
 * the person is genuinely exempt.
 *
 * Throws for both ways a claim can fail — an empty pool and a missing gender —
 * so a caller inside a transaction refuses the membership instead of seating
 * someone whose real name a client would then read. With the mechanism switched
 * off nothing is claimed and nothing throws, so seating a member never depends
 * on the pool.
 */
export async function claimAliasForMember(
  db: AliasDb,
  input: { userId: string; projectId: string; memberRole?: string },
): Promise<{ id: string; aliasId: string } | null> {
  // Ahead of every other check: with aliases off, an empty pool or a missing
  // gender must not refuse a membership over an alias nobody is going to use.
  if (!(await aliasesEnabled(db))) return null;

  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      name: true,
      email: true,
      systemRole: true,
      excludeFromAlias: true,
      gender: true,
    },
  });
  if (!user) return null;

  // Read through the same client as the claim, so a membership created in the
  // caller's still-open transaction is visible here.
  const membership = await db.projectMember.findUnique({
    where: {
      userId_projectId: { userId: input.userId, projectId: input.projectId },
    },
    select: { showRealName: true },
  });

  const requirement = aliasRequirement(user, {
    memberRole: input.memberRole,
    showRealName: membership?.showRealName ?? false,
  });
  if (requirement === "exempt") return null;
  if (requirement === "no-gender") {
    throw new AliasGenderMissingError(user.name ?? user.email);
  }

  return claimAlias(db, {
    userId: input.userId,
    projectId: input.projectId,
    gender: user.gender!,
  });
}

// There is deliberately no "release" helper. An alias is consumed for good:
// dropping an assignment would put a name a client already knows on somebody
// else. Assignments only disappear with the project or user they belong to,
// which takes the chat history that referenced them along with it.

// ─── Masking helpers ─────────────────────────────────────────────────────────

/** No-op map for viewers who see real identities (all employees). */
export const NO_MASK: Map<string, AliasIdentity> = new Map();

export function maskName(
  userId: string | null | undefined,
  realName: string,
  map: Map<string, AliasIdentity>,
): string {
  if (!userId || map.size === 0) return realName;
  return map.get(userId)?.name ?? realName;
}

export function maskImage(
  userId: string | null | undefined,
  realImage: string | null,
  map: Map<string, AliasIdentity>,
): string | null {
  if (!userId || map.size === 0) return realImage;
  const alias = map.get(userId);
  return alias ? alias.imageUrl : realImage;
}

/** Swap name + photo on a user-shaped object, leaving other fields untouched. */
export function maskUser<
  T extends { id: string; name?: string | null; imageUrl?: string | null },
>(user: T, map: Map<string, AliasIdentity>): T {
  if (map.size === 0) return user;
  const alias = map.get(user.id);
  if (!alias) return user;
  return { ...user, name: alias.name, imageUrl: alias.imageUrl };
}

/** Matches the stored chat mention token `@[Name](userId)`. */
const MENTION_TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/**
 * Rewrite mention labels inside a stored chat body. The token carries the user
 * id, so the display name can be swapped without re-resolving anything — this
 * is what makes text masking cheap. Unknown ids (e.g. the @all sentinel) pass
 * through unchanged.
 */
export function maskMentionTokens(
  body: string,
  map: Map<string, AliasIdentity>,
): string {
  if (map.size === 0 || !body.includes("@[")) return body;
  return body.replace(MENTION_TOKEN_RE, (full, _label: string, id: string) => {
    const alias = map.get(id);
    return alias ? `@[${alias.name}](${id})` : full;
  });
}

/** True when the character cannot be part of a name, so a match ends here. */
function isBoundary(char: string | undefined): boolean {
  return char === undefined || !/[\p{L}\p{N}_]/u.test(char);
}

/**
 * Replace `needle` only where it stands as its own word. A blind replace would
 * rewrite the name out of the middle of longer words too — a person called Ali
 * turns "Alignment" into "Yousefgnment" — and mangling client-visible text is
 * its own kind of tell.
 */
function replaceWord(text: string, needle: string, replacement: string): string {
  let out = "";
  let from = 0;

  for (;;) {
    const at = text.indexOf(needle, from);
    if (at === -1) return out + text.slice(from);

    const standsAlone =
      isBoundary(text[at - 1]) && isBoundary(text[at + needle.length]);
    out += text.slice(from, at) + (standsAlone ? replacement : needle);
    from = at + needle.length;
  }
}

/**
 * Replace real names in already-rendered text: notification titles, quoted
 * comment bodies, and legacy plain "@Name" runs. Longest name first so "Ali"
 * inside "Ali Hassan" cannot clobber the longer match.
 *
 * Best-effort by nature — it can only match the name as recorded, so a client
 * writing a nickname or half a name is not something this can catch. Mention
 * tokens carry a user id and are handled exactly; this is the net underneath.
 */
export function maskPlainNames(
  text: string,
  map: Map<string, AliasIdentity>,
): string {
  if (map.size === 0 || !text) return text;
  const ordered = [...map.values()]
    .filter((a): a is AliasIdentity & { realName: string } => Boolean(a.realName))
    .sort((a, b) => b.realName.length - a.realName.length);

  let out = text;
  for (const alias of ordered) {
    if (!out.includes(alias.realName)) continue;
    out = replaceWord(out, alias.realName, alias.name);
  }
  return out;
}

/** Mention tokens first, then any leftover real names in the plain text. */
export function maskBody(body: string, map: Map<string, AliasIdentity>): string {
  if (map.size === 0) return body;
  return maskPlainNames(maskMentionTokens(body, map), map);
}

/**
 * Note-activity cards carry a title and an excerpt lifted straight out of a
 * staff-authored document, so both go out through the same net as chat text.
 */
export function maskNoteActivity<
  T extends {
    noteTitle: string;
    excerpt?: string;
    scopeTask?: { code: string; title: string };
  },
>(payload: T | null, map: Map<string, AliasIdentity>): T | null {
  if (!payload || map.size === 0) return payload;
  return {
    ...payload,
    noteTitle: maskPlainNames(payload.noteTitle, map),
    ...(payload.excerpt ? { excerpt: maskPlainNames(payload.excerpt, map) } : {}),
    ...(payload.scopeTask
      ? {
          scopeTask: {
            ...payload.scopeTask,
            title: maskPlainNames(payload.scopeTask.title, map),
          },
        }
      : {}),
  };
}
