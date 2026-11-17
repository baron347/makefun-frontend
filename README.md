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

- **Bounty board** (`#/`) — the live bounties as a master-detail board: dense
  rows (live pot, fee, time left with a progress bar, entries) on the left,
  the selected bounty's detail on the right. A stats strip shows live
  bounties, live pots, total entries and the next deadline ticking down; a
  live ticker names the newest entries. Live/Ended tabs carry counts, and
  sort chips (Closing soon / Biggest pot / Most entries), category chips and
  search filter the board without refetching. Clicking a row updates the
  detail pane; the title link opens the bounty's own page. Bounties still
  taking entries come first, closing soonest on top. A bounty past its
  deadline counts as ended even while its status still reads open, until its
  results are published.
- **Bounty page** (`#/bounty/<slug>`) — summary, description and full rules,
  stat cards (live pot, entry fee, time left, entries), a green "Enter on
  make.fun" button, a rewards table with what each place pays right now and
  green bars sized to the top prize, a phases timeline (Opened → Now →
  Deadline → Results by), a Top 5 leaderboard preview with judge win rates
  and prize now, and the most recent entries. The board's detail pane shows
  the same rich detail for the selected bounty.
- **Leaderboard** (`#/bounty/<slug>/leaderboard`) — the bounty's ranked
  entries: judge win rate, 90% interval, prize now (what each rank pays from
  the live pot), entry size and status, paged 25 at a time from a single
  fetch. Clicking a handle opens that entrant's profile.
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
  four small ES modules), no framework, no third-party code. The JS and CSS
  ship minified (terser / clean-css) for first-load size; the unminified
  sources are not kept in the repo. Per the dossier: first load 6 files,
  37,874 bytes raw, 12,153 bytes gzip-9; whole app 7 files, 38,122 bytes.
- **No blank pages.** Every route shows a loading state, then its data, or a
  clear error with a retry button when the API does not answer. The "time
  left" figures tick every second (countdowns) and every 30 seconds (rows)
  without rebuilding the page. API requests time out after 30 seconds instead
  of hanging, and a failed ended-bounties fetch is retried once.
- **Honest status line.** The footer shows the real request counts for the
  current view (API requests, 304 revalidations, answers served from memory,
  time since the last answer).

## Files

- `app/` — the frontend: `index.html`, `style.css`, `main.js` (router),
  `api.js` (cached API client), `views.js` (the four pages), `format.js`
  (formatting and a small safe Markdown renderer), `favicon.svg`.
- `main.ts` — hands the entry in: copies `app/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored library.
- `serve.ts` — the local static server used during development.
- `screenshots/` — three real renders of the running app on live data.
- `vendor/makefun-frontend.ts` — the kit's library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
