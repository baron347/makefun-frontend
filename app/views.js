// The four views, as HTML strings: the board, one bounty, the standings
// and a public profile. Everything here is pure string building — the
// router in main.js owns fetching, state and events; these functions only
// turn data the API already gave us into markup.
//
// Shared pieces live up top (money, status flags, progress, stat cards,
// section headings, avatars); the page builders below compose them.

import {
  esc,
  int,
  bytes,
  money,
  moneyShort,
  dateFull,
  dateDay,
  dateStamp,
  leftShort,
  leftTick,
  ago,
  ordinalOf,
  isLive,
  winRate,
  plural,
  renderMd,
} from "./format.js";

// --- Small value helpers ---------------------------------------------------

// What a bounty is worth right now: the live pot when the API gives one,
// otherwise the headline reward.
function potOf(comp) {
  return money(comp.potUsd ?? comp.rewardAmount);
}

// What it costs to enter, as a short label.
function feeText(comp) {
  const fee = Number(comp.entryFeeUsd);
  return fee > 0 ? money(comp.entryFeeUsd) : "Free";
}

// A small status flag for a bounty row or page.
function flagFor(comp) {
  if (!isLive(comp)) return '<span class="flag done">Finished</span>';
  const leftMs = new Date(comp.deadline).getTime() - Date.now();
  if (leftMs < 24 * 60 * 60 * 1000) {
    return '<span class="flag soon">Ending soon</span>';
  }
  return '<span class="flag open">Open</span>';
}

// How far through its window a bounty is: 0 at opening, 1 at deadline.
function progressOf(comp) {
  const start = new Date(comp.publishedAt).getTime();
  const end = new Date(comp.deadline).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(1, Math.max(0, (Date.now() - start) / (end - start)));
}

// What a rank pays out of the live pot right now.
function prizeFor(comp, rank) {
  const rows = comp.rewardsNow ?? [];
  const row = rows.find((r) => Number(r.place) === Number(rank));
  return row ? money(row.amountUsd) : "—";
}

// An entrant's avatar URL, made absolute when the API gives a path.
function absImg(image) {
  if (!image) return "";
  return image.startsWith("/") ? `https://make.fun${image}` : image;
}

