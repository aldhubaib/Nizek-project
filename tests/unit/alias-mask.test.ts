import { describe, expect, it } from "vitest";
import {
  aliasRequirement,
  AliasPoolExhaustedError,
  claimAlias,
  claimAliasForMember,
  isAliasBlocked,
  isAliasGenderMissing,
  isAliasPoolExhausted,
  maskBody,
  maskMentionTokens,
  maskName,
  maskPlainNames,
  needsAlias,
  type AliasDb,
  type AliasIdentity,
} from "@/lib/alias-mask";

function aliasMap(
  entries: [string, Partial<AliasIdentity> & { name: string }][],
): Map<string, AliasIdentity> {
  return new Map(
    entries.map(([id, a]) => [
      id,
      { name: a.name, imageUrl: a.imageUrl ?? null, realName: a.realName ?? null },
    ]),
  );
}

// ─── Masking ─────────────────────────────────────────────────────────────────

describe("maskMentionTokens", () => {
  const map = aliasMap([
    ["u1", { name: "Yousef Al Sabah", realName: "Ali Hassan" }],
    ["u2", { name: "Dana Al Fahad", realName: "Sara Noor" }],
  ]);

  it("swaps the label but keeps the id, so the token still resolves", () => {
    expect(maskMentionTokens("hey @[Ali Hassan](u1) look", map)).toBe(
      "hey @[Yousef Al Sabah](u1) look",
    );
  });

  it("rewrites every mention in a body", () => {
    expect(
      maskMentionTokens("@[Ali Hassan](u1) and @[Sara Noor](u2) ship it", map),
    ).toBe("@[Yousef Al Sabah](u1) and @[Dana Al Fahad](u2) ship it");
  });

  it("leaves unknown ids like the @all sentinel alone", () => {
    expect(maskMentionTokens("@[everyone](all) ping", map)).toBe(
      "@[everyone](all) ping",
    );
  });

  it("is a no-op with an empty map or a body with no tokens", () => {
    expect(maskMentionTokens("@[Ali Hassan](u1)", new Map())).toBe(
      "@[Ali Hassan](u1)",
    );
    expect(maskMentionTokens("plain text", map)).toBe("plain text");
  });
});

describe("maskPlainNames", () => {
  it("replaces a real name in already-rendered text", () => {
    const map = aliasMap([["u1", { name: "Yousef", realName: "Ali Hassan" }]]);
    expect(maskPlainNames("Ali Hassan · Acme · Client", map)).toBe(
      "Yousef · Acme · Client",
    );
  });

  it("prefers the longest name so a shorter one cannot clobber it", () => {
    const map = aliasMap([
      ["u1", { name: "Yousef", realName: "Ali" }],
      ["u2", { name: "Khalid", realName: "Ali Hassan" }],
    ]);
    expect(maskPlainNames("Ali Hassan declined the task", map)).toBe(
      "Khalid declined the task",
    );
  });

  it("ignores entries with no recorded real name", () => {
    const map = aliasMap([["u1", { name: "Yousef" }]]);
    expect(maskPlainNames("Ali Hassan said hi", map)).toBe("Ali Hassan said hi");
  });

  it("leaves the name alone inside a longer word", () => {
    const map = aliasMap([["u1", { name: "Yousef", realName: "Ali" }]]);
    expect(maskPlainNames("Alignment with Alice is fine", map)).toBe(
      "Alignment with Alice is fine",
    );
  });

  it("still masks a name hugged by punctuation", () => {
    const map = aliasMap([["u1", { name: "Yousef", realName: "Ali" }]]);
    expect(maskPlainNames("(Ali) said Ali's build, @Ali — Ali.", map)).toBe(
      "(Yousef) said Yousef's build, @Yousef — Yousef.",
    );
  });

  it("masks a non-Latin name without bleeding into adjacent letters", () => {
    const map = aliasMap([["u1", { name: "Yousef", realName: "علي" }]]);
    expect(maskPlainNames("علي أرسل التقرير", map)).toBe("Yousef أرسل التقرير");
    expect(maskPlainNames("علياء أرسلت التقرير", map)).toBe("علياء أرسلت التقرير");
  });
});

