// Tiny static server for E2E: serves the harness page plus the REAL production
// service worker files from public/, so tests run the exact shipped code.

import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const PORT = Number(process.env.HARNESS_PORT || 4173);

const ROUTES = {
  "/": path.join(__dirname, "index.html"),
  "/index.html": path.join(__dirname, "index.html"),
  "/sw.js": path.join(ROOT, "public/sw.js"),
  "/sw-lib.js": path.join(ROOT, "public/sw-lib.js"),
};

const TYPES = { ".html": "text/html", ".js": "application/javascript" };

http
  .createServer(async (req, res) => {
    const url = (req.url || "/").split("?")[0];
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
