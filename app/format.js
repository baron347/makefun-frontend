// Pure formatting helpers for the board: escaping, money, dates,
// countdowns, ordinals and a small safe Markdown renderer. Everything is
// pinned to en-US / UTC, so a render looks the same on any machine.

// Escape the five characters that can break out of HTML text or an attribute.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// Dollars: a whole amount prints without cents, the rest with two.
export function usd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// A plain integer with thousands separators, or a dash when not a number.
export function fmtInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}

// A byte count as B, KB or MB.
export function fmtBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function parseDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// A full date + time, always UTC so it never depends on the reader's zone.
export function fullDate(value) {
  const d = parseDate(value);
  if (!d) return "—";
  return `${d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

// A short day date, e.g. "Nov 17, 2026", in UTC.
export function dayDate(value) {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// A compact timestamp for the phases strip, e.g. "Nov 17, 12:30 UTC".
export function stamp(value) {
  const d = parseDate(value);
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

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;

// Time left, coarse: "2d 3h left", "5h 12m left", "9m left", or "ended".
export function left(value) {
  const d = parseDate(value);
  if (!d) return "ended";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "ended";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const mins = Math.floor((ms % HOUR_MS) / MIN_MS);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

// Time left, ticking every second: "2d 3h 4m", "5h 12m 30s", "9m 4s".
export function leftExact(value) {
  const d = parseDate(value);
  if (!d) return "ended";
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "ended";
  const secs = Math.floor(ms / 1000);
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rest = secs % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${rest}s`;
  return `${mins}m ${rest}s`;
}

// How long ago something happened: "just now", "12 min ago", "3h 5m ago".
export function since(value) {
  const d = parseDate(value);
  if (!d) return "just now";
  const ms = Date.now() - d.getTime();
  if (ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// "1st", "2nd", "3rd", "4th", "11th", "21st" …
export function ordinal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const suffixes = ["th", "st", "nd", "rd"];
  const rem100 = n % 100;
  return n + (suffixes[(rem100 - 20) % 10] || suffixes[rem100] || suffixes[0]);
}

// Is this bounty still taking entries? One past its deadline counts as
// finished even while its status still says open, until results are out.
export function openNow(comp) {
  if (!comp) return false;
  if (comp.deadline) return new Date(comp.deadline).getTime() > Date.now();
  return comp.status === "open";
}

// A judge win rate stored in basis points (9500 = 95.00%).
export function winPct(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `${(n / 10000).toFixed(2)}%` : "—";
}

// Inline Markdown only: bold, code, links. The block renderer below builds
// its structure from the same escaped text, so raw HTML in the source can
// never leak onto the page.
function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

// A small block renderer: ## / ### headings, "- " lists, blank-line
// separated paragraphs. Anything else is a paragraph.
export function miniMd(src) {
  const blocks = [];
  let items = null;
  const flushList = () => {
    if (items) {
      blocks.push(`<ul>${items.join("")}</ul>`);
      items = null;
    }
  };
  for (const raw of String(src ?? "").split("\n")) {
    const line = raw.trim();
    if (line.startsWith("## ")) {
      flushList();
      blocks.push(`<h3>${inlineMd(line.slice(3))}</h3>`);
    } else if (line.startsWith("### ")) {
      flushList();
      blocks.push(`<h4>${inlineMd(line.slice(4))}</h4>`);
    } else if (line.startsWith("- ")) {
      if (!items) items = [];
      items.push(`<li>${inlineMd(line.slice(2))}</li>`);
    } else if (line === "") {
      flushList();
    } else {
      flushList();
      blocks.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  flushList();
  return blocks.join("");
}
