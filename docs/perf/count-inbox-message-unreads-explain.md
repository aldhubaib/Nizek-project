# EXPLAIN ANALYZE: `countInboxMessageUnreads`

Recorded against local Postgres after PR-9 indexes (`20261123190000_pr9_push_filename_indexes`).

Staff user: `cmsd6kly3008d01o70zsoo2gy` (Asia/Kuwait, 2026-11-23).

## Verdict

- **Message** access uses index scans (`Message_projectId_updatedAt_idx`, `Message_conversationId_updatedAt_idx`) — no sequential scan on `Message`.
- **ChatReadCursor**, **ProjectMember**, **MessageHidden** use index / index-only scans.
- Small **Seq Scan** on `User` (membership filter) and `ConversationParticipant` (~243 rows) — acceptable at current size; not a Message heap scan.
- Project leg ~2.1 ms; conversation leg ~3.9 ms execution time on this dataset.

## Indexes added in PR-9

- `MobilePushToken_deviceId_idx` (btree)
- `MessageAttachment_filename_trgm_idx` (GIN `gin_trgm_ops`) for ILIKE filename search

No further unread-query rewrite required from this probe.
