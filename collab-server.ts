/**
 * Hocuspocus collaborative editing server for sprint planning/review documents.
 *
 * Start: node --import tsx collab-server.ts
 *
 * Shares the same Postgres as the Next.js app. Documents are loaded/saved from
 * the MeetingNote table. Auth verifies project access using better-auth session
 * tokens passed as WebSocket query params.
 *
 * The Yjs state and the HTML in `MeetingNote.content` are kept in step in both
 * directions: a document with no Yjs state yet is seeded from its HTML, and
 * every save writes the HTML back out. The rest of the app reads content, not
 * ydoc, so letting the two drift breaks ending a sprint.
 */

import { Server } from "@hocuspocus/server";
import { Database } from "@hocuspocus/extension-database";
import { JSDOM } from "jsdom";
import { PrismaClient } from "./src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// TipTap's HTML helpers parse and serialise through the DOM, so Node needs one
// before anything imports them. Must run before the schema import below.
const dom = new JSDOM("<!DOCTYPE html><body></body>");
const globals = globalThis as unknown as Record<string, unknown>;
globals.window ??= dom.window;
globals.document ??= dom.window.document;
globals.DOMParser ??= dom.window.DOMParser;
globals.Node ??= dom.window.Node;

const { generateHTML, generateJSON } = await import("@tiptap/core");
const { getSchema } = await import("@tiptap/core");
const { prosemirrorJSONToYDoc, yXmlFragmentToProsemirrorJSON } = await import("y-prosemirror");
const Y = await import("yjs");
const { noteSchemaExtensions } = await import("./src/lib/tiptap-schema.js");

/** The Yjs field TipTap's Collaboration extension binds the document to. */
const COLLAB_FIELD = "default";

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
      /**
       * Every note predates collaboration, so `ydoc` is null for all of them and
       * returning that null handed the editor an empty document — no Sprint
       * Information table and therefore no Start sprint button at all. Seed from
       * the HTML we already have instead.
       */
      async fetch({ documentName }) {
        const noteId = documentName.replace("note:", "");
        const note = await prisma.meetingNote.findUnique({
          where: { id: noteId },
          select: { ydoc: true, content: true },
        });
        if (!note) return null;
        if (note.ydoc) return note.ydoc;
        if (!note.content) return null;

        try {
          const json = generateJSON(note.content, noteSchemaExtensions);
          const seeded = prosemirrorJSONToYDoc(
            getSchema(noteSchemaExtensions),
            json,
            COLLAB_FIELD,
          );
          return Buffer.from(Y.encodeStateAsUpdate(seeded));
        } catch (err) {
          // Better to open empty and let the user retype than to refuse the
          // connection, but this needs to be visible in the logs.
          console.error(`[collab] could not seed ${noteId} from HTML:`, err);
          return null;
        }
      },

      /**
       * Writes the HTML back as well as the Yjs state.
       *
       * `MeetingNote.content` is what the rest of the app reads: completeSprint
       * pulls the incomplete reasons out of it, and the chat announcement
       * excerpts it. Storing only `ydoc` would freeze content at whatever it was
       * when collaboration was switched on, and ending a sprint would quietly
       * stop working.
       */
      async store({ documentName, state, document }) {
        const noteId = documentName.replace("note:", "");

        let content: string | null = null;
        try {
          const json = yXmlFragmentToProsemirrorJSON(document.getXmlFragment(COLLAB_FIELD));
          content = generateHTML(json, noteSchemaExtensions);
        } catch (err) {
          console.error(`[collab] could not render ${noteId} back to HTML:`, err);
        }

        await prisma.meetingNote.update({
          where: { id: noteId },
          data: {
            ydoc: Buffer.from(state),
            ...(content ? { content } : {}),
          },
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
