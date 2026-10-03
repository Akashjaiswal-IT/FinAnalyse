import {
  DEMO_PORTFOLIO,
  HYPOTHETICAL_START,
  HYPOTHETICAL_WIND_KT,
  LANDFALL_REGIONS,
  UNIVERSE,
  type AnalogEvent,
  type HypotheticalStormParams,
  type MacroSnapshot,
  type StormPoint,
  type StormTrack,
  type EventType,
  type Reaction,
} from "@repo/contracts";
import {
  FIXTURE_PRICES,
  buildFixturePortfolio,
  fixtureAtRiskRefineries,
  fixtureMarketEvents,
  fixtureNews,
  fixtureNewsUkraine,
  fixtureStorm,
  fixtureStormTrack,
  ukraineNodeOutputs,
  idaNodeOutputs,
} from "@repo/contracts/fixtures";
import type { AgentServices } from "./deps";

// Deterministic stand-ins for the data services, built from the contracts fixtures plus synthetic history.
// They exist so the nodes can be tested, and the graph run offline, before the real services are seeded.
// Nothing here is market data.

export type Scenario = "ukraine" | "ida";

/** Mulberry32: a small seeded generator, so the same symbol always gets the same history. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const normal = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

type Loadings = Partial<Record<"MARKET" | "WTI" | "GOLD" | "RATES" | "USD" | "GAS" | "GASOLINE", number>>;
const SIGMA: Record<keyof Loadings, number> = { MARKET: 0.01, WTI: 0.02, GOLD: 0.008, RATES: 0.006, USD: 0.004, GAS: 0.03, GASOLINE: 0.022 };

/** Factor loadings by symbol: the shape of the history, not an estimate of anything real. */
function loadingsOf(symbol: string): Loadings {
  const sector = UNIVERSE.find((u) => u.symbol === symbol)?.sector;
  switch (symbol) {
    case "SPY": return { MARKET: 1 };
    case "WTI": return { WTI: 1, MARKET: 0.3 };
    case "GULF_GASOLINE": return { GASOLINE: 1, WTI: 0.7 };
    case "HH_NATGAS": return { GAS: 1 };
    case "BRENT": return { WTI: 1 };
    case "GLD": return { GOLD: 1 };
    case "TLT": return { RATES: 1, MARKET: -0.1 };
    case "UUP": return { USD: 1 };
    case "USO": return { WTI: 0.95, MARKET: 0.3 };
    case "UNG": return { GAS: 0.8 };
    case "UGA": return { GASOLINE: 0.8, WTI: 0.4 };
    case "DAL": case "UAL": case "JETS": return { MARKET: 1.2, WTI: -0.45 };
    default:
  }
  switch (sector) {
    case "energy": return { MARKET: 0.8, WTI: 0.55 };
    case "refiner": return { MARKET: 0.9, GASOLINE: 0.4, WTI: 0.2 };
    case "gold": return { MARKET: 0.4, GOLD: 1.1 };
    case "defense": return { MARKET: 0.6 };
    case "tech": case "semis": return { MARKET: 1.3 };
    case "banks": return { MARKET: 1.1, RATES: -0.2 };
    case "china": return { MARKET: 0.9 };
    default: return { MARKET: 0.9 };
  }
}

const DAY = 86_400_000;

function businessDays(asOf: Date, n: number): string[] {
  const out: string[] = [];
  let t = asOf.getTime() - DAY;
  while (out.length < n) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    t -= DAY;
  }
  return out.reverse();
}

const factorSeries = (kind: keyof Loadings, n: number) => {
  const r = prng(hash(kind));
  return Array.from({ length: n }, () => normal(r) * SIGMA[kind]);
};

function returnsFor(symbol: string, n: number): number[] {
  const loads = loadingsOf(symbol);
  const idio = prng(hash(symbol));
  const factors = Object.entries(loads).map(([k, b]) => ({ b: b as number, f: factorSeries(k as keyof Loadings, n) }));
  return Array.from({ length: n }, (_, i) => factors.reduce((s, { b, f }) => s + b * (f[i] as number), 0) + normal(idio) * 0.006);
}

const priceOf = (symbol: string) => FIXTURE_PRICES[symbol] ?? 50;