// The medal for a top-three finish, nothing otherwise.
function medalFor(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

// --- Shared builders -------------------------------------------------------

// One stat card: a small label, a big value, a quiet caption underneath.
function statCard(label, value, caption, valueClass = "") {
  const cls = valueClass ? ` class="${valueClass}"` : "";
  return `<div><span>${label}</span><strong${cls}>${value}</strong><small>${caption}</small></div>`;
}

// A section heading with an optional quiet aside on the same line.
function sectionHead(title, aside = "") {
  const side = aside ? ` <span class="sub-note">${aside}</span>` : "";
  return `<h3>${title}${side}</h3>`;
}

// An entrant's avatar image, or nothing when there is no image.
function avatarImg(image, size) {
  const url = absImg(image);
  if (!url) return "";
  return `<img crossorigin="anonymous" src="${esc(url)}" alt="" width="${size}" height="${size}" loading="lazy">`;
}

// A filter pill button: on when its value matches the current one.
function pillBtn(action, key, value, current, label) {
  const on = value === current ? ' class="on"' : "";
  return `<button type="button" data-action="${action}" data-${key}="${esc(value)}"${on}>${label}</button>`;
}

// --- Board pieces ----------------------------------------------------------

// One row of the bounty list.
function bountyRow(comp, selected) {
  const closingSoon =
    isLive(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const soon = closingSoon ? '<span class="flag soon">Ending soon</span>' : "";
  const frac = Math.round(100 * progressOf(comp));
  return `
    <li class="bounty-row${selected ? " on" : ""}" data-action="select" data-slug="${esc(comp.slug)}" tabindex="0">
      <span class="cell-pot">${potOf(comp)}<small>pot</small></span>
      <span class="cell-main">
        <span class="cell-title"><a href="#/bounty/${encodeURIComponent(comp.slug)}">${esc(comp.title)}</a></span>
        <span class="cell-sub">${soon}<span class="tag">${esc(comp.category ?? "")}</span>${esc(comp.summary ?? comp.description ?? "")}</span>
      </span>
      <span class="cell-fee">${feeText(comp)}</span>
      <span class="cell-time"><span data-deadline="${esc(comp.deadline)}">${leftShort(comp.deadline)}</span><i class="meter${closingSoon ? " hot" : ""}"><b style="width:${frac}%"></b></i></span>
      <span class="cell-count"><strong>${int(comp.submissionCount)}</strong><small>${plural(comp.submissionCount, "entry", "entries")}</small></span>
    </li>`;
}

// Order a list of bounties: by pot, by entries, or by deadline.
function orderRows(list, key) {
  const copy = list.slice();
  const byPot = (a, b) =>
    Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount);
  const byEntries = (a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0);
  const byClosing = (a, b) => new Date(a.deadline) - new Date(b.deadline);
  if (key === "pot") return copy.sort(byPot);
  if (key === "entries") return copy.sort(byEntries);
  return copy.sort(byClosing);
}

// The four-number strip above the board.
function kpis(live) {
  const pots = live.reduce(
    (sum, c) => sum + Number(c.potUsd ?? c.rewardAmount ?? 0),
    0,
  );
  const entries = live.reduce((sum, c) => sum + (c.submissionCount ?? 0), 0);
  const next = live
    .slice()
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
  const withinHour =
    next && new Date(next.deadline).getTime() - Date.now() < 60 * 60 * 1000;
  const nextAttr = next ? ` data-countdown="${esc(next.deadline)}"` : "";
  const nextClass = withinHour ? ' class="red"' : "";
  return `
    <div class="kpis" role="status">
      ${statCard("Bounties open", int(live.length), "right now")}
      ${statCard("Pots right now", money(pots), "live prize money", "green")}
      ${statCard("Entries so far", int(entries), "across open bounties")}
      <div><span>Closing next</span><strong${nextClass}${nextAttr}>${next ? leftTick(next.deadline) : "—"}</strong><small>${next ? esc(next.title) : ""}</small></div>
    </div>`;
}

// The live ticker: the newest entries on the selected bounty, or the newest
// entry anywhere on the board when the selection has none.
function feed(live, detail) {
  const parts = ['<span class="live-dot">●</span> Live now'];
  const recent = (detail?.submissions ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  for (const sub of recent) {
    parts.push(
      `<a href="#/profile/${encodeURIComponent(sub.hunter)}">@${esc(sub.hunter)}</a> joined ${esc(detail.title)} <span data-createdat="${esc(sub.createdAt)}">${ago(sub.createdAt)}</span>`,
    );
  }
  if (recent.length === 0) {
    let newest = null;
    for (const comp of live) {
      for (const sub of comp.submissions ?? []) {
        const at = new Date(sub.createdAt).getTime();
        if (!newest || at > newest.at) newest = { at, title: comp.title };
      }
    }
    if (newest) {
      parts.push(
        `latest entry ${ago(new Date(newest.at).toISOString())} on ${esc(newest.title)}`,
      );
    }
  }
  return `<p class="feed">${parts.join(" · ")}</p>`;
}

// --- Bounty detail pieces --------------------------------------------------

// Rewards as a table, grouping runs of places that pay the same amount.
function payoutTable(comp) {
  const rows = (comp.rewardsNow ?? [])
    .slice()
    .sort((a, b) => Number(a.place) - Number(b.place));
  if (rows.length === 0) {
    const base = Object.entries(comp.rewards ?? {}).sort(
      (a, b) => Number(a[0]) - Number(b[0]),
    );
    if (base.length > 0) {
      const body = base
        .map(
          ([place, amount]) =>
            `<tr><td>${esc(place)}</td><td>${money(amount)}</td></tr>`,
        )
        .join("");
      return `<table class="payouts"><thead><tr><th>Place</th><th>Pays</th></tr></thead><tbody>${body}</tbody></table>`;
    }
    return `<p>Reward: <strong>${potOf(comp)}</strong></p>`;
  }
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    const same =
      last &&
      last.baseUsd === row.baseUsd &&
      last.feeShareUsd === row.feeShareUsd &&
      Number(row.place) === last.end + 1;
    if (same) {
      last.end = Number(row.place);
      last.amountUsd = row.amountUsd;
    } else {
      groups.push({
        start: Number(row.place),
        end: Number(row.place),
        baseUsd: row.baseUsd,
        feeShareUsd: row.feeShareUsd,
        amountUsd: row.amountUsd,
      });
    }
  }
  const top = Math.max(...rows.map((r) => Number(r.amountUsd) || 0), 1);
  const body = groups
    .map((g) => {
      const place =
        g.start === g.end ? ordinalOf(g.start) : `${g.start}–${g.end}`;
      const width = Math.max(4, Math.round((Number(g.amountUsd) / top) * 100));
      const each = g.start !== g.end ? " each" : "";
      return `<tr><td>${place}</td><td>${money(g.baseUsd)}</td><td>+${money(g.feeShareUsd)}</td><td><span class="share-bar"><i style="width:${width}%"></i></span><strong class="green">${money(g.amountUsd)}</strong>${each}</td></tr>`;
    })
    .join("");
  return `
    <table class="payouts">
      <thead><tr><th>Place</th><th>Base</th><th>Fee cut</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

// The opened → now → deadline → results timeline.
function timeline(comp) {
  const phases = comp.phases ?? [];
  const dev = phases.find((p) => p.key === "dev");
  const fin = phases.find((p) => p.key === "final");
  const deadline = dev?.endsAt ?? comp.deadline;
  const results = fin?.endsAt ?? null;
  const done = Math.round(100 * progressOf({ ...comp, deadline }));
  return `
    <div class="timeline">
      <div class="timeline-track"><i style="width:${done}%"></i><b style="left:${done}%"></b></div>
      <div class="timeline-stops">
        <div><b>Opened</b><span>${dateStamp(comp.publishedAt)}</span></div>
        <div class="cur"><b>Now</b><span>${dateStamp(new Date().toISOString())}</span></div>
        <div><b>Deadline</b><span>${dateStamp(deadline)}</span></div>
        <div><b>Results by</b><span>${results ? dateStamp(results) : "—"}</span></div>
      </div>
    </div>`;
}

// The top-5 preview under a bounty.
function topFive(comp, top5) {
  if (!top5) return '<p class="note">Top 5 still loading…</p>';
  if (top5.length === 0) return '<p class="note">Nothing ranked here yet.</p>';
  const body = top5
    .map((entry) => {
      const rate = entry.value != null ? entry.value : entry.values?.judge;
      return `<tr><td>${int(entry.rank ?? entry.performance)}</td><td class="who-cell">${avatarImg(entry.image, 20)}<a href="#/profile/${encodeURIComponent(entry.handle)}">${esc(entry.handle)}</a></td><td><strong>${winRate(rate)}</strong></td><td><strong class="green">${prizeFor(comp, entry.prize_rank ?? entry.rank)}</strong></td></tr>`;
    })
    .join("");
  return `
    <table class="top5">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="note"><a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Whole leaderboard · ${int(comp.submissionCount)} entries →</a></p>`;
}

// The shared detail block: stat cards, entry buttons, rewards, phases, top 5.
export function detailBlock(comp, top5, lastHour) {
  const closingSoon =
    isLive(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const paid = comp.entryFeeUsd && Number(comp.entryFeeUsd) > 0;
  const feeNote = paid
    ? `${int(comp.entryFeePayers)} paid · one per account`
    : "nothing to pay";
  const hourNote =
    lastHour != null
      ? `${int(lastHour)} in the past hour`
      : "the judge's win rate decides";
  const places = (comp.rewardsNow ?? []).length;
  return `
    <div class="metrics">
      ${statCard("Pot now", potOf(comp), `${money(comp.rewardAmount)} prize + ${money(comp.entryFeesUsd ?? 0)} from fees`, "green")}
      ${statCard("To enter", paid ? money(comp.entryFeeUsd) : "Free", feeNote)}
      <div><span>Closes in</span><strong class="${closingSoon ? "red" : ""}" data-countdown="${esc(comp.deadline)}">${leftTick(comp.deadline)}</strong><small>ends ${dateStamp(comp.deadline)}</small></div>
      ${statCard("Entries", int(comp.submissionCount), hourNote)}
    </div>
    <p class="actions"><a class="btn primary" href="https://make.fun/bounty/${encodeURIComponent(comp.slug)}">Enter this bounty ↗</a>
    <a class="btn quiet" href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Full leaderboard · ${int(comp.submissionCount)} entries →</a></p>
    ${sectionHead("Rewards", `${int(places)} places split the pot of ${potOf(comp)}`)}
    ${payoutTable(comp)}
    ${sectionHead("Dates &amp; phases")}
    ${timeline(comp)}
    ${sectionHead("Top 5", "by judge win rate")}
    ${topFive(comp, top5)}`;
}

// --- Pages -----------------------------------------------------------------

// The board: ticker, stats, controls, the list, and the selected bounty.
export function boardPage(data, state) {
  const items = data.items ?? [];
  const live = items.filter(isLive);
  const finished = items.filter((c) => !isLive(c));
  const ended = state.ended ? [...finished, ...state.ended] : finished;
  const shown = state.tab === "ended" ? ended : live;
  const ordered = orderRows(shown, state.sort);
  const query = (state.q ?? "").trim().toLowerCase();
  const byCat =
    state.cat && state.cat !== "All"
      ? ordered.filter((c) => (c.category ?? "") === state.cat)
      : ordered;
  const matches = query
    ? byCat.filter((c) =>
        `${c.title} ${c.category ?? ""} ${(c.skills ?? []).join(" ")}`
          .toLowerCase()
          .includes(query),
      )
    : byCat;
  const cats = [
    "All",
    ...new Set(shown.map((c) => c.category ?? "").filter(Boolean)),
  ].sort();
  const selected =
    matches.find((c) => c.slug === state.selected) ??
    ordered.find((c) => c.slug === state.selected) ??
    ordered[0] ??
    null;
  if (selected) state.selected = selected.slug;
  const top5 = selected ? state.top5[selected.slug] ?? null : null;
  const full = selected ? state.full[selected.slug] ?? null : null;
  const hourAgo = Date.now() - 36e5;
  const detail = full ?? selected;
  const lastHour = detail
    ? (detail.submissions ?? []).filter(
        (s) => new Date(s.createdAt).getTime() > hourAgo,
      ).length
    : null;
  const rowsHtml =
    matches.length === 0
      ? '<p class="empty">Nothing matches that search.</p>'
      : `<ul class="bounties">${matches.map((c) => bountyRow(c, c.slug === state.selected)).join("")}</ul>`;
  const detailHtml = selected
    ? `
        <p class="peek-crumbs">Board / ${esc(selected.category ?? "")} · ${flagFor(selected)}</p>
        <h2 class="peek-title">${esc(selected.title)}</h2>
        <p class="peek-sum">${esc(selected.summary ?? "")}</p>
        ${detailBlock(selected, top5, lastHour)}
        <div class="prose clamp">${renderMd(selected.description ?? "")}</div>
        <p><a href="#/bounty/${encodeURIComponent(selected.slug)}">Open the full bounty page →</a></p>`
    : '<p class="empty">Pick a bounty to see it here.</p>';
  const sortPills = [
    ["closing", "Soonest first"],
    ["pot", "Largest pot"],
    ["entries", "Most entered"],
  ]
    .map(([value, label]) => pillBtn("sort", "sort", value, state.sort, label))
    .join("");
  const catPills = cats
    .map((c) => pillBtn("cat", "cat", c, state.cat, esc(c)))
    .join("");
  return `
    <div class="intro">
      <h1>Open bounties</h1>
      <p>Every live bounty on make.fun — pots, fees and deadlines, fresh from the public API.</p>
    </div>
    ${feed(live, full)}
    ${kpis(live)}
    <div class="toolbar">
      <div class="seg" role="tablist">
        <button type="button" role="tab" data-action="tab" data-tab="live" ${state.tab === "live" ? 'class="on" aria-selected="true"' : ""}>Open ${int(live.length)}</button>
        <button type="button" role="tab" data-action="tab" data-tab="ended" ${state.tab === "ended" ? 'class="on" aria-selected="true"' : ""}>Closed ${int(ended.length)}</button>
      </div>
      <label class="finder">Find <input id="q" type="search" placeholder="title, category, skill…" value="${esc(state.q ?? "")}" autocomplete="off"></label>
      <button type="button" data-action="refresh">Reload</button>
    </div>
    <div class="pillrows">
      <div class="pillrow"><span>Order</span>${sortPills}</div>
      <div class="pillrow"><span>Kind</span>${catPills}</div>
    </div>
    <div class="duo">
      <div class="rail">
        ${rowsHtml}
      </div>
      <aside class="peek" aria-label="Selected bounty">
        ${detailHtml}
      </aside>
    </div>
    <p class="note">Pots grow when entry fees come in. A bounty past its deadline counts as finished even if it still shows as open, until results are out.</p>`;
}

// One bounty page: summary, stats, rewards, phases, top 5, description,
// rules, and the most recent entries.
export function bountyPage(comp, top5) {
  const hourAgo = Date.now() - 36e5;
  const lastHour = (comp.submissions ?? []).filter(
    (s) => new Date(s.createdAt).getTime() > hourAgo,
  ).length;
  const recent = (comp.submissions ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);
  const rulesHtml = comp.rules
    ? `<details class="rules"><summary>Read the full rules</summary><div class="prose">${renderMd(comp.rules)}</div></details>`
    : "";
  const recentHtml = recent.length
    ? `<h2>Latest entries</h2><ul class="latest">${recent.map((s) => `<li><a href="#/profile/${encodeURIComponent(s.hunter)}">@${esc(s.hunter)}</a> — ${esc(s.title ?? "")} · <span data-createdat="${esc(s.createdAt)}">${ago(s.createdAt)}</span>${s.status ? ` · ${esc(s.status)}` : ""}</li>`).join("")}</ul>`
    : "";
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Standings →</a></p>
    <h1>${esc(comp.title)}</h1>
    <p class="lede">${esc(comp.summary ?? "")}</p>
    <p class="tags">${flagFor(comp)}<span class="tag">${esc(comp.category ?? "")}</span>${(comp.skills ?? []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</p>
    ${detailBlock(comp, top5, lastHour)}
    <h2>About this bounty</h2>
    <div class="prose">${renderMd(comp.description ?? "")}</div>
    ${rulesHtml}
    ${recentHtml}`;
}

// One row of a leaderboard table.
function leaderRow(entry, comp) {
  const vals = entry.values ?? entry;
  const rate = entry.value != null ? winRate(entry.value) : winRate(vals.judge);
  const low =
    entry.interval?.low != null ? winRate(entry.interval.low) : winRate(vals.judge_low);
  const high =
    entry.interval?.high != null
      ? winRate(entry.interval.high)
      : winRate(vals.judge_high);
  const size = entry.values?.bytes ?? vals.bytes;
  const status =
    entry.status ?? (entry.judged === false ? "not judged" : "judged");
  const medal = medalFor(entry.rank);
  return `
    <tr>
      <td>${int(entry.rank ?? entry.performance)}${medal ? ` ${medal}` : ""}</td>
      <td class="who-cell">${avatarImg(entry.image, 28)}<a href="#/profile/${encodeURIComponent(entry.handle)}">${esc(entry.handle)}</a><span class="entry-name">${esc(entry.title ?? "")}</span></td>
      <td><strong>${rate}</strong></td>
      <td>${low} – ${high}</td>
      <td><strong class="green">${prizeFor(comp, entry.prize_rank ?? entry.rank)}</strong></td>
      <td style="white-space:nowrap">${bytes(size)}</td>
      <td>${esc(status)}</td>
    </tr>`;
}

// A leaderboard page: ranked entries, paged 25 at a time.
export function standingsPage(comp, lb, shown) {
  const first = lb.entries ?? [];
  const rest = lb.rest ?? [];
  const all = first.concat(rest);
  const page = all.slice(0, shown);
  const more =
    shown < all.length
      ? `<p><button type="button" data-action="more-lb">Show more (${int(Math.min(25, all.length - shown))} more of ${int(all.length - shown)})</button></p>`
      : `<p class="note">That is all ${int(all.length)} entries.</p>`;
  const table =
    all.length === 0
      ? '<p class="empty">No entries placed yet.</p>'
      : `<table class="standings">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>90% range</th><th>Pays now</th><th>Size</th><th>Status</th></tr></thead>
      <tbody>${page.map((e) => leaderRow(e, comp)).join("")}</tbody>
    </table>
    ${more}`;
  const stage = lb.phase?.title ?? lb.phase?.key ?? "";
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}">${esc(comp.title)}</a></p>
    <h1>Standings — ${esc(comp.title)}</h1>
    <p class="lede">${int(all.length)} entries placed · stage: ${esc(stage)} · judge win rate with a 90% range · prize now is what each place pays out of the live pot</p>
    ${table}
    <p class="note">Win rate is how often the judge picked an entry over the field. Tap a handle to open that entrant's profile.</p>`;
}

