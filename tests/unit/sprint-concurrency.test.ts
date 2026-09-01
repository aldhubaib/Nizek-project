/**
 * The concurrency guarantees, exercised against a real Postgres.
 *
 * These are deliberately not tested through the server actions: mocking auth
 * would leave the interesting part — what two connections racing each other
 * actually do — untested. What matters is that the database refuses the second
 * writer, and that only the database can promise it, because the app runs on
 * two replicas and an in-process guard is worth nothing across them.
 *
 * Skipped when no DATABASE_URL is set, so CI without a database still passes.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const CONNECTION = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const suite = CONNECTION ? describe : describe.skip;

let pool: pg.Pool;
let projectId: string;
let userId: string;

/** Two connections, so they genuinely contend rather than queue on one socket. */
async function inParallel<T>(
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const clients = await Promise.all([pool.connect(), pool.connect()]);
  try {
    return await Promise.allSettled(clients.map((c) => work(c)));
  } finally {
    clients.forEach((c) => c.release());
  }
}

function fulfilled<T>(results: PromiseSettledResult<T>[]) {
  return results.filter((r) => r.status === "fulfilled");
}

suite("sprint concurrency invariants", () => {
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: CONNECTION, max: 6 });
    projectId = `test-conc-${Date.now()}`;
    userId = `test-user-${Date.now()}`;

    await pool.query(
      `INSERT INTO "User" (id, email, "updatedAt") VALUES ($1, $2, now())`,
      [userId, `${userId}@example.test`],
    );
    await pool.query(
      `INSERT INTO "Project" (id, name, "updatedAt") VALUES ($1, 'Concurrency fixture', now())`,
      [projectId],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    // Sprints, notes and plans all cascade from the project.
    await pool.query(`DELETE FROM "Project" WHERE id = $1`, [projectId]).catch(() => {});
    await pool.query(`DELETE FROM "User" WHERE id = $1`, [userId]).catch(() => {});
    await pool.end();
  });

  async function makeSprint(name: string, status: string): Promise<string> {
    const id = `${projectId}-${name}`;
    await pool.query(
      `INSERT INTO "Sprint" (id, name, "startDate", "endDate", status, "projectId", "updatedAt")
       VALUES ($1, $2, now(), now(), $3::"SprintStatus", $4, now())`,
      [id, name, status, projectId],
    );
    return id;
  }

  it("refuses a second NEXT sprint in the same project", async () => {
    const a = await makeSprint("next-a", "PLANNED");
    const b = await makeSprint("next-b", "PLANNED");

    // Both people drag a different sprint into Next at the same moment.
    const clients = await Promise.all([pool.connect(), pool.connect()]);
    const outcomes = await Promise.allSettled(
      [a, b].map(async (sprintId, i) => {
        const client = clients[i];
        await client.query("BEGIN");
        try {
          await client.query(
            `UPDATE "Sprint" SET status = 'NEXT' WHERE id = $1`,
            [sprintId],
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }),
    );
    clients.forEach((c) => c.release());

    expect(fulfilled(outcomes)).toHaveLength(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "Sprint" WHERE "projectId" = $1 AND status = 'NEXT'`,
      [projectId],
    );
    expect(rows[0].n).toBe(1);

    await pool.query(`DELETE FROM "Sprint" WHERE id = ANY($1)`, [[a, b]]);
  });

  it("creates one sprint, not two, when both callers find the column empty", async () => {
    const column = "NEXT";

    // Exactly what ensureSprintForColumn does: lock, read, create if absent.
    const outcomes = await inParallel(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `SELECT true FROM pg_advisory_xact_lock(hashtext($1)::bigint)`,
          [`sprint-column:${projectId}:${column}`],
        );
        const existing = await client.query(
          `SELECT id FROM "Sprint" WHERE "projectId" = $1 AND status = $2::"SprintStatus" LIMIT 1`,
          [projectId, column],
        );
        if (existing.rows.length > 0) {
          await client.query("COMMIT");
          return { created: false, id: existing.rows[0].id as string };
        }
        const created = await client.query(
          `INSERT INTO "Sprint" (id, name, "startDate", "endDate", status, "projectId", "updatedAt")
           VALUES (gen_random_uuid()::text, 'Sprint 1', now(), now(), $1::"SprintStatus", $2, now())
           RETURNING id`,
          [column, projectId],
        );
        await client.query("COMMIT");
        return { created: true, id: created.rows[0].id as string };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    const won = fulfilled(outcomes).map((r) => r.value);
    expect(won).toHaveLength(2);
    expect(won.filter((r) => r.created)).toHaveLength(1);
    // The loser is handed the winner's sprint, not one of its own.
    expect(new Set(won.map((r) => r.id)).size).toBe(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "Sprint" WHERE "projectId" = $1`,
      [projectId],
    );
    expect(rows[0].n).toBe(1);

    await pool.query(`DELETE FROM "Sprint" WHERE "projectId" = $1`, [projectId]);
  });

  it("refuses a second planning document for the same sprint", async () => {
    const sprintId = await makeSprint("doc-race", "NEXT");

    const outcomes = await inParallel(async (client) =>
      client.query(
        `INSERT INTO "MeetingNote"
           (id, title, content, date, "noteType", "projectId", "authorId", "sprintId", "updatedAt")
         VALUES (gen_random_uuid()::text, 'Sprint planning', '<p></p>', now(),
                 'SPRINT_PLANNING', $1, $2, $3, now())`,
        [projectId, userId, sprintId],
      ),
    );

    expect(fulfilled(outcomes)).toHaveLength(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "MeetingNote"
        WHERE "sprintId" = $1 AND "noteType" = 'SPRINT_PLANNING'`,
      [sprintId],
    );
    expect(rows[0].n).toBe(1);
  });

  // The index is on (sprintId, noteType), so a sprint keeps both of its
  // documents. Getting this wrong would make it impossible to end a sprint.
  it("still allows a review document alongside the planning one", async () => {
    const sprintId = await makeSprint("doc-both", "PLANNED");

    for (const noteType of ["SPRINT_PLANNING", "SPRINT_REVIEW"]) {
      await pool.query(
        `INSERT INTO "MeetingNote"
           (id, title, content, date, "noteType", "projectId", "authorId", "sprintId", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, '<p></p>', now(), $2::"NoteType", $3, $4, $5, now())`,
        [noteType, noteType, projectId, userId, sprintId],
      );
    }

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "MeetingNote" WHERE "sprintId" = $1`,
      [sprintId],
    );
    expect(rows[0].n).toBe(2);
  });

  it("serialises two starts of the same project behind one advisory lock", async () => {
    const sprintId = await makeSprint("start-race", "PLANNED");
    const order: string[] = [];

    // The lock is what stops the second caller reading the sprint's tasks while
    // the first is still promoting them.
    const outcomes = await inParallel(async (client) => {
      await client.query("BEGIN");
      try {
        await client.query(
          `SELECT true FROM pg_advisory_xact_lock(hashtext($1)::bigint)`,
          [`sprint-start:${projectId}`],
        );
        order.push("enter");
        await new Promise((r) => setTimeout(r, 40));
        order.push("leave");
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    expect(fulfilled(outcomes)).toHaveLength(2);
    // Never interleaved: the second only enters after the first has left.
    expect(order).toEqual(["enter", "leave", "enter", "leave"]);

    await pool.query(`DELETE FROM "Sprint" WHERE id = $1`, [sprintId]);
  });

  it("keeps one SprintTaskPlan row per task per sprint", async () => {
    const sprintId = await makeSprint("plan-race", "PLANNED");
    const taskId = `${projectId}-task`;
    await pool.query(
      `INSERT INTO "Task" (id, title, stage, "order", "projectId", "sprintId", "createdById", "updatedAt")
       VALUES ($1, 'Task', 'BACKLOG'::"Stage", 0, $2, $3, $4, now())`,
      [taskId, projectId, sprintId, userId],
    );

    const outcomes = await inParallel(async (client) =>
      client.query(
        `INSERT INTO "SprintTaskPlan" (id, "sprintId", "taskId", decision, risk, "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, 'a decision', 'a risk', now())`,
        [sprintId, taskId],
      ),
    );

    expect(fulfilled(outcomes)).toHaveLength(1);

    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM "SprintTaskPlan" WHERE "sprintId" = $1 AND "taskId" = $2`,
      [sprintId, taskId],
    );
    expect(rows[0].n).toBe(1);
  });
});
