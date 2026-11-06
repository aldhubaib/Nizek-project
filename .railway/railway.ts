import {
  defineRailway,
  fn,
  github,
  image,
  postgres,
  preserve,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

/**
 * Railway project `nizek-project`: both environments, one file.
 *
 *   production  <- branch `main`     https://panel.nizek.com      2 replicas
 *   staging     <- branch `staging`  https://<STAGING.web>        1 replica, no emails
 *
 * Preview / apply one environment at a time:
 *
 *   railway config plan  --environment production
 *   railway config apply --environment production
 *   railway config plan  --environment staging
 *   railway config apply --environment staging
 *
 * Secrets are never written here. `preserve()` keeps whatever value the
 * environment already has (staging got its copies when it was duplicated from
 * production). Only non-secret settings and cross-service wiring are spelled
 * out, so the two environments cannot drift apart silently.
 *
 * Replaces railway.toml / railway.worker.toml (Railway stops reading those on
 * 2026-12-01). See docs/staging.md for the day-to-day flow.
 */

const REPO = "aldhubaib/Nizek-project";

/**
 * "Wait for CI": Railway skips a deploy when the commit's GitHub checks fail.
 * Off for now because the `main` workflow has been red for weeks (the Firefox
 * E2E job, tests/e2e/push-display.spec.ts); with it on, nothing would deploy.
 * Flip to true once the CI workflow is green on `main`, then apply both
 * environments.
 */
const WAIT_FOR_CI = false;

/** Railway-provided domains of the staging services (set with `railway domain update … --domain`). */
const STAGING = {
  web: "nizek-staging.up.railway.app",
  centrifugo: "nizek-centrifugo-staging.up.railway.app",
  /** Public URL of the `nizek-staging` R2 bucket. Empty = keep the copied value until the bucket exists. */
  r2PublicUrl: "",
};

/** Production addresses, written out so a wrong edit shows up in `railway config plan`. */
const PRODUCTION = {
  web: "panel.nizek.com",
  centrifugo: "centrifugo-production-bd28.up.railway.app",
  r2Bucket: "nizek-projects",
};

export default defineRailway((ctx) => {
  const env = ctx.environment;
  if (env !== "production" && env !== "staging") {
    throw new Error(
      `Unknown Railway environment "${env ?? ""}". Run with --environment production or --environment staging.`,
    );
  }
  const prod = env === "production";

  // Both environments deploy from GitHub (`checkSuites` = "Wait for CI").
  const branch = prod ? "main" : "staging";
  const source = () => github(REPO, { branch, checkSuites: WAIT_FOR_CI });

  const webUrl = prod ? `https://${PRODUCTION.web}` : `https://${STAGING.web}`;
  const centrifugoWs = `wss://${prod ? PRODUCTION.centrifugo : STAGING.centrifugo}/connection/websocket`;

  // ---------------------------------------------------------------- databases

  // Centrifugo's engine (pub/sub + presence + history).
  const redisRealtime = redis("Redis", { region: "us-west2" });
  redisRealtime.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  redisRealtime.networking = { privateNetworkEndpoint: "redis" };

  // The app's Redis: BullMQ push queue and caches (web + worker).
  const redisQueue = redis("Redis-FBd5", { region: "us-west2" });
  redisQueue.deploy = {
    startCommand:
      '/bin/sh -c "rm -rf $RAILWAY_VOLUME_MOUNT_PATH/lost+found/ && exec docker-entrypoint.sh redis-server --requirepass $REDIS_PASSWORD --save 60 1 --dir $RAILWAY_VOLUME_MOUNT_PATH"',
  };
  redisQueue.networking = { privateNetworkEndpoint: "redis-fbd5" };

  const db = postgres("Postgres", { region: "us-west2" });
  // The TCP proxy gives DATABASE_PUBLIC_URL, used by scripts/pull-live-db.sh
  // (read only) and scripts/load-staging-db.sh.
  db.networking = { privateNetworkEndpoint: "postgres", tcpProxies: { "5432": {} } };

  const volumeAlerts = { usage: { "80": {}, "95": {}, "100": {} } };
  const redisRealtimeVolume = volume("redis-volume", {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const redisQueueVolume = volume("redis-volume-MBV4", {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });
  const postgresVolume = volume("postgres-volume", {
    alerts: volumeAlerts,
    allowOnlineResize: true,
    region: "us-west2",
    sizeMB: 5000,
  });

  // ------------------------------------------------------------------- web app

  const web = service("Nizek Projects", {
    source: source(),
    build: {
      builder: "RAILPACK",
      buildEnvironment: "V3",
      // Builds, stamps sw.js, copies static + public into the standalone output
      // and fails the build if /sw.js would 404.
      buildCommand: "sh scripts/railway-build.sh",
    },
    // Migrations run once per deploy, before the new version takes traffic.
    // The Postgres private network is only reachable at run time, so this
    // cannot move into the build.
    preDeploy: "node prisma/migrate.mjs",
    start: "NODE_OPTIONS='--max-old-space-size=2048' node .next/standalone/server.js",
    healthcheck: "/api/health",
    healthcheckTimeout: 300,
    // Stateless app (JWT sessions, Centrifugo is its own service, per-replica
    // TTL caches), so it scales out safely. Each replica opens up to
    // PG_POOL_MAX (default 10) DB connections.
    replicas: { "us-west2": prod ? 2 : 1 },
    // Restart policy: Railway's default ON_FAILURE (it never stores the default
    // type, so naming it here would show up as a permanent diff in `plan`).
    deploy: { restartPolicyMaxRetries: 5 },
    domains: prod ? [{ domain: PRODUCTION.web, port: 3000 }] : [],
    networking: { privateNetworkEndpoint: "amused-wonder" },
    env: {
      HOSTNAME: "0.0.0.0",
      PORT: "3000",
      NODE_OPTIONS: "--max-old-space-size=2048",
      NEXT_PUBLIC_APP_URL: webUrl,

      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: redisQueue.env.REDIS_URL,

      // Realtime: browser -> public Centrifugo domain, server -> private network.
      NEXT_PUBLIC_CENTRIFUGO_WS: centrifugoWs,
      CENTRIFUGO_HTTP_API: "http://centrifugo.railway.internal:8000",
      CENTRIFUGO_API_KEY: preserve(),
      CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: preserve(),

      // Auth (same Google OAuth client in both environments; the staging
      // callback URL is added to it in Google Cloud).
      BETTER_AUTH_SECRET: preserve(),
      GOOGLE_CLIENT_ID: preserve(),
      GOOGLE_CLIENT_SECRET: preserve(),
      GOOGLE_MAPS_API_KEY: preserve(),

      // Files: same Cloudflare account and keys, separate bucket per
      // environment so a delete on staging can never remove a live file.
      R2_ACCOUNT_ID: preserve(),
      R2_ACCESS_KEY_ID: preserve(),
      R2_SECRET_ACCESS_KEY: preserve(),
      R2_BUCKET_NAME: prod ? PRODUCTION.r2Bucket : "nizek-staging",
      R2_PUBLIC_URL: prod || !STAGING.r2PublicUrl ? preserve() : STAGING.r2PublicUrl,

      // Push + cron + vault.
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
      CRON_SECRET: preserve(),
      VAULT_ENCRYPTION_KEY: preserve(),

      // Emails only from production. Without the key the mailer logs a
      // warning and stays off, so staging never emails real people.
      ...(prod ? { RESEND_API_KEY: preserve() } : {}),
    },
  });

  // ---------------------------------------------------------------- Centrifugo

  // Built from ./centrifugo (Dockerfile + config.json) and uploaded with
  // `railway up`, not from GitHub; it changes rarely. See docs/staging.md.
  const centrifugo = service("Centrifugo", {
    build: { builder: "RAILPACK", buildEnvironment: "V3" },
    replicas: { "us-west2": 1 },
    networking: { privateNetworkEndpoint: "centrifugo" },
    env: {
      PORT: "8000",
      CENTRIFUGO_HTTP_SERVER_PORT: "8000",
      CENTRIFUGO_CLIENT_ALLOWED_ORIGINS: `${webUrl} http://localhost:3000`,
      CENTRIFUGO_ENGINE_REDIS_ADDRESS: redisRealtime.env.REDIS_URL,
      CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: preserve(),
      CENTRIFUGO_HTTP_API_KEY: preserve(),
    },
  });

  // --------------------------------------------------------------- push worker

  const worker = service("Push Worker", {
    source: source(),
    build: { builder: "DOCKERFILE", buildEnvironment: "V3", dockerfilePath: "Dockerfile.worker" },
    // start-worker.sh applies pending Prisma migrations, then boots the BullMQ
    // worker. Jobs carry deterministic ids, so two replicas never double-send.
    start: "./start-worker.sh",
    replicas: { "us-west2": prod ? 2 : 1 },
    // Restart policy: Railway's default (ON_FAILURE, 10 retries), see above.
    networking: { privateNetworkEndpoint: "push-worker" },
    env: {
      PORT: "3001",
      PUSH_WORKER_CONCURRENCY: "20",
      RAILWAY_DOCKERFILE_PATH: "Dockerfile.worker",
      NEXT_PUBLIC_APP_URL: webUrl,

      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: redisQueue.env.REDIS_URL,

      // The worker does the live chat broadcasts (message-events queue).
      // src/lib/centrifugo.ts treats Centrifugo as "not configured" unless all
      // three are set, so the HMAC secret is needed here too, not only on web.
      CENTRIFUGO_HTTP_API: "http://centrifugo.railway.internal:8000",
      CENTRIFUGO_API_KEY: preserve(),
      CENTRIFUGO_TOKEN_HMAC_SECRET_KEY: centrifugo.env.CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY,

      NEXT_PUBLIC_VAPID_PUBLIC_KEY: preserve(),
      VAPID_PRIVATE_KEY: preserve(),
    },
  });

  // ---------------------------------------------------------------------- cron

  // Railway function: POSTs /api/cron/deadline-reminders on the web app at
  // 03:00 UTC every day. The code lives in functions/deadline-reminders-cron.ts.
  const deadlineReminders = fn("deadline-reminders-cron", {
    codeFile: "functions/deadline-reminders-cron.ts",
    source: image("ghcr.io/railwayapp/function-bun:1.4.4"),
    build: { builder: "RAILPACK", buildEnvironment: "V3" },
    replicas: { "us-west2": 1 },
    deploy: { cronSchedule: "0 3 * * *", restartPolicyType: "NEVER" },
    env: {
      CRON_URL: `${webUrl}/api/cron/deadline-reminders`,
      CRON_SECRET: preserve(),
    },
  });

  return project("nizek-project", {
    // This file owns every variable on these services: anything not listed
    // (or kept with preserve()) is removed on apply. The CLI reads this flag;
    // the SDK's types (3.16) do not declare it yet, hence the spread.
    ...({ variables: { managed: true } } as object),
    resources: [
      db,
      redisRealtime,
      redisQueue,
      postgresVolume,
      redisRealtimeVolume,
      redisQueueVolume,
      web,
      worker,
      centrifugo,
      deadlineReminders,
    ],
  });
});
