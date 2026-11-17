// The four pages, each a function from API data to HTML. Every value from the API is
// escaped (see format.js); links are hash routes inside this app or https://make.fun.

import { bytes, date, esc, isTakingEntries, md, money, num, pct, shortDate, timeLeft } from './format.js';

/** The reward as it stands now: the prize plus any entry fees paid into it. */
const pot = (b) => money(b.potUsd ?? b.rewardAmount);

/** The entry fee, when the bounty charges one. */
const fee = (b) =>
  b.entryFeeUsd && Number(b.entryFeeUsd) > 0 ? `${money(b.entryFeeUsd)} fee` : 'Free entry';

/** Open / closing-soon / ended badge. A bounty past its deadline may still read status
 *  open until results are published, so the deadline decides, not the status. */
function statusBadge(b) {
  if (!isTakingEntries(b)) return '<span class="badge ended">Ended</span>';
  const ms = new Date(b.deadline).getTime() - Date.now();
  if (ms < 86400000) return '<span class="badge soon">Closing soon</span>';
  return '<span class="badge open">Open</span>';
}

function bountyCard(b) {
  return `
    <li class="card">
      <h2><a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></h2>
      <p class="summary">${esc(b.summary ?? b.description ?? '')}</p>
      <p class="meta">
        <span class="pot" title="Live pot: base reward plus entry fees paid in">${pot(b)} <small>pot</small></span>
        <span>${fee(b)}</span>
        <span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span>
        <span>${num(b.submissionCount)} ${b.submissionCount === 1 ? 'entry' : 'entries'}</span>
      </p>
      <p class="tags">${statusBadge(b)}<span class="tag">${esc(b.category ?? '')}</span>${(b.skills ?? [])
        .slice(0, 3)
        .map((s) => `<span class="tag">${esc(s)}</span>`)
        .join('')}</p>
    </li>`;
}

/** The bounty board: live bounties, each with its pot, fee, time left and entries. */
export function board(data, state) {
  const items = (data.items ?? []).slice().sort((a, b) => {
    // Bounties still taking entries first, closing soonest on top; ended ones last.
    const ae = isTakingEntries(a) ? 0 : 1;
    const be = isTakingEntries(b) ? 0 : 1;
    if (ae !== be) return ae - be;
    return ae === 0 ? new Date(a.deadline) - new Date(b.deadline) : new Date(b.deadline) - new Date(a.deadline);
  });
  const q = (state.q ?? '').trim().toLowerCase();
  const shown = q
    ? items.filter((b) => `${b.title} ${b.category ?? ''} ${(b.skills ?? []).join(' ')}`.toLowerCase().includes(q))
    : items;
  return `
    <h1>Open bounties</h1>
    <p class="lede">${num(items.length)} live ${items.length === 1 ? 'bounty' : 'bounties'} — every pot, fee and deadline below is live from the make.fun API.</p>
    <div class="toolbar">
      <label class="search">Search <input id="q" type="search" placeholder="title, category or skill…" value="${esc(state.q ?? '')}" autocomplete="off"></label>
      <button type="button" data-action="ended" ${state.showEnded ? 'aria-pressed="true"' : ''}>${state.showEnded ? 'Hide ended' : 'Show ended'}</button>
      <button type="button" data-action="refresh">Refresh</button>
    </div>
    ${state.showEnded && state.ended ? `<h2>Ended bounties</h2><ul class="board">${state.ended.map(bountyCard).join('')}</ul>` : ''}
    ${shown.length === 0 ? '<p class="empty">No bounties match that search.</p>' : `<ul class="board">${shown.map(bountyCard).join('')}</ul>`}
    <p class="note">Pots grow as entry fees are paid in. A bounty past its deadline is ended even while its status still reads open, until its results are published.</p>`;
}

