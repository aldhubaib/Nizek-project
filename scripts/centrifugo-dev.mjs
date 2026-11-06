// Runs a local Centrifugo (realtime server) with the same keys the panel uses.
//
//   npm run centrifugo            (needs: brew install centrifugo)
//
// Reads .env (loaded by `node --env-file`): the port comes from
// CENTRIFUGO_HTTP_API, the keys from CENTRIFUGO_TOKEN_HMAC_SECRET_KEY and
// CENTRIFUGO_API_KEY. Uses the in-memory engine, so no Redis is required.
// Production runs centrifugo/Dockerfile instead; this is for development only.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = join(root, "centrifugo", "config.json");

const secret = process.env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;
const apiKey = process.env.CENTRIFUGO_API_KEY;
if (!secret || !apiKey) {
  console.error(
    "Set CENTRIFUGO_TOKEN_HMAC_SECRET_KEY and CENTRIFUGO_API_KEY in .env first (any two random strings).",
  );
  process.exit(1);
}

let port = "8000";
try {
  port = new URL(process.env.CENTRIFUGO_HTTP_API || "http://localhost:8000").port || "8000";
} catch {
  // keep the default
}

if (!existsSync(config)) {
  console.error(`Missing ${config}`);
  process.exit(1);
}

console.log(`[centrifugo] starting on http://localhost:${port} (memory engine, config: centrifugo/config.json)`);

// Centrifugo warns about CENTRIFUGO_* variables it does not know, so pass only
// its own names (the panel's names are mapped above).
const env = {
  ...process.env,
  CENTRIFUGO_HTTP_SERVER_PORT: port,
  CENTRIFUGO_ENGINE_TYPE: process.env.CENTRIFUGO_ENGINE_TYPE || "memory",
  CENTRIFUGO_CLIENT_TOKEN_HMAC_SECRET_KEY: secret,
  CENTRIFUGO_HTTP_API_KEY: apiKey,
};
delete env.CENTRIFUGO_API_KEY;
delete env.CENTRIFUGO_HTTP_API;
delete env.CENTRIFUGO_TOKEN_HMAC_SECRET_KEY;

const child = spawn("centrifugo", ["-c", config], {
  stdio: "inherit",
  // Not the project root: Centrifugo would load the panel's .env from there.
  cwd: dirname(config),
  env,
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    console.error("centrifugo is not installed. Install it with: brew install centrifugo");
  } else {
    console.error(err);
  }
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
