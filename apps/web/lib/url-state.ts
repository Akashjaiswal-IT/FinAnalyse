import {
  DEFAULT_REPLAY_PRESET_ID,
  EARLIEST_REPLAY_AS_OF,
  IsoDateTime,
  Mode,
  REPLAY_PRESETS,
  type ReplayPreset,
} from "@repo/contracts";

// The terminal keeps mode, preset and as-of in the URL query so a reload (or a shared link) restores them.
//   ?mode=live
//   ?mode=replay&preset=geopolitical-russia-ukraine-2022      as-of = the preset's own
//   ?mode=replay&asOf=2022-03-01T21:00:00.000Z                custom as-of, no preset

export const DEFAULT_MODE: Mode = "replay";

export interface TerminalParams {
  mode: Mode;
  /** Replay only. Null for live mode and for a custom as-of. */
  presetId: string | null;
  /** Replay only: set when the user typed an as-of instead of picking a preset. */
  asOf: string | null;
}

interface ParamReader {
  get(name: string): string | null;
}

export function findPreset(presetId: string | null): ReplayPreset | null {
  return REPLAY_PRESETS.find((p) => p.id === presetId) ?? null;
}

/** An as-of is valid from 2017-01-01 and not in the future. `now` is a parameter so tests stay deterministic. */
export function isValidAsOf(iso: string, now: number): boolean {
  if (!IsoDateTime.safeParse(iso).success) return false;
  const t = Date.parse(iso);
  return t >= Date.parse(EARLIEST_REPLAY_AS_OF) && t <= now;
}

export function parseTerminalParams(params: ParamReader, now: number): TerminalParams {
  const parsedMode = Mode.safeParse(params.get("mode"));
  const mode = parsedMode.success ? parsedMode.data : DEFAULT_MODE;
  if (mode === "live") return { mode: "live", presetId: null, asOf: null };

  const presetId = findPreset(params.get("preset"))?.id ?? null;
  const rawAsOf = params.get("asOf");
  const asOf = rawAsOf !== null && isValidAsOf(rawAsOf, now) ? rawAsOf : null;

  // A bare URL, or one with nothing usable in it, replays the default preset.
  if (presetId === null && asOf === null) {
    return { mode: "replay", presetId: DEFAULT_REPLAY_PRESET_ID, asOf: null };
  }
  // A custom as-of replaces the preset: the preset's analysis is only defined at its own as-of.
  return asOf !== null ? { mode: "replay", presetId: null, asOf } : { mode: "replay", presetId, asOf: null };
}

export function serializeTerminalParams(p: TerminalParams): string {
  const q = new URLSearchParams({ mode: p.mode });
  if (p.mode === "replay") {
    if (p.presetId !== null) q.set("preset", p.presetId);
    else if (p.asOf !== null) q.set("asOf", p.asOf);
  }
  return q.toString();
}

/** The as-of that panels and runs use: the custom value, else the preset's. Null in live mode (the server uses now). */
export function resolveAsOf(p: TerminalParams): string | null {
  if (p.mode !== "replay") return null;
  return p.asOf ?? findPreset(p.presetId)?.asOf ?? null;
}

export const modeParams = (mode: Mode): TerminalParams =>
  mode === "live"
    ? { mode, presetId: null, asOf: null }
    : { mode, presetId: DEFAULT_REPLAY_PRESET_ID, asOf: null };

export const presetParams = (presetId: string): TerminalParams => ({ mode: "replay", presetId, asOf: null });

export const asOfParams = (asOf: string): TerminalParams => ({ mode: "replay", presetId: null, asOf });

// <input type="datetime-local"> has no zone; the terminal reads and writes it as UTC.

export function isoToInputValue(iso: string): string {
  return iso.slice(0, 16);
}

export function inputValueToIso(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ? `${value}:00.000Z` : null;
}
