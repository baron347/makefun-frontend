# Bounties · make.fun

[![make.fun bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

A fast, read-only way to browse [make.fun](https://make.fun), built for the
[Build the best make.fun frontend](https://make.fun/bounty/makefun-frontend-01)
bounty. It is only static files — plain JavaScript, no framework, no build
step — and everything on screen comes live from the make.fun public API.

## Run it

```sh
node serve.ts        # serves app/ on http://localhost:8080
```

Then open <http://localhost:8080>. Any static host works too, with `app/` at
its root.

## The four pages

Each page has its own URL, so any of them can be linked or refreshed:

- **Board** (`#/`) — open bounties as a master-detail board. The left column
  lists them densely: live pot, entry fee, time left with a progress bar,
  entry count. The right pane shows the bounty you picked, in full. Above
  them sit four numbers (bounties open, pots right now, entries so far,
  closing next, ticking down every second) and a live ticker naming the
  newest entries. Open and Closed tabs carry their counts; sort chips
  (soonest first, largest pot, most entered), kind chips and a search box
  narrow the list from memory, without another fetch. Clicking a row swaps
  the detail pane. A bounty past its deadline counts as finished even while
  its status still says open, until results are out.
- **Bounty** (`#/bounty/<slug>`) — the bounty in full: what it is, the whole
  rules, stat cards (pot now, what it costs to enter, closes in, entries),
  a green button that takes you to enter on make.fun, a rewards table with
  what every place pays from the live pot right now and green bars sized to
  the top prize, a timeline (Opened → Now → Deadline → Results by), a top-5
  preview by judge win rate with prize now, and the latest entries. The
  board's detail pane shows the same for the bounty you picked.
- **Standings** (`#/bounty/<slug>/leaderboard`) — the bounty's ranked
  entries: judge win rate, 90% range, prize now (what each place pays out of
  the live pot), entry size and status. Twenty-five rows at a time from a
  single fetch; the rest page in from that same answer. Clicking a handle
  opens that entrant's profile.
- **Profile** (`#/profile/<handle>`) — a public profile: photo, bio, links,
  when they joined, their record (bounties entered, placed, won, podiums,
  best finish, winnings) and every entry they have made, each linked back to
  its bounty.

## Why it feels fast

- **One request per page.** The board, a bounty, its standings and a profile
  each fetch once. The standings' later rows come from that same fetch and
  page in on the client; search filters the board already in memory.
- **Answers are cached, then revalidated.** An answer stays in memory for 60
  seconds; after that it is revalidated with `If-None-Match`, so a visit
  inside the minute costs no request at all and a 304 after it costs no body.
- **It starts small.** Six small files on first load (HTML, one stylesheet,
  four small ES modules), no framework, no third-party code. Per the
  dossier: first load 6 files, 55,058 bytes raw, 16,827 bytes gzip-9; whole
  app 7 files, 55,385 bytes.
- **It never goes blank.** Every route shows a loading state, then its data,
  or a plain error with a retry button when the API does not answer. The
  "closes in" figures tick every second (countdowns) and every 30 seconds
  (rows) without rebuilding the page. API requests give up after 30 seconds
  instead of hanging, and a failed closed-bounties fetch is tried once more.
- **It says what it did.** The footer shows the real request counts for the
  page you are on (API requests, 304 revalidations, answers served from
  memory, time since the last answer).

## What is in here

- `app/` — the frontend: `index.html`, `style.css`, `main.js` (the router),
  `api.js` (the cached API client), `views.js` (the four pages), `format.js`
  (formatting and a small safe Markdown renderer), `favicon.svg`.
- `main.ts` — hands the entry in: copies `app/` and `screenshots/` to the
  output directory and writes `dossier.json` with the vendored library.
- `serve.ts` — the local static server used while building.
- `screenshots/` — three real renders of the running app on live data.
- `vendor/makefun-frontend.ts` — the kit's library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
