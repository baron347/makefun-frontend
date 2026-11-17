# Featherlight · make.fun bounties

[![make.fun bounty](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/rank.svg)](https://make.fun/bounty/makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/baron347/makefun-frontend/reward.svg)](https://make.fun/bounty/makefun-frontend-01)

A light, read-only browser for [make.fun](https://make.fun), built for the
[Build the best make.fun frontend](https://make.fun/bounty/makefun-frontend-01)
bounty. Static files only — hand-written JavaScript, no framework, no build
step — and every number on screen comes live from the make.fun public API.

## Running it

```sh
node serve.ts        # serves app/ at http://localhost:8080
```

Open <http://localhost:8080>. Any static host works as well, with `app/`
at the root.

## The four views

Every view has its own URL, so each one can be linked or refreshed:

- **Board** (`#/`) — open bounties in a master-detail layout. The left
  column lists them compactly: live pot, entry fee, time left with a
  progress bar, entry count. The right pane shows the bounty you picked,
  in full. Above them sit four live numbers (bounties open, pots right
  now, entries so far, closing next, ticking down every second) and a
  ticker naming the newest entries. Open and Closed tabs carry their
  counts; sort chips (soonest first, largest pot, most entered), kind
  chips and a search box narrow the list in memory, with no extra fetch.
  Clicking a row swaps the detail pane. A bounty past its deadline counts
  as finished even while its status still says open, until results are out.
- **Bounty** (`#/bounty/<slug>`) — one bounty in full: what it is, the
  whole rules, stat cards (pot now, what it costs to enter, closes in,
  entries), a green button that takes you to enter on make.fun, a rewards
  table showing what every place pays from the live pot right now with
  green bars sized to the top prize, a timeline (Opened → Now →
  Deadline → Results by), a top-5 preview by judge win rate with prize
  now, and the latest entries. The board's detail pane shows the same for
  the bounty you picked.
- **Standings** (`#/bounty/<slug>/leaderboard`) — the bounty's ranked
  entries: judge win rate, 90% range, prize now (what each place pays out
  of the live pot), entry size and status, with medals for the top three.
  Twenty-five rows at a time from a single fetch; the rest page in from
  that same answer. Clicking a handle opens that entrant's profile.
- **Profile** (`#/profile/<handle>`) — a public profile: photo, bio,
  links, when they joined, their record (bounties entered, placed, won,
  podiums, best finish, winnings) and every entry they have made, each
  linked back to its bounty.

## Why it feels fast

- **One request per view.** The board, a bounty, its standings and a
  profile each fetch once. The standings' later rows come from that same
  fetch and page in on the client; search filters the board already in
  memory.
- **Cached, then revalidated.** An answer stays in memory for 60 seconds;
  after that it is revalidated with `If-None-Match`, so a visit inside the
  minute costs no request at all and a 304 after it costs no body.
- **Small first load.** Six small files on first load (HTML, one
  stylesheet, four small ES modules), no framework, no third-party code.
- **Never a blank page.** Every route shows a loading state, then its
  data, or a plain error with a retry button when the API does not answer.
  The "closes in" figures tick every second (countdowns) and every 30
  seconds (rows) without rebuilding the page. API requests give up after
  30 seconds instead of hanging, and a failed closed-bounties fetch is
  tried once more.
- **It reports what it did.** The footer shows the real request counts for
  the page you are on (API requests, 304 revalidations, answers served
  from memory, time since the last answer).

## What lives here

- `app/` — the frontend: `index.html`, `style.css`, `main.js` (the
  router), `api.js` (the cached API client), `views.js` (the four views),
  `format.js` (formatting plus a small safe Markdown renderer),
  `favicon.svg`.
- `main.ts` — the submission entry point: copies `app/` and
  `screenshots/` to the output directory and writes `dossier.json` with
  the vendored library.
- `serve.ts` — the local static server used while building.
- `screenshots/` — three real renders of the running app on live data.
- `vendor/makefun-frontend.ts` — the kit's library, unchanged.

## License

MIT — see [LICENSE](LICENSE).
