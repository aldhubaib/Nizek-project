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
};

function createClient() {
  const pool = new Pool({
    connectionString,
    max: 10,
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

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;

function gracefulShutdown() {
  globalForPrisma.pool?.end().catch(() => {});
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
