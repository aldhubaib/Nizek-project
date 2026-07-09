// Applies Prisma migrations at build/deploy time.
//
// Handles three cases safely:
//   1. Existing production DB (tables present, but no _prisma_migrations table):
//      baseline by marking the initial migration as already-applied, then deploy
//      the remaining migrations (e.g. new perf indexes).
//   2. Fresh database (no tables): `migrate deploy` applies everything, including 0_init.
//   3. Steady state (already migrated): `migrate deploy` applies only new migrations.
//
// This replaces the old prisma/ensure-tables.mjs ad-hoc DDL.

import pg from "pg";
import { execSync } from "node:child_process";

const BASELINE = "0_init";

const connectionString =
  process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;

if (!connectionString) {
  console.error("[migrate] No DATABASE_URL / DIRECT_DATABASE_URL set; skipping.");
  process.exit(0);
}

function run(cmd) {
  console.log(`[migrate] $ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

// Like run(), but tolerates failure. Used for the one-time baseline resolve so a
// second replica booting concurrently doesn't crash if the first already
// recorded the baseline migration.
function runTolerant(cmd) {
  try {
    run(cmd);
  } catch (err) {
    console.warn(`[migrate] non-fatal: ${cmd} -> ${err?.message ?? err}`);
  }
}

async function tableExists(client, name) {
  const { rows } = await client.query("SELECT to_regclass($1) AS oid", [
    `public."${name}"`,
  ]);
  return rows[0]?.oid != null;
}

async function main() {
  const client = new pg.Client({ connectionString });
  await client.connect();

  let needsBaseline = false;
  try {
    const hasMigrations = await tableExists(client, "_prisma_migrations");
    const hasSchema = await tableExists(client, "User");
    // Existing DB that predates Prisma Migrate -> baseline it.
    needsBaseline = !hasMigrations && hasSchema;
  } finally {
    await client.end();
  }

  if (needsBaseline) {
    console.log("[migrate] Existing schema detected without migration history; baselining.");
    runTolerant(`npx prisma migrate resolve --applied ${BASELINE}`);
  }

  run("npx prisma migrate deploy");
  console.log("[migrate] done");
}

main().catch((err) => {
  console.error("[migrate] Failed:", err?.message ?? err);
  process.exit(1);
});
