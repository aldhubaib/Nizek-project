/**
 * Fills Message.searchText for rows the SQL migration left alone (card
 * payloads) and adds attachment filenames onto ordinary messages.
 * Does not touch updatedAt, so open chats do not treat this as an edit.
 *
 *   node --env-file=.env --import tsx scripts/backfill-message-search.ts
 */
import { prisma } from "../src/lib/prisma";
import { messageSearchText } from "../src/lib/message-search";

const PAGE = 200;

async function main() {
  let cursor: string | undefined;
  let count = 0;
  for (;;) {
    const rows = await prisma.message.findMany({
      where: { deletedAt: null },
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: {
        id: true,
        body: true,
        attachments: { select: { filename: true } },
      },
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      const text = messageSearchText(
        row.body,
        row.attachments.map((file) => file.filename),
      );
      await prisma.$executeRaw`UPDATE "Message" SET "searchText" = ${text} WHERE id = ${row.id}`;
    }
    count += rows.length;
    cursor = rows[rows.length - 1]?.id;
    console.log(`[backfill-message-search] ${count}`);
    if (rows.length < PAGE) break;
  }
  console.log(`[backfill-message-search] done ${count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
