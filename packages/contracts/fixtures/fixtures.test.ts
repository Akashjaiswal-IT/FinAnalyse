import { describe, expect, it } from "vitest";
import { HEDGE_LIMITS, HEDGE_MENU, NODE_ORDER, NUMERIC_ALLOWLIST, SEVERITY_BOUNDS, UNIVERSE_SYMBOLS } from "../constants";
import { extractPlaceholders, renderTemplate } from "../format";
import {
  Answer,
  AnalogsOutput,
  EventOutput,
  Evidence,
  HedgingOutput,
  MacroOutput,
  MarketEventView,
  NewsItem,
  PortfolioSnapshot,
  Plan,
  RiskOutput,
  RunEvent,
  SentimentOutput,
  StormTrack,
  Verification,
  WeatherOutput,
  type EventProfile,
  type TemplateText,
} from "../schemas";
import {
  FIXTURE_PRICES,
  fixtureMarketEvents,
  fixtureNews,
  fixtureNewsUkraine,
  fixturePortfolio,
  fixturePortfolioUkraine,
  fixtureStormTrack,
  idaEvidence,
  idaEventProfile,
  idaNodeOutputs,
  idaRunEvents,
  ukraineEvidence,
  ukraineEventProfile,
  ukraineNodeOutputs,
  ukraineRunEvents,
} from "./index";

const outputSchemas = {
  planner: Plan,
  event: EventOutput,
  weather: WeatherOutput,
  sentiment: SentimentOutput,
  macro: MacroOutput,
  analogs: AnalogsOutput,
  risk: RiskOutput,
  hedging: HedgingOutput,
  synthesizer: Answer,
  verifier: Verification,
} as const;

const runs = [
  { name: "Ida", events: idaRunEvents, evidence: idaEvidence, outputs: idaNodeOutputs, portfolio: fixturePortfolio, profile: idaEventProfile },
  { name: "Ukraine", events: ukraineRunEvents, evidence: ukraineEvidence, outputs: ukraineNodeOutputs, portfolio: fixturePortfolioUkraine, profile: ukraineEventProfile },
] as const;

function authoredTexts(outputs: (typeof runs)[number]["outputs"]): TemplateText[] {
  const findings = [outputs.event, outputs.weather, outputs.sentiment, outputs.macro, outputs.analogs].flatMap((o) =>
    o.status === "ok" ? o.findings.map((f) => f.text) : [],
  );
  const hedge = outputs.hedging.status === "ok" ? outputs.hedging.plan : null;
  return [
    outputs.synthesizer.headline,
    outputs.synthesizer.summary,
    ...outputs.synthesizer.bullets.map((b) => b.text),
    ...outputs.synthesizer.caveats,
    ...findings,
    ...(hedge ? [hedge.summary, ...hedge.actions.flatMap((a) => [a.rationale, a.exitTrigger])] : []),
  ];
}

function severityOf(p: EventProfile): EventProfile["severity"] {
  if (p.volZ === null) throw new Error("observed profile without volZ");
  return p.volZ >= SEVERITY_BOUNDS.high ? "high" : p.volZ >= SEVERITY_BOUNDS.medium ? "medium" : "low";
}

