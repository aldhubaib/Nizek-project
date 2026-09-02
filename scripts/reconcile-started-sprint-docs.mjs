/**
 * One-time repair for planning documents belonging to sprints that had already
 * started before reconciliation existed.
 *
 * Those documents drifted while the old code only ever added tasks, and the
 * freeze that now protects a started sprint's document also stops it ever
 * catching up on its own. This closes the gap once. It is deliberately not
 * wired into the app: from here on a started document is meant to stay put.
 *
 * Dry run by default. Pass --apply to write, and optionally --status=ACTIVE
 * (repeatable) to limit which sprints are touched.
 *
 * Reuses the app's own syncPlanningDocTasks rather than reimplementing the
 * reconcile, so a document repaired here is byte-identical to one the editor
 * would produce.
 */
import pg from "pg";
import {
  planningTaskIdsFromHtml,
  syncPlanningDocTasks,
} from "../src/lib/sprint-planning-doc.ts";
import { taskCode } from "../src/lib/task-label.ts";
import { isBuiltInTaskFieldQuestion } from "../src/lib/task-readiness.ts";
import { isCurrentSprintStatus } from "../src/lib/sprint-status.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const statuses = args
  .filter((a) => a.startsWith("--status="))
  .map((a) => a.slice("--status=".length).toUpperCase());
// Everything that is not still being planned; those repair themselves.
const TARGET = statuses.length
  ? statuses
  : ["ACTIVE", "COMPLETED", "PARTIALLY_COMPLETED", "SHIPPED"];

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL required");

const client = new pg.Client({ connectionString });
await client.connect();

// Every edit is attributed to a real person, because NoteHistory shows up in
// the note UI and an entry from nobody is worse than no entry.
const actorEmail = args.find((a) => a.startsWith("--actor="))?.slice("--actor=".length);
let actorId = null;
if (APPLY) {
  if (!actorEmail) throw new Error("--actor=<email> is required with --apply");
  const { rows } = await client.query(`SELECT id FROM "User" WHERE email = $1`, [actorEmail]);
  if (rows.length === 0) throw new Error(`No user with email ${actorEmail}`);
  actorId = rows[0].id;
}

const { rows: notes } = await client.query(
  `SELECT n.id AS note_id, n.content, s.id AS sprint_id, s.name, s.status, s."projectId"
     FROM "MeetingNote" n
     JOIN "Sprint" s ON s.id = n."sprintId"
    WHERE n."noteType" = 'SPRINT_PLANNING'
      AND s.status = ANY($1::"SprintStatus"[])
    ORDER BY s."projectId", s.name`,
  [TARGET],
);

const { rows: questions } = await client.query(
  `SELECT id, question, "taskType" FROM "DefaultQuestion" ORDER BY "order" ASC`,
);

/** The same payload getSprintPlanningTasks builds, assembled from SQL. */
async function planningTasks(sprintId) {
  const { rows } = await client.query(
    `SELECT t.id, t.title, t."taskType"::text AS task_type, t.stage::text AS stage,
            t."taskNumber", t."estimatedMinutes", t."unplannedInSprint",
            u.id AS assignee_id, u.name AS assignee_name, u."imageUrl" AS assignee_image,
            s.status::text AS sprint_status,
            (SELECT count(*)::int FROM "SprintTaskSnapshot" sn WHERE sn."taskId" = t.id) AS snapshots,
            p.decision, p.risk
       FROM "Task" t
       LEFT JOIN "User" u ON u.id = t."assigneeId"
       LEFT JOIN "Sprint" s ON s.id = t."sprintId"
       LEFT JOIN "SprintTaskPlan" p ON p."taskId" = t.id AND p."sprintId" = $1
      WHERE t."sprintId" = $1 AND t."archivedAt" IS NULL
      ORDER BY t."order" ASC`,
    [sprintId],
  );

  const { rows: answers } = await client.query(
    `SELECT a."taskId", a."questionId", a.answer
       FROM "TaskAnswer" a
       JOIN "Task" t ON t.id = a."taskId"
      WHERE t."sprintId" = $1`,
    [sprintId],
  );
  const answerBy = new Map(answers.map((a) => [`${a.taskId}:${a.questionId}`, a.answer]));

  return rows.map((t) => ({
    id: t.id,
    code: taskCode(t.task_type, t.taskNumber),
    title: t.title,
    taskType: t.task_type,
    stage: t.stage,
    estimatedMinutes: t.estimatedMinutes,
    sprintCount:
      t.snapshots + (t.sprint_status && isCurrentSprintStatus(t.sprint_status) ? 1 : 0),
    assignee: t.assignee_id
      ? { id: t.assignee_id, name: t.assignee_name, imageUrl: t.assignee_image }
      : null,
    unplanned: t.unplannedInSprint,
    decision: t.decision ?? "",
    risk: t.risk ?? "",
    questions: questions
      .filter((q) => q.taskType === t.task_type && !isBuiltInTaskFieldQuestion(q.question))
      .map((q) => ({
        question: q.question,
        answer: answerBy.get(`${t.id}:${q.id}`) ?? "",
      })),
  }));
}

// The document's own parser, not a regex: older blocks carry their id only
// inside the embedded JSON, and a hand-rolled match silently misses them.
const idsIn = (html) => planningTaskIdsFromHtml(html);

console.log(`${APPLY ? "APPLYING" : "DRY RUN"} over statuses: ${TARGET.join(", ")}`);
console.log(`${notes.length} planning document(s) on started sprints\n`);

let changed = 0;
for (const note of notes) {
  const tasks = await planningTasks(note.sprint_id);
  const next = syncPlanningDocTasks(note.content, tasks);
  if (next === note.content) continue;

  changed++;
  const before = idsIn(note.content);
  const after = idsIn(next);
  const removed = before.filter((id) => !after.includes(id));
  const added = after.filter((id) => !before.includes(id));

  console.log(`${note.name} (${note.status})  sprint=${note.sprint_id}`);
  console.log(
    added.length || removed.length
      ? `    ${before.length} block(s) -> ${after.length}; +${added.length} -${removed.length}`
      : `    ${before.length} block(s), unchanged; assignee/estimate/Decision/Risk refreshed`,
  );

  if (APPLY) {
    await client.query("BEGIN");
    try {
      // Guarded so a document edited between the read and the write is skipped
      // rather than overwritten.
      const res = await client.query(
        `UPDATE "MeetingNote" SET content = $1, "updatedAt" = now()
          WHERE id = $2 AND content = $3`,
        [next, note.note_id, note.content],
      );
      if (res.rowCount === 1) {
        // The previous revision goes into the history the note UI already
        // reads, so this is undoable in place rather than from a file.
        await client.query(
          `INSERT INTO "NoteHistory" (id, field, "oldValue", "newValue", "noteId", "userId")
           VALUES (gen_random_uuid()::text, 'content', $1, $2, $3, $4)`,
          [note.content, next, note.note_id, actorId],
        );
        console.log("    written, previous revision saved to NoteHistory");
      } else {
        console.log("    SKIPPED: changed underneath us");
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.log(`    FAILED: ${err.message}`);
    }
  }
}

console.log(
  `\n${changed} document(s) ${APPLY ? "updated" : "would change"}; ${notes.length - changed} already correct.`,
);
if (!APPLY && changed > 0) console.log("Re-run with --apply to write.");

await client.end();
