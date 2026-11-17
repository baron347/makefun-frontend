// The router and the board's memory: four routes (board, bounty,
// standings, profile), one fetch per page, countdowns that tick without
// rebuilding the page, and a footer that says what the page really fetched.

import {
  fetchStats,
  flushCache,
  listOpen,
  listByStatus,
  oneBounty,
  oneStandings,
  oneProfile,
  resetStats,
} from "./api.js";
import { boardPage, bountyPage, standingsPage, profilePage } from "./views.js";
import { left, leftExact, since } from "./format.js";

const root = document.getElementById("app");
const footerLine = document.getElementById("api-status");

// What the board remembers while you use it: the search text, the tab, the
// sort and kind chips, which bounty is picked, and the detail data already
// fetched for it.
const board = {
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

let boardData = null;
let rowsShown = 25;
let tickFast = null;
let tickSlow = null;

function startClocks() {
  stopClocks();
  tickFast = setInterval(() => {
    for (const el of document.querySelectorAll("[data-countdown]")) {
      el.textContent = leftExact(el.dataset.countdown);
    }
    paintFooter();
  }, 1000);
  tickSlow = setInterval(() => {
    for (const el of root.querySelectorAll("[data-deadline]")) {
      el.textContent = left(el.dataset.deadline);
    }
    for (const el of document.querySelectorAll("[data-createdat]")) {
      el.textContent = since(el.dataset.createdat);
    }
  }, 30000);
}

function stopClocks() {
  if (tickFast) clearInterval(tickFast);
  if (tickSlow) clearInterval(tickSlow);
  tickFast = tickSlow = null;
}

// The footer line: the real request counts for the page you are on.
function paintFooter() {
  if (!footerLine) return;
  const s = fetchStats();
  const ago = s.at
    ? `${Math.max(0, Math.round((Date.now() - s.at) / 1000))}s ago`
    : "—";
  const plural = s.req === 1 ? "" : "s";
  footerLine.textContent = `This view: ${s.req} API request${plural} · ${s.notMod} unchanged (304) · ${s.mem} from memory · updated ${ago}`;
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
    startClocks();
    paintFooter();
  } catch (err) {
    return void showError(err, "board");
  }
  window.__shotReady = true;
}

// The Closed tab's extra pages: closed + resolved, newest deadline first.
// A failed fetch is tried once more after a short pause, then left empty.
async function loadEnded() {
  if (board.ended || board.endedBusy) return;
  board.endedBusy = true;
  try {
    const fetchEnded = async () => {
      const closed = await listByStatus("closed").catch(() => ({ items: [] }));
      const resolved = await listByStatus("resolved").catch(() => ({
        items: [],
      }));
      return [...closed.items, ...resolved.items].sort(
        (a, b) => new Date(b.deadline) - new Date(a.deadline),
      );
    };
    let rows = await fetchEnded();
    if (rows.length === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      rows = await fetchEnded();
    }
    board.ended = rows;
  } catch {
    // The Closed tab simply keeps what the open list already had.
  } finally {
    board.endedBusy = false;
  }
}

// Re-render the board in place (search, tabs, chips, picking a row) without
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
    startClocks();
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
  stopClocks();
  const r = readRoute();
  if (r.name === "bounty") await showBounty(r.slug);
  else if (r.name === "leaderboard") await showStandings(r.slug);
  else if (r.name === "profile") await showProfile(r.handle);
  else await showBoard();
  dropBrokenImages();
  window.scrollTo(0, 0);
}

root.addEventListener("click", async (ev) => {
  const btn = ev.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "retry") {
    flushCache();
    await route();
  } else if (action === "refresh") {
    flushCache();
    board.ended = null;
    board.top5 = {};
    board.full = {};
    await route();
  } else if (action === "tab") {
    board.tab = btn.dataset.tab;
    if (board.tab === "ended" && !board.ended) {
      loadEnded().then(() => {
        if (readRoute().name === "board") repaintBoard();
        paintFooter();
      });
    }
    repaintBoard();
  } else if (action === "sort") {
    board.sort = btn.dataset.sort;
    repaintBoard();
  } else if (action === "cat") {
    board.cat = btn.dataset.cat;
    repaintBoard();
  } else if (action === "select") {
    if (ev.target.closest("a[href]")) return; // the title link navigates instead
    const slug = btn.dataset.slug;
    if (slug === board.selected) return;
    board.selected = slug;
    repaintBoard();
    await loadDetail(slug);
    if (readRoute().name === "board" && board.selected === slug) repaintBoard();
  } else if (action === "more-lb") {
    rowsShown += 25;
    const slug = root.dataset.lbSlug;
    try {
      const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
      root.innerHTML = standingsPage(comp, lb, rowsShown);
    } catch {
      await route();
    }
  }
});

// Rows are keyboard-selectable too.
root.addEventListener("keydown", (ev) => {
  if (
    (ev.key === "Enter" || ev.key === " ") &&
    ev.target.matches?.('.row[data-action="select"]')
  ) {
    ev.preventDefault();
    ev.target.click();
  }
});

window.addEventListener("hashchange", route);
route();
