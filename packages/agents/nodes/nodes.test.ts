import { describe, expect, it } from "vitest";
import { FakeLlm, fakeFailure } from "@repo/services/llm";
import type { EventOutput, NewsItem, Plan, WeatherOutput } from "@repo/contracts";
import { fixtureNews } from "@repo/contracts/fixtures";
import { aggregateSentiment, itemWeight } from "../sentiment-math";
import { emptyState, makeEnv, modelPlan } from "../testkit";
import { analogsNode } from "./analogs";
import { eventNode, voteFactors } from "./event";
import { riskNode } from "./risk";
import { weatherNode } from "./weather";

const IDA_ASOF = "2021-08-27T21:00:00.000Z";
const hurricane = (over: Partial<Plan["event"]> = {}) =>
  modelPlan({ type: "disaster", subtype: "hurricane", name: "Hurricane Ida", ...over }, { specialists: { weather: true, sentiment: true, macro: true, analogs: true } });

const item = (over: Partial<NewsItem>): NewsItem => ({ ...(fixtureNews[0] as NewsItem), ...over });

describe("sentiment math", () => {
  const asOf = "2022-02-25T03:00:00.000Z";
  const ago = (h: number) => new Date(Date.parse(asOf) - h * 3_600_000).toISOString();

  it("halves an item's weight every 24 hours", () => {
    const w0 = itemWeight({ relevance: 0.8, publishedAt: ago(0) }, asOf);
    expect(itemWeight({ relevance: 0.8, publishedAt: ago(24) }, asOf)).toBeCloseTo(w0 / 2, 10);
    expect(itemWeight({ relevance: 0.8, publishedAt: ago(48) }, asOf)).toBeCloseTo(w0 / 4, 10);
  });

  it("weights by relevance and recency, uses the per-entity score, and ignores unscored items", () => {
    const items = [
      item({ id: "a", tickers: ["DAL"], sentiment: -0.6, relevance: 0.9, publishedAt: ago(0), entitySentiment: [{ symbol: "DAL", score: -0.8 }] }),
      item({ id: "b", tickers: ["DAL"], sentiment: 0.4, relevance: 0.9, publishedAt: ago(24), entitySentiment: null }),
      item({ id: "c", tickers: ["DAL"], sentiment: null, relevance: null, publishedAt: ago(1), entitySentiment: null }),
    ];
    const agg = aggregateSentiment(items, asOf, ["DAL", "UAL"]);
    const dal = agg.holdings.get("DAL");
    expect(dal?.n).toBe(2);
    expect(dal?.score).toBeCloseTo((-0.8 * 0.9 + 0.4 * 0.45) / (0.9 + 0.45), 10);
    expect(agg.scoredIds).toEqual(["a", "b"]);
    expect(agg.sectors.get("airlines")?.n).toBe(2);
  });

  it("counts a peer's news at half weight and fills the peer group", () => {
    const items = [
      item({ id: "a", tickers: ["DAL"], peerTickers: [], sentiment: -0.6, relevance: 1, publishedAt: asOf, entitySentiment: null }),
      item({ id: "b", tickers: ["AAPL"], peerTickers: ["UAL"], sentiment: 0.2, relevance: 1, publishedAt: asOf, entitySentiment: null }),
    ];
    const agg = aggregateSentiment(items, asOf, ["DAL", "UAL"]);
    expect(agg.holdings.get("UAL")?.score).toBeCloseTo(0.2, 10);
    expect(agg.peerGroups.find((g) => g.symbols.includes("DAL"))?.agg.n).toBe(2);
  });
});

