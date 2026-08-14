import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
  /** The generated PrismaClient class this singleton was built from. */
  prismaClientClass: typeof PrismaClient | undefined;
};

// Pool size is env-tunable so we can raise it per-replica when a Postgres
// connection pooler (e.g. PgBouncer) sits in front, enabling horizontal
// scale-out without exhausting DB connections. Defaults to 10.
const POOL_MAX = Number(process.env.PG_POOL_MAX ?? 10) || 10;

function createClient() {
  const pool = new Pool({
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Keep TCP connections alive so idle sockets aren't silently dropped by the
    // network (a common cause of "Connection terminated unexpectedly" / ETIMEDOUT).
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    // NOTE: this runs as a long-lived server on Railway, so we must NOT allow the
    // pool to exit on idle — that churns connections and forces slow reconnects.
  });

  pool.on("error", (err) => {
    console.error("Unexpected pg pool error:", err.message);
  });

  globalForPrisma.pool = pool;
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function getClient() {
  // `prisma generate` swaps in a new PrismaClient class (new DMMF). Next HMR
  // re-runs this module, but globalThis still holds the old instance — which
  // then rejects queries with "Unknown argument `taskHighlightThread`" etc.
  if (
    globalForPrisma.prisma &&
    globalForPrisma.prismaClientClass === PrismaClient
  ) {
    return globalForPrisma.prisma;
  }
  if (globalForPrisma.pool) {
    globalForPrisma.pool.end().catch(() => {});
    globalForPrisma.pool = undefined;
  }
  globalForPrisma.prismaClientClass = PrismaClient;
  const client = createClient();
  globalForPrisma.prisma = client;
  return client;
}

export const prisma = getClient();

function gracefulShutdown() {
  globalForPrisma.pool?.end().catch(() => {});
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
