// The router and the board's memory: four routes (board, bounty,
// standings, profile), one fetch per page, countdowns that tick without
// rebuilding the page, and a footer that says what the page really fetched.
//
// Views live in views.js, the API client in api.js, formatting in
// format.js. This file only wires them together: it reads the hash, loads
// the data, renders, and handles the clicks that stay on the same page.

import {
  fetchStats,
  flushCache,
  listOpen,
  listEnded,
  oneBounty,
  oneStandings,
  oneProfile,
  resetStats,
} from "./api.js";
import { boardPage, bountyPage, standingsPage, profilePage } from "./views.js";
import { leftShort, leftTick, ago } from "./format.js";

const root = document.getElementById("app");
const footerLine = document.getElementById("api-status");

// What the board remembers while you use it: the search text, the tab, the
// sort and kind pills, which bounty is picked, and the detail data already
// fetched for it. A factory, so a fresh board starts from the same shape.
function freshBoardState() {
  return {
    q: "",
    tab: "live",
    sort: "closing",
    cat: "All",
    ended: null,
    endedBusy: false,
    selected: null,
    top5: {},
    full: {},
  };
}

const board = freshBoardState();
let boardData = null;
let rowsShown = 25;

// --- Clocks ---------------------------------------------------------------
// Two timers: one per second for the ticking countdowns, one per thirty
// seconds for the coarse "time left" and "x min ago" labels. Both only
// rewrite text nodes, never the page, so scrolling and focus survive.

const clocks = {
  fast: null,
  slow: null,
  start() {
    this.stop();
    this.fast = setInterval(() => {
      for (const el of document.querySelectorAll("[data-countdown]")) {
        el.textContent = leftTick(el.dataset.countdown);
      }
      paintFooter();
    }, 1000);
    this.slow = setInterval(() => {
      for (const el of root.querySelectorAll("[data-deadline]")) {
        el.textContent = leftShort(el.dataset.deadline);
      }
      for (const el of document.querySelectorAll("[data-createdat]")) {
        el.textContent = ago(el.dataset.createdat);
      }
    }, 30000);
  },
  stop() {
    if (this.fast) clearInterval(this.fast);
    if (this.slow) clearInterval(this.slow);
    this.fast = this.slow = null;
  },
};

// The footer line: the real request counts for the page you are on.
function paintFooter() {
  if (!footerLine) return;
  const s = fetchStats();
  const agoSecs = s.at
    ? `${Math.max(0, Math.round((Date.now() - s.at) / 1000))}s ago`
    : "—";
  const plural = s.req === 1 ? "" : "s";
  footerLine.textContent = `This view: ${s.req} API request${plural} · ${s.notMod} unchanged (304) · ${s.mem} from memory · updated ${agoSecs}`;
}

function showLoading(title) {
  root.innerHTML = `<h1>${title}</h1><p class="loading">Loading live data from make.fun…</p>`;
}

function showError(err, retryKey) {
  const missing = err?.status === 404;
  root.innerHTML = `
    <h1>${missing ? "Not found" : "Could not load this page"}</h1>
    <p class="error">${missing ? "make.fun has no page with that address." : "The make.fun API did not answer. Your connection may be down, or the API may be busy — try again."}</p>
    <p><button type="button" data-action="retry">Try again</button> <a href="#/">← Back to the board</a></p>`;
  root.dataset.retry = retryKey;
  window.__shotReady = true;
}

// Fetch the picked bounty's full record and its top 5, once each, so the
// detail pane can show them. A failure here is not fatal: the pane falls
// back to the list row's own data.
async function loadDetail(slug) {
  if (!slug) return;
  if (!board.full[slug]) {
    try {
      board.full[slug] = await oneBounty(slug);
    } catch {
      // the detail pane falls back to the list row's data
    }
  }
  if (!board.top5[slug]) {
    try {
      const lb = await oneStandings(slug);
      board.top5[slug] = (lb.entries ?? []).slice(0, 5);
    } catch {
      board.top5[slug] = [];
    }
  }
}

// The Closed tab's extra rows, fetched once and kept for the session.
async function loadEnded() {
  if (board.ended || board.endedBusy) return;
  board.endedBusy = true;
  try {
    board.ended = await listEnded();
  } catch {
    // The Closed tab simply keeps what the open list already had.
  } finally {
    board.endedBusy = false;
  }
}

async function showBoard() {
  showLoading("Open bounties");
  try {
    resetStats();
    boardData = await listOpen();
    if (!board.selected) {
      const items = boardData.items ?? [];
      board.selected = items.some((c) => c.slug === "makefun-frontend-01")
        ? "makefun-frontend-01"
        : items[0]?.slug ?? null;
    }
    document.title = "Open bounties · Featherlight";
    await loadDetail(board.selected);
    await loadEnded();
    root.innerHTML = boardPage(boardData, board);
    attachSearch();
    clocks.start();
    paintFooter();
  } catch (err) {
    return void showError(err, "board");
  }
  window.__shotReady = true;
}