describe("maskBody", () => {
  it("handles tokens and leftover plain names in one pass", () => {
    const map = aliasMap([
      ["u1", { name: "Yousef", realName: "Ali Hassan" }],
      ["u2", { name: "Dana", realName: "Sara Noor" }],
    ]);
    expect(maskBody("@[Ali Hassan](u1) told Sara Noor to review", map)).toBe(
      "@[Yousef](u1) told Dana to review",
    );
  });
});

describe("maskName", () => {
  const map = aliasMap([["u1", { name: "Yousef", realName: "Ali Hassan" }]]);

  it("returns the alias for an aliased user", () => {
    expect(maskName("u1", "Ali Hassan", map)).toBe("Yousef");
  });

  it("passes through people with no alias, e.g. excludeFromAlias staff", () => {
    expect(maskName("u9", "Abdulaziz", map)).toBe("Abdulaziz");
  });
});

describe("aliasRequirement", () => {
  it("exempts clients and excluded staff", () => {
    expect(
      aliasRequirement({
        systemRole: "CLIENT",
        excludeFromAlias: false,
        gender: "MALE",
      }),
    ).toBe("exempt");
    expect(
      aliasRequirement({
        systemRole: "DEVELOPER",
        excludeFromAlias: true,
        gender: "MALE",
      }),
    ).toBe("exempt");
    expect(
      aliasRequirement(
        { systemRole: "DEVELOPER", excludeFromAlias: false, gender: "MALE" },
        "CLIENT",
      ),
    ).toBe("exempt");
  });

  it("separates a missing gender from being exempt", () => {
    // The distinction is the point: exempt means "keeps their real name on
    // purpose", no-gender means "would be exposed by accident".
    expect(
      aliasRequirement({
        systemRole: "DEVELOPER",
        excludeFromAlias: false,
        gender: null,
      }),
    ).toBe("no-gender");
  });

  it("requires an alias for a normal employee", () => {
    expect(
      aliasRequirement({
        systemRole: "DESIGNER",
        excludeFromAlias: false,
        gender: "FEMALE",
      }),
    ).toBe("required");
  });
});

describe("claimAliasForMember", () => {
  const withUser = (
    db: ReturnType<typeof fakeDb>,
    user: {
      name?: string | null;
      email?: string;
      systemRole: string;
      excludeFromAlias: boolean;
      gender: "MALE" | "FEMALE" | null;
    },
  ) =>
    Object.assign(db, {
      user: {
        findUnique: async () => ({
          name: user.name ?? null,
          email: user.email ?? "someone@example.com",
          systemRole: user.systemRole,
          excludeFromAlias: user.excludeFromAlias,
          gender: user.gender,
        }),
      },
    }) as unknown as AliasDb;

  it("refuses to seat a member who has no gender recorded", async () => {
    const db = withUser(fakeDb(["a1"]), {
      name: "Ali Hassan",
      systemRole: "DEVELOPER",
      excludeFromAlias: false,
      gender: null,
    });
    const err = await claimAliasForMember(db, {
      userId: "u1",
      projectId: "p1",
    }).catch((e: unknown) => e);

    // Returning null here is what used to let them join unaliased.
    expect(isAliasGenderMissing(err)).toBe(true);
    expect(isAliasBlocked(err)).toBe(true);
    expect((err as Error).message).toContain("Ali Hassan");
  });

  it("returns null for someone exempt, without touching the pool", async () => {
    const db = withUser(fakeDb(["a1"]), {
      systemRole: "DEVELOPER",
      excludeFromAlias: true,
      gender: "MALE",
    });
    expect(
      await claimAliasForMember(db, { userId: "u1", projectId: "p1" }),
    ).toBeNull();
    expect((db as unknown as ReturnType<typeof fakeDb>).assignments).toHaveLength(0);
  });

  it("claims for a normal employee", async () => {
    const db = withUser(fakeDb(["a1"]), {
      systemRole: "DEVELOPER",
      excludeFromAlias: false,
      gender: "MALE",
    });
    const claim = await claimAliasForMember(db, {
      userId: "u1",
      projectId: "p1",
    });
    expect(claim?.aliasId).toBe("a1");
  });

  it("reports an exhausted pool as blocked too, so callers treat both alike", async () => {
    const db = withUser(fakeDb([]), {
      systemRole: "DEVELOPER",
      excludeFromAlias: false,
      gender: "FEMALE",
    });
    const err = await claimAliasForMember(db, {
      userId: "u1",
      projectId: "p1",
    }).catch((e: unknown) => e);
    expect(isAliasPoolExhausted(err)).toBe(true);
    expect(isAliasBlocked(err)).toBe(true);
    expect(isAliasGenderMissing(err)).toBe(false);
  });
});