/** A synthetic historical event whose 5-day reactions follow the same loadings as the history above. */
function synthEvent(id: string, type: EventType, name: string, realizedUntil: string, shock: Loadings, features: Partial<AnalogEvent["features"]>): AnalogEvent {
  const tradable = UNIVERSE.filter((u) => u.sector !== undefined).map((u) => u.symbol);
  const reactions: Record<string, Reaction> = {};
  for (const symbol of tradable) {
    const loads = loadingsOf(symbol);
    const d5 = Object.entries(loads).reduce((s, [k, b]) => s + (b as number) * (shock[k as keyof Loadings] ?? 0), 0);
    reactions[symbol] = { d1: d5 / 3, d5, d20: d5 * 1.5 };
  }
  return {
    id, type, subtype: null, name, stormId: null,
    firstReportAt: `${realizedUntil.slice(0, 4)}-01-05T12:00:00.000Z`,
    featureAt: `${realizedUntil.slice(0, 4)}-01-06T12:00:00.000Z`,
    t0: `${realizedUntil.slice(0, 4)}-01-06`,
    landfallAt: null, region: null, entities: [], affectedSectors: [],
    gdeltQuery: `fake ${id}`,
    features: { volZ: 2, toneZ: -1, vixZ: 0.5, windKt: null, capAtRisk: null, offshoreExposure: null, ...features },
    companyCapAtRisk: null, reactions, realizedUntil, outageDays: null,
    description: `${name} (synthetic test event)`, sources: ["https://example.com/synthetic"],
  };
}

const EVENTS: AnalogEvent[] = [
  synthEvent("geopolitical-fake-a", "geopolitical", "Synthetic regional war", "2019-10-20", { MARKET: -0.02, WTI: 0.08, GOLD: 0.03 }, { volZ: 5, toneZ: -2.5, vixZ: 1.5 }),
  synthEvent("geopolitical-fake-b", "geopolitical", "Synthetic strike on a base", "2020-02-14", { MARKET: -0.01, WTI: 0.04, GOLD: 0.02 }, { volZ: 4, toneZ: -2, vixZ: 1 }),
  synthEvent("geopolitical-fake-c", "geopolitical", "Synthetic sanctions package", "2018-08-30", { MARKET: -0.015, WTI: 0.03, GOLD: 0.015 }, { volZ: 3, toneZ: -1.5, vixZ: 0.8 }),
  synthEvent("geopolitical-fake-d", "geopolitical", "Synthetic blockade", "2021-04-10", { MARKET: -0.02, WTI: 0.06, GOLD: 0.025 }, { volZ: 4.5, toneZ: -2.2, vixZ: 1.2 }),
  synthEvent("geopolitical-fake-e", "geopolitical", "Synthetic coup", "2017-07-20", { MARKET: -0.008, WTI: 0.02, GOLD: 0.01 }, { volZ: 2.5, toneZ: -1.2, vixZ: 0.4 }),
  synthEvent("policy-fake-a", "policy", "Synthetic tariff round", "2019-05-30", { MARKET: -0.03, GOLD: 0.02, USD: 0.01 }, { volZ: 3, toneZ: -1.8, vixZ: 1 }),
  synthEvent("accident-fake-a", "accident", "Synthetic pipeline outage", "2021-05-20", { MARKET: -0.004, GASOLINE: 0.06, WTI: 0.01 }, { volZ: 3.2, toneZ: -1.5, vixZ: -0.2 }),
  synthEvent("supply-fake-a", "supply_shock", "Synthetic production cut", "2020-04-20", { MARKET: 0.004, WTI: 0.07 }, { volZ: 2.5, toneZ: 0.2, vixZ: 0.3 }),
  synthEvent("macro-fake-a", "macro", "Synthetic rate shock", "2018-10-30", { MARKET: -0.04, RATES: -0.03, USD: 0.02 }, { volZ: 3.5, toneZ: -2, vixZ: 2 }),
  synthEvent("corporate-fake-a", "corporate", "Synthetic bank failure", "2019-09-20", { MARKET: -0.025, RATES: 0.02 }, { volZ: 4, toneZ: -2, vixZ: 1.5 }),
  synthEvent("statement-fake-a", "statement", "Synthetic hawkish remarks", "2019-01-30", { MARKET: -0.01, RATES: -0.01 }, { volZ: 1.5, toneZ: -0.5, vixZ: 0.3 }),
  ...(["a", "b", "c", "d", "e"] as const).map((k, i) => ({
    ...synthEvent(`disaster-fake-${k}`, "disaster", `Synthetic hurricane ${k}`, `${2017 + i}-09-20`, { MARKET: -0.004, GASOLINE: 0.05 + i * 0.01, WTI: 0.02, GAS: 0.02 }, {
      volZ: 2 + i * 0.3, toneZ: -1, vixZ: 0, windKt: 90 + i * 8, capAtRisk: 0.2 + i * 0.1, offshoreExposure: 0.3,
    }),
    subtype: "hurricane",
  })),
];

