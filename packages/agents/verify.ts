import {
  HEDGE_LIMITS,
  HEDGE_MENU,
  NUMERIC_ALLOWLIST,
  PLACEHOLDER_RE,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
  type AnswerDraft,
  type HedgePlan,
  type Verification,
} from "@repo/contracts";
import type { Ledger } from "./ledger";

type Check = Verification["checks"][number];

/** Finance acronyms that are not tradable symbols. A 2 to 5 letter capitalised word outside this list and
 * the universe is reported as an unknown symbol (SPEC 5.6, check 4). */
const KNOWN_ACRONYMS = new Set([
  "NAV", "VIX", "VAR", "CVAR", "ETF", "ETFS", "US", "USA", "UK", "EU", "UN", "USD", "EUR", "GBP", "CNY",
  "OPEC", "NATO", "GDP", "CPI", "PPI", "PMI", "FOMC", "FED", "SEC", "LNG", "AI", "CEO", "CFO", "IPO", "ESG",
  "WTI", "GDELT", "NHC", "NOAA", "PADD", "UTC", "EST", "ECB", "BOJ", "IMF", "OECD", "FRED", "EIA", "API",
  "SWIFT", "SPR", "NGL", "GULF", "NA", "OK", "TV", "IT", "PC", "DC", "NY", "TX", "LA", "FL", "MS", "AL",
  "VAR", "KNN", "ADV", "ATM", "OTC", "NYSE", "NASDAQ", "FDIC", "FAA", "NTSB", "WHO", "FDA", "EPA", "DOE",
  "BRENT", "HH", "SOFR", "BP", "ADR", "ADRS", "AAA", "TBD", "ETA", "AM", "PM", "YTD", "OPEC", "MAX",
  "MARKET", "RATES", "GOLD",
]);

/** Strings from `NUMERIC_ALLOWLIST` and placeholders are removed before looking for digits. */
export function stripAllowed(text: string): string {
  let out = text.replace(PLACEHOLDER_RE, " ");
  for (const entry of NUMERIC_ALLOWLIST) out = out.split(entry).join(" ");
  return out;
}

/** Every digit outside a placeholder or an allowlisted name. */
export function digitViolations(text: string): string[] {
  const stripped = stripAllowed(text);
  const found: string[] = [];
  for (const m of stripped.matchAll(/\S*\p{Nd}\S*/gu)) found.push(m[0]);
  return found;
}

/** Keys that are not in the ledger, and placeholder-like text that is not a valid `{{E12}}`. */
export function placeholderViolations(text: string, ledger: Ledger): string[] {
  const violations: string[] = [];
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    const key = m[1] as string;
    if (!ledger.has(key)) violations.push(`unknown evidence key ${key}`);
  }
  if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER_RE, ""))) violations.push(`malformed placeholder in "${text.slice(0, 60)}"`);
  return violations;
}

/** Fund and company names carry capitals of their own (SPDR, DB); they are removed before scanning. */
const NAMES_LONGEST_FIRST = UNIVERSE.map((u) => u.name).sort((a, b) => b.length - a.length);

export function unknownSymbols(text: string): string[] {
  const universe = new Set<string>(UNIVERSE_SYMBOLS);
  const out = new Set<string>();
  let scan = stripAllowed(text);
  for (const name of NAMES_LONGEST_FIRST) scan = scan.split(name).join(" ");
  for (const m of scan.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const word = m[0];
    if (!universe.has(word) && !KNOWN_ACRONYMS.has(word)) out.add(word);
  }
  return [...out];
}

export interface InputStatus {
  /** Node or data input, for example `sentiment`. */
  name: string;
  label: string;
  unavailable: boolean;
  stale: boolean;
}

/** A caveat the answer must contain: it counts as present when any caveat includes one of `words`. */
export interface CaveatNeed {
  name: string;
  words: string[];
  text: string;
}

const CAVEAT_WORDS: Record<string, string[]> = {
  event: ["event"],
  weather: ["weather", "storm"],
  sentiment: ["sentiment", "news"],
  macro: ["macro", "volatility", "vix"],
  analogs: ["analog", "historical", "parallel", "past"],
  risk: ["risk"],
  hedging: ["hedg"],
};

/** Caveats for degraded inputs. No digits and no reasons: reasons can carry codes such as HTTP 429 and stay
 * in the step output. */
export function caveatNeeds(inputs: readonly InputStatus[]): CaveatNeed[] {
  return inputs
    .filter((i) => i.unavailable || i.stale)
    .map((i) => ({
      name: i.name,
      words: CAVEAT_WORDS[i.name] ?? [i.label.toLowerCase()],
      text: i.unavailable
        ? `${i.label} data was unavailable, so this answer does not use it.`
        : `${i.label} data was stale at the as-of time, so treat it with care.`,
    }));
}

