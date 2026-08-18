#!/usr/bin/env node
// Responsive + duplication checker for AI Node Studio.
// Heuristic review aid — flags likely issues, not hard failures.
//
// Usage (from project root):
//   node .cursor/skills/responsive-components/scripts/check-responsive.mjs [srcDir]
// Default srcDir: "src"

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SRC = process.argv[2] ?? "src";
const EXT = new Set([".tsx", ".jsx"]);
const BP = /(^|:)(sm|md|lg|xl|2xl):/; // responsive prefix present somewhere

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (EXT.has(extname(full))) out.push(full);
  }
  return out;
}

const files = walk(join(ROOT, SRC));
if (files.length === 0) {
  console.error(`No .tsx/.jsx files found under "${SRC}". Run from the project root.`);
  process.exit(1);
}

const findings = []; // { level, rule, file, line, msg }
const add = (level, rule, file, line, msg) =>
  findings.push({ level, rule, file: relative(ROOT, file), line, msg });

// Cross-file duplication tracking: long className string -> [{file,line}]
const classOccurrences = new Map();
const CLASS_RE = /className\s*=\s*"([^"]{40,})"/g; // static strings only, 40+ chars

// Width classes considered "layout-sized" (>= ~10rem) where a missing
// responsive variant is suspicious on a container.
const LAYOUT_WIDTH_RE = /(?:^|[\s"'`])w-(40|44|48|52|56|60|64|72|80|96|\[\d)/;
// Small interactive sizes => possible sub-44px touch targets.
const SMALL_SIZE_RE = /\b(?:w-[1-9]|h-[1-9]|w-10|h-10|min-w-[0-9]|min-h-[0-9])\b/;
const HEX_RE = /(?:className|style)[^>]*?#[0-9a-fA-F]{3,8}\b/;

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");

  // Cross-file duplicate className collection
  let m;
  while ((m = CLASS_RE.exec(text)) !== null) {
    const key = m[1].trim().replace(/\s+/g, " ");
    const upto = text.slice(0, m.index);
    const line = upto.split("\n").length;
    if (!classOccurrences.has(key)) classOccurrences.set(key, []);
    classOccurrences.get(key).push({ file: relative(ROOT, file), line });
  }

  lines.forEach((raw, i) => {
    const line = i + 1;
    const l = raw;

    if (/\bh-screen\b/.test(l)) {
      add("warn", "h-screen", file, line, "Use h-dvh instead of h-screen for mobile viewports.");
    }

    if (LAYOUT_WIDTH_RE.test(l) && !BP.test(l)) {
      add("warn", "fixed-width", file, line,
        "Layout-sized width without a responsive variant (e.g. add w-full sm:w-80, or move into a Drawer).");
    }

    // Touch target heuristic: small size classes on/near a button element.
    const looksInteractive = /<button|role="button"|onClick=/.test(l);
    if (looksInteractive && SMALL_SIZE_RE.test(l) && !/min-h-1[12]|min-w-1[12]/.test(l)) {
      add("info", "touch-target", file, line,
        "Interactive element may be under 44px. Use IconButton or add min-h-11 min-w-11.");
    }

    if (HEX_RE.test(l)) {
      add("info", "raw-hex", file, line,
        "Raw hex color in markup. Prefer theme tokens (surface-*, accent-*).");
    }
  });
}

// Report duplicates repeated across 3+ sites.
for (const [cls, sites] of classOccurrences) {
  if (sites.length >= 3) {
    const where = sites.map((s) => `${s.file}:${s.line}`).join(", ");
    findings.push({
      level: "info",
      rule: "duplication",
      file: sites[0].file,
      line: sites[0].line,
      msg: `className repeated ${sites.length}x — extract a primitive. Sites: ${where}\n      "${cls.slice(0, 80)}${cls.length > 80 ? "…" : ""}"`,
    });
  }
}

// Output
const order = { warn: 0, info: 1 };
findings.sort((a, b) => order[a.level] - order[b.level] || a.file.localeCompare(b.file) || a.line - b.line);

const counts = findings.reduce((acc, f) => ((acc[f.level] = (acc[f.level] ?? 0) + 1), acc), {});
const ICON = { warn: "⚠", info: "·" };

console.log(`\nResponsive check — ${files.length} files scanned\n`);
if (findings.length === 0) {
  console.log("No issues found. \n");
  process.exit(0);
}

let lastRule = "";
for (const f of findings) {
  if (f.rule !== lastRule) {
    console.log(`\n[${f.rule}]`);
    lastRule = f.rule;
  }
  console.log(`  ${ICON[f.level] ?? "·"} ${f.file}:${f.line} — ${f.msg}`);
}

console.log(`\nSummary: ${counts.warn ?? 0} warnings, ${counts.info ?? 0} suggestions.`);
console.log("Heuristic results — review each; not all are real problems.\n");
// Non-zero exit only when there are warnings, so it can gate CI if desired.
process.exit((counts.warn ?? 0) > 0 ? 1 : 0);
