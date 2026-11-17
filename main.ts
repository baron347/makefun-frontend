// Submission entry point for makefun-frontend-01 (Node 22, standard
// library only — nothing to install).
//
// The graded work lives in app/ next to this file: static files only
// (index.html, one stylesheet, small ES modules, no build step). A browser
// opens app/index.html and the app reads live data from the make.fun public
// API at https://make.fun/api.
//
// Running this file packs the entry: it copies app/ and screenshots/ into
// the output directory (or $MAKEFUN_OUTPUT_DIR outside the grader's
// container, where /output is not writable) and writes dossier.json there —
// the summary the judge reads: which screenshots, how big the first load
// is, and the source itself. dossier.json is produced by the vendored
// library in vendor/makefun-frontend.ts; leave that file alone, because the
// scorer expects dossier.json byte-for-byte the way its own copy writes it.
//
// The app itself is the work: a board of open bounties plus a page per
// bounty, a leaderboard and public profiles. The three screenshots in
// screenshots/ must show it running on live data (the first one, by name,
// is the cover; shots.json at the repo root records which view each one
// shows). Serve it while building with `node serve.ts`, then open
// http://localhost:8080.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

// Where this entry lives, and where the graded output goes.
const here = fileURLToPath(new URL(".", import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const shotsDir = join(here, "screenshots");

// Caps from the scorer's own reference/gate.json. Only text_max_bytes
// changes the byte counts; the rest reject an entry the scorer would reject
// anyway: over 3 screenshots, or one over 256 KiB; over 993 files and
// directories in app/, or 16 MiB of app files in total. app/ is counted
// beside the output directory's own 1000-entry cap, its screenshots/ and
// dossier.json.
const limits = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
};

mkdirSync(outDir, { recursive: true });
cpSync(join(here, "app"), join(outDir, "app"), { recursive: true });
mkdirSync(join(outDir, "screenshots"), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, "screenshots"), { recursive: true });
}

const dossier = buildDossier(outDir, limits);
writeFileSync(join(outDir, "dossier.json"), dossier);
