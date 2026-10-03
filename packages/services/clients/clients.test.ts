import { HUBS } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { fixtureJson, fixtureText } from "../test-fixtures";
import { AvNews, avThrottle, normaliseAvFeed, parseAvTime } from "./alphavantage";
import { EiaSeriesResponse, parseEiaSeries } from "./eia";
import { FredObservations, parseFredObservations } from "./fred";
import {
  formatGdeltDate,
  GdeltArtlist,
  GdeltTimeline,
  normaliseArticles,
  parseGdeltDate,
  parseTimeline,
} from "./gdelt";
import { BadPayloadError, HttpClient } from "./http";
import { parseHurdat2 } from "./hurdat2";
import { MemoryKvStore } from "./kv";
import {
  currentPoint,
  ForecastPointsQuery,
  isAtlantic,
  MapServerLayers,
  NhcCurrentStorms,
  parseForecastPoints,
  resolveValidTime,
} from "./nhc";
import { OpenMeteoForecast, parseHubForecasts } from "./openmeteo";
import { chunk, indexTarget, parseSearch, PineconeClient, type PineconeIndexLike } from "./pinecone";
import { parseTiingoDaily, TiingoDaily } from "./tiingo";

// Parse tests on recorded responses in data/fixtures/ (see its README). No live HTTP.

describe("tiingo", () => {
  it("maps daily rows to price bars with adjClose (synthetic fixture: Tiingo data is never committed)", () => {
    const rows = TiingoDaily.parse(fixtureJson("tiingo-daily-synthetic.json"));
    const bars = parseTiingoDaily("TEST", rows);
    expect(bars).toHaveLength(2);
    expect(bars[1]).toEqual({
      symbol: "TEST",
      date: "2021-08-27",
      open: 100.5,
      high: 103,
      low: 100,
      close: 102,
      adjClose: 51,
      volume: 1100,
    });
  });
});

describe("fred", () => {
  it("skips '.' values", () => {
    const body = FredObservations.parse(fixtureJson("fred-observations-DCOILWTICO.json"));
    const obs = parseFredObservations("DCOILWTICO", body);
    expect(obs).toHaveLength(6);
    expect(obs[0]).toEqual({ seriesId: "DCOILWTICO", date: "2021-08-25", value: 68.54 });
    expect(obs.some((o) => o.date === "2021-12-24")).toBe(false);
  });
});

describe("eia", () => {
  it("parses weekly stocks in date order and filters by start", () => {
    const body = EiaSeriesResponse.parse(fixtureJson("eia-WGTSTUS1.json"));
    const all = parseEiaSeries(body);
    expect(all.map((o) => o.date)).toEqual(["2026-09-04", "2026-09-11", "2026-09-18", "2026-09-25"]);
    expect(all.at(-1)).toEqual({ seriesId: "WGTSTUS1", date: "2026-09-25", value: 204362 });
    expect(parseEiaSeries(body, "2026-09-15")).toHaveLength(2);
  });
});

