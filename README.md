# make.fun bounties — a fast, read-only make.fun frontend

[![make.fun bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

A fast, easy-to-use frontend for [make.fun](https://make.fun), built for the
[Build the best make.fun frontend](https://make.fun/bounty/makefun-frontend-01)
bounty. It is plain static files — vanilla JavaScript, no framework, no build
step — and reads live data from the make.fun public API only.

## Run it

```sh
node serve.ts        # serves app/ on http://localhost:8080
```

Open <http://localhost:8080> in a browser. Any static file server works too,
with `app/` at its root.

## What it shows

Four surfaces, each reachable by a link and by its own URL:

- **Bounty board** (`#/`) — the live bounties. Every card shows its live pot
  (base reward plus entry fees paid in), its entry fee where one is set, its
  time left, and its entry count. Search filters the board without refetching;
  "Show ended" loads the ended bounties. Bounties still taking entries come
  first, closing soonest on top.
- **Bounty page** (`#/bounty/<slug>`) — summary, description and full rules,
  a rewards table with what each place pays right now, the live pot, entry
  fee, deadline, published date, entry count, status and sponsor, plus a link
  to the leaderboard. A bounty past its deadline counts as ended even while
  its status still reads open, until its results are published.
- **Leaderboard** (`#/bounty/<slug>/leaderboard`) — the bounty's ranked
  entries: judge win rate, 90% interval, entry size and status, paged 25 at a
  time from a single fetch. Clicking a handle opens that entrant's profile.
- **Profile** (`#/profile/<handle>`) — a public profile: avatar, bio, links,
  joined date, record (entered, placed, won, podiums, best placement, prize
  money) and every entry they have made, each linked back to its bounty.

## How it stays fast

- **One request per view.** The board, a bounty, its leaderboard and a profile
  each fetch once. The leaderboard's remaining rows come from that same fetch
  and page client-side; search filters the board already in memory.
- **Cached and revalidated.** Answers are cached in memory for 60 seconds and
  then revalidated with `If-None-Match`, so a repeat visit inside the minute
  costs no request at all and a 304 after it costs no body.
- **Small first load.** Six small files on first load (HTML, one stylesheet,
  four small ES modules), no framework, no third-party code.
- **No blank pages.** Every route shows a loading state, then its data, or a
  clear error with a retry button when the API does not answer. The "time
  left" figures tick every 30 seconds without rebuilding the page.

## Files

- `app/` — the frontend: `index.html`, `style.css`, `main.js` (router),
  `api.js` (cached API client), `views.js` (the four pages), `format.js`
  (formatting and a small safe Markdown renderer), `favicon.svg`,
  `favicon.ico`.
- `main.ts` — hands the entry in: copies `app/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored library.
- `serve.ts` — the local static server used during development.
- `screenshots/` — three real renders of the running app on live data.
- `vendor/makefun-frontend.ts` — the kit's library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
