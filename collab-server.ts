/**
 * Hocuspocus collaborative editing server for sprint planning/review documents.
 *
 * Start: node --import tsx collab-server.ts
 *
 * Shares the same Postgres as the Next.js app. Documents are loaded/saved from
 * the MeetingNote table. Auth verifies project access using better-auth session
 * tokens passed as WebSocket query params.
 *
 * NOTE: Requires the `ydoc` column on `MeetingNote`. Run the migration first:
 *   prisma migrate dev --name add-ydoc-to-meeting-note
 */

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const PORT = parseInt(process.env.COLLAB_PORT || "4500", 10);
const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!DATABASE_URL) {
  console.error("[collab] DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const server = new Server({
  port: PORT,
  address: "0.0.0.0",

  async onAuthenticate({ token, documentName }) {
    if (!token) throw new Error("Auth token required");

    const session = await prisma.authSession.findUnique({
      where: { token },
      include: { user: { select: { id: true, name: true, imageUrl: true, systemRole: true } } },
    });
    if (!session || session.expiresAt < new Date()) {
      throw new Error("Invalid or expired session");
    }

    const noteId = documentName.replace("note:", "");
    const note = await prisma.meetingNote.findUnique({
      where: { id: noteId },
      select: { projectId: true },
    });
    if (!note) throw new Error("Document not found");

    const membership = await prisma.projectMember.findFirst({
      where: { projectId: note.projectId, userId: session.user.id },
    });
    if (!membership && session.user.systemRole !== "ADMIN") {
      throw new Error("Access denied");
    }

    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        imageUrl: session.user.imageUrl,
      },
    };
  },

  extensions: [
    new Database({
      async fetch({ documentName }) {
        const noteId = documentName.replace("note:", "");
        const note = await prisma.meetingNote.findUnique({
          where: { id: noteId },
          select: { ydoc: true },
        });
        return note?.ydoc ?? null;
      },

      async store({ documentName, state }) {
        const noteId = documentName.replace("note:", "");
        await prisma.meetingNote.update({
          where: { id: noteId },
          data: { ydoc: Buffer.from(state) },
        });
      },
    }),
  ],
});

server.listen(PORT).then(() => {
  console.log(`[collab] Hocuspocus server running on port ${PORT}`);
});

process.on("SIGTERM", async () => {
  console.log("[collab] Shutting down...");
  await server.destroy();
  await prisma.$disconnect();
  process.exit(0);
});
