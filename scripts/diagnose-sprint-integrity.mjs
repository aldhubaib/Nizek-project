// Read-only audit of sprint / planning-document integrity.
//
// Reports the three failure modes that make a planning document disagree with
// the Next column:
//   1. More than one NEXT sprint in a project — the board renders one of them,
//      so tasks dropped into Next by another person land out of sight.
//   2. More than one planning document pointing at the same sprint — created by
//      two people opening the planning view at the same moment.
//   3. A planning document whose task set differs from its sprint's. "Ghost"
//      rows (in the document, not in the sprint) are what disable Start sprint.
//
// Writes nothing. Safe to point at production:
//   DATABASE_URL=... node scripts/diagnose-sprint-integrity.mjs [projectId]

import pg from "pg";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error("[diagnose] No DATABASE_URL / DIRECT_DATABASE_URL set.");
  process.exit(1);
}

const focusProjectId = process.argv[2] ?? null;

function unescapeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** The sprint a planning document belongs to, read from its sprint-info node. */
function sprintIdFromHtml(html) {
  const match = html.match(/data-info="([^"]*)"/);
  if (!match) return null;
  try {
    const info = JSON.parse(unescapeAttr(match[1]));
    return info?.sprintId || null;
  } catch {
    return null;
  }
}

/** Task ids, plus whether Decision and Risk are filled, per sprint-task node. */
function planningTasksFromHtml(html) {
  const out = [];
  const tags = html.match(/<div\b[^>]*data-type="sprint-task"[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const taskMatch = tag.match(/\sdata-task="([^"]*)"/i);
    if (!taskMatch) continue;
    let id = null;
    try {
      id = JSON.parse(unescapeAttr(taskMatch[1]))?.id ?? null;
    } catch {
      continue;
    }
    if (!id) continue;
    const decision = tag.match(/\sdata-decision="([^"]*)"/i);
    const risk = tag.match(/\sdata-risk="([^"]*)"/i);
    out.push({
      id,
      decision: decision ? unescapeAttr(decision[1]).trim() : "",
      risk: risk ? unescapeAttr(risk[1]).trim() : "",
    });
  }
  return out;
}

function heading(text) {
  console.log(`\n${"=".repeat(72)}\n${text}\n${"=".repeat(72)}`);
}