/** Rewards table: what each place pays now (base reward + its share of fees paid in). */
function rewardsTable(b) {
  const rows = b.rewardsNow ?? [];
  if (!rows.length) {
    const base = Object.entries(b.rewards ?? {}).sort((a, c) => Number(a[0]) - Number(c[0]));
    if (!base.length) return `<p>Reward: <strong>${pot(b)}</strong></p>`;
    return `<table class="rewards"><thead><tr><th>Place</th><th>Reward</th></tr></thead><tbody>${base
      .map(([place, amount]) => `<tr><td>${esc(place)}</td><td>${money(amount)}</td></tr>`)
      .join('')}</tbody></table>`;
  }
  const shown = rows.slice(0, 5);
  return `
    <table class="rewards">
      <thead><tr><th>Place</th><th>Base</th><th>Fee share</th><th>Pays now</th></tr></thead>
      <tbody>${shown
        .map(
          (r) =>
            `<tr><td>${num(r.place)}</td><td>${money(r.baseUsd)}</td><td>${money(r.feeShareUsd)}</td><td><strong>${money(r.amountUsd)}</strong></td></tr>`,
        )
        .join('')}</tbody>
    </table>
    ${
      rows.length > 5
        ? `<details class="more"><summary>All ${rows.length} paid places</summary><table class="rewards"><tbody>${rows
            .slice(5)
            .map(
              (r) =>
                `<tr><td>${num(r.place)}</td><td>${money(r.baseUsd)}</td><td>${money(r.feeShareUsd)}</td><td><strong>${money(r.amountUsd)}</strong></td></tr>`,
            )
            .join('')}</tbody></table></details>`
        : ''
    }`;
}

/** One bounty: summary, description and rules, rewards with the live pot, dates, status. */
export function bounty(b) {
  return `
    <p class="crumbs"><a href="#/">← All bounties</a> · <a href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">Leaderboard →</a></p>
    <h1>${esc(b.title)}</h1>
    <p class="lede">${esc(b.summary ?? '')}</p>
    <p class="tags">${statusBadge(b)}<span class="tag">${esc(b.category ?? '')}</span>${(b.skills ?? [])
      .map((s) => `<span class="tag">${esc(s)}</span>`)
      .join('')}</p>
    <dl class="facts">
      <dt>Live pot</dt><dd><strong class="pot">${pot(b)}</strong> <small>($${money(b.rewardAmount)} reward + ${money(b.entryFeesUsd ?? 0)} in entry fees from ${num(b.entryFeePayers)} payers)</small></dd>
      <dt>Entry fee</dt><dd>${b.entryFeeUsd && Number(b.entryFeeUsd) > 0 ? money(b.entryFeeUsd) : 'Free entry'}</dd>
      <dt>Deadline</dt><dd><span data-deadline="${esc(b.deadline)}">${timeLeft(b.deadline)}</span> — ${date(b.deadline)}</dd>
      <dt>Published</dt><dd>${date(b.publishedAt)}</dd>
      <dt>Entries</dt><dd>${num(b.submissionCount)}</dd>
      <dt>Status</dt><dd>${esc(b.status ?? '')}${isTakingEntries(b) ? ' — still taking entries' : ' — no longer taking entries'}</dd>
      ${b.sponsor?.name ? `<dt>Sponsor</dt><dd>${esc(b.sponsor.name)}${b.sponsor.isVerified ? ' ✓' : ''}</dd>` : ''}
    </dl>
    <h2>Rewards</h2>
    ${rewardsTable(b)}
    <h2>Description</h2>
    <div class="prose">${md(b.description ?? '')}</div>
    ${
      b.rules
        ? `<details class="rules"><summary>Full rules</summary><div class="prose">${md(b.rules)}</div></details>`
        : ''
    }
    <p><a class="btn" href="#/bounty/${encodeURIComponent(b.slug)}/leaderboard">See the leaderboard →</a>
    <a class="btn ghost" href="https://make.fun/bounty/${encodeURIComponent(b.slug)}">Open on make.fun ↗</a></p>`;
}

function lbRow(e, slug) {
  const v = e.values ?? e;
  const rate = e.value != null ? pct(e.value) : pct(v.judge);
  const low = e.interval?.low != null ? pct(e.interval.low) : pct(v.judge_low);
  const high = e.interval?.high != null ? pct(e.interval.high) : pct(v.judge_high);
  const size = e.values?.bytes ?? v.bytes;
  // Avatars come back as a root-relative make.fun path ('/api/avatars/…'); resolve them
  // against make.fun, or the browser would ask this app's own server and 404.
  const img = e.image ? (e.image.startsWith('/') ? `https://make.fun${e.image}` : e.image) : '';
  return `
    <tr>
      <td>${num(e.rank ?? e.performance)}</td>
      <td class="entrant">${img ? `<img crossorigin="anonymous" src="${esc(img)}" alt="" width="28" height="28" loading="lazy">` : ''}<a href="#/profile/${encodeURIComponent(e.handle)}">${esc(e.handle)}</a><span class="entry-title">${esc(e.title ?? '')}</span></td>
      <td><strong>${rate}</strong></td>
      <td>${low} – ${high}</td>
      <td>${bytes(size)}</td>
      <td>${esc(e.status ?? (e.judged === false ? 'not judged' : 'judged'))}</td>
    </tr>`;
}

