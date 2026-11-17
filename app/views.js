import {
  ago,
  bytes,
  dtime,
  esc,
  isTakingEntries,
  md,
  money,
  num,
  pct,
  placeLabel,
  shortDate,
  timeLeft,
  timeLeftPrecise,
} from "./format.js";

// What a bounty is worth right now: the live pot when the API gives one,
// otherwise the headline reward.
function potOf(comp) {
  return money(comp.potUsd ?? comp.rewardAmount);
}

// What it costs to enter, as a short label.
function feeLabel(comp) {
  const fee = Number(comp.entryFeeUsd);
  if (fee > 0) return money(comp.entryFeeUsd);
  return "Free";
}

// A small status pill for a bounty row or page.
function badgeFor(comp) {
  if (!isTakingEntries(comp)) {
    return '<span class="badge ended">Finished</span>';
  }
  const msLeft = new Date(comp.deadline).getTime() - Date.now();
  if (msLeft < 24 * 60 * 60 * 1000) {
    return '<span class="badge soon">Ending soon</span>';
  }
  return '<span class="badge open">Open</span>';
}

// How far through its window a bounty is: 0 at opening, 1 at deadline.
function elapsed(comp) {
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
  return row ? money(row.amountUsd) : "—";
}

// An entrant's avatar URL, made absolute when the API gives a path.
function avatarUrl(image) {
  if (!image) return "";
  return image.startsWith("/") ? `https://make.fun${image}` : image;
}