/** Mirrors isUnstartedSprint: only these still mirror their task list. */
function isUnstarted(status) {
  return status === "PLANNED" || status === "NEXT";
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // ---- 1. Duplicate NEXT sprints -------------------------------------
    heading("1. Projects with more than one NEXT sprint");

    const dupNext = await client.query(`
      SELECT s."projectId",
             p.name AS project_name,
             count(*)::int AS sprint_count,
             json_agg(json_build_object(
               'id', s.id, 'name', s.name,
               'sortOrder', s."sortOrder", 'createdAt', s."createdAt"
             ) ORDER BY s."sortOrder", s."createdAt") AS sprints
      FROM "Sprint" s
      JOIN "Project" p ON p.id = s."projectId"
      WHERE s.status = 'NEXT'
      GROUP BY s."projectId", p.name
      HAVING count(*) > 1
      ORDER BY count(*) DESC
    `);

    if (dupNext.rows.length === 0) {
      console.log("None. Every project has at most one NEXT sprint.");
    } else {
      console.log(
        `${dupNext.rows.length} project(s) affected. The migration will keep the ` +
          `lowest sortOrder and demote the rest to PLANNED:\n`,
      );
      for (const row of dupNext.rows) {
        console.log(`  ${row.project_name}  (${row.projectId})  ${row.sprint_count} NEXT sprints`);
        row.sprints.forEach((s, i) => {
          const verdict = i === 0 ? "KEEP as NEXT" : "-> demote to PLANNED";
          console.log(`      ${s.name}  (${s.id})  sortOrder=${s.sortOrder}  ${verdict}`);
        });
      }
    }

    // ---- 2 & 3. Planning documents -------------------------------------
    const notes = await client.query(`
      SELECT n.id, n."projectId", n.title, n.content, n."createdAt",
             n.ydoc IS NOT NULL AS has_ydoc,
             p.name AS project_name
      FROM "MeetingNote" n
      JOIN "Project" p ON p.id = n."projectId"
      WHERE n."noteType" = 'SPRINT_PLANNING'
      ORDER BY n."createdAt" DESC
    `);

    const bySprint = new Map();
    let unlinked = 0;
    for (const note of notes.rows) {
      const sprintId = sprintIdFromHtml(note.content);
      if (!sprintId) {
        unlinked += 1;
        continue;
      }
      if (!bySprint.has(sprintId)) bySprint.set(sprintId, []);
      bySprint.get(sprintId).push({ ...note, sprintId });
    }

    heading("2. Sprints with more than one planning document");

    const dupDocs = [...bySprint.entries()].filter(([, list]) => list.length > 1);
    if (dupDocs.length === 0) {
      console.log("None. Every sprint has at most one planning document.");
    } else {
      console.log(
        `${dupDocs.length} sprint(s) affected. getSprintTypedNote returns the newest, ` +
          `so anyone editing an older copy is writing into a document nobody reads:\n`,
      );
      for (const [sprintId, list] of dupDocs) {
        console.log(`  sprint ${sprintId}  (${list[0].project_name})  ${list.length} documents`);
        for (const note of list) {
          const tasks = planningTasksFromHtml(note.content);
          const filled = tasks.filter((t) => t.decision && t.risk).length;
          console.log(
            `      ${note.id}  "${note.title}"  created=${note.createdAt.toISOString().slice(0, 10)}  ` +
              `${tasks.length} tasks, ${filled} with Decision+Risk`,
          );
        }
      }
    }

    if (unlinked > 0) {
      console.log(
        `\n  Note: ${unlinked} planning document(s) carry no sprint-info node and ` +
          `cannot be linked to a sprint. The backfill will leave sprintId NULL for these.`,
      );
    }

    // ---- 3. Ghost / missing tasks ---------------------------------------
    heading("3. Planning documents whose task set differs from their sprint");

    const liveTasks = await client.query(`
      SELECT "sprintId", id, title
      FROM "Task"
      WHERE "sprintId" IS NOT NULL AND "archivedAt" IS NULL
    `);

    const tasksBySprint = new Map();
    for (const row of liveTasks.rows) {
      if (!tasksBySprint.has(row.sprintId)) tasksBySprint.set(row.sprintId, new Map());
      tasksBySprint.get(row.sprintId).set(row.id, row.title);
    }

    const sprintStatus = await client.query(`
      SELECT id, name, status, "projectId" FROM "Sprint"
    `);
    const sprintById = new Map(sprintStatus.rows.map((s) => [s.id, s]));

    const drifted = [];
    for (const [sprintId, list] of bySprint) {
      // Only the document actually served matters: newest wins.
      const note = list[0];
      const sprint = sprintById.get(sprintId);
      if (!sprint) continue;

      const docTasks = planningTasksFromHtml(note.content);
      const live = tasksBySprint.get(sprintId) ?? new Map();
      const docIds = new Set(docTasks.map((t) => t.id));

      const ghosts = docTasks.filter((t) => !live.has(t.id));
      const missing = [...live.keys()].filter((id) => !docIds.has(id));
      if (ghosts.length === 0 && missing.length === 0) continue;

      drifted.push({ note, sprint, ghosts, missing, live, docTasks });
    }

    if (drifted.length === 0) {
      console.log("None. Every planning document matches its sprint's task list.");
    } else {
      console.log(
        `${drifted.length} document(s) out of sync. Unstarted sprints repair ` +
          `themselves the next time their document is opened; started ones are ` +
          `frozen and keep the drift as history:\n`,
      );
      for (const d of drifted) {
        const selfHealing = isUnstarted(d.sprint.status);
        console.log(
          `  ${d.sprint.name}  (${d.sprint.id})  status=${d.sprint.status}  ` +
            `project=${d.sprint.projectId}`,
        );
        console.log(
          `      document ${d.note.id}: ${d.docTasks.length} rows, sprint holds ${d.live.size} tasks`,
        );
        if (d.ghosts.length > 0) {
          console.log(`      ${d.ghosts.length} GHOST row(s) in the document but not in the sprint:`);
          for (const g of d.ghosts) {
            console.log(
              `          ${g.id}  decision=${g.decision ? "set" : "EMPTY"}  risk=${g.risk ? "set" : "EMPTY"}`,
            );
          }
        }
        if (d.missing.length > 0) {
          console.log(`      ${d.missing.length} task(s) in the sprint but missing from the document:`);
          for (const id of d.missing) {
            console.log(`          ${id}  "${d.live.get(id)}"`);
          }
        }
        console.log(
          selfHealing
            ? `      >> Unstarted: reconcile clears this on next open. Start is not blocked, ` +
                `because validation reads the sprint's task list, not the document.`
            : `      >> Already started: document is frozen, drift is left as-is.`,
        );
      }
    }

    // ---- 4. Decision / Risk inventory for the backfill -------------------
    heading("4. Decision / Risk values recoverable for the SprintTaskPlan backfill");

    let plans = 0;
    let withDecision = 0;
    let withRisk = 0;
    for (const [sprintId, list] of bySprint) {
      const live = tasksBySprint.get(sprintId) ?? new Map();
      for (const t of planningTasksFromHtml(list[0].content)) {
        if (!live.has(t.id)) continue; // ghosts are dropped, not migrated
        plans += 1;
        if (t.decision) withDecision += 1;
        if (t.risk) withRisk += 1;
      }
    }
    console.log(
      `${plans} SprintTaskPlan row(s) will be created: ` +
        `${withDecision} with a Decision, ${withRisk} with a Risk.`,
    );

    const withYdoc = notes.rows.filter((n) => n.has_ydoc).length;
    console.log(
      `\n${withYdoc} of ${notes.rows.length} planning document(s) have a ydoc. ` +
        (withYdoc === 0
          ? "Collaboration has never run, so content HTML is the source of truth."
          : "Some content may be newer in the ydoc than in content HTML."),
    );

    // ---- 5. Focus project ------------------------------------------------
    if (focusProjectId) {
      heading(`5. Focus: project ${focusProjectId}`);

      const project = await client.query(
        `SELECT id, name FROM "Project" WHERE id = $1`,
        [focusProjectId],
      );
      if (project.rows.length === 0) {
        console.log("Project not found.");
      } else {
        console.log(`${project.rows[0].name}\n`);

        const sprints = await client.query(
          `SELECT s.id, s.name, s.status, s."sortOrder",
                  (SELECT count(*)::int FROM "Task" t
                    WHERE t."sprintId" = s.id AND t."archivedAt" IS NULL) AS task_count
           FROM "Sprint" s WHERE s."projectId" = $1
           ORDER BY s.status, s."sortOrder"`,
          [focusProjectId],
        );
        console.log("  Sprints:");
        for (const s of sprints.rows) {
          console.log(
            `      ${s.status.padEnd(20)} ${s.name.padEnd(24)} ${s.task_count} tasks  (${s.id})`,
          );
        }

        const nextCount = sprints.rows.filter((s) => s.status === "NEXT").length;
        const projectDrift = drifted.filter((d) => d.sprint.projectId === focusProjectId);

        console.log("\n  Verdict:");
        if (nextCount > 1) {
          console.log(`      HIT: ${nextCount} NEXT sprints. Tasks are split across them.`);
        }
        for (const d of projectDrift) {
          if (d.ghosts.length > 0) {
            console.log(
              `      HIT: "${d.sprint.name}" document carries ${d.ghosts.length} ghost row(s).`,
            );
          }
          if (d.missing.length > 0) {
            console.log(
              `      HIT: "${d.sprint.name}" document is missing ${d.missing.length} task(s) that are in the sprint.`,
            );
          }
        }
        const projectDupDocs = dupDocs.filter(
          ([sprintId]) => sprintById.get(sprintId)?.projectId === focusProjectId,
        );
        for (const [sprintId, list] of projectDupDocs) {
          console.log(
            `      HIT: sprint ${sprintId} has ${list.length} competing planning documents.`,
          );
        }
        if (nextCount <= 1 && projectDrift.length === 0 && projectDupDocs.length === 0) {
          console.log("      Clean on all three checks.");
        }
      }
    }

    console.log("");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[diagnose] Failed:", err?.message ?? err);
  process.exit(1);
});
