import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString =
  process.env.DIRECT_DATABASE_URL ??
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@localhost:51214/template1?sslmode=disable";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const pool = new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createClient();

globalForPrisma.prisma = prisma;