describe("gdelt", () => {
  it("normalises artlist articles", () => {
    const body = GdeltArtlist.parse(fixtureJson("gdelt-artlist-ida-2021.json"));
    const fetchedAt = new Date("2026-10-03T10:00:00Z");
    const items = normaliseArticles(body.articles ?? [], "disaster", fetchedAt);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatchObject({
      source: "gdelt",
      url: "https://www.wbrz.com/news/ebr-mayor-declares-emergency-for-east-baton-rouge-parish",
      title: "EBR Mayor declares emergency for East Baton Rouge Parish",
      domain: "wbrz.com",
      queryKey: "disaster",
      publishedAt: "2021-08-27T19:45:00.000Z",
      fetchedAt: "2026-10-03T10:00:00.000Z",
      summary: null,
    });
  });

  it("parses timelines", () => {
    const vol = parseTimeline(GdeltTimeline.parse(fixtureJson("gdelt-timelinevol-harvey-2017.json")));
    expect(vol).toHaveLength(17);
    expect(vol[0]).toEqual({ at: "2017-08-20T00:00:00.000Z", value: 0.0481 });
    const tone = parseTimeline(GdeltTimeline.parse(fixtureJson("gdelt-timelinetone-harvey-2017.json")));
    expect(tone).toHaveLength(17);
  });

  it("treats an empty result as no articles", () => {
    expect(GdeltArtlist.parse({}).articles).toBeUndefined();
  });

  it("formats and parses dates", () => {
    expect(formatGdeltDate(new Date("2021-08-25T06:00:00Z"))).toBe("20210825060000");
    expect(parseGdeltDate("20210826T171500Z")).toBe("2021-08-26T17:15:00.000Z");
  });

  it("rejects the plain-text throttle body that arrives with HTTP 200", async () => {
    const text = fixtureText("gdelt-rate-limited.txt");
    const http = new HttpClient({
      fetch: (async () => new Response(text, { status: 200 })) as typeof fetch,
      store: new MemoryKvStore(),
      now: Date.now,
      sleep: async () => {},
      random: () => 0.5,
      disabledSources: [],
      log: () => {},
    });
    await expect(http.request({ source: "gdelt", url: "https://x.test", schema: GdeltArtlist })).rejects.toBeInstanceOf(
      BadPayloadError,
    );
  });
});

describe("alphavantage", () => {
  it("normalises the feed with numeric sentiment and UTC times", () => {
    const body = AvNews.parse(fixtureJson("alphavantage-news-energy.json"));
    const items = normaliseAvFeed(body.feed, "av_topics_energy_transportation", new Date("2026-10-03T10:20:00Z"));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      source: "alphavantage",
      publishedAt: "2026-10-03T09:18:19.000Z",
      sourceSentiment: 0.442495,
      topics: ["energy_transportation"],
      queryKey: "av_topics_energy_transportation",
    });
    expect(items[0]?.tickerSentiment).toMatchObject({ AWK: 0.431676 });
    expect(parseAvTime("20261002T214715")).toBe("2026-10-02T21:47:15.000Z");
  });

  it("detects throttle bodies", () => {
    expect(avThrottle({ Information: "rate limit" })).toBe("rate limit");
    expect(avThrottle({ Note: "slow down" })).toBe("slow down");
    expect(avThrottle(fixtureJson("alphavantage-news-energy.json"))).toBeNull();
  });
});

