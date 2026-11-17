// Small formatting helpers for the board: escaping, money, dates, countdowns,
// and a tiny Markdown renderer. Everything here is pure and locale-fixed
// (en-US, UTC) so a render looks the same on any machine.

// Escape the five characters that can break out of HTML text or attributes.
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// Dollars: whole amounts print without cents, the rest with two.
export function usd(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

// A plain integer with thousands separators, or a dash when it is not a number.
export function fmtInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "—";
}

// A byte count as B, KB, or MB.
export function fmtBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// A full date + time, always in UTC so it never depends on the reader's zone.
export function fullDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

// A short day date, e.g. "Nov 17, 2026", in UTC.
export function dayDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// A compact timestamp for the phases strip, e.g. "Nov 17, 12:30 UTC".
export function stamp(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
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

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

// Time left, coarse: "2d 3h left", "5h 12m left", "9m left", or "ended".
export function left(value) {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "ended";
  const days = Math.floor(ms / DAY_MS);
  const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
  const mins = Math.floor((ms % HOUR_MS) / MIN_MS);
  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}

// Time left, ticking every second: "2d 3h 4m", "5h 12m 30s", "9m 4s".
export function leftExact(value) {
  const ms = new Date(value).getTime() - Date.now();
  if (Number.isNaN(ms) || ms <= 0) return "ended";
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

// How long ago something happened: "just now", "12 min ago", "3h 5m ago".
export function since(value) {
  const ms = Date.now() - new Date(value).getTime();
  if (Number.isNaN(ms) || ms < 0) return "just now";
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

// Is this bounty still taking entries? A bounty past its deadline counts as
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

// Inline Markdown only: bold, code, links. Block structure below is built
// from the same escaped text, so raw HTML in the source can never leak out.
function inlineMd(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
}

// A small block renderer: ## / ### headings, "- " lists, blank-line
// separated paragraphs. Anything else is a paragraph.
export function miniMd(src) {
  const out = [];
  let list = null;
  const flushList = () => {
    if (list) {
      out.push(`<ul>${list.join("")}</ul>`);
      list = null;
    }
  };
  for (const line of String(src ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ")) {
      flushList();
      out.push(`<h3>${inlineMd(trimmed.slice(3))}</h3>`);
    } else if (trimmed.startsWith("### ")) {
      flushList();
      out.push(`<h4>${inlineMd(trimmed.slice(4))}</h4>`);
    } else if (trimmed.startsWith("- ")) {
      list = list ?? [];
      list.push(`<li>${inlineMd(trimmed.slice(2))}</li>`);
    } else if (trimmed === "") {
      flushList();
    } else {
      flushList();
      out.push(`<p>${inlineMd(trimmed)}</p>`);
    }
  }
  flushList();
  return out.join("");
}
