import { BAR_AVAILABLE_HOUR_UTC, WEEKLY_SERIES_LAG_DAYS } from "./constants";
import type { Evidence } from "./schemas/evidence";
import type { Unit } from "./schemas/common";

export const PLACEHOLDER_RE = /\{\{(E\d+)\}\}/g;
export const NOT_AVAILABLE = "n/a";

type Valued = Pick<Evidence, "value" | "textValue" | "unit">;

function trimmed(n: number, decimals: number): string {
  return n.toFixed(decimals).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

function signedPct(fraction: number): string {
  const rounded = Number((fraction * 100).toFixed(1));
  const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
  return `${sign}${Math.abs(rounded).toFixed(1)}%`;
}

function usd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // The thresholds sit just below each power of ten so a value that rounds up moves to the next unit.
  if (abs >= 999.95e6) return `${sign}$${trimmed(abs / 1e9, 1)}B`;
  if (abs >= 999.95e3) return `${sign}$${trimmed(abs / 1e6, 1)}M`;
  if (abs >= 999.5) return `${sign}$${trimmed(abs / 1e3, 1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function bpd(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 999_995) return `${sign}${trimmed(abs / 1e6, 2)}M b/d`;
  if (abs >= 999.5) return `${sign}${trimmed(abs / 1e3, 1)}K b/d`;
  return `${sign}${Math.round(abs)} b/d`;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Formats one value by unit. `date` values are epoch milliseconds (UTC). */
export function formatValue(unit: Unit, value: number | null, textValue: string | null = null): string {
  if (unit === "text") return textValue ?? NOT_AVAILABLE;
  if (value === null || !Number.isFinite(value)) return NOT_AVAILABLE;
  switch (unit) {
    case "pct":
      return `${trimmed(value * 100, 1)}%`;
    case "pct_signed":
      return signedPct(value);
    case "usd":
      return usd(value);
    case "kt":
      return `${Math.round(value)} kt`;
    case "bpd":
      return bpd(value);
    case "days":
      return `${trimmed(value, 1)} ${Math.abs(value) === 1 ? "day" : "days"}`;
    case "score":
    case "ratio":
      return value.toFixed(2);
    case "z":
      return value.toFixed(1);
    case "count":
      return Math.round(value).toLocaleString("en-US");
    case "category":
      return String(Math.round(value));
    case "date":
      return dateFormat.format(new Date(value));
  }
}

export function formatEvidence(e: Valued): string {
  if (e.unit === null) return e.textValue ?? (e.value === null ? NOT_AVAILABLE : String(e.value));
  return formatValue(e.unit, e.value, e.textValue);
}

export function extractPlaceholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER_RE)].map((m) => m[1] as string);
}

/** Replaces `{{E12}}` with the formatted evidence value. Unresolved keys stay in place and are reported. */
export function renderTemplate(
  template: string,
  lookup: (key: string) => Valued | undefined,
): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER_RE, (whole, key: string) => {
    const e = lookup(key);
    if (!e) {
      missing.push(key);
      return whole;
    }
    return formatEvidence(e);
  });
  return { text, missing };
}

/** A daily bar dated D (YYYY-MM-DD) is readable from D 21:00 UTC (SPEC 5.1). */
export function barAvailableAt(date: string): Date {
  return new Date(`${date}T${String(BAR_AVAILABLE_HOUR_UTC).padStart(2, "0")}:00:00.000Z`);
}

/** A weekly observation dated D is readable from D plus 5 days (SPEC 5.1). */
export function weeklyAvailableAt(date: string): Date {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + WEEKLY_SERIES_LAG_DAYS);
  return d;
}
