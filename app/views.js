import {
  escapeHtml,
  fmtBytes,
  fmtInt,
  fullDate,
  dayDate,
  stamp,
  left,
  leftExact,
  since,
  ordinal,
  openNow,
  usd,
  winPct,
  miniMd,
} from "./format.js";

// What a bounty is worth right now: the live pot when the API gives one,
// otherwise the headline reward.
function currentPot(comp) {
  return usd(comp.potUsd ?? comp.rewardAmount);
}

// What it costs to enter, as a short label.
function feeLabel(comp) {
  const fee = Number(comp.entryFeeUsd);
  return fee > 0 ? usd(comp.entryFeeUsd) : "Free";
}

// A small status pill for a bounty row or page.
function stateBadge(comp) {
  if (!openNow(comp)) return '<span class="badge ended">Finished</span>';
  const remaining = new Date(comp.deadline).getTime() - Date.now();
  if (remaining < 24 * 60 * 60 * 1000) {
    return '<span class="badge soon">Ending soon</span>';
  }
  return '<span class="badge open">Open</span>';
}

// How far through its window a bounty is: 0 at opening, 1 at deadline.
function elapsedFrac(comp) {
  const start = new Date(comp.publishedAt).getTime();
  const end = new Date(comp.deadline).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  const frac = (Date.now() - start) / (end - start);
  return Math.min(1, Math.max(0, frac));
}

// What a rank pays out of the live pot right now.
function prizeAt(comp, rank) {
  const rows = comp.rewardsNow ?? [];
  const row = rows.find((r) => Number(r.place) === Number(rank));
  return row ? usd(row.amountUsd) : "—";
}

// An entrant's avatar URL, made absolute when the API gives a path.
function avatarUrl(image) {
  if (!image) return "";
  return image.startsWith("/") ? `https://make.fun${image}` : image;
}

// One row of the bounty list.
function listRow(comp, isSelected) {
  const closingSoon =
    openNow(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const soonBadge = closingSoon ? '<span class="badge soon">Ending soon</span>' : "";
  return `
    <li class="row${isSelected ? " on" : ""}" data-action="select" data-slug="${escapeHtml(comp.slug)}" tabindex="0">
      <span class="r-pot">${currentPot(comp)}<small>pot</small></span>
      <span class="r-main">
      <span class="r-title"><a href="#/bounty/${encodeURIComponent(comp.slug)}">${escapeHtml(comp.title)}</a></span>
        <span class="r-sub">${soonBadge}<span class="tag">${escapeHtml(comp.category ?? "")}</span>${escapeHtml(comp.summary ?? comp.description ?? "")}</span>
      </span>
      <span class="r-fee">${feeLabel(comp)}</span>
      <span class="r-time"><span data-deadline="${escapeHtml(comp.deadline)}">${left(comp.deadline)}</span><i class="bar${closingSoon ? " hot" : ""}"><b style="width:${Math.round(100 * elapsedFrac(comp))}%"></b></i></span>
      <span class="r-entries"><strong>${fmtInt(comp.submissionCount)}</strong><small>entries</small></span>
    </li>`;
}

// Order a list of bounties: by pot, by entries, or by deadline.
function sortList(list, key) {
  const copy = list.slice();
  if (key === "pot") {
    return copy.sort(
      (a, b) =>
        Number(b.potUsd ?? b.rewardAmount) - Number(a.potUsd ?? a.rewardAmount),
    );
  }
  if (key === "entries") {
    return copy.sort((a, b) => (b.submissionCount ?? 0) - (a.submissionCount ?? 0));
  }
  return copy.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
}

// The four-number strip above the board.
function statsStrip(live) {
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
  const nextAttr = next ? ` data-countdown="${escapeHtml(next.deadline)}"` : "";
  return `
    <div class="stats" role="status">
      <div><span>Bounties open</span><strong>${fmtInt(live.length)}</strong></div>
      <div><span>Pots right now</span><strong class="green">${usd(pots)}</strong></div>
      <div><span>Entries so far</span><strong>${fmtInt(entries)}</strong></div>
      <div><span>Closing next</span><strong class="${withinHour ? "red" : ""}"${nextAttr}>${next ? leftExact(next.deadline) : "—"}</strong><small>${next ? escapeHtml(next.title) : ""}</small></div>
    </div>`;
}

// The live ticker: the newest entries on the selected bounty, or the newest
// entry anywhere on the board.
function activityTicker(live, detail) {
  const parts = ['<span class="live-dot">●</span> Live now'];
  const recent = (detail?.submissions ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 4);
  for (const sub of recent) {
    parts.push(
      `<a href="#/profile/${encodeURIComponent(sub.hunter)}">@${escapeHtml(sub.hunter)}</a> joined ${escapeHtml(detail.title)} <span data-createdat="${escapeHtml(sub.createdAt)}">${since(sub.createdAt)}</span>`,
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
        `latest entry ${since(new Date(newest.at).toISOString())} on ${escapeHtml(newest.title)}`,
      );
    }
  }
  return `<p class="ticker">${parts.join(" · ")}</p>`;
}