const PRESETS = {
  "geopolitical-russia-ukraine-2022": {
    id: "geopolitical-russia-ukraine-2022", name: "Russia invades Ukraine", type: "geopolitical" as const, subtype: "war",
    firstReportAt: "2022-02-24T03:00:00.000Z", entities: ["LMT", "RTX"], affectedSectors: ["defense" as const, "energy" as const, "airlines" as const],
    gdeltQuery: "(invasion OR war) (Russia OR Ukraine) sourcelang:english", sources: ["https://example.com/synthetic"],
  },
  "disaster-hurricane-ida-2021": {
    id: "disaster-hurricane-ida-2021", name: "Hurricane Ida", type: "disaster" as const, subtype: "hurricane",
    firstReportAt: "2021-08-26T12:00:00.000Z", entities: [], affectedSectors: ["energy" as const, "refiner" as const],
    gdeltQuery: '("Hurricane Ida" OR "Tropical Storm Ida") sourcelang:english', sources: ["https://example.com/synthetic"],
  },
};

const REFINERIES = [
  ...fixtureAtRiskRefineries.map(({ distanceKm: _d, ...r }) => (void _d, r)),
  { id: "fixture-ref-5", name: "Fixture refinery 5", company: "Valero Energy", ticker: "VLO", state: "TX", padd: 3, lat: 27.8, lon: -97.4, capacityBpd: 300_000 },
  { id: "fixture-ref-6", name: "Fixture refinery 6", company: "Marathon Petroleum", ticker: "MPC", state: "TX", padd: 3, lat: 29.7, lon: -95.0, capacityBpd: 400_000 },
  { id: "fixture-ref-7", name: "Fixture refinery 7", company: "Phillips 66", ticker: "PSX", state: "TX", padd: 3, lat: 29.9, lon: -93.9, capacityBpd: 250_000 },
  { id: "fixture-ref-8", name: "Fixture refinery 8", company: "Exxon Mobil", ticker: "XOM", state: "TX", padd: 3, lat: 29.7, lon: -95.0, capacityBpd: 560_000 },
];

function hypotheticalTrack(params: HypotheticalStormParams, asOf: Date): StormTrack {
  const target = LANDFALL_REGIONS[params.region as keyof typeof LANDFALL_REGIONS] ?? LANDFALL_REGIONS.LA_WEST;
  const steps = Math.max(2, Math.round(params.hoursToLandfall / 6));
  const wind = HYPOTHETICAL_WIND_KT[params.category - 1] as number;
  const points: StormPoint[] = Array.from({ length: steps + 2 }, (_, i) => {
    const f = Math.min(i, steps) / steps;
    const last = i === steps + 1;
    return {
      stormId: "HYPOTHETICAL", kind: i === 0 ? "observed" : "forecast",
      issuedAt: asOf.toISOString(), validAt: new Date(asOf.getTime() + i * 6 * 3_600_000).toISOString(),
      lat: HYPOTHETICAL_START.lat + (target.lat - HYPOTHETICAL_START.lat) * f,
      lon: HYPOTHETICAL_START.lon + (target.lon - HYPOTHETICAL_START.lon) * f,
      windKt: last ? Math.round(wind / 2) : wind, pressureMb: null, status: "HU", recordId: i === steps ? "L" : null,
    };
  });
  return { storm: { id: "HYPOTHETICAL", name: "Hypothetical storm", season: asOf.getUTCFullYear(), source: "nhc" }, asOf: asOf.toISOString(), points, forecastLabel: "hypothetical", atRiskRefineries: [] };
}