describe("needsAlias", () => {
  it("skips clients, excluded users, and anyone with no gender", () => {
    expect(
      needsAlias({ systemRole: "CLIENT", excludeFromAlias: false, gender: "MALE" }),
    ).toBe(false);
    expect(
      needsAlias({ systemRole: "DEVELOPER", excludeFromAlias: true, gender: "MALE" }),
    ).toBe(false);
    expect(
      needsAlias({ systemRole: "DEVELOPER", excludeFromAlias: false, gender: null }),
    ).toBe(false);
    expect(
      needsAlias(
        { systemRole: "DEVELOPER", excludeFromAlias: false, gender: "MALE" },
        "CLIENT",
      ),
    ).toBe(false);
  });

  it("aliases a normal employee with a recorded gender", () => {
    expect(
      needsAlias({ systemRole: "DESIGNER", excludeFromAlias: false, gender: "FEMALE" }),
    ).toBe(true);
  });
});

// ─── claimAlias ──────────────────────────────────────────────────────────────

class UniqueViolation extends Error {
  code = "P2002";
}

type Assignment = {
  id: string;
  aliasId: string;
  userId: string;
  projectId: string;
};

/**
 * In-memory stand-in for the slice of Postgres claimAlias leans on: the two
 * tables and their unique constraints, `FOR UPDATE SKIP LOCKED` row locks, and
 * transaction-scoped advisory locks. Modelling the locks is the point —
 * interleaved claims below wait exactly where they would wait on the database,
 * so the concurrency tests mean something.
 *
 * `shuffleKeys` mirrors the random draw order the real column provides. It
 * defaults to insertion order so the ordering tests can assert deliberately;
 * pass explicit keys to model a shuffled pool.
 */
