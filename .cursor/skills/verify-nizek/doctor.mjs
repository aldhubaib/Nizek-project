#!/usr/bin/env node
// Read-only doctor check for the local Nizek-project stack.
const base = (process.env.NIZEK_URL || "http://localhost:3001").replace(/\/$/, "");

async function checkJson(path) {
  const url = `${base}${path}`;
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    const text = await res.text();
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

const health = await checkJson("/api/health");
const version = await checkJson("/api/version");
const devLogin = await checkJson("/api/auth/dev-sign-in");

const ok =
  health.ok &&
  health.body?.status === "ok" &&
  version.ok &&
  devLogin.ok &&
  typeof devLogin.body?.email === "string";

const report = {
  base,
  ok,
  health: { status: health.status, dbOk: health.body?.status === "ok", error: health.error },
  version: { status: version.status, version: version.body?.version ?? null },
  devLogin: {
    status: devLogin.status,
    defaultEmail: devLogin.body?.email ?? null,
    accountCount: Array.isArray(devLogin.body?.people) ? devLogin.body.people.length : 0,
  },
};

console.log(JSON.stringify(report, null, 2));
process.exit(ok ? 0 : 1);