describe("event node", () => {
  const profileOf = (out: { output: unknown }) => (out.output as Extract<EventOutput, { status: "ok" }>).profile;

  it("voteFactors takes the majority and ignores unclear votes", () => {
    expect(voteFactors([
      { factorDirections: [{ factor: "WTI", direction: "up" }, { factor: "GOLD", direction: "unclear" }] },
      { factorDirections: [{ factor: "WTI", direction: "up" }, { factor: "MARKET", direction: "down" }] },
      { factorDirections: [{ factor: "WTI", direction: "down" }, { factor: "MARKET", direction: "up" }] },
    ])).toEqual([{ factor: "WTI", direction: "up" }]);
  });

  it("builds a replay profile from the preset's pre-outcome fields and the news at as-of", async () => {
    const env = makeEnv(new FakeLlm(), { query: "q", replayEventId: "geopolitical-russia-ukraine-2022", asOf: "2022-02-25T03:00:00.000Z" });
    const out = await eventNode(emptyState({ plan: modelPlan() }), env);
    const p = profileOf(out as never);
    expect(p).toMatchObject({ id: "geopolitical-russia-ukraine-2022", source: "replay", type: "geopolitical", title: "Russia invades Ukraine", newsBasis: "observed", severity: "high" });
    expect(p.entities).toEqual(["LMT", "RTX"]);
    expect(p.peerSymbols).toEqual([]);
    expect(p.volZ).toBeCloseTo(6.8);
    expect(env.ctx.ledger.tagged("event.title")).toBeDefined();
    expect(env.ctx.ledger.all().every((r) => r.basis !== "assumption")).toBe(true);
  });

  it("classifies a news-search event with the model and keeps only universe symbols and known external names", async () => {
    const llm = new FakeLlm({ event_classification: () => ({ type: "geopolitical", subtype: "war", entities: ["LMT", "TSLA"], externalNames: ["airbus", "Nobody Inc"], affectedSectors: ["defense"], factorDirections: [] }) });
    const env = makeEnv(llm, { query: "How does the war affect us?", mode: "live", asOf: "2022-02-25T03:00:00.000Z" });
    const out = await eventNode(emptyState({ plan: modelPlan({ source: "live" }) }), env);
    const p = profileOf(out as never);
    expect(p.id).toBe("news-search");
    expect(p.entities).toEqual(["LMT"]);
    expect(p.externalNames).toEqual(["Airbus"]);
    expect(p.peerSymbols).toEqual(expect.arrayContaining(["RTX", "BA"]));
    expect(llm.calls.map((c) => c.label)).toContain("event_classification");
  });

  it("falls back to the keyword classifier when the model fails", async () => {
    const base = makeEnv(new FakeLlm({ event_classification: () => fakeFailure("refusal") }), { query: "Our competitor just had a refinery explosion", mode: "live", asOf: "2022-02-25T03:00:00.000Z" });
    const headline = item({ id: "x", title: "Explosion at a Gulf refinery", relevance: 0.9 });
    const env = { ...base, ctx: { ...base.ctx, deps: { ...base.ctx.deps, news: { ...base.ctx.deps.news, search: async () => [{ item: headline, score: 0.9 }] } } } };
    const out = await eventNode(emptyState({ plan: modelPlan({ source: "live", type: null, subtype: null }) }), env);
    expect(profileOf(out as never)).toMatchObject({ type: "accident", subtype: "industrial" });
    expect(env.ctx.warnings.join(" ")).toContain("keyword classification");
  });

  it("builds a hypothetical profile whose numbers are assumptions from the plan's severity", async () => {
    const plan = modelPlan({
      source: "hypothetical",
      hypothetical: { type: "geopolitical", subtype: "war", entities: ["TSM", "ZZZ"], externalNames: [], affectedSectors: ["semis"], factorDirections: [{ factor: "GOLD", direction: "up" }], severity: "high" },
    }, { intent: "what_if" });
    const env = makeEnv(new FakeLlm(), { query: "What if China blockades Taiwan?", mode: "live" });
    const out = await eventNode(emptyState({ plan }), env);
    const p = profileOf(out as never);
    expect(p).toMatchObject({ id: "hypothetical", source: "hypothetical", newsBasis: "assumed", severity: "high", volZ: 4, toneZ: 0, firstReportAt: null, articleCount: null });
    expect(p.entities).toEqual(["TSM"]);
    expect(p.title).toBe("What if China blockades Taiwan");
    const volRow = env.ctx.ledger.all().find((r) => r.label === "News volume z-score");
    expect(volRow).toMatchObject({ basis: "assumption", source: "user", value: 4 });
  });

  it("reuses the previous run's event for a what-if follow-up", async () => {
    const first = await eventNode(emptyState({ plan: hurricane() }), makeEnv(new FakeLlm(), { query: "q", replayEventId: "disaster-hurricane-ida-2021", asOf: IDA_ASOF }));
    const prevEvent = (first as { output: EventOutput }).output;
    const llm = new FakeLlm();
    const env = makeEnv(llm, { query: "What if it only reaches Category 2?", asOf: IDA_ASOF, mode: "live" });
    const plan = hurricane({ source: "live", categoryOverride: 2 });
    const out = await eventNode(emptyState({ plan: { ...plan, intent: "what_if" }, previous: { plan: hurricane(), event: prevEvent, weather: null } }), env);
    expect(out.summary).toContain("previous run");
    expect(llm.calls).toHaveLength(0);
    expect(env.ctx.ledger.tagged("event.title")).toBeDefined();
  });

  it("is unavailable when no event can be identified, and skipped when the plan has none", async () => {
    const env = makeEnv(new FakeLlm(), { query: "hello there", mode: "live", asOf: "2022-02-25T03:00:00.000Z" });
    const base = { ...env.ctx.deps, news: { ...env.ctx.deps.news, search: async () => [] } };
    const out = await eventNode(emptyState({ plan: modelPlan({ source: "live", type: null }) }), { ...env, ctx: { ...env.ctx, deps: base } });
    expect(out).toMatchObject({ status: "degraded", output: { status: "unavailable" } });
    const none = await eventNode(emptyState({ plan: modelPlan({ source: "none" }, { intent: "out_of_scope" }) }), env);
    expect(none.status).toBe("skipped");
  });

  it("ranks live market events by the portfolio value they touch for a news scan", async () => {
    const env = makeEnv(new FakeLlm(), { query: "What is moving our portfolio today?", mode: "live", asOf: "2026-10-03T12:00:00.000Z" });
    const plan = modelPlan({ source: "live", type: null }, { intent: "news_scan" });
    const out = (await eventNode(emptyState({ plan }), env)) as { output: Extract<EventOutput, { status: "ok" }> };
    expect(out.output.profile.source).toBe("live");
    expect(out.output.others.length).toBeLessThanOrEqual(2);
    expect(out.output.others.length).toBe(2);
  });
});

