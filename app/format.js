// Formatting toolbox for the board: safe HTML, money, dates, countdowns,
// ordinals and a tiny Markdown renderer. All output is pinned to en-US and
// UTC, so two machines render the same string for the same input.
//
// Nothing here touches the network or the DOM — pure functions in, strings
// out — which keeps every view easy to test by hand in a console.

const MS_MINUTE = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

// One shared formatter per shape, built once instead of per call.
const moneyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const moneyCents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat("en-US");

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The five characters that can escape HTML text or an attribute value.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// Dollars. Whole amounts print without cents ("$250"), the rest with two.
export function money(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  return Number.isInteger(n) ? moneyFmt.format(n) : moneyCents.format(n);
}

// A compact dollar amount for tight spots: "$1.2k", "$3.4M", else money().
export function moneyShort(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return money(n);
}

// A plain integer with thousands separators, or a dash when not a number.
export function int(value) {
  const n = asNumber(value);
  return n === null ? "—" : intFmt.format(Math.trunc(n));
}

// A byte count as "812 B", "14 KB" or "2.3 MB".
export function bytes(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  if (n < 1024) return `${Math.trunc(n)} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// "Nov 17, 2026, 4:30 PM UTC" — full date plus time, always UTC.
export function dateFull(value) {
  const d = asDate(value);
  if (!d) return "—";
  return (
    d.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

// "Nov 17, 2026" — day only, in UTC.
export function dateDay(value) {
  const d = asDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "Nov 17, 12:30 UTC" — the compact stamp the timeline uses.
export function dateStamp(value) {
  const d = asDate(value);
  if (!d) return "—";
  return (
    d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }) + " UTC"
  );
}

// Split a millisecond span into whole days / hours / minutes / seconds.
function splitSpan(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

// Time left, coarse and calm: "2d 3h left", "5h 12m left", "9m left".
// Used for rows that refresh every thirty seconds.
export function leftShort(value) {
  const d = asDate(value);
  if (!d) return "ended";
  const span = splitSpan(d.getTime() - Date.now());
  if (d.getTime() - Date.now() <= 0) return "ended";
  if (span.days > 0) return `${span.days}d ${span.hours}h left`;
  if (span.hours > 0) return `${span.hours}h ${span.minutes}m left`;
  return `${span.minutes}m left`;
}

// Time left, ticking every second: "2d 3h 4m", "5h 12m 30s", "9m 4s".
export function leftTick(value) {
  const d = asDate(value);
  if (!d) return "ended";
  if (d.getTime() - Date.now() <= 0) return "ended";
  const span = splitSpan(d.getTime() - Date.now());
  if (span.days > 0) return `${span.days}d ${span.hours}h ${span.minutes}m`;
  if (span.hours > 0) return `${span.hours}h ${span.minutes}m ${span.seconds}s`;
  return `${span.minutes}m ${span.seconds}s`;
}

// How long ago something happened: "just now", "12 min ago", "3h 5m ago".
export function ago(value) {
  const d = asDate(value);
  if (!d) return "just now";
  const ms = Date.now() - d.getTime();
  if (ms <= 0) return "just now";
  const minutes = Math.floor(ms / MS_MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st" …
export function ordinalOf(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  const whole = Math.trunc(n);
  const lastTwo = whole % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${whole}th`;
  const last = whole % 10;
  if (last === 1) return `${whole}st`;
  if (last === 2) return `${whole}nd`;
  if (last === 3) return `${whole}rd`;
  return `${whole}th`;
}

// Is this bounty still taking entries? One past its deadline counts as
// finished even while its status still says open, until results are out.
export function isLive(comp) {
  if (!comp) return false;
  if (comp.deadline) return new Date(comp.deadline).getTime() > Date.now();
  return comp.status === "open";
}

// A judge win rate stored in basis points: 9500 becomes "95.00%".
export function winRate(value) {
  const n = asNumber(value);
  return n === null ? "—" : `${(n / 10000).toFixed(2)}%`;
}

// "1 entry" / "3 entries" — tiny plural helper for captions.
export function plural(count, one, many) {
  return Number(count) === 1 ? one : many;
}

// --- A small safe Markdown renderer ---------------------------------------
// Inline first: bold, code, links — applied to already-escaped text, so raw
// HTML in the source can never leak onto the page. Block structure comes
// from the same escaped lines: ## / ### headings, "- " lists, everything
// else a paragraph separated by blank lines.

function renderInline(text) {
  return esc(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

export function renderMd(src) {
  const lines = String(src ?? "").split("\n");
  const out = [];
  let list = null;

  const closeList = () => {
    if (list) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      closeList();
      out.push(`<h4>${renderInline(line.slice(4))}</h4>`);
    } else if (line.startsWith("## ")) {
      closeList();
      out.push(`<h3>${renderInline(line.slice(3))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!list) list = [];
      list.push(`<li>${renderInline(line.slice(2))}</li>`);
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${renderInline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}
