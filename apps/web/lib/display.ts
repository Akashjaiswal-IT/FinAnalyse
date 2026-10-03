// Formatting for values the terminal receives. Nothing here computes a financial number: money,
// percentages and scores go through `formatValue` / `formatEvidence` from @repo/contracts.

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

/** "Feb 25, 2022, 03:00 UTC". All times in the terminal are UTC (SPEC 5.1). */
export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso : `${dateTimeFormat.format(t)} UTC`;
}

/** Step durations as the server measured them: "800 ms", "1.6 s". */
export function formatDuration(ms: number): string {
  return ms < 1_000 ? `${Math.round(ms)} ms` : `${(ms / 1_000).toFixed(1)} s`;
}

/** Elapsed time since the run started, for the step log: "+3.2 s". */
export function formatOffset(ms: number): string {
  return `+${(Math.max(0, ms) / 1_000).toFixed(1)} s`;
}

/** LLM cost per run is a few cents, which the `usd` unit would round to $0. */
export function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 0.01 ? 4 : 3)}`;
}

export function formatTokens(n: number): string {
  return n.toLocaleString("en-US");
}

/** "supply_shock" -> "supply shock". */
export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

/** "+0.45" for a sentiment score; the number itself comes from the server. */
export function signed(formatted: string, value: number): string {
  return value > 0 ? `+${formatted}` : formatted;
}

/** Only http(s) links are rendered as links; evidence `sourceRef` can also be a series id or a formula. */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const priceFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A share price as the server sent it, with cents ("$56.50"); `formatValue("usd")` rounds to whole dollars. */
export function formatPrice(price: number): string {
  return priceFormat.format(price);
}