describe("weather node", () => {
  const run = async (plan: Plan, asOf = IDA_ASOF, query = "q", replayEventId: string | null = "disaster-hurricane-ida-2021") => {
    const env = makeEnv(new FakeLlm(), { query, asOf, replayEventId, mode: "replay" });
    const event = (await eventNode(emptyState({ plan }), env)) as { output: EventOutput };
    const out = await weatherNode(emptyState({ plan, eventOut: event.output }), env);
    return { out, weather: out.output as WeatherOutput, env };
  };

  it("is skipped for a non-weather event", async () => {
    const env = makeEnv(new FakeLlm());
    const out = await weatherNode(emptyState({ plan: modelPlan() }), env);
    expect(out.status).toBe("skipped");
  });

  it("reports the replay storm, its landfall and the capacity at risk", async () => {
    const { weather } = await run(hurricane());
    expect(weather).toMatchObject({ status: "ok", forecastLabel: "perfect_forecast_replay", storm: { name: "Ida" }, peakCategory: 4, currentCategory: 1, landfallRegion: "LA_SOUTHEAST" });
    if (weather.status !== "ok") return;
    expect(weather.landfallAt).toBe("2021-08-29T17:00:00.000Z");
    expect(weather.refineriesAtRisk).toBe(weather.atRisk.length);
    expect(weather.atRisk.every((r) => r.distanceKm <= 100)).toBe(true);
    expect(weather.companyCapAtRisk.VLO).toBeGreaterThan(0);
    expect(weather.companyCapAtRisk.VLO).toBeLessThanOrEqual(1);
    expect(weather.features?.capAtRisk).toBe(weather.gulfCapAtRisk);
    expect(weather.features?.windKt).toBe(130);
  });

  it("caps the winds for a category override and records the assumption", async () => {
    const { weather, env } = await run(hurricane({ categoryOverride: 2 }));
    expect(weather).toMatchObject({ status: "ok", peakCategory: 2 });
    expect(env.ctx.ledger.all().find((r) => r.label === "Category assumed in the follow-up")).toMatchObject({ value: 2, basis: "assumption" });
  });

  it("is unavailable, with a reason, when no storm is active at as-of", async () => {
    const { out, weather } = await run(hurricane(), "2022-02-25T03:00:00.000Z", "q", null);
    expect(out.status).toBe("degraded");
    expect(weather).toEqual({ status: "unavailable", reason: "no active Gulf storm at as-of" });
  });

  it("builds a hypothetical track from the plan, and the override replaces its category", async () => {
    const plan = hurricane({ source: "hypothetical", hypotheticalStorm: { category: 4, region: "LA_WEST", hoursToLandfall: 48 } });
    const { weather } = await run(plan, "2026-10-03T12:00:00.000Z", "q", null);
    expect(weather).toMatchObject({ status: "ok", forecastLabel: "hypothetical", peakCategory: 4, landfallRegion: "LA_WEST" });
    const lower = await run({ ...plan, event: { ...plan.event, categoryOverride: 2 } }, "2026-10-03T12:00:00.000Z", "q", null);
    expect(lower.weather).toMatchObject({ peakCategory: 2 });
  });
});