describe.each(runs)("$name fixture run", (run) => {
  it("parses against the schemas", () => {
    for (const e of run.events) RunEvent.parse(e);
    for (const e of run.evidence) Evidence.parse(e);
    PortfolioSnapshot.parse(run.portfolio);
    for (const [node, schema] of Object.entries(outputSchemas)) {
      schema.parse(run.outputs[node as keyof typeof run.outputs]);
    }
  });

  it("completes every node in graph order and ends with run.completed", () => {
    const completed = run.events.flatMap((e) => (e.type === "step.completed" ? [e.node] : []));
    expect(completed).toEqual([...NODE_ORDER]);
    expect(run.events[0]?.type).toBe("run.started");
    const last = run.events.at(-1);
    expect(last?.type).toBe("run.completed");
    expect(last?.type === "run.completed" ? last.eventProfile : null).toEqual(run.profile);
  });

  it("numbers evidence keys E1..En without gaps and marks them as fixture data", () => {
    expect(run.evidence.map((e) => e.key)).toEqual(run.evidence.map((_, i) => `E${i + 1}`));
    for (const e of run.evidence) expect(["fixture", "user"]).toContain(e.source);
  });

  it("resolves every placeholder and keeps digits out of authored text", () => {
    const lookup = (k: string) => run.evidence.find((e) => e.key === k);
    for (const { template, rendered } of authoredTexts(run.outputs)) {
      const r = renderTemplate(template, lookup);
      expect(r.missing).toEqual([]);
      expect(r.text).toBe(rendered);
      let stripped = template.replace(/\{\{E\d+\}\}/g, "");
      for (const allowed of NUMERIC_ALLOWLIST) stripped = stripped.replaceAll(allowed, "");
      expect(stripped).not.toMatch(/\d/);
      for (const key of extractPlaceholders(template)) expect(lookup(key)).toBeDefined();
    }
  });

  it("keeps the hedge plan inside the limits with consistent notionals", () => {
    const plan = run.outputs.hedging.status === "ok" ? run.outputs.hedging.plan : null;
    expect(plan).not.toBeNull();
    const nav = run.portfolio.nav;
    const held = new Set(run.portfolio.positions.map((p) => p.symbol));
    expect(plan!.grossNotional).toBeLessThanOrEqual(HEDGE_LIMITS.grossNotionalMaxPctNav * nav);
    expect(plan!.grossNotional).toBe(plan!.actions.reduce((s, a) => s + a.notional, 0));
    for (const a of plan!.actions) {
      expect(a.notional).toBeLessThanOrEqual(HEDGE_LIMITS.singleActionMaxPctNav * nav);
      expect(a.notional).toBe(a.quantity * (FIXTURE_PRICES[a.symbol] as number));
      if (a.type === "hedge") expect(HEDGE_MENU).toContain(a.symbol);
      else expect(held.has(a.symbol) && a.side === "sell").toBe(true);
    }
  });

  it("keeps the event profile consistent: severity rule, universe entities", () => {
    expect(run.profile.severity).toBe(severityOf(run.profile));
    for (const s of [...run.profile.entities, ...run.profile.peerSymbols]) expect(UNIVERSE_SYMBOLS).toContain(s);
  });

  it("reconciles scenario P&L across holdings, sectors and channels", () => {
    const risk = run.outputs.risk.status === "ok" ? run.outputs.risk.report : null;
    expect(risk).not.toBeNull();
    const sum = (xs: { pnl: number }[]) => xs.reduce((s, x) => s + x.pnl, 0);
    expect(sum(risk!.scenario.perHolding)).toBe(risk!.scenario.pnl);
    expect(sum(risk!.scenario.perSector)).toBe(risk!.scenario.pnl);
    expect(sum(risk!.scenario.perChannel)).toBe(risk!.scenario.pnl);
  });
});

describe("event model fixtures", () => {
  it("skips the weather node for the Ukraine run and runs it for Ida", () => {
    expect(ukraineNodeOutputs.weather.status).toBe("skipped");
    expect(idaNodeOutputs.weather.status).toBe("ok");
  });

  it("shows at least two exposure channels in each run", () => {
    for (const run of runs) {
      const risk = run.outputs.risk.status === "ok" ? run.outputs.risk.report : null;
      const kinds = new Set(risk!.channels.flatMap((h) => h.channels.map((c) => c.channel)));
      expect(kinds.size).toBeGreaterThanOrEqual(2);
    }
  });

  it("parses the live event, news and storm fixtures", () => {
    for (const e of fixtureMarketEvents) MarketEventView.parse(e);
    for (const n of [...fixtureNews, ...fixtureNewsUkraine]) NewsItem.parse(n);
    StormTrack.parse(fixtureStormTrack);
  });
});
