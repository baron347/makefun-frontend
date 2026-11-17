// The router and board state: four routes (board, bounty, standings,
// profile), one fetch per page, countdowns that tick without rebuilding the
// page, and a footer that says what the page actually fetched.

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
const footerStatus = document.getElementById("api-status");

// What the board remembers while you use it: the search text, the tab, the
// sort and category chips, which bounty is picked, and the detail data
// already fetched for it.
const ui = {
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
let shownRows = 25;
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

// The footer line: real request counts for the page you are on.
function paintFooter() {
  if (!footerStatus) return;
  const s = fetchStats();
  const when = s.at ? `${Math.max(0, Math.round((Date.now() - s.at) / 1000))}s ago` : "—";
  footerStatus.textContent = `This view: ${s.req} API request${s.req === 1 ? "" : "s"} · ${s.notMod} unchanged (304) · ${s.mem} from memory · updated ${when}`;
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
// back to the list's own data.
async function fillSelected(slug) {
  if (!slug) return;
  if (!ui.full[slug]) {
    try {
      ui.full[slug] = await oneBounty(slug);
    } catch {}
  }
  if (!ui.top5[slug]) {
    try {
      const lb = await oneStandings(slug);
      ui.top5[slug] = (lb.entries ?? []).slice(0, 5);
    } catch {
      ui.top5[slug] = [];
    }
  }
}

async function paintBoard() {
  showLoading("Open bounties");
  try {
    resetStats();
    boardData = await listOpen();
    if (!ui.selected) {
      const items = boardData.items ?? [];
      ui.selected = items.some((c) => c.slug === "makefun-frontend-01")
        ? "makefun-frontend-01"
        : items[0]?.slug ?? null;
    }
    document.title = "Open bounties | make.fun";
    await fillSelected(ui.selected);
    await refreshEnded();
    root.innerHTML = boardPage(boardData, ui);
    bindSearch();
    startClocks();
    paintFooter();
  } catch (err) {
    return void showError(err, "board");
  }
  window.__shotReady = true;
}

// The Closed tab's extra pages: closed + resolved, newest deadline first.
// A failed fetch is tried once more after a short pause, then left empty.
async function refreshEnded() {
  if (ui.ended || ui.endedBusy) return;
  ui.endedBusy = true;
  try {
    const fetchBoth = async () => {
      const closed = await listByStatus("closed").catch(() => ({ items: [] }));
      const resolved = await listByStatus("resolved").catch(() => ({ items: [] }));
      return [...closed.items, ...resolved.items].sort(
        (a, b) => new Date(b.deadline) - new Date(a.deadline),
      );
    };
    let rows = await fetchBoth();
    if (rows.length === 0) {
      await new Promise((r) => setTimeout(r, 2000));
      rows = await fetchBoth();
    }
    ui.ended = rows;
  } catch {
    // The Closed tab simply stays with what the open list already had.
  } finally {
    ui.endedBusy = false;
  }
}

// Re-render the board in place (search, tabs, chips, picking a row) without
// refetching, keeping the scroll position.
function repaintBoard() {
  const y = window.scrollY;
  root.innerHTML = boardPage(boardData, ui);
  bindSearch();
  window.scrollTo(0, y);
  paintFooter();
}

function bindSearch() {
  const input = document.getElementById("q");
  if (!input) return;
  input.addEventListener("input", () => {
    const caret = input.selectionStart;
    ui.q = input.value;
    repaintBoard();
    const again = document.getElementById("q");
    again.focus();
    again.setSelectionRange(caret, caret);
  });
}

async function paintBounty(slug) {
  showLoading("Bounty");
  try {
    resetStats();
    const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
    document.title = `${comp.title} | make.fun`;
    root.innerHTML = bountyPage(comp, (lb.entries ?? []).slice(0, 5));
    startClocks();
    paintFooter();
  } catch (err) {
    return void showError(err, `bounty:${slug}`);
  }
  window.__shotReady = true;
}

async function paintStandings(slug) {
  showLoading("Leaderboard");
  try {
    resetStats();
    const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
    document.title = `Leaderboard — ${comp.title} | make.fun`;
    shownRows = 25;
    root.innerHTML = standingsPage(comp, lb, shownRows);
    root.dataset.lbSlug = slug;
    paintFooter();
  } catch (err) {
    return void showError(err, `leaderboard:${slug}`);
  }
  window.__shotReady = true;
}

async function paintProfile(handle) {
  showLoading("Profile");
  try {
    resetStats();
    const p = await oneProfile(handle);
    document.title = `@${p.handle} | make.fun`;
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
function parseHash() {
  const parts = (location.hash || "#/").replace(/^#\//, "").split("/").map(decodeURIComponent);
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
  const r = parseHash();
  if (r.name === "bounty") await paintBounty(r.slug);
  else if (r.name === "leaderboard") await paintStandings(r.slug);
  else if (r.name === "profile") await paintProfile(r.handle);
  else await paintBoard();
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
    ui.ended = null;
    ui.top5 = {};
    ui.full = {};
    await route();
  } else if (action === "tab") {
    ui.tab = btn.dataset.tab;
    if (ui.tab === "ended" && !ui.ended) {
      refreshEnded().then(() => {
        if (parseHash().name === "board") repaintBoard();
        paintFooter();
      });
    }
    repaintBoard();
  } else if (action === "sort") {
    ui.sort = btn.dataset.sort;
    repaintBoard();
  } else if (action === "cat") {
    ui.cat = btn.dataset.cat;
    repaintBoard();
  } else if (action === "select") {
    if (ev.target.closest("a[href]")) return; // the title link navigates instead
    const slug = btn.dataset.slug;
    if (slug === ui.selected) return;
    ui.selected = slug;
    repaintBoard();
    await fillSelected(slug);
    if (parseHash().name === "board" && ui.selected === slug) repaintBoard();
  } else if (action === "more-lb") {
    shownRows += 25;
    const slug = root.dataset.lbSlug;
    try {
      const [comp, lb] = await Promise.all([oneBounty(slug), oneStandings(slug)]);
      root.innerHTML = standingsPage(comp, lb, shownRows);
    } catch {
      await route();
    }
  }
});

// Rows are keyboard-selectable too.
root.addEventListener("keydown", (ev) => {
  if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('.row[data-action="select"]')) {
    ev.preventDefault();
    ev.target.click();
  }
});

window.addEventListener("hashchange", route);
route();