// Re-render the board in place (search, tabs, pills, picking a row) without
// refetching, keeping the scroll position.
function repaintBoard() {
  const y = window.scrollY;
  root.innerHTML = boardPage(boardData, board);
  attachSearch();
  window.scrollTo(0, y);
  paintFooter();
}

function attachSearch() {
  const input = document.getElementById("q");
  if (!input) return;
  input.addEventListener("input", () => {
    const caret = input.selectionStart;
    board.q = input.value;
    repaintBoard();
    const again = document.getElementById("q");
    again.focus();
    again.setSelectionRange(caret, caret);
  });
}

async function showBounty(slug) {
  showLoading("Bounty");
  try {
    resetStats();
    const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
    document.title = `${comp.title} · Featherlight`;
    root.innerHTML = bountyPage(comp, (lb.entries ?? []).slice(0, 5));
    clocks.start();
    paintFooter();
  } catch (err) {
    return void showError(err, `bounty:${slug}`);
  }
  window.__shotReady = true;
}

async function showStandings(slug) {
  showLoading("Leaderboard");
  try {
    resetStats();
    const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
    document.title = `Standings — ${comp.title} · Featherlight`;
    rowsShown = 25;
    root.innerHTML = standingsPage(comp, lb, rowsShown);
    root.dataset.lbSlug = slug;
    paintFooter();
  } catch (err) {
    return void showError(err, `leaderboard:${slug}`);
  }
  window.__shotReady = true;
}

async function showProfile(handle) {
  showLoading("Profile");
  try {
    resetStats();
    const p = await oneProfile(handle);
    document.title = `@${p.handle} · Featherlight`;
    root.innerHTML = profilePage(p);
    paintFooter();
  } catch (err) {
    return void showError(err, `profile:${handle}`);
  }
  window.__shotReady = true;
}

// Drop images that fail to load (a missing avatar should vanish, not show
// a broken icon).
function dropBrokenImages() {
  for (const img of root.querySelectorAll("img")) {
    if (img.complete && img.naturalWidth === 0) {
      img.remove();
    } else {
      img.addEventListener("error", () => img.remove(), { once: true });
    }
  }
}

// "#/bounty/<slug>/leaderboard", "#/bounty/<slug>", "#/profile/<handle>",
// anything else is the board.
function readRoute() {
  const parts = (location.hash || "#/")
    .replace(/^#\//, "")
    .split("/")
    .map(decodeURIComponent);
  if (parts[0] === "bounty" && parts[1] && parts[2] === "leaderboard") {
    return { name: "leaderboard", slug: parts[1] };
  }
  if (parts[0] === "bounty" && parts[1]) return { name: "bounty", slug: parts[1] };
  if (parts[0] === "profile" && parts[1]) return { name: "profile", handle: parts[1] };
  return { name: "board" };
}

async function route() {
  window.__shotReady = false;
  clocks.stop();
  const r = readRoute();
  if (r.name === "bounty") await showBounty(r.slug);
  else if (r.name === "leaderboard") await showStandings(r.slug);
  else if (r.name === "profile") await showProfile(r.handle);
  else await showBoard();
  dropBrokenImages();
  window.scrollTo(0, 0);
}

// --- Clicks that stay on the page -----------------------------------------
// One handler per data-action, looked up by name instead of a long if/else
// chain, so adding a new in-page action is one entry here.

function clearBoardCaches() {
  flushCache();
  board.ended = null;
  board.top5 = {};
  board.full = {};
}

const actions = {
  async retry() {
    flushCache();
    await route();
  },
  async refresh() {
    clearBoardCaches();
    await route();
  },
  tab(btn) {
    board.tab = btn.dataset.tab;
    if (board.tab === "ended" && !board.ended) {
      loadEnded().then(() => {
        if (readRoute().name === "board") repaintBoard();
        paintFooter();
      });
    }
    repaintBoard();
  },
  sort(btn) {
    board.sort = btn.dataset.sort;
    repaintBoard();
  },
  cat(btn) {
    board.cat = btn.dataset.cat;
    repaintBoard();
  },
  async select(btn, ev) {
    if (ev.target.closest("a[href]")) return; // the title link navigates instead
    const slug = btn.dataset.slug;
    if (slug === board.selected) return;
    board.selected = slug;
    repaintBoard();
    await loadDetail(slug);
    if (readRoute().name === "board" && board.selected === slug) repaintBoard();
  },
  async "more-lb"() {
    rowsShown += 25;
    const slug = root.dataset.lbSlug;
    try {
      const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
      root.innerHTML = standingsPage(comp, lb, rowsShown);
    } catch {
      await route();
    }
  },
};

root.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const handler = actions[btn.dataset.action];
  if (handler) await handler(btn, ev);
});

// Rows are keyboard-selectable too.
root.addEventListener("keydown", (ev) => {
  if (
    (ev.key === "Enter" || ev.key === " ") &&
    ev.target.matches?.('.bounty-row[data-action="select"]')
  ) {
    ev.preventDefault();
    ev.target.click();
  }
});

window.addEventListener("hashchange", route);
route();
