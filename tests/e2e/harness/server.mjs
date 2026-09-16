// Tiny static server for E2E: serves the harness pages plus the REAL production
// service worker files from public/, so tests run the exact shipped code.
//
// /gate.js is the real <NotificationGate> + push store bundled on startup with
// esbuild (a dependency of tsx), so the gate E2E exercises the shipped React
// component against a mocked API rather than a re-implementation.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.HARNESS_PORT || 4173);

const ROUTES = {
  "/": path.join(__dirname, "index.html"),
  "/index.html": path.join(__dirname, "index.html"),
  "/gate.html": path.join(__dirname, "gate.html"),
  "/sw.js": path.join(ROOT, "public/sw.js"),
  "/sw-lib.js": path.join(ROOT, "public/sw-lib.js"),
  "/sw-cache.js": path.join(ROOT, "public/sw-cache.js"),
  "/offline.html": path.join(ROOT, "public/offline.html"),
};

const TYPES = { ".html": "text/html", ".js": "application/javascript" };

let gateBundle = null;
async function buildGateBundle() {
  const result = await build({
    entryPoints: [path.join(__dirname, "gate-entry.tsx")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: "es2020",
    jsx: "automatic",
    alias: { "@": path.join(ROOT, "src") },
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      "process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY": JSON.stringify(
        // Any valid 65-byte P-256 point encoded base64url; only its shape matters here.
        "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
      ),
      "process.env.NEXT_PUBLIC_APP_BUILD_TIME": JSON.stringify("e2e"),
    },
    logLevel: "silent",
  });
  gateBundle = result.outputFiles[0].text;
}

const bundleReady = buildGateBundle().catch((err) => {
  console.error("[harness] gate bundle failed:", err.message);
});

// ---------------------------------------------------------------------------
// In-process mock of /api/push* for the gate spec.
//
// Why here and not page.route(): once sw.js controls the page, Firefox and
// WebKit issue fetches through the service worker and Playwright cannot
// intercept them. Serving the mock from the same origin keeps all three
// browsers on the identical code path the real app uses.
//
// Each test picks an id and sets cookies `mockId` + `mockRegistered`; the
// server records calls per id so parallel tests never see each other.
// ---------------------------------------------------------------------------
const mockCalls = new Map(); // mockId -> [{ url, method }]

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function handleMockApi(req, res, url) {
  const cookies = parseCookies(req.headers.cookie);
  const id = cookies.mockId || "anon";
  const registered = cookies.mockRegistered === "1";
  const list = mockCalls.get(id) || [];
  list.push({ url, method: req.method });
  mockCalls.set(id, list);

  if (url === "/api/push/status") {
    json(res, 200, {
      registered,
      subscriptionId: registered ? "sub_1" : null,
      failCount: 0,
      vapidKeyHash: null,
      serverTime: new Date().toISOString(),
    });
    return;
  }
  if (url === "/api/push/device") {
    json(res, 200, { ok: true });
    return;
  }
  // POST/DELETE /api/push
  json(res, 200, { ok: true, subscriptionId: "sub_1" });
}

http
  .createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];

    if (url.startsWith("/api/push")) {
      handleMockApi(req, res, url);
      return;
    }
    if (url.startsWith("/__mock/calls/")) {
      json(res, 200, mockCalls.get(decodeURIComponent(url.slice("/__mock/calls/".length))) || []);
      return;
    }

    if (url === "/gate.js") {
      await bundleReady;
      if (!gateBundle) {
        res.writeHead(500).end("gate bundle unavailable");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        "Cache-Control": "no-store",
      });
      res.end(gateBundle);
      return;
    }

    const file = ROUTES[url];
    if (!file) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "text/plain",
        "Cache-Control": "no-store",
        // Allow SW registration scope for /.
        "Service-Worker-Allowed": "/",
      });
      res.end(body);
    } catch {
      res.writeHead(500).end("read error");
    }
  })
  .listen(PORT, () => {
    console.log(`harness listening on http://localhost:${PORT}`);
  });