/** The scenario a time belongs to: August 2021 is Ida, anything else reads as the Ukraine scenario. */
const scenarioAt = (asOf: Date): Scenario => (asOf.getUTCFullYear() === 2021 && asOf.getUTCMonth() === 7 ? "ida" : "ukraine");

const okMacro = (o: typeof idaNodeOutputs.macro | typeof ukraineNodeOutputs.macro): MacroSnapshot => {
  if (o.status !== "ok") throw new Error("fixture macro output is not ok");
  return o.snapshot;
};

/** Services that read the Ukraine or the Ida scenario from the contracts fixtures. Without `scenario` each call
 * picks the scenario from its as-of time, so one instance serves both presets. */
export function fakeServices(scenario?: Scenario): AgentServices {
  const at = (asOf: Date) => scenario ?? scenarioAt(asOf);

  return {
    portfolio: { snapshot: async (_id, asOf) => buildFixturePortfolio(asOf.toISOString()) },

    market: {
      closesAt: async (symbols, asOf) => symbols.map((symbol) => ({ symbol, date: new Date(asOf.getTime() - DAY).toISOString().slice(0, 10), close: priceOf(symbol), adjClose: priceOf(symbol) })),
      returns: async (symbols, lookback, asOf) => {
        const dates = businessDays(asOf, lookback);
        const cols = symbols.map((s) => returnsFor(s, lookback));
        return { symbols: [...symbols], dates, returns: dates.map((_, i) => cols.map((c) => c[i] as number)) };
      },
      adv: async (symbol) => (symbol === "SPY" ? 3e10 : UNIVERSE.find((u) => u.symbol === symbol)?.assetClass === "etf" ? 2e9 : 8e8),
    },

    macro: { snapshot: async (asOf) => okMacro(at(asOf) === "ida" ? idaNodeOutputs.macro : ukraineNodeOutputs.macro) },

    news: {
      search: async (_text, options) => {
        const pool = at(options.asOf) === "ida" ? fixtureNews : fixtureNewsUkraine;
        return pool.filter((n) => Date.parse(n.publishedAt) <= options.asOf.getTime()).map((item, i) => ({ item, score: 0.9 - i * 0.05 }));
      },
      newsFeatures: async (query, windowStart, windowEnd) => ({
        data: { query, windowStart: windowStart.toISOString(), windowEnd: windowEnd.toISOString(), volZ: at(windowEnd) === "ida" ? 2.1 : 6.8, toneZ: at(windowEnd) === "ida" ? -1.4 : -3.1 },
        stale: false,
      }),
      scoreUnscored: async () => [],
    },

    events: {
      buildEventQuery: (profile) => `(${[...profile.entities, ...profile.externalNames, profile.type].join(" OR ")}) sourcelang:english`,
      active: async () => fixtureMarketEvents,
      get: async (id) => {
        const found = fixtureMarketEvents.find((e) => e.id === id);
        return found ? { ...found, topNews: [] } : null;
      },
    },

    weather: {
      stormsAt: async (asOf) => (at(asOf) === "ida" ? [fixtureStorm] : []),
      track: async (stormId) => (stormId === fixtureStorm.id ? fixtureStormTrack : null),
      hypotheticalTrack: async (params, asOf) => hypotheticalTrack(params, asOf),
      refineries: async () => REFINERIES,
      hubForecasts: async () => ({ unavailable: "fixture: replay has no hub forecast" }),
    },

    analogs: {
      list: async (type) => (type ? EVENTS.filter((e) => e.type === type) : EVENTS),
      search: async (_text, options) =>
        EVENTS.filter((e) => Date.parse(e.realizedUntil) < options.asOf.getTime() && (!options.types || options.types.includes(e.type)))
          .map((event, i) => ({ event, similarity: Math.max(0.1, 0.9 - i * 0.04) }))
          .slice(0, options.topK ?? 20),
      presetEvent: async (id) => PRESETS[id as keyof typeof PRESETS] ?? null,
    },
  };
}

export { DEMO_PORTFOLIO };
