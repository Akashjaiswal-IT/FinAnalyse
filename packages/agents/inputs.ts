import { WEATHER_SUBTYPES, type Confidence } from "@repo/contracts";
import { computeConfidence } from "./confidence";
import type { Ledger } from "./ledger";
import type { RunStateValue } from "./state";
import { TAG } from "./tags";
import { caveatNeeds, type CaveatNeed, type InputStatus } from "./verify";

type Output = { status: string } | null;

const unavailable = (o: Output) => o === null || o.status === "unavailable";

/** The weather node is a core input only for weather disasters (SPEC 5.5, rule 7). */
export function weatherRequired(state: RunStateValue): boolean {
  const e = state.plan?.event;
  if (!e) return false;
  const byEvent = e.type === "disaster" && WEATHER_SUBTYPES.includes((e.subtype ?? "") as (typeof WEATHER_SUBTYPES)[number]);
  return byEvent || e.hypotheticalStorm !== null || state.plan?.specialists.weather === true;
}

export function staleNodes(ledger: Ledger): Set<string> {
  return new Set(ledger.all().filter((r) => r.stale).map((r) => r.producedBy));
}

/** Inputs the answer relies on, with whether each is unavailable or stale. Skipped nodes are not inputs. */
export function inputStatuses(state: RunStateValue, ledger: Ledger): InputStatus[] {
  const stale = staleNodes(ledger);
  const plan = state.plan;
  const rows: [string, string, Output, boolean][] = [
    ["event", "Event", state.eventOut, plan?.event.source !== "none"],
    ["weather", "Weather", state.weatherOut, weatherRequired(state)],
    ["sentiment", "Sentiment", state.sentimentOut, plan?.specialists.sentiment === true],
    ["macro", "Macro", state.macroOut, plan?.specialists.macro === true],
    ["analogs", "Historical analog", state.analogsOut, plan?.specialists.analogs === true],
    ["risk", "Risk", state.riskOut, plan?.event.source !== "none"],
    ["hedging", "Hedging", state.hedgingOut, plan?.intent !== "explain" && plan?.event.source !== "none"],
  ];
  return rows
    .filter(([, , , needed]) => needed)
    .map(([name, label, out]) => ({ name, label, unavailable: unavailable(out), stale: stale.has(name) }));
}

export function confidenceFor(state: RunStateValue, ledger: Ledger): Confidence {
  const typeEvents = ledger.tagged(TAG.analogsTypeEvents);
  return computeConfidence({
    event: state.eventOut,
    sentiment: state.sentimentOut,
    analogs: state.analogsOut,
    weather: state.weatherOut,
    weatherRequired: weatherRequired(state),
    staleNodes: staleNodes(ledger),
    hypothetical: state.plan?.event.source === "hypothetical",
    typeEventCount: typeEvents ? (ledger.get(typeEvents)?.value ?? null) : null,
  });
}

/** Caveats the answer must carry: degraded inputs, plus the standing limits that apply to this run. */
export function requiredCaveats(state: RunStateValue, ledger: Ledger): CaveatNeed[] {
  const needs = caveatNeeds(inputStatuses(state, ledger));
  if (state.plan?.event.source === "hypothetical") {
    needs.push({
      name: "hypothetical",
      words: ["hypothetical"],
      text: "This is a hypothetical event: its inputs are assumptions, not observations.",
    });
  }
  if (state.weatherOut?.status === "ok") {
    if (state.weatherOut.forecastLabel === "perfect_forecast_replay") {
      needs.push({
        name: "replay_forecast",
        words: ["perfect-forecast", "perfect forecast"],
        text: "The storm track is a perfect-forecast replay built from the best track, not a forecast available at the time.",
      });
    }
    needs.push({
      name: "wind_only",
      words: ["flood", "wind distance"],
      text: "The storm impact model uses wind distance only and ignores flooding.",
    });
  }
  if (state.analogsOut?.status === "ok" && state.analogsOut.forecast.effectiveN < 4) {
    needs.push({
      name: "small_sample",
      words: ["sample", "few comparable"],
      text: "Few comparable past events exist, so the forecast is uncertain.",
    });
  }
  return needs;
}
