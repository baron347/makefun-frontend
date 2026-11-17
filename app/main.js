// Router and page assembly for the four surfaces, on hash routes:
//
//   #/                              the bounty board
//   #/bounty/<slug>                 one bounty
//   #/bounty/<slug>/leaderboard     that bounty's leaderboard
//   #/profile/<handle>              a public profile
//
// window.__shotReady is false while a route loads and true once its data has rendered
// (or an error state has), so a screenshot script knows when to capture.

import { clearCache, getBounties, getBountiesByStatus, getBounty, getLeaderboard, getProfile } from './api.js';
import { board, bounty, leaderboard, profile } from './views.js';

const app = document.getElementById('app');
const boardState = { q: '', showEnded: false, ended: null };
let lbShown = 25;
let ticker = null;

/** Keep every "time left" on screen fresh without rebuilding the page. */
function startTicker() {
  stopTicker();
  ticker = setInterval(() => {
    for (const el of app.querySelectorAll('[data-deadline]')) {
      const ms = new Date(el.dataset.deadline).getTime() - Date.now();
      el.textContent =
        ms <= 0
          ? 'ended'
          : ms >= 86400000
            ? `${Math.floor(ms / 86400000)}d ${Math.floor((ms % 86400000) / 3600000)}h left`
            : ms >= 3600000
              ? `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m left`
              : `${Math.floor(ms / 60000)}m left`;
    }
  }, 30000);
}

function stopTicker() {
  if (ticker) {
    clearInterval(ticker);
    ticker = null;
  }
}

function loading(title) {
  app.innerHTML = `<h1>${title}</h1><p class="loading">Loading live data from make.fun…</p>`;
}

function failed(err, retry) {
  const notFound = err?.status === 404;
  app.innerHTML = `
    <h1>${notFound ? 'Not found' : 'Could not load this page'}</h1>
    <p class="error">${notFound ? 'make.fun has no page with that address.' : 'The make.fun API did not answer. Your connection may be down, or the API may be busy — try again.'}</p>
    <p><button type="button" data-action="retry">Try again</button> <a href="#/">← Back to the board</a></p>`;
  app.dataset.retry = retry;
  window.__shotReady = true;
}

async function showBoard() {
  loading('Open bounties');
  try {
    const data = await getBounties();
    document.title = 'Open bounties | make.fun';
    app.innerHTML = board(data, boardState);
    attachSearch(data);
    startTicker();
  } catch (err) {
    failed(err, 'board');
    return;
  }
  window.__shotReady = true;
}

/** Re-render the board list for a search keystroke, without refetching. */
function renderBoardOnly(data) {
  const scroll = window.scrollY;
  app.innerHTML = board(data, boardState);
  attachSearch(data);
  window.scrollTo(0, scroll);
}

/** The board's search box: filter the already-fetched list, keep the caret where it was. */
function attachSearch(data) {
  const q = document.getElementById('q');
  if (!q) return;
  q.addEventListener('input', () => {
    const pos = q.selectionStart;
    boardState.q = q.value;
    renderBoardOnly(data);
    const next = document.getElementById('q');
    next.focus();
    next.setSelectionRange(pos, pos);
  });
}

async function showBounty(slug) {
  loading('Bounty');
  try {
    const b = await getBounty(slug);
    document.title = `${b.title} | make.fun`;
    app.innerHTML = bounty(b);
    startTicker();
  } catch (err) {
    failed(err, `bounty:${slug}`);
    return;
  }
  window.__shotReady = true;
}

async function showLeaderboard(slug) {
  loading('Leaderboard');
  try {
    const [b, lb] = await Promise.all([getBounty(slug), getLeaderboard(slug)]);
    document.title = `Leaderboard — ${b.title} | make.fun`;
    lbShown = 25;
    app.innerHTML = leaderboard(b, lb, lbShown);
    app.dataset.lbSlug = slug;
  } catch (err) {
    failed(err, `leaderboard:${slug}`);
    return;
  }
  window.__shotReady = true;
}

async function showProfile(handle) {
  loading('Profile');
  try {
    const p = await getProfile(handle);
    document.title = `@${p.handle} | make.fun`;
    app.innerHTML = profile(p);
  } catch (err) {
    failed(err, `profile:${handle}`);
    return;
  }
  window.__shotReady = true;
}

/** Drop any image that fails to load (a missing avatar), so no broken glyph shows. */
function pruneBrokenImages() {
  for (const img of app.querySelectorAll('img')) {
    if (img.complete && img.naturalWidth === 0) img.remove();
    else img.addEventListener('error', () => img.remove(), { once: true });
  }
}

function parseRoute() {
  const hash = location.hash || '#/';
  const parts = hash.replace(/^#\//, '').split('/').map(decodeURIComponent);
  if (parts[0] === 'bounty' && parts[1] && parts[2] === 'leaderboard') return { name: 'leaderboard', slug: parts[1] };
  if (parts[0] === 'bounty' && parts[1]) return { name: 'bounty', slug: parts[1] };
  if (parts[0] === 'profile' && parts[1]) return { name: 'profile', handle: parts[1] };
  return { name: 'board' };
}

async function render() {
  window.__shotReady = false;
  stopTicker();
  const route = parseRoute();
  if (route.name === 'bounty') await showBounty(route.slug);
  else if (route.name === 'leaderboard') await showLeaderboard(route.slug);
  else if (route.name === 'profile') await showProfile(route.handle);
  else await showBoard();
  pruneBrokenImages();
  window.scrollTo(0, 0);
}

/** One delegated click handler for the app's buttons (no inline handlers). */
app.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const action = button.dataset.action;
  if (action === 'retry') {
    clearCache();
    await render();
  } else if (action === 'refresh') {
    clearCache();
    boardState.ended = null;
    await render();
  } else if (action === 'ended') {
    boardState.showEnded = !boardState.showEnded;
    if (boardState.showEnded && !boardState.ended) {
      button.disabled = true;
      button.textContent = 'Loading ended…';
      try {
        const [closed, resolved] = await Promise.all([
          getBountiesByStatus('closed'),
          getBountiesByStatus('resolved'),
        ]);
        boardState.ended = [...closed.items, ...resolved.items].sort(
          (a, b) => new Date(b.deadline) - new Date(a.deadline),
        );
      } catch {
        boardState.showEnded = false;
      }
    }
    await render();
  } else if (action === 'more-lb') {
    lbShown += 25;
    const slug = app.dataset.lbSlug;
    try {
      const [b, lb] = await Promise.all([getBounty(slug), getLeaderboard(slug)]);
      app.innerHTML = leaderboard(b, lb, lbShown);
    } catch {
      // The cached data is gone; a full re-render shows the error state instead.
      await render();
    }
  }
});

window.addEventListener('hashchange', render);
render();
