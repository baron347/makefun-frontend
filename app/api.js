// A small cached client for the make.fun public API.
//
// The deal this client makes with the rest of the app:
//  - every page fetches once; two callers asking for the same URL while a
//    fetch is still flying share that one promise, never a second request;
//  - a body stays fresh in memory for a minute, then is revalidated with
//    its ETag, so a 304 answer costs no body at all;
//  - a request that hangs is dropped after thirty seconds.
//
// fetchStats() returns the real counts the footer prints.

const ROOT = "https://make.fun/api";
const FRESH_MS = 60_000;
const ABORT_MS = 30_000;
const CLOSED_CAP = 500;
const CLOSED_PAGES = 10;

// url -> { body, etag, at }
const kept = new Map();
// url -> promise still in flight
const inFlight = new Map();

const counts = { sent: 0, notModified: 0, fromMemory: 0, lastAt: 0 };

export function fetchStats() {
  return {
    req: counts.sent,
    notMod: counts.notModified,
    mem: counts.fromMemory,
    at: counts.lastAt,
  };
}

export function resetStats() {
  counts.sent = 0;
  counts.notModified = 0;
  counts.fromMemory = 0;
  counts.lastAt = 0;
}

export function flushCache() {
  kept.clear();
}

function fresh(entry) {
  return entry && Date.now() - entry.at < FRESH_MS;
}

async function fetchJson(path) {
  const known = kept.get(path);
  if (fresh(known)) {
    counts.fromMemory++;
    counts.lastAt = Date.now();
    return known.body;
  }
  const shared = inFlight.get(path);
  if (shared) return shared;

  const job = (async () => {
    const headers = known?.etag ? { "If-None-Match": known.etag } : {};
    counts.sent++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ABORT_MS);
    let res;
    try {
      res = await fetch(ROOT + path, { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304 && known) {
      counts.notModified++;
      counts.lastAt = Date.now();
      known.at = Date.now();
      return known.body;
    }
    if (!res.ok) {
      const err = new Error(`make.fun API ${res.status} for ${path}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    counts.lastAt = Date.now();
    kept.set(path, { body, etag: res.headers.get("ETag"), at: Date.now() });
    return body;
  })();

  inFlight.set(path, job);
  try {
    return await job;
  } finally {
    inFlight.delete(path);
  }
}

// The open board, carrying the activity times the ticker reads.
export const listOpen = () => fetchJson("/competitions?status=open&activity=times");

// Closed and resolved bounties for the board's Closed tab: up to 500 rows,
// newest deadline first, walking the cursor pages until one comes back empty.
export async function listByStatus(status) {
  const rows = [];
  let cursor = "";
  for (let page = 0; page < CLOSED_PAGES && rows.length < CLOSED_CAP; page++) {
    const tail = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const chunk = await fetchJson(
      `/competitions?status=${status}&activity=times${tail}`,
    );
    rows.push(...(chunk.items ?? []));
    cursor = chunk.next_cursor ?? "";
    if (!cursor) break;
  }
  return { items: rows };
}

export const oneBounty = (slug) =>
  fetchJson(`/competitions/${encodeURIComponent(slug)}`);

export const oneStandings = (slug) =>
  fetchJson(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);

export const oneProfile = (handle) =>
  fetchJson(`/profiles/${encodeURIComponent(handle)}`);
