// Purges .next when it disagrees with the current Turbopack workspace root.
//
// Next writes the symlinks under .next/**/node_modules relative to that root, so
// a cache left over from a different root contains links that climb above it.
// Turbopack's PostCSS step globs the tree, `realpath_with_links` fails with
// "leaves the filesystem root", and it respawns its worker on every failure --
// ~50 node processes a second, none exiting, until the machine is out of memory.
// That cost this repo a day on 2026-08-01/02, so it is checked automatically
// rather than relied on being remembered.
//
// Two independent checks, because either alone has a blind spot:
//   1. A stamp recording the root that built the cache, which catches a changed
//      turbopack.root or a moved/renamed checkout before any symlink exists.
//   2. A traversal check on every symlink, which catches a cache that predates
//      the stamp.
//
// Runs from `predev` and `prebuild`. Run: node scripts/check-next-cache.mjs
import { mkdir, readdir, readFile, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

// Compared as real paths, since the same directory can be reached under more
// than one name on macOS (/tmp vs /private/tmp, /Users vs /System/Volumes/Data).
// Comparing the literal strings would purge a perfectly good cache on every run.
const realOrSelf = async (p) => {
  try {
    return await realpath(p);
  } catch {
    return p;
  }
};

const root = await realOrSelf(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const nextDir = join(root, ".next");
const stampFile = join(nextDir, ".workspace-root");

// Whether following `target` from `linkPath` ever rises above the root. What
// matters is the traversal, not the final destination: the symlink that broke
// this repo resolved to a path back inside the project, but only after climbing
// two levels above the root first, which is what Turbopack refuses to do.
function escapesRoot(linkPath, target) {
  if (isAbsolute(target)) {
    return target !== root && !target.startsWith(root + sep);
  }
  const from = relative(root, dirname(linkPath));
  let depth = from ? from.split(sep).filter((s) => s && s !== ".").length : 0;
  for (const segment of target.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      depth -= 1;
      if (depth < 0) return true;
    } else {
      depth += 1;
    }
  }
  return false;
}

// The links only ever live in a node_modules directory at the top of .next or
// one level under it, so this stays cheap rather than walking the whole cache.
async function nodeModulesDirs() {
  const dirs = [join(nextDir, "node_modules")];
  let entries;
  try {
    entries = await readdir(nextDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (entry.isDirectory()) dirs.push(join(nextDir, entry.name, "node_modules"));
  }
  return dirs;
}

async function* symlinks(dir, depth = 0) {
  if (depth > 1) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) yield path;
    // One extra level covers scoped packages such as @prisma/client.
    else if (entry.isDirectory()) yield* symlinks(path, depth + 1);
  }
}

async function findReason() {
  let stamped;
  try {
    stamped = (await readFile(stampFile, "utf8")).trim();
  } catch {
    stamped = null;
  }
  if (stamped && (await realOrSelf(stamped)) !== root) {
    return `it was built under a different workspace root (${stamped})`;
  }

  for (const dir of await nodeModulesDirs()) {
    for await (const link of symlinks(dir)) {
      const target = await readlink(link);
      if (escapesRoot(link, target)) {
        return `${relative(root, link)} -> ${target} climbs above the project root`;
      }
    }
  }
  return null;
}

let cacheExists = true;
try {
  await readdir(nextDir);
} catch {
  cacheExists = false;
}

if (cacheExists) {
  const reason = await findReason();
  if (reason) {
    console.log(`Purging .next: ${reason}.`);
    console.log("Left in place it sends Turbopack into a worker respawn loop that exhausts memory.");
    await rm(nextDir, { recursive: true, force: true });
  }
}

// Stamp unconditionally so the next run can compare against it, including the
// first run after a purge or on a fresh checkout.
await mkdir(nextDir, { recursive: true });
await writeFile(stampFile, root + "\n");
