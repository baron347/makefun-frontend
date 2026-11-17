// Entry point for the makefun-frontend-01 submission (Node 22, standard
// library only — nothing to install).
//
// The graded work is the static app in app/ beside this file: index.html,
// one stylesheet, small ES modules, no build step. A browser opens
// app/index.html and the app reads live data from the make.fun public API
// at https://make.fun/api.
//
// Running this file packs the entry into the output directory (or
// $MAKEFUN_OUTPUT_DIR outside the grader's container, where /output is not
// writable): it copies app/ and screenshots/ there and writes dossier.json
// — the summary the judge reads: which screenshots, how big the first load
// is, and the source itself. dossier.json comes from the vendored library
// in vendor/makefun-frontend.ts; leave that file alone, because the scorer
// expects dossier.json byte-for-byte the way its own copy writes it.
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

const repoRoot = fileURLToPath(new URL(".", import.meta.url));

function resolveOutputDir() {
  return process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
}

// Caps from the scorer's own reference/gate.json. Only text_max_bytes
// changes the byte counts; the rest reject an entry the scorer would reject
// anyway: over 3 screenshots, or one over 256 KiB; over 993 files and
// directories in app/, or 16 MiB of app files in total. app/ is counted
// beside the output directory's own 1000-entry cap, its screenshots/ and
// dossier.json.
function scorerCaps() {
  return {
    text_max_bytes: 163840,
    screenshots: { max: 3, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 16777216,
  };
}

function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function packEntry() {
  const outputDir = resolveOutputDir();
  mkdirSync(outputDir, { recursive: true });
  copyTree(join(repoRoot, "app"), join(outputDir, "app"));
  const inShots = join(repoRoot, "screenshots");
  if (existsSync(inShots)) {
    copyTree(inShots, join(outputDir, "screenshots"));
  }
  const dossier = buildDossier(outputDir, scorerCaps());
  writeFileSync(join(outputDir, "dossier.json"), dossier);
}

packEntry();