describe("nhc", () => {
  const storms = NhcCurrentStorms.parse(fixtureJson("nhc-current-storms.json")).activeStorms;

  it("parses active storms and the current position", () => {
    expect(storms.map((s) => `${s.id}:${s.binNumber}`)).toEqual(["ep182026:EP3", "ep152026:CP2"]);
    expect(storms.some(isAtlantic)).toBe(false);
    expect(currentPoint(storms[0]!)).toMatchObject({
      stormId: "EP182026",
      kind: "observed",
      validAt: "2026-10-03T09:00:00.000Z",
      lat: 19.4,
      lon: -111.8,
      windKt: 80,
      pressureMb: 969,
      status: "HU",
    });
  });

  it("finds forecast-point layers by name", () => {
    const layers = MapServerLayers.parse(fixtureJson("nhc-mapserver-layers.json")).layers;
    expect(layers.find((l) => l.name === "AT1 Forecast Points")?.id).toBe(6);
    expect(layers.find((l) => l.name === "EP3 Forecast Points")?.id).toBe(188);
  });

  it("parses forecast points from the geometry, not the rounded attributes", () => {
    const body = ForecastPointsQuery.parse(fixtureJson("nhc-forecast-points-ep3.json"));
    const points = parseForecastPoints("ep182026", body, new Date("2026-10-03T09:00:00Z"));
    expect(points).toHaveLength(9);
    expect(points[0]).toMatchObject({ validAt: "2026-10-03T06:00:00.000Z", lat: 19.4, lon: -111.8, windKt: 80, pressureMb: 969 });
    expect(points[1]).toMatchObject({ validAt: "2026-10-03T18:00:00.000Z", lat: 19.6, lon: -112.4, pressureMb: null });
    expect(points.at(-1)).toMatchObject({ validAt: "2026-10-08T06:00:00.000Z", lat: 22.2, lon: -125, windKt: 55 });
  });

  it("rolls validtime into the next month", () => {
    expect(resolveValidTime("02/0600", new Date("2026-10-30T09:00:00Z")).toISOString()).toBe("2026-11-02T06:00:00.000Z");
    expect(resolveValidTime("01/0000", new Date("2026-12-30T09:00:00Z")).toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("hurdat2", () => {
  it("parses a two-storm sample with landfall records and west longitudes", () => {
    const storms = parseHurdat2(fixtureText("hurdat2-two-storms.txt"));
    expect(storms.map((s) => [s.storm.id, s.storm.name, s.storm.season, s.points.length])).toEqual([
      ["AL092021", "IDA", 2021, 40],
      ["AL102021", "KATE", 2021, 21],
    ]);
    const ida = storms[0]!;
    expect(ida.points[0]).toEqual({
      stormId: "AL092021",
      kind: "observed",
      issuedAt: "2021-08-26T12:00:00.000Z",
      validAt: "2021-08-26T12:00:00.000Z",
      lat: 16.5,
      lon: -78.9,
      windKt: 30,
      pressureMb: 1006,
      status: "TD",
      recordId: null,
    });
    const landfalls = ida.points.filter((p) => p.recordId === "L");
    expect(landfalls).toHaveLength(3);
    expect(landfalls[2]).toMatchObject({ validAt: "2021-08-29T16:55:00.000Z", lat: 29.1, lon: -90.2, windKt: 130 });
  });

  it("drops seasons before fromSeason", () => {
    expect(parseHurdat2(fixtureText("hurdat2-two-storms.txt"), 2022)).toHaveLength(0);
  });
});

describe("openmeteo", () => {
  it("returns one forecast per hub, in HUBS order", () => {
    const body = OpenMeteoForecast.parse(fixtureJson("openmeteo-hubs.json"));
    const hubs = parseHubForecasts(body, new Date("2026-10-03T00:00:00Z"));
    expect(hubs.map((h) => h.hub)).toEqual(HUBS.map((h) => h.name));
    expect(hubs[0]).toMatchObject({ hub: "Corpus Christi", maxGustKmh: 23.8, maxPrecipMm: 0, hoursAhead: 120 });
  });
});

describe("pinecone", () => {
  it("reads a name or a host from PINECONE_INDEX", () => {
    expect(indexTarget("tempest")).toEqual({ name: "tempest" });
    expect(indexTarget("https://market-intelligence-xchodmi.svc.aped-4627-b74a.pinecone.io")).toEqual({
      host: "market-intelligence-xchodmi.svc.aped-4627-b74a.pinecone.io",
    });
  });

  it("upserts in batches of at most 96 with flat metadata", async () => {
    const batches: number[] = [];
    const fake: PineconeIndexLike = {
      upsertRecords: async ({ records }) => {
        batches.push(records.length);
      },
      searchRecords: async () => ({ result: { hits: [] } }),
      describeIndexStats: async () => ({ namespaces: { news: { recordCount: 200 } } }),
    };
    const client = new PineconeClient(fake);
    const records = Array.from({ length: 200 }, (_, i) => ({ id: `n_${i}`, text: "t", metadata: { publishedAt: i } }));
    await client.upsert("news", records);
    expect(batches).toEqual([96, 96, 8]);
    expect(await client.namespaceCounts()).toEqual({ news: 200 });
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("parses search hits", () => {
    expect(
      parseSearch({ result: { hits: [{ _id: "e_x", _score: 0.8, fields: { type: "geopolitical" } }] }, usage: {} }),
    ).toEqual([{ id: "e_x", score: 0.8, fields: { type: "geopolitical" } }]);
  });
});
