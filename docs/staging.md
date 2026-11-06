# Staging on Railway

Two environments of the same Railway project, `nizek-project`:

| environment  | branch    | address                                       | replicas | emails |
| ------------ | --------- | --------------------------------------------- | -------- | ------ |
| `production` | `main`    | https://panel.nizek.com                       | 2 + 2    | on     |
| `staging`    | `staging` | https://nizek-staging.up.railway.app          | 1 + 1    | off    |

Staging is a full copy: its own web app, push worker, Centrifugo, cron
function, Postgres and two Redis. Nothing on staging can reach live data.
Both environments are described by one file, [`.railway/railway.ts`](../.railway/railway.ts);
the `railway.toml` files are gone (Railway stops reading them on 2026-12-01).

## Day to day

**Deploy to staging** — merge (or push) into the `staging` branch. Railway
deploys web + worker. Migrations run in the web service's pre-deploy step,
before the new version takes traffic.

"Wait for CI" (Railway skips the deploy when the GitHub checks fail) is
prepared but off: the CI workflow has been red on `main` for weeks because of
the Firefox E2E job (`tests/e2e/push-display.spec.ts`), and with it on nothing
would deploy. Once CI is green, set `WAIT_FOR_CI = true` in
`.railway/railway.ts` and apply both environments.

**Go live** — open a pull request `staging` → `main`, merge it. Same flow on
production. Nothing else to do.

**Hotfix straight to `main`** — allowed; merge `main` back into `staging`
right after so the two branches do not drift.

**Work in progress** — feature branches as usual; open the PR against
`staging`, not `main`.

## Changing Railway settings

Edit `.railway/railway.ts`, then preview and apply one environment at a time:

```sh
railway config plan  --environment staging
railway config apply --environment staging
railway config plan  --environment production
railway config apply --environment production
```

`plan` is read only. Secrets are never in the file: `preserve()` keeps the
value the environment already has. Variables that differ per environment
(URLs, bucket name, the Resend key) are switched on `ctx.environment` inside
the file. Type-check the file with `cd .railway && npm install && npm run typecheck`.

## Reload staging with live data

```sh
bash scripts/load-staging-db.sh
```

Dumps live (read only), replaces everything in the staging database, clears
push subscriptions / devices / tokens / outbox, login sessions and
verification tokens, then redeploys the staging web app so its pre-deploy
step applies any migration staging has and live does not. The script refuses
to run unless the target really is the environment named `staging` and is a
different server from live. Everyone has to sign in again on staging after a
reload.

File links inside copied rows still point at the live public bucket, so they
open. New uploads and deletes on staging go to the `nizek-staging` bucket only.

## What is different on staging, on purpose

- No `RESEND_API_KEY`: the mailer logs a warning and sends nothing. (Calendar
  invites, which require email, fail on staging.)
- `R2_BUCKET_NAME=nizek-staging`, separate from live `nizek-projects`. Same
  Cloudflare account and keys. The bucket needs the CORS policy from
  [uploads.md](uploads.md) with the staging origin.
- Google sign-in uses the same OAuth client as live; the staging callback
  `https://nizek-staging.up.railway.app/api/auth/callback/google` is listed on it.
- One replica per service instead of two.
- The cron function calls the staging URL (`CRON_URL`), so deadline reminders
  on staging only touch staging data (and send no email).

## Centrifugo

Centrifugo is not built from GitHub; it is uploaded from `./centrifugo`
(Dockerfile + `config.json`). To (re)deploy it:

```sh
cd centrifugo
railway up --service Centrifugo --environment staging --detach
railway up --service Centrifugo --environment production --detach   # when live needs it
```

## Checking staging

- Health: `https://nizek-staging.up.railway.app/api/health`
- Logs: `railway logs --service "Nizek Projects" --environment staging`
  (same for `"Push Worker"`, `Centrifugo`).
- Chat should connect to `wss://nizek-centrifugo-staging.up.railway.app`; a
  `[realtime] disabled` warning in the browser console means the Centrifugo
  variables are wrong or the service is not deployed.
