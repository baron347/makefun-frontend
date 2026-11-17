// Handing in a makefun-frontend-01 entry (Node 22, standard library only).
// The frontend lives in this directory's app/ folder: plain static files a
// browser opens at app/index.html (ES modules plus CSS, no build step), which
// read make.fun's public API at https://make.fun/api. This program gathers
// it up: it copies app/ and screenshots/ from beside this file into the
// output directory and writes output/dossier.json there — the summary the
// judge reads (your screenshots, the first load's files and bytes, and your
// source) — using the vendored make.fun library. Leave
// vendor/makefun-frontend.ts alone: the scorer wants dossier.json byte for
// byte the way its own copy writes it.
//
// This is a starting point, not a winner: a plain board of open bounties and
// a page for each. Build your frontend in app/ (a leaderboard, profiles,
// speed, ease of use), put 3 PNG or JPEG screenshots of it running on live
// data in screenshots/ (the first by name is the cover; shots.json says
// which views this starter's were taken of), and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-frontend.ts";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const targetDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

mkdirSync(targetDir, { recursive: true });
cpSync(join(rootDir, "app"), join(targetDir, "app"), { recursive: true });
mkdirSync(join(targetDir, "screenshots"), { recursive: true });
if (existsSync(join(rootDir, "screenshots"))) {
  cpSync(join(rootDir, "screenshots"), join(targetDir, "screenshots"), {
    recursive: true,
  });
}

// The scorer's own caps (from its reference/gate.json): only text_max_bytes
// shapes the byte counts; the rest refuse an entry the scorer would refuse
// (more than 3 screenshots, or one over 256 KiB; more than 993 files and
// directories in app/, or 16 MiB of app files — app/ counts beside the
// output directory's own 1000-entry cap, its screenshots/ and dossier.json).
const dossier = buildDossier(targetDir, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
});
writeFileSync(join(targetDir, "dossier.json"), dossier);
