// A tiny client for the make.fun public API: one fetch per page, answers
// cached in memory for a minute and revalidated with ETags after that, so a
// revisit inside the minute costs no request and a 304 after it costs no
// body. Identical in-flight requests share one fetch. Requests give up
// after 30 seconds instead of hanging.
//
// The footer shows the real counts for the page you are on, via fetchStats().

const BASE = "https://make.fun/api";
const FRESH_MS = 60 * 1000;
const TIMEOUT_MS = 30 * 1000;

const cache = new Map(); // url -> { data, etag, at }
const pending = new Map(); // url -> promise
const counters = { req: 0, notMod: 0, mem: 0, at: 0 };

export function fetchStats() {
  return { ...counters };
}

export function resetStats() {
  counters.req = 0;
  counters.notMod = 0;
  counters.mem = 0;
  counters.at = 0;
}

export function flushCache() {
  cache.clear();
}

async function request(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < FRESH_MS) {
    counters.mem++;
    counters.at = Date.now();
    return hit.data;
  }
  const shared = pending.get(path);
  if (shared) return shared;

  const job = (async () => {
    const headers = {};
    if (hit?.etag) headers["If-None-Match"] = hit.etag;
    counters.req++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(BASE + path, { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304 && hit) {
      counters.notMod++;
      counters.at = Date.now();
      hit.at = Date.now();
      return hit.data;
    }
    if (!res.ok) {
      const err = new Error(`make.fun API ${res.status} for ${path}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    counters.at = Date.now();
    cache.set(path, { data, etag: res.headers.get("ETag"), at: Date.now() });
    return data;
  })();

  pending.set(path, job);
  try {
    return await job;
  } finally {
    pending.delete(path);
  }
}

// The open board, with the activity times the ticker and the "past hour"
// counts read from.
export const listOpen = () => request("/competitions?status=open&activity=times");

// Closed / resolved bounties for the board's Closed tab, up to 500, newest
// deadline first. Walks the cursor pages; a page that comes back empty
// simply ends the walk.
export async function listByStatus(status) {
  const all = [];
  let cursor = "";
  for (let page = 0; page < 10 && all.length < 500; page++) {
    const chunk = await request(
      `/competitions?status=${status}&activity=times${
        cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""
      }`,
    );
    all.push(...(chunk.items ?? []));
    cursor = chunk.next_cursor ?? "";
    if (!cursor) break;
  }
  return { items: all };
}

export const oneBounty = (slug) =>
  request(`/competitions/${encodeURIComponent(slug)}`);

export const oneStandings = (slug) =>
  request(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);

export const oneProfile = (handle) =>
  request(`/profiles/${encodeURIComponent(handle)}`);