export interface VerifyInput {
  draft: AnswerDraft;
  hedgePlan: HedgePlan | null;
  ledger: Ledger;
  needs: CaveatNeed[];
  nav: number | null;
}

export interface VerifyResult {
  checks: Check[];
  /** Caveats after deterministic appends. */
  caveats: string[];
  appendedCaveats: string[];
  /** The checks that need an LLM repair; `caveats` never does because it is fixed here. */
  passed: boolean;
  violations: string[];
}

function authoredTexts(draft: AnswerDraft, hedgePlan: HedgePlan | null, caveats: string[]): string[] {
  return [
    draft.headline,
    draft.summary,
    ...draft.bullets.map((b) => b.text),
    ...caveats,
    ...(hedgePlan
      ? [
          hedgePlan.summary.template,
          ...hedgePlan.actions.flatMap((a) => [a.rationale.template, a.exitTrigger.template]),
        ]
      : []),
  ];
}

function hedgeViolations(plan: HedgePlan, nav: number | null, ledger: Ledger): string[] {
  const out: string[] = plan.violations.map((v) => v.message);
  const menu = new Set<string>(HEDGE_MENU);
  const universe = new Set<string>(UNIVERSE_SYMBOLS);
  let gross = 0;
  for (const a of plan.actions) {
    gross += Math.abs(a.notional);
    if (!Number.isInteger(a.quantity) || a.quantity <= 0) out.push(`${a.symbol}: quantity must be a positive integer`);
    if (!universe.has(a.symbol)) out.push(`${a.symbol}: not in the universe`);
    if (a.type === "hedge" && !menu.has(a.symbol)) out.push(`${a.symbol}: not on the hedge menu`);
    if (a.evidenceKeys.length === 0) out.push(`${a.symbol}: action cites no evidence`);
    for (const k of a.evidenceKeys) if (!ledger.has(k)) out.push(`${a.symbol}: unknown evidence key ${k}`);
    if (nav !== null && Math.abs(a.notional) > HEDGE_LIMITS.singleActionMaxPctNav * nav) {
      out.push(`${a.symbol}: action exceeds the single-action limit`);
    }
  }
  if (nav !== null && gross > HEDGE_LIMITS.grossNotionalMaxPctNav * nav) out.push("gross hedge notional exceeds the limit");
  return out;
}

/** SPEC 5.6 verifier checks. Pure: it reads the ledger and returns what to repair or append. */
export function verifyAnswer(input: VerifyInput): VerifyResult {
  const { draft, hedgePlan, ledger } = input;

  const haystack = draft.caveats.join(" ").toLowerCase();
  const missingCaveats = input.needs
    .filter((need) => !need.words.some((w) => haystack.includes(w)))
    .map((need) => need.text);
  const caveats = [...draft.caveats, ...missingCaveats];
  const texts = authoredTexts(draft, hedgePlan, caveats);

  const placeholders = [
    ...texts.flatMap((t) => placeholderViolations(t, ledger)),
    ...draft.bullets.flatMap((b) => b.evidenceKeys.filter((k) => !ledger.has(k)).map((k) => `bullet cites unknown key ${k}`)),
    ...(draft.bullets.length === 0 ? ["answer has no bullets"] : []),
  ];
  const digits = texts.flatMap((t) => digitViolations(t).map((d) => `digit outside a placeholder: "${d}"`));
  const limits = hedgePlan ? hedgeViolations(hedgePlan, input.nav, ledger) : [];
  const universe = texts.flatMap((t) => unknownSymbols(t).map((s) => `symbol ${s} is not in the universe`));

  const checks: Check[] = [
    { name: "placeholders", passed: placeholders.length === 0, violations: [...new Set(placeholders)] },
    { name: "digits", passed: digits.length === 0, violations: [...new Set(digits)] },
    { name: "hedge_limits", passed: limits.length === 0, violations: limits },
    { name: "universe", passed: universe.length === 0, violations: universe },
    {
      name: "caveats",
      passed: missingCaveats.length === 0,
      violations: missingCaveats.map((c) => `missing caveat, appended: ${c}`),
    },
  ];
  // A missing caveat is fixed deterministically, so it never triggers a repair.
  const blocking = checks.filter((c) => c.name !== "caveats" && !c.passed);
  return {
    checks,
    caveats,
    appendedCaveats: missingCaveats,
    passed: blocking.length === 0,
    violations: blocking.flatMap((c) => c.violations),
  };
}