// A public profile: who they are, their record, and their entries.
export function profilePage(p) {
  const record = p.record ?? {};
  const entries = p.solutions ?? [];
  const photo = p.image
    ? `<img class="portrait" crossorigin="anonymous" src="${esc(p.image)}" alt="" width="96" height="96">`
    : "";
  const github = p.github_login
    ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}">GitHub ↗</a>`
    : "";
  const xLink = p.x
    ? `<a href="https://x.com/${encodeURIComponent(p.x)}">X ↗</a>`
    : "";
  const discord = p.discord ? `<span>Discord: ${esc(p.discord)}</span>` : "";
  const best =
    record.best_placement != null ? `#${int(record.best_placement)}` : "—";
  const entriesHtml =
    entries.length === 0
      ? '<p class="empty">No entries so far.</p>'
      : `<table class="standings"><thead><tr><th>Bounty</th><th>Entry</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead>
      <tbody>${entries.map((e) => `<tr>
        <td><a href="#/bounty/${encodeURIComponent(e.competition?.slug ?? "")}">${esc(e.competition?.title ?? e.competition?.slug ?? "")}</a></td>
        <td>${esc(e.title)}</td>
        <td>${e.placement != null ? `#${int(e.placement)}` : "—"}</td>
        <td>${e.score?.value != null ? winRate(e.score.value) : "—"}</td>
        <td>${e.prize_usd != null ? money(e.prize_usd) : "—"}</td>
        <td>${dateDay(e.entered_at)}</td>
      </tr>`).join("")}</tbody></table>`;
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a></p>
    <div class="person">
      ${photo}
      <div>
        <h1>${esc(p.display_name ?? p.handle)}</h1>
        <p class="at-handle">@${esc(p.handle)}</p>
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ""}
        <p class="out-links">
          ${github}
          ${xLink}
          ${discord}
          <span>Joined ${dateDay(p.joined_at)}</span>
        </p>
      </div>
    </div>
    <dl class="record">
      <dt>Bounties entered</dt><dd>${int(record.competitions_entered)}</dd>
      <dt>Placed</dt><dd>${int(record.competitions_placed)}</dd>
      <dt>Won</dt><dd>${int(record.competitions_won)}</dd>
      <dt>Podiums</dt><dd>${int(record.podium_finishes)}</dd>
      <dt>Best finish</dt><dd>${best}</dd>
      <dt>Winnings</dt><dd>${money(record.prize_usd ?? 0)}</dd>
    </dl>
    <h2>Entries (${int(entries.length)})</h2>
    ${entriesHtml}`;
}