// One row of the bounty list.
function rowHtml(comp, isSelected) {
  const closingSoon =
    isTakingEntries(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const fee = feeLabel(comp);
  return `
    <li class="row${isSelected ? " on" : ""}" data-action="select" data-slug="${esc(comp.slug)}" tabindex="0">
      <span class="r-pot">${potOf(comp)}<small>pot</small></span>
      <span class="r-main">
      <span class="r-title"><a href="#/bounty/${encodeURIComponent(comp.slug)}">${esc(comp.title)}</a></span>
        <span class="r-sub">${closingSoon ? '<span class="badge soon">Ending soon</span>' : ""}<span class="tag">${esc(comp.category ?? "")}</span>${esc(comp.summary ?? comp.description ?? "")}</span>
      </span>
      <span class="r-fee">${fee}</span>
      <span class="r-time"><span data-deadline="${esc(comp.deadline)}">${timeLeft(comp.deadline)}</span><i class="bar${closingSoon ? " hot" : ""}"><b style="width:${Math.round(100 * elapsed(comp))}%"></b></i></span>
      <span class="r-entries"><strong>${num(comp.submissionCount)}</strong><small>entries</small></span>
    </li>`;
}

// Order a list of bounties: by pot, by entries, or by deadline.
function sorted(list, key) {
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
function statsHtml(live) {
  const pots = live.reduce(
    (sum, c) => sum + Number(c.potUsd ?? c.rewardAmount ?? 0),
    0,
  );
  const entries = live.reduce((sum, c) => sum + (c.submissionCount ?? 0), 0);
  const next = live
    .slice()
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
  const urgent =
    next && new Date(next.deadline).getTime() - Date.now() < 60 * 60 * 1000;
  return `
    <div class="stats" role="status">
      <div><span>Bounties open</span><strong>${num(live.length)}</strong></div>
      <div><span>Pots right now</span><strong class="green">${money(pots)}</strong></div>
      <div><span>Entries so far</span><strong>${num(entries)}</strong></div>
      <div><span>Closing next</span><strong class="${urgent ? "red" : ""}" ${next ? `data-countdown="${esc(next.deadline)}"` : ""}>${next ? timeLeftPrecise(next.deadline) : "—"}</strong><small>${next ? esc(next.title) : ""}</small></div>
    </div>`;
}

// The live ticker: the newest entries, or the newest entry anywhere.
function tickerHtml(live, detail) {
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
  return `<p class="ticker">${parts.join(" · ")}</p>`;
}

// Rewards as a table, grouping runs of places that pay the same.
function rewardsHtml(comp) {
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
      return `<table class="rewards"><thead><tr><th>Place</th><th>Pays</th></tr></thead><tbody>${body}</tbody></table>`;
    }
    return `<p>Reward: <strong>${potOf(comp)}</strong></p>`;
  }
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last.baseUsd === row.baseUsd &&
      last.feeShareUsd === row.feeShareUsd &&
      Number(row.place) === last.end + 1
    ) {
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
        g.start === g.end ? placeLabel(g.start) : `${g.start}–${g.end}`;
      const width = Math.max(
        4,
        Math.round((Number(g.amountUsd) / top) * 100),
      );
      return `<tr><td>${place}</td><td>${money(g.baseUsd)}</td><td>+${money(g.feeShareUsd)}</td><td><span class="pays"><i style="width:${width}%"></i></span><strong class="green">${money(g.amountUsd)}</strong>${g.start !== g.end ? " each" : ""}</td></tr>`;
    })
    .join("");
  return `
    <table class="rewards">
      <thead><tr><th>Place</th><th>Base</th><th>Fee cut</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

// The opened → now → deadline → results timeline.
function phasesHtml(comp) {
  const phases = comp.phases ?? [];
  const dev = phases.find((p) => p.key === "dev");
  const fin = phases.find((p) => p.key === "final");
  const deadline = dev?.endsAt ?? comp.deadline;
  const results = fin?.endsAt ?? null;
  const done = Math.round(100 * elapsed({ ...comp, deadline }));
  const now = new Date();
  return `
    <div class="phases">
      <div class="track"><i style="width:${done}%"></i><b style="left:${done}%"></b></div>
      <div class="stops">
        <div><b>Opened</b><span>${dtime(comp.publishedAt)}</span></div>
        <div class="cur"><b>Now</b><span>${dtime(now.toISOString())}</span></div>
        <div><b>Deadline</b><span>${dtime(deadline)}</span></div>
        <div><b>Results by</b><span>${results ? dtime(results) : "—"}</span></div>
      </div>
    </div>`;
}

// The top-5 preview under a bounty.
function topFiveHtml(comp, top5) {
  if (!top5) return '<p class="note">Top 5 still loading…</p>';
  if (top5.length === 0) return '<p class="note">Nothing ranked here yet.</p>';
  const body = top5
    .map((entry) => {
      const img = avatarUrl(entry.image);
      return `<tr><td>${num(entry.rank ?? entry.performance)}</td><td class="entrant">${img ? `<img crossorigin="anonymous" src="${esc(img)}" alt="" width="20" height="20" loading="lazy">` : ""}<a href="#/profile/${encodeURIComponent(entry.handle)}">${esc(entry.handle)}</a></td><td><strong>${pct(entry.value ?? entry.values?.judge)}</strong></td><td><strong class="green">${prizeAt(comp, entry.prize_rank ?? entry.rank)}</strong></td></tr>`;
    })
    .join("");
  return `
    <table class="top5">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>Pays now</th></tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="note"><a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Whole leaderboard · ${num(comp.submissionCount)} entries →</a></p>`;
}

// The shared detail block: stat cards, entry buttons, rewards, phases, top 5.
export function bountyDetail(comp, top5, lastHour) {
  const closingSoon =
    isTakingEntries(comp) &&
    new Date(comp.deadline).getTime() - Date.now() < 24 * 60 * 60 * 1000;
  const paid = comp.entryFeeUsd && Number(comp.entryFeeUsd) > 0;
  return `
    <div class="cards">
      <div><span>Pot now</span><strong class="green">${potOf(comp)}</strong><small>${money(comp.rewardAmount)} prize + ${money(comp.entryFeesUsd ?? 0)} from fees</small></div>
      <div><span>To enter</span><strong>${paid ? money(comp.entryFeeUsd) : "Free"}</strong><small>${paid ? `${num(comp.entryFeePayers)} paid · one per account` : "nothing to pay"}</small></div>
      <div><span>Closes in</span><strong class="${closingSoon ? "red" : ""}" data-countdown="${esc(comp.deadline)}">${timeLeftPrecise(comp.deadline)}</strong><small>ends ${dtime(comp.deadline)}</small></div>
      <div><span>Entries</span><strong>${num(comp.submissionCount)}</strong><small>${lastHour != null ? `${num(lastHour)} in the past hour` : "the judge's win rate decides"}</small></div>
    </div>
    <p class="cta"><a class="btn go" href="https://make.fun/bounty/${encodeURIComponent(comp.slug)}">Enter this bounty ↗</a>
    <a class="btn ghost" href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Full leaderboard · ${num(comp.submissionCount)} entries →</a></p>
    <h3>Rewards <span class="h-sub">${num((comp.rewardsNow ?? []).length)} places split the pot of ${potOf(comp)}</span></h3>
    ${rewardsHtml(comp)}
    <h3>Dates &amp; phases</h3>
    ${phasesHtml(comp)}
    <h3>Top 5 <span class="h-sub">by judge win rate</span></h3>
    ${topFiveHtml(comp, top5)}`;
}

// The board: ticker, stats, controls, the list, and the selected bounty.
export function board(data, state) {
  const items = data.items ?? [];
  const live = items.filter(isTakingEntries);
  const finished = items.filter((c) => !isTakingEntries(c));
  const ended = state.ended ? [...finished, ...state.ended] : finished;
  const shown = state.tab === "ended" ? ended : live;
  const ordered = sorted(shown, state.sort);
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
  return `
    ${tickerHtml(live, full)}
    ${statsHtml(live)}
    <div class="controls">
      <div class="tabs" role="tablist">
        <button type="button" role="tab" data-action="tab" data-tab="live" ${state.tab === "live" ? 'class="on" aria-selected="true"' : ""}>Open ${num(live.length)}</button>
        <button type="button" role="tab" data-action="tab" data-tab="ended" ${state.tab === "ended" ? 'class="on" aria-selected="true"' : ""}>Closed ${num(ended.length)}</button>
      </div>
      <label class="search">Find <input id="q" type="search" placeholder="title, category, skill…" value="${esc(state.q ?? "")}" autocomplete="off"></label>
      <button type="button" data-action="refresh">Reload</button>
    </div>
    <div class="chiprows">
    <div class="chips"><span>Order</span>
      <button type="button" data-action="sort" data-sort="closing" ${state.sort === "closing" ? 'class="on"' : ""}>Soonest first</button>
      <button type="button" data-action="sort" data-sort="pot" ${state.sort === "pot" ? 'class="on"' : ""}>Largest pot</button>
      <button type="button" data-action="sort" data-sort="entries" ${state.sort === "entries" ? 'class="on"' : ""}>Most entered</button>
    </div>
    <div class="chips"><span>Kind</span>
      ${cats.map((c) => `<button type="button" data-action="cat" data-cat="${esc(c)}" ${state.cat === c ? 'class="on"' : ""}>${esc(c)}</button>`).join("")}
    </div>
    </div>
    <div class="split">
      <div class="list-col">
        ${matches.length === 0 ? '<p class="empty">Nothing matches that search.</p>' : `<ul class="rows">${matches.map((c) => rowHtml(c, c.slug === state.selected)).join("")}</ul>`}
      </div>
      <aside class="detail" aria-label="Selected bounty">
        ${selected ? `
        <p class="d-crumbs">Board / ${esc(selected.category ?? "")} · ${badgeFor(selected)}</p>
        <h2 class="d-title">${esc(selected.title)}</h2>
        <p class="d-sum">${esc(selected.summary ?? "")}</p>
        ${bountyDetail(selected, top5, lastHour)}
        <div class="prose clamp">${md(selected.description ?? "")}</div>
        <p><a href="#/bounty/${encodeURIComponent(selected.slug)}">Open the full bounty page →</a></p>` : '<p class="empty">Pick a bounty to see it here.</p>'}
      </aside>
    </div>
    <p class="note">Pots grow when entry fees come in. A bounty past its deadline counts as finished even if it still shows as open, until results are out.</p>`;
}

// One bounty page: summary, stats, rewards, phases, top 5, description,
// rules, and the most recent entries.
export function bounty(comp, top5) {
  const hourAgo = Date.now() - 36e5;
  const lastHour = (comp.submissions ?? []).filter(
    (s) => new Date(s.createdAt).getTime() > hourAgo,
  ).length;
  const recent = (comp.submissions ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 8);
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}/leaderboard">Standings →</a></p>
    <h1>${esc(comp.title)}</h1>
    <p class="lede">${esc(comp.summary ?? "")}</p>
    <p class="tags">${badgeFor(comp)}<span class="tag">${esc(comp.category ?? "")}</span>${(comp.skills ?? []).map((s) => `<span class="tag">${esc(s)}</span>`).join("")}</p>
    ${bountyDetail(comp, top5, lastHour)}
    <h2>About this bounty</h2>
    <div class="prose">${md(comp.description ?? "")}</div>
    ${comp.rules ? `<details class="rules"><summary>Read the full rules</summary><div class="prose">${md(comp.rules)}</div></details>` : ""}
    ${recent.length ? `<h2>Latest entries</h2><ul class="recent">${recent.map((s) => `<li><a href="#/profile/${encodeURIComponent(s.hunter)}">@${esc(s.hunter)}</a> — ${esc(s.title ?? "")} · <span data-createdat="${esc(s.createdAt)}">${ago(s.createdAt)}</span>${s.status ? ` · ${esc(s.status)}` : ""}</li>`).join("")}</ul>` : ""}`;
}

