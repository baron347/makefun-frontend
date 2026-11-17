// Formatting toolbox: safe HTML, money, dates, countdowns, ordinals, Markdown.
const MS_MINUTE = 60_000;
const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

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

export function money(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  return Number.isInteger(n) ? moneyFmt.format(n) : moneyCents.format(n);
}

export function int(value) {
  const n = asNumber(value);
  return n === null ? "—" : intFmt.format(Math.trunc(n));
}

export function bytes(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  if (n < 1024) return `${Math.trunc(n)} B`;
  const kb = Math.round(n / 1024);
  if (n < 1024 * 1024) return `${kb} KB`;
  const mb = (n / (1024 * 1024)).toFixed(1);
  return `${mb} MB`;
}

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

function splitSpan(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function leftShort(value) {
  const d = asDate(value);
  if (!d) return "ended";
  const left = d.getTime() - Date.now();
  if (left <= 0) return "ended";
  const span = splitSpan(left);
  if (span.days > 0) return `${span.days}d ${span.hours}h left`;
  if (span.hours > 0) return `${span.hours}h ${span.minutes}m left`;
  return `${span.minutes}m left`;
}

export function leftTick(value) {
  const d = asDate(value);
  if (!d) return "ended";
  const left = d.getTime() - Date.now();
  if (left <= 0) return "ended";
  const span = splitSpan(left);
  if (span.days > 0) return `${span.days}d ${span.hours}h ${span.minutes}m`;
  if (span.hours > 0) return `${span.hours}h ${span.minutes}m ${span.seconds}s`;
  return `${span.minutes}m ${span.seconds}s`;
}

export function ago(value) {
  const d = asDate(value);
  if (!d) return "just now";
  const ms = Date.now() - d.getTime();
  if (ms <= 0) return "just now";
  const minutes = Math.floor(ms / MS_MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return `${hours}h ${rest}m ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ordinalOf(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  const whole = Math.trunc(n);
  const lastTwo = whole % 100;
  const isTeen = lastTwo >= 11 && lastTwo <= 13;
  if (isTeen) return `${whole}th`;
  const last = whole % 10;
  if (last === 1) return `${whole}st`;
  if (last === 2) return `${whole}nd`;
  if (last === 3) return `${whole}rd`;
  return `${whole}th`;
}

// Live while its deadline is ahead; past it counts as finished.
export function isLive(comp) {
  if (!comp) return false;
  if (comp.deadline) return new Date(comp.deadline).getTime() > Date.now();
  return comp.status === "open";
}

export function winRate(value) {
  const n = asNumber(value);
  return n === null ? "—" : `${(n / 10000).toFixed(2)}%`;
}

export function plural(count, one, many) {
  return Number(count) === 1 ? one : many;
}

// A compact count: "1.2k", "3.4M", else the plain integer.
export function shortCount(value) {
  const n = asNumber(value);
  if (n === null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const scaled = (n / 1_000_000).toFixed(1);
    const trim = scaled.replace(/\.0$/, "");
    return `${trim}M`;
  }
  if (abs >= 1_000) {
    const scaled = (n / 1_000).toFixed(1);
    const trim = scaled.replace(/\.0$/, "");
    return `${trim}k`;
  }
  return intFmt.format(Math.trunc(n));
}

// A count with its noun: "1 saved bounty" / "4 saved bounties".
export function countLabel(count, one, many) {
  return `${int(count)} ${plural(count, one, many)}`;
}

// Small safe Markdown renderer: bold, code, links on escaped text.

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
      const body = renderInline(line.slice(4));
      out.push(`<h4>${body}</h4>`);
    } else if (line.startsWith("## ")) {
      closeList();
      const body = renderInline(line.slice(3));
      out.push(`<h3>${body}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!list) list = [];
      const item = renderInline(line.slice(2));
      list.push(`<li>${item}</li>`);
    } else if (line === "") {
      closeList();
    } else {
      closeList();
      const body = renderInline(line);
      out.push(`<p>${body}</p>`);
    }
  }
  closeList();
  return out.join("");
}
