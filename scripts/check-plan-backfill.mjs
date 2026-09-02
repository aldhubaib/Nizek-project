// Read-only. Compares the Decision/Risk text still sitting in planning document
// HTML against what the backfill put into SprintTaskPlan, so we can be sure a
// reconcile will not blank out something a person typed.
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL required");

const client = new pg.Client({ connectionString });
await client.connect();

function unescapeAttr(v) {
  return v
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Every sprint-task block in a document, with whatever Decision/Risk it holds. */
function blocksFromHtml(html) {
  const out = [];
  for (const tag of html.match(/<div[^>]*data-type="sprint-task"[^>]*>/gi) ?? []) {
    const id = tag.match(/\sdata-id="([^"]*)"/i)?.[1];
    if (!id) continue;
    out.push({
      id,
      decision: unescapeAttr(tag.match(/\sdata-decision="([^"]*)"/i)?.[1] ?? "").trim(),
      risk: unescapeAttr(tag.match(/\sdata-risk="([^"]*)"/i)?.[1] ?? "").trim(),
    });
  }
  return out;
}

const { rows: notes } = await client.query(`
  SELECT n.id, n."sprintId", n.content, s.status
    FROM "MeetingNote" n JOIN "Sprint" s ON s.id = n."sprintId"
   WHERE n."noteType" = 'SPRINT_PLANNING'
`);
const { rows: plans } = await client.query(
  `SELECT "sprintId", "taskId", decision, risk FROM "SprintTaskPlan"`,
);

const planKey = new Map(
  plans.map((p) => [`${p.sprintId}:${p.taskId}`, p]),
);

let htmlWithText = 0;
const atRisk = [];

for (const note of notes) {
  for (const b of blocksFromHtml(note.content)) {
    if (!b.decision && !b.risk) continue;
    htmlWithText++;
    const plan = planKey.get(`${note.sprintId}:${b.id}`);
    const lostDecision = b.decision && (plan?.decision ?? "").trim() !== b.decision;
    const lostRisk = b.risk && (plan?.risk ?? "").trim() !== b.risk;
    if (lostDecision || lostRisk) {
      atRisk.push({
        sprint: note.sprintId,
        status: note.status,
        task: b.id,
        inTable: Boolean(plan),
        decision: b.decision.slice(0, 40),
        risk: b.risk.slice(0, 40),
      });
    }
  }
}

console.log(`planning documents scanned : ${notes.length}`);
console.log(`task blocks carrying text  : ${htmlWithText}`);
console.log(`SprintTaskPlan rows        : ${plans.length}`);
console.log(`blocks whose text is NOT in the table: ${atRisk.length}`);

for (const r of atRisk.slice(0, 25)) {
  console.log(
    `  sprint=${r.sprint} status=${r.status} task=${r.task} row=${r.inTable ? "exists" : "MISSING"}`,
  );
  if (r.decision) console.log(`      decision: ${r.decision}`);
  if (r.risk) console.log(`      risk:     ${r.risk}`);
}

const unstartedAtRisk = atRisk.filter(
  (r) => r.status === "PLANNED" || r.status === "NEXT",
);
console.log(
  `\nOf those, ${unstartedAtRisk.length} are on unstarted sprints — the only ones a reconcile would overwrite.`,
);

await client.end();
