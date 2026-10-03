import { describe, expect, it } from "vitest";
import { NUMERIC_ALLOWLIST } from "../constants";
import { extractPlaceholders, renderTemplate } from "../format";
import {
  Answer,
  AnalogsOutput,
  Evidence,
  HedgingOutput,
  MacroOutput,
  NewsItem,
  PortfolioSnapshot,
  Plan,
  RiskOutput,
  RunEvent,
  SentimentOutput,
  StormTrack,
  Verification,
  WeatherOutput,
} from "../schemas";
import { fixtureNews, fixturePortfolio, fixtureStormTrack, idaEvidence, idaNodeOutputs, idaRunEvents } from "./index";

const outputSchemas = {
  planner: Plan,
  weather: WeatherOutput,
  sentiment: SentimentOutput,
  macro: MacroOutput,
  analogs: AnalogsOutput,
  risk: RiskOutput,
  hedging: HedgingOutput,
  synthesizer: Answer,
  verifier: Verification,
} as const;

describe("Ida fixtures", () => {
  it("parse against their schemas", () => {
    for (const e of idaRunEvents) RunEvent.parse(e);
    for (const e of idaEvidence) Evidence.parse(e);
    PortfolioSnapshot.parse(fixturePortfolio);
    StormTrack.parse(fixtureStormTrack);
    for (const n of fixtureNews) NewsItem.parse(n);
    for (const [node, schema] of Object.entries(outputSchemas)) {
      schema.parse(idaNodeOutputs[node as keyof typeof idaNodeOutputs]);
    }
  });

  it("emit the full node order and finish with run.completed", () => {
    const completed = idaRunEvents.flatMap((e) => (e.type === "step.completed" ? [e.node] : []));
    expect(completed).toEqual(["planner", "weather", "sentiment", "macro", "analogs", "risk", "hedging", "synthesizer", "verifier"]);
    expect(idaRunEvents[0]?.type).toBe("run.started");
    expect(idaRunEvents.at(-1)?.type).toBe("run.completed");
  });

  it("number evidence keys E1..En without gaps and mark them as fixture data", () => {
    expect(idaEvidence.map((e) => e.key)).toEqual(idaEvidence.map((_, i) => `E${i + 1}`));
    for (const e of idaEvidence) expect(["fixture", "user"]).toContain(e.source);
  });

  it("resolve every placeholder and keep digits out of authored text", () => {
    const lookup = (k: string) => idaEvidence.find((e) => e.key === k);
    const authored = [
      idaNodeOutputs.synthesizer.headline,
      idaNodeOutputs.synthesizer.summary,
      ...idaNodeOutputs.synthesizer.bullets.map((b) => b.text),
      ...idaNodeOutputs.synthesizer.caveats,
      ...(idaNodeOutputs.hedging.status === "ok"
        ? idaNodeOutputs.hedging.plan.actions.flatMap((a) => [a.rationale, a.exitTrigger])
        : []),
    ];
    for (const { template, rendered } of authored) {
      const r = renderTemplate(template, lookup);
      expect(r.missing).toEqual([]);
      expect(r.text).toBe(rendered);
      let stripped = template.replace(/\{\{E\d+\}\}/g, "");
      for (const allowed of NUMERIC_ALLOWLIST) stripped = stripped.replaceAll(allowed, "");
      expect(stripped).not.toMatch(/\d/);
      for (const key of extractPlaceholders(template)) expect(lookup(key)).toBeDefined();
    }
  });

  it("keeps the demo hedge plan inside the hedge limits", () => {
    const plan = idaNodeOutputs.hedging.status === "ok" ? idaNodeOutputs.hedging.plan : null;
    expect(plan).not.toBeNull();
    const nav = fixturePortfolio.nav;
    expect(plan!.grossNotional).toBeLessThanOrEqual(0.3 * nav);
    for (const a of plan!.actions) expect(a.notional).toBeLessThanOrEqual(0.1 * nav);
  });
});
