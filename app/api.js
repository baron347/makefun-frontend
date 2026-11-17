// The make.fun public API, behind a tiny cache.
//
// Rules of this client:
//  - one fetch per page; identical requests that are already flying share
//    the same promise instead of starting a second fetch;
//  - an answer stays fresh in memory for 60 seconds, and after that it is
//    revalidated with an ETag, so a 304 costs no body;
//  - a request that hangs is abandoned after 30 seconds.
//
// fetchStats() exposes the real counts for the footer line.

const API_ROOT = "https://make.fun/api";
const FRESH_FOR_MS = 60_000;
const GIVE_UP_MS = 30_000;

// url -> { body, etag, fetchedAt }
const answers = new Map();
// url -> in-flight promise
const flying = new Map();
const tally = { requests: 0, revalidated: 0, memory: 0, lastAt: 0 };

export function fetchStats() {
  return { req: tally.requests, notMod: tally.revalidated, mem: tally.memory, at: tally.lastAt };
}

export function resetStats() {
  tally.requests = 0;
  tally.revalidated = 0;
  tally.memory = 0;
  tally.lastAt = 0;
}

export function flushCache() {
  answers.clear();
}

async function get(path) {
  const known = answers.get(path);
  if (known && Date.now() - known.fetchedAt < FRESH_FOR_MS) {
    tally.memory++;
    tally.lastAt = Date.now();
    return known.body;
  }
  if (flying.has(path)) return flying.get(path);

  const task = (async () => {
    const headers = known?.etag ? { "If-None-Match": known.etag } : {};
    tally.requests++;
    const abort = new AbortController();
    const clock = setTimeout(() => abort.abort(), GIVE_UP_MS);
    let reply;
    try {
      reply = await fetch(API_ROOT + path, { headers, signal: abort.signal });
    } finally {
      clearTimeout(clock);
    }
    if (reply.status === 304 && known) {
      tally.revalidated++;
      tally.lastAt = Date.now();
      known.fetchedAt = Date.now();
      return known.body;
    }
    if (!reply.ok) {
      const failure = new Error(`make.fun API ${reply.status} for ${path}`);
      failure.status = reply.status;
      throw failure;
    }
    const body = await reply.json();
    tally.lastAt = Date.now();
    answers.set(path, {
      body,
      etag: reply.headers.get("ETag"),
      fetchedAt: Date.now(),
    });
    return body;
  })();

  flying.set(path, task);
  try {
    return await task;
  } finally {
    flying.delete(path);
  }
}

// The open board, with the activity times the ticker and the past-hour
// counts read from.
export const listOpen = () => get("/competitions?status=open&activity=times");

// Closed / resolved bounties for the board's Closed tab, up to 500, newest
// deadline first. Walks the cursor pages; an empty page simply ends it.
export async function listByStatus(status) {
  const collected = [];
  let cursor = "";
  for (let page = 0; page < 10 && collected.length < 500; page++) {
    const next = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
    const chunk = await get(`/competitions?status=${status}&activity=times${next}`);
    collected.push(...(chunk.items ?? []));
    cursor = chunk.next_cursor ?? "";
    if (!cursor) break;
  }
  return { items: collected };
}

export const oneBounty = (slug) =>
  get(`/competitions/${encodeURIComponent(slug)}`);

export const oneStandings = (slug) =>
  get(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);

export const oneProfile = (handle) =>
  get(`/profiles/${encodeURIComponent(handle)}`);