describe("analogs node", () => {
  const withEvent = async (asOf: string, replayEventId: string | null) => {
    const env = makeEnv(new FakeLlm(), { asOf, replayEventId, mode: "replay" });
    const event = (await eventNode(emptyState({ plan: modelPlan() }), env)) as { output: EventOutput };
    return { env, state: emptyState({ plan: modelPlan(), eventOut: event.output }) };
  };

  it("never uses an event whose window is not fully realized before as-of (no look-ahead)", async () => {
    const asOf = "2019-12-01T00:00:00.000Z";
    const { env, state } = await withEvent(asOf, "geopolitical-russia-ukraine-2022");
    const out = await analogsNode(state, env);
    const forecast = (out.output as { forecast: { analogs: { eventId: string }[]; effectiveN: number } }).forecast;
    expect(forecast.analogs.length).toBeGreaterThan(0);
    const ids = forecast.analogs.map((a) => a.eventId);
    // Fake events realized on or after 2019-12-01 must be absent.
    for (const later of ["geopolitical-fake-b", "geopolitical-fake-d", "supply-fake-a", "disaster-fake-d", "disaster-fake-e", "accident-fake-a"]) expect(ids).not.toContain(later);
  });

  it("is unavailable when no event is fully realized yet, and when there is no event profile", async () => {
    const early = await withEvent("2017-01-01T00:00:00.000Z", null);
    expect(await analogsNode(early.state, early.env)).toMatchObject({ status: "degraded", output: { status: "unavailable" } });
    const none = await analogsNode(emptyState({ plan: modelPlan() }), makeEnv(new FakeLlm()));
    expect(none).toMatchObject({ status: "degraded", output: { reason: "no event profile to match against" } });
  });

  it("uses the news group only when the event has news features", async () => {
    const { env, state } = await withEvent("2022-02-25T03:00:00.000Z", null);
    const noNews = emptyState({ plan: state.plan, eventOut: state.eventOut?.status === "ok" ? { ...state.eventOut, profile: { ...state.eventOut.profile, volZ: null, toneZ: null, newsBasis: "unavailable" } } : null });
    const out = await analogsNode(noNews, env);
    expect((out.output as { forecast: { groupsUsed: string[]; newsBasis: string } }).forecast).toMatchObject({ newsBasis: "unavailable" });
    expect((out.output as { forecast: { groupsUsed: string[] } }).forecast.groupsUsed).not.toContain("news");
  });
});

describe("risk node", () => {
  it("without an event computes VaR and betas but states no scenario", async () => {
    const env = makeEnv(new FakeLlm(), { asOf: "2022-02-25T03:00:00.000Z" });
    const plan = modelPlan({ source: "none", type: null }, { intent: "portfolio_risk" });
    const out = await riskNode(emptyState({ plan }), env);
    const report = (out.output as { report: { var1d: { var95: number }; scenario: { pnl: number }; channels: unknown[] } }).report;
    expect(report.var1d.var95).toBeGreaterThan(0);
    expect(report.scenario.pnl).toBe(0);
    expect(report.channels).toEqual([]);
    expect(env.ctx.ledger.tagged("risk.scenarioPnl")).toBeUndefined();
    expect(env.ctx.ledger.tagged("risk.var1d")).toBeDefined();
  });

  it("is unavailable when an event is analysed without a forecast", async () => {
    const env = makeEnv(new FakeLlm());
    const out = await riskNode(emptyState({ plan: modelPlan() }), env);
    expect(out).toMatchObject({ status: "degraded", output: { status: "unavailable" } });
  });
});