/** A bounty's leaderboard: ranked entries, paged 25 at a time from the one fetch. */
export function leaderboard(b, lb, shown) {
  const entries = lb.entries ?? [];
  const rest = lb.rest ?? [];
  const all = entries.concat(rest);
  const page = all.slice(0, shown);
  return `
    <p class="crumbs"><a href="#/">← All bounties</a> · <a href="#/bounty/${encodeURIComponent(b.slug)}">${esc(b.title)}</a></p>
    <h1>Leaderboard — ${esc(b.title)}</h1>
    <p class="lede">${num(all.length)} entries ranked · phase: ${esc(lb.phase?.title ?? lb.phase?.key ?? '')} · judge win rate, 90% interval</p>
    ${
      all.length === 0
        ? '<p class="empty">No entries on the leaderboard yet.</p>'
        : `<table class="lb">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>90% interval</th><th>Size</th><th>Status</th></tr></thead>
      <tbody>${page.map((e) => lbRow(e, b.slug)).join('')}</tbody>
    </table>
    ${
      shown < all.length
        ? `<p><button type="button" data-action="more-lb">Show more (${num(Math.min(25, all.length - shown))} of ${num(all.length - shown)} remaining)</button></p>`
        : `<p class="note">Showing all ${num(all.length)} entries.</p>`
    }`
    }
    <p class="note">Win rate is the judge's share of wins against the field. Click a handle to open that entrant's public profile.</p>`;
}

/** A public profile: identity, record, and every entry they have made. */
export function profile(p) {
  const rec = p.record ?? {};
  const sols = p.solutions ?? [];
  return `
    <p class="crumbs"><a href="#/">← All bounties</a></p>
    <div class="who">
      ${p.image ? `<img class="avatar" crossorigin="anonymous" src="${esc(p.image)}" alt="" width="96" height="96">` : ''}
      <div>
        <h1>${esc(p.display_name ?? p.handle)}</h1>
        <p class="handle">@${esc(p.handle)}</p>
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ''}
        <p class="links">
          ${p.github_login ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}">GitHub ↗</a>` : ''}
          ${p.x ? `<a href="https://x.com/${encodeURIComponent(p.x)}">X ↗</a>` : ''}
          ${p.discord ? `<span>Discord: ${esc(p.discord)}</span>` : ''}
          <span>Joined ${shortDate(p.joined_at)}</span>
        </p>
      </div>
    </div>
    <dl class="facts">
      <dt>Competitions entered</dt><dd>${num(rec.competitions_entered)}</dd>
      <dt>Placed</dt><dd>${num(rec.competitions_placed)}</dd>
      <dt>Won</dt><dd>${num(rec.competitions_won)}</dd>
      <dt>Podium finishes</dt><dd>${num(rec.podium_finishes)}</dd>
      <dt>Best placement</dt><dd>${rec.best_placement != null ? `#${num(rec.best_placement)}` : '—'}</dd>
      <dt>Prize money</dt><dd>${money(rec.prize_usd ?? 0)}</dd>
    </dl>
    <h2>Entries (${num(sols.length)})</h2>
    ${
      sols.length === 0
        ? '<p class="empty">No entries yet.</p>'
        : `<table class="lb"><thead><tr><th>Competition</th><th>Entry</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead>
      <tbody>${sols
        .map(
          (s) => `<tr>
        <td><a href="#/bounty/${encodeURIComponent(s.competition?.slug ?? '')}">${esc(s.competition?.title ?? s.competition?.slug ?? '')}</a></td>
        <td>${esc(s.title)}</td>
        <td>${s.placement != null ? `#${num(s.placement)}` : '—'}</td>
        <td>${s.score?.value != null ? pct(s.score.value) : '—'}</td>
        <td>${s.prize_usd != null ? money(s.prize_usd) : '—'}</td>
        <td>${shortDate(s.entered_at)}</td>
      </tr>`,
        )
        .join('')}</tbody></table>`
    }`;
}
