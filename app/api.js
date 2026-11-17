// A small cached client for the make.fun public API: one fetch per page,
// bodies fresh for a minute then revalidated with ETag, 30s timeout.
const API_ROOT = "https://make.fun/api";
const FRESH_FOR_MS = 60_000;
const GIVE_UP_MS = 30_000;
const ENDED_LIMIT = 500;
const ENDED_PAGES = 10;

class Client {
  constructor() {
    // path -> { body, etag, at } — answers already in hand.
    this.kept = new Map();
    // path -> promise — requests still in flight, shared by all callers.
    this.flying = new Map();
    this.tally = { sent: 0, notModified: 0, fromMemory: 0, lastAt: 0 };
  }

  stats() {
    return {
      req: this.tally.sent,
      notMod: this.tally.notModified,
      mem: this.tally.fromMemory,
      at: this.tally.lastAt,
    };
  }

  reset() {
    this.tally.sent = 0;
    this.tally.notModified = 0;
    this.tally.fromMemory = 0;
    this.tally.lastAt = 0;
  }

  clear() {
    this.kept.clear();
  }

  stillFresh(entry) {
    return Boolean(entry) && Date.now() - entry.at < FRESH_FOR_MS;
  }

  async json(path) {
    const known = this.kept.get(path);
    if (this.stillFresh(known)) {
      this.tally.fromMemory++;
      this.tally.lastAt = Date.now();
      return known.body;
    }
    const shared = this.flying.get(path);
    if (shared) return shared;

    const job = this.run(path, known);
    this.flying.set(path, job);
    try {
      return await job;
    } finally {
      this.flying.delete(path);
    }
  }

  async run(path, known) {
    const headers = known?.etag ? { "If-None-Match": known.etag } : {};
    this.tally.sent++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), GIVE_UP_MS);
    let res;
    try {
      res = await fetch(API_ROOT + path, { headers, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 304 && known) {
      this.tally.notModified++;
      this.tally.lastAt = Date.now();
      known.at = Date.now();
      return known.body;
    }
    if (!res.ok) {
      const err = new Error(`make.fun API ${res.status} for ${path}`);
      err.status = res.status;
      throw err;
    }
    const body = await res.json();
    this.tally.lastAt = Date.now();
    this.kept.set(path, {
      body,
      etag: res.headers.get("ETag"),
      at: Date.now(),
    });
    return body;
  }

  // The open board, carrying the activity times the ticker reads.
  board() {
    return this.json("/competitions?status=open&activity=times");
  }

  // One status worth of finished bounties: up to 500 rows, newest first.
  async byStatus(status) {
    const rows = [];
    let cursor = "";
    for (let page = 0; page < ENDED_PAGES && rows.length < ENDED_LIMIT; page++) {
      const tail = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
      const chunk = await this.json(
        `/competitions?status=${status}&activity=times${tail}`,
      );
      rows.push(...(chunk.items ?? []));
      cursor = chunk.next_cursor ?? "";
      if (!cursor) break;
    }
    return { items: rows };
  }

  // Closed + resolved together, newest deadline first; an empty first
  // try is retried once after a short pause.
  async ended() {
    const gather = async () => {
      const closed = await this.byStatus("closed").catch(() => ({ items: [] }));
      const resolved = await this.byStatus("resolved").catch(() => ({
        items: [],
      }));
      return [...closed.items, ...resolved.items].sort(
        (a, b) => new Date(b.deadline) - new Date(a.deadline),
      );
    };
    let rows = await gather();
    if (rows.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      rows = await gather();
    }
    return rows;
  }

  bounty(slug) {
    return this.json(`/competitions/${encodeURIComponent(slug)}`);
  }

  standings(slug) {
    return this.json(
      `/competitions/${encodeURIComponent(slug)}/leaderboard?rows=first`,
    );
  }

  profile(handle) {
    return this.json(`/profiles/${encodeURIComponent(handle)}`);
  }
}

const client = new Client();

export const fetchStats = () => client.stats();
export const resetStats = () => client.reset();
export const flushCache = () => client.clear();
export const listOpen = () => client.board();
export const listByStatus = (status) => client.byStatus(status);
export const listEnded = () => client.ended();
export const oneBounty = (slug) => client.bounty(slug);
export const oneStandings = (slug) => client.standings(slug);
export const oneProfile = (handle) => client.profile(handle);