// Rewards as a table, grouping runs of places that pay the same.
function rewardsTable(comp) {
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
            `<tr><td>${escapeHtml(place)}</td><td>${usd(amount)}</td></tr>`,
        )
        .join("");
      return `<table class="rewards"><thead><tr><th>Place</th><th>Pays</th></tr></thead><tbody>${body}</tbody></table>`;
    }
    return `<p>Reward: <strong>${currentPot(comp)}</strong></p>`;
  }
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    const continues =
      last &&
      last.baseUsd === row.baseUsd &&
      last.feeShareUsd === row.feeShareUsd &&
      Number(row.place) === last.end + 1;
    if (continues) {
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
        g.start === g.end ? ordinal(g.start) : `${g.start}–${g.end}`;
      const width = Math.max(4, Math.round((Number(g.amountUsd) / top) * 100));
      const each = g.start !== g.end ? " each" : "";
      return `<tr><td>${place}</td><td>${usd(g.baseUsd)}</td><td>+${usd(g.feeShareUsd)}</td><td><span class="pays"><i style="width:${width}%"></i></span><strong class="green">${usd(g.amountUsd)}</strong>${each}</td></tr>`;
    })
    .join("");
  return `
    <table class="rewards">
      <thead><tr><th>Place</th><th>Base</th><th>Fee cut</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

// The opened → now → deadline → results timeline.
function phaseStrip(comp) {
  const phases = comp.phases ?? [];
  const dev = phases.find((p) => p.key === "dev");
  const fin = phases.find((p) => p.key === "final");
  const deadline = dev?.endsAt ?? comp.deadline;
  const results = fin?.endsAt ?? null;
  const done = Math.round(100 * elapsedFrac({ ...comp, deadline }));
  return `
    <div class="phases">
      <div class="track"><i style="width:${done}%"></i><b style="left:${done}%"></b></div>
      <div class="stops">
        <div><b>Opened</b><span>${stamp(comp.publishedAt)}</span></div>
        <div class="cur"><b>Now</b><span>${stamp(new Date().toISOString())}</span></div>
        <div><b>Deadline</b><span>${stamp(deadline)}</span></div>
        <div><b>Results by</b><span>${results ? stamp(results) : "—"}</span></div>
      </div>
    </div>`;
}

// The top-5 preview under a bounty.
function topFiveTable(comp, top5) {
  if (!top5) return '<p class="note">Top 5 still loading…</p>';
  if (top5.length === 0) return '<p class="note">Nothing ranked here yet.</p>';
  const body = top5
    .map((entry) => {
      const img = avatarUrl(entry.image);
      const pic = img
        ? `<img crossorigin="anonymous" src="${escapeHtml(img)}" alt="" width="20" height="20" loading="lazy">`
        : "";
      return `<tr><td>${fmtInt(entry.rank ?? entry.performance)}</td><td class="entrant">${pic}<a href="#/profile/${encodeURIComponent(entry.handle)}">${escapeHtml(entry.handle)}</a></td><td><strong>${winPct(entry.value ?? entry.values?.judge)}</strong></td><td><strong class="green">${prizeAt(comp, entry.prize_rank ?? entry.rank)}</strong></td></tr>`;
    })
    .join("");
  return `
    <table class="top5">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="note"><a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Whole leaderboard · ${fmtInt(comp.submissionCount)} entries →</a></p>`;
}

// The shared detail block: stat cards, entry buttons, rewards, phases, top 5.
export function detailBlock(comp, top5, lastHour) {
  const closingSoon =
    openNow(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const paid = comp.entryFeeUsd && Number(comp.entryFeeUsd) > 0;
  const feeNote = paid
    ? `${fmtInt(comp.entryFeePayers)} paid · one per account`
    : "nothing to pay";
  const hourNote =
    lastHour != null
      ? `${fmtInt(lastHour)} in the past hour`
      : "the judge's win rate decides";
  return `
    <div class="cards">
      <div><span>Pot now</span><strong class="green">${currentPot(comp)}</strong><small>${usd(comp.rewardAmount)} prize + ${usd(comp.entryFeesUsd ?? 0)} from fees</small></div>
      <div><span>To enter</span><strong>${paid ? usd(comp.entryFeeUsd) : "Free"}</strong><small>${feeNote}</small></div>
      <div><span>Closes in</span><strong class="${closingSoon ? "red" : ""}" data-countdown="${escapeHtml(comp.deadline)}">${leftExact(comp.deadline)}</strong><small>ends ${stamp(comp.deadline)}</small></div>
      <div><span>Entries</span><strong>${fmtInt(comp.submissionCount)}</strong><small>${hourNote}</small></div>
    </div>
    <p class="cta"><a class="btn go" href="https://make.fun/bounty/${encodeURIComponent(comp.slug)}">Enter this bounty ↗</a>
    <a class="btn ghost" href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Full leaderboard · ${fmtInt(comp.submissionCount)} entries →</a></p>
    <h3>Rewards <span class="h-sub">${fmtInt((comp.rewardsNow ?? []).length)} places split the pot of ${currentPot(comp)}</span></h3>
    ${rewardsTable(comp)}
    <h3>Dates &amp; phases</h3>
    ${phaseStrip(comp)}
    <h3>Top 5 <span class="h-sub">by judge win rate</span></h3>
    ${topFiveTable(comp, top5)}`;
}

// The board: ticker, stats, controls, the list, and the selected bounty.
export function boardPage(data, state) {
  const items = data.items ?? [];
  const live = items.filter(openNow);
  const finished = items.filter((c) => !openNow(c));
  const ended = state.ended ? [...finished, ...state.ended] : finished;
  const shown = state.tab === "ended" ? ended : live;
  const ordered = sortList(shown, state.sort);
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
      : `<ul class="rows">${matches.map((c) => listRow(c, c.slug === state.selected)).join("")}</ul>`;
  const detailHtml = selected
    ? `
        <p class="d-crumbs">Board / ${escapeHtml(selected.category ?? "")} · ${stateBadge(selected)}</p>
        <h2 class="d-title">${escapeHtml(selected.title)}</h2>
        <p class="d-sum">${escapeHtml(selected.summary ?? "")}</p>
        ${detailBlock(selected, top5, lastHour)}
        <div class="prose clamp">${miniMd(selected.description ?? "")}</div>
        <p><a href="#/bounty/${encodeURIComponent(selected.slug)}">Open the full bounty page →</a></p>`
    : '<p class="empty">Pick a bounty to see it here.</p>';
  return `
    ${activityTicker(live, full)}
    ${statsStrip(live)}
    <div class="controls">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-action="tab" data-tab="live" ${state.tab === "live" ? 'class="on" aria-selected="true"' : ""}>Open ${fmtInt(live.length)}</button>
        <button type="button" role="tab" data-action="tab" data-tab="ended" ${state.tab === "ended" ? 'class="on" aria-selected="true"' : ""}>Closed ${fmtInt(ended.length)}</button>
      </div>
      <label class="search">Find <input id="q" type="search" placeholder="title, category, skill…" value="${escapeHtml(state.q ?? "")}" autocomplete="off"></label>
      <button type="button" data-action="refresh">Reload</button>
    </div>
    <div class="chiprows">
    <div class="chips"><span>Order</span>
      <button type="button" data-action="sort" data-sort="closing" ${state.sort === "closing" ? 'class="on"' : ""}>Soonest first</button>
      <button type="button" data-action="sort" data-sort="pot" ${state.sort === "pot" ? 'class="on"' : ""}>Largest pot</button>
      <button type="button" data-action="sort" data-sort="entries" ${state.sort === "entries" ? 'class="on"' : ""}>Most entered</button>
    </div>
    <div class="chips"><span>Kind</span>
      ${cats.map((c) => `<button type="button" data-action="cat" data-cat="${escapeHtml(c)}" ${state.cat === c ? 'class="on"' : ""}>${escapeHtml(c)}</button>`).join("")}
    </div>
    </div>
    <div class="split">
      <div class="list-col">
        ${rowsHtml}
      </div>
      <aside class="detail" aria-label="Selected bounty">
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
    ? `<details class="rules"><summary>Read the full rules</summary><div class="prose">${miniMd(comp.rules)}</div></details>`
    : "";
  const recentHtml = recent.length
    ? `<h2>Latest entries</h2><ul class="recent">${recent.map((s) => `<li><a href="#/profile/${encodeURIComponent(s.hunter)}">@${escapeHtml(s.hunter)}</a> — ${escapeHtml(s.title ?? "")} · <span data-createdat="${escapeHtml(s.createdAt)}">${since(s.createdAt)}</span>${s.status ? ` · ${escapeHtml(s.status)}` : ""}</li>`).join("")}</ul>`
    : "";
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Standings →</a></p>
    <h1>${escapeHtml(comp.title)}</h1>
    <p class="lede">${escapeHtml(comp.summary ?? "")}</p>
    <p class="tags">${stateBadge(comp)}<span class="tag">${escapeHtml(comp.category ?? "")}</span>${(comp.skills ?? []).map((s) => `<span class="tag">${escapeHtml(s)}</span>`).join("")}</p>
    ${detailBlock(comp, top5, lastHour)}
    <h2>About this bounty</h2>
    <div class="prose">${miniMd(comp.description ?? "")}</div>
    ${rulesHtml}
    ${recentHtml}`;
}

// One row of a leaderboard table.
function leaderRow(entry, comp) {
  const vals = entry.values ?? entry;
  const rate = entry.value != null ? winPct(entry.value) : winPct(vals.judge);
  const low =
    entry.interval?.low != null ? winPct(entry.interval.low) : winPct(vals.judge_low);
  const high =
    entry.interval?.high != null
      ? winPct(entry.interval.high)
      : winPct(vals.judge_high);
  const size = entry.values?.bytes ?? vals.bytes;
  const img = avatarUrl(entry.image);
  const pic = img
    ? `<img crossorigin="anonymous" src="${escapeHtml(img)}" alt="" width="28" height="28" loading="lazy">`
    : "";
  const status =
    entry.status ?? (entry.judged === false ? "not judged" : "judged");
  return `
    <tr>
      <td>${fmtInt(entry.rank ?? entry.performance)}</td>
      <td class="entrant">${pic}<a href="#/profile/${encodeURIComponent(entry.handle)}">${escapeHtml(entry.handle)}</a><span class="entry-title">${escapeHtml(entry.title ?? "")}</span></td>
      <td><strong>${rate}</strong></td>
      <td>${low} – ${high}</td>
      <td><strong class="green">${prizeAt(comp, entry.prize_rank ?? entry.rank)}</strong></td>
      <td>${fmtBytes(size)}</td>
      <td>${escapeHtml(status)}</td>
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
      ? `<p><button type="button" data-action="more-lb">Show more (${fmtInt(Math.min(25, all.length - shown))} more of ${fmtInt(all.length - shown)})</button></p>`
      : `<p class="note">That is all ${fmtInt(all.length)} entries.</p>`;
  const table =
    all.length === 0
      ? '<p class="empty">No entries placed yet.</p>'
      : `<table class="lb">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>90% range</th><th>Pays now</th><th>Size</th><th>Status</th></tr></thead>
      <tbody>${page.map((e) => leaderRow(e, comp)).join("")}</tbody>
    </table>
    ${more}`;
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}">${escapeHtml(comp.title)}</a></p>
    <h1>Standings — ${escapeHtml(comp.title)}</h1>
    <p class="lede">${fmtInt(all.length)} entries placed · stage: ${escapeHtml(lb.phase?.title ?? lb.phase?.key ?? "")} · judge win rate with a 90% range · prize now is what each place pays out of the live pot</p>
    ${table}
    <p class="note">Win rate is how often the judge picked an entry over the field. Tap a handle to open that entrant's profile.</p>`;
}

