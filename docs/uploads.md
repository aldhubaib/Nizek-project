# Attachment uploads

How a file picked in chat gets to Cloudflare R2, and the one bucket setting
the resumable path cannot work without.

## Two paths

| File size | Path | Where the bytes go |
| --- | --- | --- |
| under 16 MB | one presigned `PUT` (`/api/upload/presign`), falls back to the same-origin proxy `/api/upload` on browsers with CORS quirks | browser → R2 (or browser → our server → R2 on fallback) |
| 16 MB and over | multipart (`/api/upload/multipart/*`) | browser → R2 directly, one 16 MB part at a time, 3 parts in flight |

The multipart path is what makes big videos from phones reliable:

- each part has its own signed link (valid 1 hour), its own stall timer and up
  to 5 retries with backoff. A hiccup redoes one 16 MB part, not the file;
- finished parts are remembered in the browser (IndexedDB, keyed by
  `name + size + lastModified`). If the tab is killed or the phone reloads,
  picking the same file again continues from the parts that already landed
  ("Resuming part 7 of 19" in the outbox bubble);
- nothing passes through our server, so the limit is 2 GB
  (`MAX_UPLOAD_BYTES` in `src/lib/upload-limits.ts`). The proxy fallback is
  never used for files over 16 MB — it would buffer them in server memory.

Routes (all require a signed-in session; a user can only touch keys under
`uploads/<their id>/`):

| Route | Purpose |
| --- | --- |
| `POST /api/upload/multipart/create` | `{filename, contentType, size}` → `{key, uploadId, url, partSize, partCount}` |
| `POST /api/upload/multipart/sign` | `{key, uploadId, partNumbers[]}` → `{urls: {partNumber: url}}` (max 200 per call) |
| `POST /api/upload/multipart/complete` | `{key, uploadId, parts: [{partNumber, etag}]}` → `{url, key}` |
| `POST /api/upload/multipart/abort` | `{key, uploadId}` → 204 |

Server helpers live in `src/lib/r2.ts` (`createMultipartUpload`,
`presignUploadPart`, `completeMultipartUpload`, `abortMultipartUpload`,
`listStaleMultipartUploads`). The client is `uploadMultipart` in
`src/lib/upload.ts`.

## Required: R2 bucket CORS (big uploads do not work until this is done)

When the browser `PUT`s a part, R2 answers with an `ETag` header. The browser
needs that value to call `complete`. Browsers hide response headers from
cross-origin requests unless the server lists them in
`Access-Control-Expose-Headers`, so **without `ETag` in `ExposeHeaders` every
multipart upload fails at the first part** with "did not expose its ETag".

As of the Phase 0 deploy (Nov 2026) the bucket had **no CORS policy that
allows `panel.nizek.com`** — a preflight `OPTIONS` from that origin answered
403 — which is why direct browser uploads always fell back to the proxy and
files over 100 MB never worked. Until the policy below is in place the client
behaves like this:

- under 16 MB: unchanged — direct PUT fails, proxy takes over.
- 16 MB – 100 MB: the first part fails twice in a row with no HTTP status, the
  client concludes "blocked", aborts the multipart upload and sends the file
  through the proxy (status line "Direct upload blocked — using fallback
  route"). Works, but slower and buffered on the server as before.
- over 100 MB: fails fast with "storage refused the browser upload — the bucket
  CORS policy does not allow this site … files over 100MB cannot be uploaded".

The app's own R2 key cannot read or change the policy (`GetBucketCors` →
AccessDenied; it is an object-level token), so this is a dashboard step.

In the Cloudflare dashboard: R2 → the bucket → Settings → CORS policy → edit,
and paste this (add every origin the app is served from):

```json
[
  {
    "AllowedOrigins": [
      "https://panel.nizek.com",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Content-Length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 86400
  }
]
```

Or with Wrangler:

```sh
# save the JSON above as r2-cors.json, then
npx wrangler r2 bucket cors put <bucket-name> --file r2-cors.json
```

Checklist:

- `AllowedMethods` must include `PUT` (parts and single uploads) — `POST` is
  not needed, the create/sign/complete calls go to our own server.
- `ExposeHeaders` must include `ETag`.
- `AllowedOrigins` must list the exact scheme + host the app runs on. Add
  preview/staging hosts if uploads should work there.
- `R2_PUBLIC_URL` (the public bucket domain) is unaffected; it only serves
  downloads.

## Cleanup of abandoned uploads

A multipart upload that is never completed or aborted keeps its parts in the
bucket (billed storage) forever. Two safety nets:

1. The daily cron (`/api/cron/deadline-reminders`, called by the Railway cron
   function) aborts every multipart upload under `uploads/` that was started
   more than 24 hours ago (`listStaleMultipartUploads` + `abortMultipartUpload`).
2. Optional belt and braces: in the bucket's **Object lifecycle rules**, add a
   rule "Abort incomplete multipart uploads after 2 days". It costs nothing and
   covers a cron outage.

## Diagnosing "my file would not upload"

Every failed send is logged on the server with sizes:

- `[send-failure]` — the message action refused it (body length, attachment
  count/bytes, thread).
- `[send-failure:client]` — the browser reported it via
  `POST /api/messages/failure` (stage `upload`, `action-rejected` or
  `action-unreachable`, device user agent, online state).
- `[upload-failure]` — the per-file reason from `POST /api/upload/failure`
  (file name, size, type, error text).
- `[multipart] …` — server-side errors from the multipart routes.

Search Railway logs for the user's id or the file name; the `reason` field is
the exact error the browser saw.