function fakeDb(aliasIds: string[], shuffleKeys?: Record<string, number>) {
  const committed: Assignment[] = [];
  let seq = 0;
  let transactions = 0;

  const keyOf = (id: string) => shuffleKeys?.[id] ?? aliasIds.indexOf(id);

  /** Alias rows held by a transaction that has not ended yet. */
  const lockedRows = new Set<string>();
  /** Tail of the waiter chain per advisory key. */
  const advisoryTail = new Map<string, Promise<void>>();

  /** A transaction's own uncommitted state. */
  type Tx = { rows: Set<string>; release: (() => void)[]; writes: Assignment[] };

  async function takeAdvisoryLock(key: string, tx: Tx) {
    let release!: () => void;
    const mine = new Promise<void>((resolve) => (release = resolve));
    const ahead = advisoryTail.get(key) ?? Promise.resolve();
    advisoryTail.set(
      key,
      ahead.then(() => mine),
    );
    await ahead;
    tx.release.push(release);
  }

  function txClient(tx: Tx) {
    /** What this transaction can see: everything committed, plus its own writes. */
    const visible = () => [...committed, ...tx.writes];

    return {
      $queryRaw: async (
        strings: TemplateStringsArray,
        ...values: unknown[]
      ): Promise<unknown[]> => {
        const sql = strings.join(" ? ");

        if (sql.includes("pg_advisory_xact_lock")) {
          await takeAdvisoryLock(String(values[0]), tx);
          return [];
        }

        if (sql.includes('FROM "Alias"')) {
          // Guards two things the masking depends on: drawing by insert order
          // is what would leak an alphabetical import, and without SKIP LOCKED
          // two claims fight over the same row.
          if (!sql.includes('ORDER BY a."shuffleKey"')) {
            throw new Error("claimAlias must draw by shuffleKey");
          }
          if (!sql.includes("FOR UPDATE SKIP LOCKED")) {
            throw new Error("claimAlias must skip rows another claim holds");
          }
          const taken = new Set(visible().map((a) => a.aliasId));
          const pick = aliasIds
            .filter((id) => !taken.has(id) && !lockedRows.has(id))
            .sort((a, b) => keyOf(a) - keyOf(b))[0];
          if (!pick) return [];
          lockedRows.add(pick);
          tx.rows.add(pick);
          return [{ id: pick }];
        }

        throw new Error(`unexpected raw query: ${sql}`);
      },
      aliasAssignment: {
        findUnique: async ({
          where,
        }: {
          where: { userId_projectId: { userId: string; projectId: string } };
        }) => {
          const { userId, projectId } = where.userId_projectId;
          const hit = visible().find(
            (a) => a.userId === userId && a.projectId === projectId,
          );
          return hit ? { id: hit.id, aliasId: hit.aliasId } : null;
        },
        create: async ({
          data,
        }: {
          data: { aliasId: string; userId: string; projectId: string };
        }) => {
          // Postgres would block here and then raise; the tests treat any
          // violation as a bug, since a claim that collides has already lost
          // the ability to recover inside its transaction.
          if (visible().some((a) => a.aliasId === data.aliasId)) {
            throw new UniqueViolation("aliasId taken");
          }
          if (
            visible().some(
              (a) => a.userId === data.userId && a.projectId === data.projectId,
            )
          ) {
            throw new UniqueViolation("user already aliased on project");
          }
          const row = { id: `asg${++seq}`, ...data };
          tx.writes.push(row);
          return { id: row.id, aliasId: row.aliasId };
        },
      },
    };
  }

  const db = {
    /** Committed assignments. */
    get assignments() {
      return committed;
    },
    /** How many transactions the claims opened. */
    get transactions() {
      return transactions;
    },
    $transaction: async <T>(fn: (tx: ReturnType<typeof txClient>) => Promise<T>) => {
      transactions += 1;
      const tx: Tx = { rows: new Set(), release: [], writes: [] };
      try {
        const result = await fn(txClient(tx));
        committed.push(...tx.writes);
        return result;
      } finally {
        for (const id of tx.rows) lockedRows.delete(id);
        for (const release of tx.release) release();
      }
    },
  };

  return db as typeof db & AliasDb;
}