// A public profile: who they are, their record, and their entries.
export function profilePage(p) {
  const record = p.record ?? {};
  const entries = p.solutions ?? [];
  const photo = p.image
    ? `<img class="avatar" crossorigin="anonymous" src="${escapeHtml(p.image)}" alt="" width="96" height="96">`
    : "";
  const github = p.github_login
    ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}">GitHub ↗</a>`
    : "";
  const xLink = p.x
    ? `<a href="https://x.com/${encodeURIComponent(p.x)}">X ↗</a>`
    : "";
  const discord = p.discord ? `<span>Discord: ${escapeHtml(p.discord)}</span>` : "";
  const entriesHtml =
    entries.length === 0
      ? '<p class="empty">No entries so far.</p>'
      : `<table class="lb"><thead><tr><th>Bounty</th><th>Entry</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead>
      <tbody>${entries.map((e) => `<tr>
        <td><a href="#/bounty/${encodeURIComponent(e.competition?.slug ?? "")}">${escapeHtml(e.competition?.title ?? e.competition?.slug ?? "")}</a></td>
        <td>${escapeHtml(e.title)}</td>
        <td>${e.placement != null ? `#${fmtInt(e.placement)}` : "—"}</td>
        <td>${e.score?.value != null ? winPct(e.score.value) : "—"}</td>
        <td>${e.prize_usd != null ? usd(e.prize_usd) : "—"}</td>
        <td>${dayDate(e.entered_at)}</td>
      </tr>`).join("")}</tbody></table>`;
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a></p>
    <div class="who">
      ${photo}
      <div>
        <h1>${escapeHtml(p.display_name ?? p.handle)}</h1>
        <p class="handle">@${escapeHtml(p.handle)}</p>
        ${p.bio ? `<p>${escapeHtml(p.bio)}</p>` : ""}
        <p class="links">
          ${github}
          ${xLink}
          ${discord}
          <span>Joined ${dayDate(p.joined_at)}</span>
        </p>
      </div>
    </div>
    <dl class="facts">
      <dt>Bounties entered</dt><dd>${fmtInt(record.competitions_entered)}</dd>
      <dt>Placed</dt><dd>${fmtInt(record.competitions_placed)}</dd>
      <dt>Won</dt><dd>${fmtInt(record.competitions_won)}</dd>
      <dt>Podiums</dt><dd>${fmtInt(record.podium_finishes)}</dd>
      <dt>Best finish</dt><dd>${record.best_placement != null ? `#${fmtInt(record.best_placement)}` : "—"}</dd>
      <dt>Winnings</dt><dd>${usd(record.prize_usd ?? 0)}</dd>
    </dl>
    <h2>Entries (${fmtInt(entries.length)})</h2>
    ${entriesHtml}`;
}
