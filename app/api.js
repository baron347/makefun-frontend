// make.fun's public API: read-only GET requests, open to any origin (CORS).
// The full API is described at https://make.fun/api/openapi.json.
//
// Every answer is cached in memory and revalidated cheaply: within 60 s the cache is used
// with no request at all; after that one conditional request with If-None-Match revalidates,
// and a 304 answer (the API's ETags are bound to the minute) costs no body. In-flight
// requests for the same path are shared, so one view makes one request.

const API = 'https://make.fun/api';
const TTL_MS = 60000;
const cache = new Map(); // path -> { data, etag, at }
const inflight = new Map(); // path -> Promise

async function get(path) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const pending = inflight.get(path);
  if (pending) return pending;
  const job = (async () => {
    const headers = {};
    if (hit?.etag) headers['If-None-Match'] = hit.etag;
    const res = await fetch(API + path, { headers });
    if (res.status === 304 && hit) {
      hit.at = Date.now();
      return hit.data;
    }
    if (!res.ok) {
      const err = new Error(`make.fun API ${res.status} for ${path}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    cache.set(path, { data, etag: res.headers.get('ETag'), at: Date.now() });
    return data;
  })();
  inflight.set(path, job);
  try {
    return await job;
  } finally {
    inflight.delete(path);
  }
}

/** The open bounties, one request: { items: [...] }. */
export const getBounties = () => get('/competitions?status=open&activity=times');

/** Bounties of one status, following the cursor until the list ends (capped). */
export async function getBountiesByStatus(status) {
  const items = [];
  let cursor = '';
  for (let page = 0; page < 10 && items.length < 500; page++) {
    const data = await get(
      `/competitions?status=${status}&activity=times${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    );
    items.push(...(data.items ?? []));
    cursor = data.next_cursor ?? '';
    if (!cursor) break;
  }
  return { items };
}

/** One bounty, by its slug. */
export const getBounty = (slug) => get(`/competitions/${encodeURIComponent(slug)}`);

/** A bounty's leaderboard, top 10 in `entries` plus the rest in compact `rest` rows:
 *  one request, paged client-side, never refetched for the next page. */
export const getLeaderboard = (slug) =>
  get(`/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`);

/** A public profile, by handle. */
export const getProfile = (handle) => get(`/profiles/${encodeURIComponent(handle)}`);

/** Drop the cache (used by the retry button after an error). */
export function clearCache() {
  cache.clear();
}