describe("claimAlias", () => {
  it("assigns the free alias with the lowest shuffle key", async () => {
    const db = fakeDb(["a1", "a2"]);
    const claim = await claimAlias(db, {
      userId: "u1",
      projectId: "p1",
      gender: "MALE",
    });
    expect(claim.aliasId).toBe("a1");
  });

  it("draws in shuffle order, not the order aliases were added", async () => {
    // "a1".."a4" stand in for an alphabetised import; the shuffle keys are what
    // the database assigns at random.
    const db = fakeDb(["a1", "a2", "a3", "a4"], { a1: 0.9, a2: 0.1, a3: 0.7, a4: 0.3 });
    const drawn: string[] = [];
    for (const userId of ["u1", "u2", "u3", "u4"]) {
      const claim = await claimAlias(db, { userId, projectId: "p1", gender: "MALE" });
      drawn.push(claim.aliasId);
    }
    expect(drawn).toEqual(["a2", "a4", "a3", "a1"]);
  });

  it("still exhausts the whole pool exactly once when shuffled", async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `a${i}`);
    const keys = Object.fromEntries(ids.map((id) => [id, Math.random()]));
    const db = fakeDb(ids, keys);
    for (let i = 0; i < 20; i += 1) {
      await claimAlias(db, { userId: `u${i}`, projectId: "p1", gender: "MALE" });
    }
    expect(new Set(db.assignments.map((a) => a.aliasId)).size).toBe(20);
    await expect(
      claimAlias(db, { userId: "u99", projectId: "p1", gender: "MALE" }),
    ).rejects.toThrow(AliasPoolExhaustedError);
  });

  it("is idempotent — re-claiming returns the same assignment", async () => {
    const db = fakeDb(["a1", "a2"]);
    const first = await claimAlias(db, {
      userId: "u1",
      projectId: "p1",
      gender: "MALE",
    });
    const second = await claimAlias(db, {
      userId: "u1",
      projectId: "p1",
      gender: "MALE",
    });
    expect(second).toEqual(first);
    expect(db.assignments).toHaveLength(1);
  });

  it("gives the same person a different alias on a second project", async () => {
    const db = fakeDb(["a1", "a2"]);
    const p1 = await claimAlias(db, {
      userId: "u1",
      projectId: "p1",
      gender: "MALE",
    });
    const p2 = await claimAlias(db, {
      userId: "u1",
      projectId: "p2",
      gender: "MALE",
    });
    expect(p1.aliasId).not.toBe(p2.aliasId);
  });

  it("never double-assigns an alias under concurrent claims", async () => {
    const db = fakeDb(["a1", "a2", "a3", "a4", "a5"]);
    const claims = await Promise.all(
      ["u1", "u2", "u3", "u4", "u5"].map((userId) =>
        claimAlias(db, { userId, projectId: "p1", gender: "MALE" }),
      ),
    );
    const aliasIds = claims.map((c) => c.aliasId);
    expect(new Set(aliasIds).size).toBe(5);
  });

  it("throws AliasPoolExhaustedError when nothing is free", async () => {
    const db = fakeDb(["a1"]);
    await claimAlias(db, { userId: "u1", projectId: "p1", gender: "MALE" });
    await expect(
      claimAlias(db, { userId: "u2", projectId: "p1", gender: "MALE" }),
    ).rejects.toThrow(AliasPoolExhaustedError);
  });

  it("reports exhaustion with the gender that ran out", async () => {
    const db = fakeDb([]);
    const err = await claimAlias(db, {
      userId: "u1",
      projectId: "p1",
      gender: "FEMALE",
    }).catch((e: unknown) => e);
    expect(isAliasPoolExhausted(err)).toBe(true);
    expect((err as AliasPoolExhaustedError).gender).toBe("FEMALE");
    expect((err as Error).message).toContain("female");
  });

  it("returns the winning row when a race is for the same person", async () => {
    const db = fakeDb(["a1", "a2"]);
    const [first, second] = await Promise.all([
      claimAlias(db, { userId: "u1", projectId: "p1", gender: "MALE" }),
      claimAlias(db, { userId: "u1", projectId: "p1", gender: "MALE" }),
    ]);
    expect(first).toEqual(second);
    expect(db.assignments).toHaveLength(1);
  });

  it("picks and writes in one transaction, so the two cannot be split", async () => {
    const db = fakeDb(["a1"]);
    await claimAlias(db, { userId: "u1", projectId: "p1", gender: "MALE" });
    expect(db.transactions).toBe(1);
  });

  it("joins the caller's transaction instead of opening its own", async () => {
    const db = fakeDb(["a1"]);
    await db.$transaction(async (tx) => {
      await claimAlias(tx as unknown as AliasDb, {
        userId: "u1",
        projectId: "p1",
        gender: "MALE",
      });
    });
    // A second transaction would put the membership row and the alias in
    // separate units of work, so exhaustion could no longer roll the member back.
    expect(db.transactions).toBe(1);
    expect(db.assignments).toHaveLength(1);
  });

  it("skips the alias a still-open claim is holding", async () => {
    const db = fakeDb(["a1", "a2"]);
    let finishFirst!: () => void;
    const firstMayCommit = new Promise<void>((resolve) => (finishFirst = resolve));

    const first = db.$transaction(async (tx) => {
      const claim = await claimAlias(tx as unknown as AliasDb, {
        userId: "u1",
        projectId: "p1",
        gender: "MALE",
      });
      await firstMayCommit;
      return claim;
    });

    // Let the first claim take its row, then claim while it is still uncommitted:
    // a1 is invisible to the second reader and only the row lock keeps them apart.
    await Promise.resolve();
    const second = await claimAlias(db, {
      userId: "u2",
      projectId: "p1",
      gender: "MALE",
    });
    finishFirst();

    expect((await first).aliasId).toBe("a1");
    expect(second.aliasId).toBe("a2");
  });
});