// One row of a leaderboard table.
function lbRow(entry, comp) {
  const vals = entry.values ?? entry;
  const rate = entry.value != null ? pct(entry.value) : pct(vals.judge);
  const low =
    entry.interval?.low != null ? pct(entry.interval.low) : pct(vals.judge_low);
  const high =
    entry.interval?.high != null
      ? pct(entry.interval.high)
      : pct(vals.judge_high);
  const size = entry.values?.bytes ?? vals.bytes;
  const img = avatarUrl(entry.image);
  const status =
    entry.status ?? (entry.judged === false ? "not judged" : "judged");
  return `
    <tr>
      <td>${num(entry.rank ?? entry.performance)}</td>
      <td class="entrant">${img ? `<img crossorigin="anonymous" src="${esc(img)}" alt="" width="28" height="28" loading="lazy">` : ""}<a href="#/profile/${encodeURIComponent(entry.handle)}">${esc(entry.handle)}</a><span class="entry-title">${esc(entry.title ?? "")}</span></td>
      <td><strong>${rate}</strong></td>
      <td>${low} – ${high}</td>
      <td><strong class="green">${prizeAt(comp, entry.prize_rank ?? entry.rank)}</strong></td>
      <td>${bytes(size)}</td>
      <td>${esc(status)}</td>
    </tr>`;
}

