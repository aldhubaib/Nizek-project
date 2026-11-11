// One switch for the local stack.
//
//   npm run local            Postgres, Redis, Centrifugo, panel, worker,
//                            collab, and the mobile Metro server.
//                            Ctrl+C stops all of them.
//   npm run local:stop       same, from another terminal
//   npm run local:reset -- --yes
//                            stop, and delete the local database volume
//   npm run local:data       replace that database with a read-only copy of live
//
// Overmind runs the processes in Procfile.local. Docker Compose runs the
// databases. The database name and password are read from DATABASE_URL.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sock = join(root, ".overmind.local.sock");
const composeFile = "compose.local.yaml";

function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    let value = trimmed.slice(eq + 1);
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function stackEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) {
    console.error("[local] .env is missing. Copy .env.example to .env first.");
    process.exit(1);
  }
  const file = parseEnv(readFileSync(envPath, "utf8"));
  if (!file.DATABASE_URL) {
    console.error("[local] DATABASE_URL is missing from .env");
    process.exit(1);
  }
  const db = new URL(file.DATABASE_URL);
  const redis = new URL(file.REDIS_URL || "redis://127.0.0.1:6379");
  let centrifugoPort = "8000";
  try {
    centrifugoPort = new URL(file.CENTRIFUGO_HTTP_API || "http://localhost:8000").port || "8000";
  } catch {
    // keep the default
  }
  const env = {
    ...process.env,
    POSTGRES_USER: decodeURIComponent(db.username),
    POSTGRES_PASSWORD: decodeURIComponent(db.password),
    POSTGRES_DB: decodeURIComponent(db.pathname.replace(/^\//, "")),
    PG_HOST_PORT: db.port || "5432",
    REDIS_HOST_PORT: redis.port || "6379",
    CENTRIFUGO_HOST_PORT: centrifugoPort,
  };
  return { file, env };
}

function requireDocker(env) {
  const info = spawnSync("docker", ["info"], { cwd: root, env, stdio: "ignore" });
  if (info.status !== 0) {
    console.error("[local] Docker is not running. Open Docker Desktop, then run this again.");
    process.exit(1);
  }
}

function overmind(args, env) {
  return spawnSync("overmind", args, { cwd: root, env, stdio: "inherit" });
}

function compose(args, env) {
  return spawnSync("docker", ["compose", "-f", composeFile, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
  });
}

function stop(env) {
  overmind(["quit", "-s", sock], env);
  compose(["stop"], env);
}

const command = process.argv[2] ?? "start";
const { file, env } = stackEnv();

if (command === "stop") {
  requireDocker(env);
  stop(env);
  process.exit(0);
}

if (command === "reset") {
  if (!process.argv.includes("--yes")) {
    console.error("[local] This deletes the local database. Run: npm run local:reset -- --yes");
    process.exit(1);
  }
  requireDocker(env);
  stop(env);
  compose(["down"], env);
  const removed = spawnSync("docker", ["volume", "rm", "nizek-panel-pgdata"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  process.exit(removed.status ?? 1);
}

if (command === "data") {
  requireDocker(env);
  const ready = spawnSync(
    "docker",
    [
      "compose",
      "-f",
      composeFile,
      "exec",
      "-T",
      "postgres",
      "pg_isready",
      "-q",
      "-U",
      env.POSTGRES_USER,
      "-d",
      env.POSTGRES_DB,
    ],
    { cwd: root, env, stdio: "ignore" },
  );
  if (ready.status !== 0) {
    console.error("[local] The database is not up. Run npm run local in another terminal first.");
    process.exit(1);
  }
  const child = spawn("bash", ["scripts/pull-live-db.sh"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...env,
      PGPASSWORD: env.POSTGRES_PASSWORD,
      PG_USER: env.POSTGRES_USER,
      PG_DB: env.POSTGRES_DB,
      PG_PORT: env.PG_HOST_PORT,
      PG_HOST: "127.0.0.1",
    },
  });
  child.on("exit", (code) => process.exit(code ?? 1));
} else if (command === "start") {
  if (!existsSync("/opt/homebrew/bin/overmind") && spawnSync("overmind", ["--version"], { stdio: "ignore" }).status !== 0) {
    console.error("[local] Overmind is not installed. Install it with: brew install overmind");
    process.exit(1);
  }
  requireDocker(env);
  const status = spawnSync("overmind", ["status", "-s", sock], { cwd: root, env, stdio: "ignore" });
  if (status.status === 0) {
    console.error("[local] Already running. Stop it with Ctrl+C in that terminal, or npm run local:stop.");
    process.exit(1);
  }
  rmSync(join(root, ".local", "ready"), { force: true });
  mkdirSync(join(root, ".local"), { recursive: true });

  console.log("[local] Panel   http://localhost:3001");
  console.log("[local] Metro   http://localhost:8082   (Nizek Staging on the Simulator, pointed at this panel)");
  console.log("[local] Ctrl+C stops Postgres, Redis, Centrifugo, the panel, the worker, collab, and Metro.");
  if (!file.GOOGLE_CLIENT_ID || !file.GOOGLE_CLIENT_SECRET) {
    console.log("[local] Google sign-in is off until GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are in .env.");
    console.log("[local] Redirect to add in Google Cloud: http://localhost:3001/api/auth/callback/google");
  }
  console.log("[local] Load a fresh copy of live into the local database with: npm run local:data");

  const child = spawn("overmind", ["start", "-f", "Procfile.local", "-s", sock, "--no-port", "--any-can-die"], {
    cwd: root,
    env,
    stdio: "inherit",
  });
  const forward = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => forward("SIGINT"));
  process.on("SIGTERM", () => forward("SIGTERM"));
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
} else {
  console.error(`[local] Unknown command "${command}". Use start, stop, reset, or data.`);
  process.exit(1);
}