// A leaderboard page: ranked entries, paged 25 at a time.
export function leaderboard(comp, lb, shown) {
  const first = lb.entries ?? [];
  const rest = lb.rest ?? [];
  const all = first.concat(rest);
  const page = all.slice(0, shown);
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a> · <a href="#/bounty/${encodeURIComponent(comp.slug)}">${esc(comp.title)}</a></p>
    <h1>Standings — ${esc(comp.title)}</h1>
    <p class="lede">${num(all.length)} entries placed · stage: ${esc(lb.phase?.title ?? lb.phase?.key ?? "")} · judge win rate with a 90% range · prize now is what each place pays out of the live pot</p>
    ${all.length === 0 ? '<p class="empty">No entries placed yet.</p>' : `<table class="lb">
      <thead><tr><th>#</th><th>Entrant</th><th>Win rate</th><th>90% range</th><th>Pays now</th><th>Size</th><th>Status</th></tr></thead>
      <tbody>${page.map((e) => lbRow(e, comp)).join("")}</tbody>
    </table>
    ${shown < all.length ? `<p><button type="button" data-action="more-lb">Show more (${num(Math.min(25, all.length - shown))} more of ${num(all.length - shown)})</button></p>` : `<p class="note">That is all ${num(all.length)} entries.</p>`}`}
    <p class="note">Win rate is how often the judge picked an entry over the field. Tap a handle to open that entrant's profile.</p>`;
}

// A public profile: who they are, their record, and their entries.
export function profile(p) {
  const record = p.record ?? {};
  const entries = p.solutions ?? [];
  return `
    <p class="crumbs"><a href="#/">← Every bounty</a></p>
    <div class="who">
      ${p.image ? `<img class="avatar" crossorigin="anonymous" src="${esc(p.image)}" alt="" width="96" height="96">` : ""}
      <div>
        <h1>${esc(p.display_name ?? p.handle)}</h1>
        <p class="handle">@${esc(p.handle)}</p>
        ${p.bio ? `<p>${esc(p.bio)}</p>` : ""}
        <p class="links">
          ${p.github_login ? `<a href="https://github.com/${encodeURIComponent(p.github_login)}">GitHub ↗</a>` : ""}
          ${p.x ? `<a href="https://x.com/${encodeURIComponent(p.x)}">X ↗</a>` : ""}
          ${p.discord ? `<span>Discord: ${esc(p.discord)}</span>` : ""}
          <span>Joined ${shortDate(p.joined_at)}</span>
        </p>
      </div>
    </div>
    <dl class="facts">
      <dt>Bounties entered</dt><dd>${num(record.competitions_entered)}</dd>
      <dt>Placed</dt><dd>${num(record.competitions_placed)}</dd>
      <dt>Won</dt><dd>${num(record.competitions_won)}</dd>
      <dt>Podiums</dt><dd>${num(record.podium_finishes)}</dd>
      <dt>Best finish</dt><dd>${record.best_placement != null ? `#${num(record.best_placement)}` : "—"}</dd>
      <dt>Winnings</dt><dd>${money(record.prize_usd ?? 0)}</dd>
    </dl>
    <h2>Entries (${num(entries.length)})</h2>
    ${entries.length === 0 ? '<p class="empty">No entries so far.</p>' : `<table class="lb"><thead><tr><th>Bounty</th><th>Entry</th><th>Place</th><th>Score</th><th>Prize</th><th>Entered</th></tr></thead>
      <tbody>${entries.map((e) => `<tr>
        <td><a href="#/bounty/${encodeURIComponent(e.competition?.slug ?? "")}">${esc(e.competition?.title ?? e.competition?.slug ?? "")}</a></td>
        <td>${esc(e.title)}</td>
        <td>${e.placement != null ? `#${num(e.placement)}` : "—"}</td>
        <td>${e.score?.value != null ? pct(e.score.value) : "—"}</td>
        <td>${e.prize_usd != null ? money(e.prize_usd) : "—"}</td>
        <td>${shortDate(e.entered_at)}</td>
      </tr>`).join("")}</tbody></table>`}`;
}
