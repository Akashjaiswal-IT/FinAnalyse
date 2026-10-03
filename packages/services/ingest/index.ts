import {
  AV_DAILY_MAX,
  AV_ROTATION,
  ENRICH_BATCH,
  FRED_FACTOR_SYMBOLS,
  MACRO_SERIES,
  NEWS_QUERIES,
  TIINGO_SYMBOLS,
  UNIVERSE,
  type SourceStatus,
} from "@repo/contracts";
import defaultDb, { sql } from "@repo/database";
import { macroObservations, priceBars, stormPoints, storms, type NewPriceBarRow } from "@repo/database/schema";
import { AlphaVantageClient, normaliseAvFeed, rotationQueryKey } from "../clients/alphavantage";
import { defaultHttp } from "../clients/default-http";
import { EiaClient } from "../clients/eia";
import { FredClient } from "../clients/fred";
import { GdeltClient, normaliseArticles } from "../clients/gdelt";
import { NhcClient, currentPoint, isAtlantic, stormFromNhc } from "../clients/nhc";
import { getRedis, takeQuota } from "../clients/redis";
import { TiingoClient } from "../clients/tiingo";
import { NewsService, type NewsItemInput } from "../news";
import { enqueue } from "../queues";
import { SystemService, publishLive } from "../system";
import { WeatherService } from "../weather";

export const INGEST_SOURCES = ["gdelt", "alphavantage", "nhc", "openmeteo", "fred", "tiingo"] as const;
export type IngestSource = (typeof INGEST_SOURCES)[number];

export interface IngestResult {
  source: IngestSource;
  fetched: number;
  inserted: number;
  /** null when the source was skipped (circuit open, quota used up). */
  latencyMs: number | null;
  skipped: string | null;
}

type Db = typeof defaultDb;
const DAY = 86_400_000;
/** Each GDELT pass covers the last 30 minutes; the schedule is every 15, so passes overlap and dedupe by URL. */
const GDELT_TIMESPAN = "30min";
/** Daily refreshes re-read the last 10 days, which also picks up late corrections. */
const REFRESH_DAYS = 10;
const EIA_SERIES = new Set(["WGTSTUS1", "WCESTUS1"]);

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

let gdeltClient: GdeltClient | null = null;

/** One pass of a source: fetch, validate, normalise, de-duplicate, prefilter, persist and index, publish (SPEC 5.2). */
export class IngestService {
  constructor(
    private readonly db: Db = defaultDb,
    private readonly news: NewsService = new NewsService(db),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runSource(name: IngestSource): Promise<IngestResult> {
    switch (name) {
      case "gdelt":
        return this.gdelt();
      case "alphavantage":
        return this.alphavantage();
      case "nhc":
        return this.nhc();
      case "openmeteo":
        return this.openmeteo();
      case "fred":
        return this.fred();
      case "tiingo":
        return this.tiingo();
    }
  }

  async status(): Promise<SourceStatus[]> {
    return new SystemService(this.db).sourceStatus();
  }

  /** Stores a news batch, queues enrichment for the prefiltered items and publishes `news.ingested`. */
  private async storeNews(source: IngestSource, items: NewsItemInput[]): Promise<IngestResult> {
    if (items.length === 0) return { source, fetched: 0, inserted: 0, latencyMs: null, skipped: null };
    const r = await this.news.upsertBatch(items);
    for (let i = 0; i < r.prefiltered.length; i += ENRICH_BATCH) {
      await enqueue("enrich", { newsIds: r.prefiltered.slice(i, i + ENRICH_BATCH) });
    }
    if (r.inserted.length) await publishLive({ type: "news.ingested", items: r.inserted, latencyMs: r.latencyMs });
    return { source, fetched: items.length, inserted: r.inserted.length, latencyMs: r.latencyMs, skipped: r.indexError };
  }

  private async gdelt(): Promise<IngestResult> {
    gdeltClient ??= new GdeltClient(defaultHttp());
    const items: NewsItemInput[] = [];
    const failures: string[] = [];
    for (const [key, query] of Object.entries(NEWS_QUERIES)) {
      try {
        const articles = await gdeltClient.artlist(query, { timespan: GDELT_TIMESPAN });
        items.push(...normaliseArticles(articles, key, this.now()));
      } catch (error) {
        failures.push(`${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (items.length === 0 && failures.length) {
      return { source: "gdelt", fetched: 0, inserted: 0, latencyMs: null, skipped: failures[0] ?? "failed" };
    }
    return this.storeNews("gdelt", items);
  }

  private async alphavantage(): Promise<IngestResult> {
    const redis = getRedis();
    if (!(await takeQuota(redis, "alphavantage", AV_DAILY_MAX, this.now()))) {
      return { source: "alphavantage", fetched: 0, inserted: 0, latencyMs: null, skipped: "daily quota used" };
    }
    const index = (await redis.incr("av:rotation")) % AV_ROTATION.length;
    const entry = AV_ROTATION[index]!;
    const feed = await new AlphaVantageClient(defaultHttp()).news(entry);
    return this.storeNews("alphavantage", normaliseAvFeed(feed, rotationQueryKey(entry), this.now()));
  }

  /** Active Atlantic storms: the current position and the latest forecast points into `storm_points`. */
  private async nhc(): Promise<IngestResult> {
    const client = new NhcClient(defaultHttp());
    const now = this.now();
    const active = (await client.currentStorms()).filter(isAtlantic);
    let points = 0;
    for (const s of active) {
      const storm = stormFromNhc(s, now.getUTCFullYear());
      await this.db
        .insert(storms)
        .values({ id: storm.id, name: storm.name, season: storm.season, source: "nhc" })
        .onConflictDoUpdate({ target: storms.id, set: { name: storm.name } });
      const current = currentPoint(s);
      const forecast = await client.forecastPoints(s).catch(() => []);
      const rows = [...(current ? [current] : []), ...forecast].map((p) => ({
        stormId: p.stormId,
        kind: p.kind,
        issuedAt: new Date(p.issuedAt),
        validAt: new Date(p.validAt),
        lat: p.lat,
        lon: p.lon,
        windKt: p.windKt,
        pressureMb: p.pressureMb,
        status: p.status,
        recordId: p.recordId,
      }));
      if (rows.length) await this.db.insert(stormPoints).values(rows).onConflictDoNothing();
      points += rows.length;
    }
    if (active.length) await publishLive({ type: "weather.updated", stormIds: active.map((s) => stormFromNhc(s, now.getUTCFullYear()).id) });
    return { source: "nhc", fetched: active.length, inserted: points, latencyMs: null, skipped: null };
  }

  /** Warms the hub forecast cache the weather node reads. */
  private async openmeteo(): Promise<IngestResult> {
    const r = await new WeatherService(this.db).hubForecasts(this.now());
    if ("unavailable" in r) return { source: "openmeteo", fetched: 0, inserted: 0, latencyMs: null, skipped: r.unavailable };
    return { source: "openmeteo", fetched: r.data.length, inserted: 0, latencyMs: null, skipped: null };
  }

  /** FRED factors into `price_bars`, FRED and EIA macro series into `macro_observations`, last `REFRESH_DAYS`. */
  private async fred(): Promise<IngestResult> {
    const http = defaultHttp();
    const fred = new FredClient(http);
    const eia = new EiaClient(http);
    const start = isoDate(new Date(this.now().getTime() - REFRESH_DAYS * DAY));
    let fetched = 0;
    for (const symbol of FRED_FACTOR_SYMBOLS) {
      const seriesId = UNIVERSE.find((u) => u.symbol === symbol)?.sourceRef;
      if (!seriesId) continue;
      const obs = await fred.observations(seriesId, start);
      await this.upsertBars(obs.map((o) => ({ symbol, date: o.date, open: o.value, high: o.value, low: o.value, close: o.value, adjClose: o.value, volume: null })));
      fetched += obs.length;
    }
    for (const seriesId of MACRO_SERIES) {
      const obs = EIA_SERIES.has(seriesId) ? await eia.weekly(seriesId, start) : await fred.observations(seriesId, start);
      if (obs.length) {
        await this.db
          .insert(macroObservations)
          .values(obs.map((o) => ({ seriesId, date: o.date, value: o.value })))
          .onConflictDoUpdate({ target: [macroObservations.seriesId, macroObservations.date], set: { value: sql`excluded.value` } });
      }
      fetched += obs.length;
    }
    await publishLive({ type: "prices.updated", symbols: [...FRED_FACTOR_SYMBOLS], date: isoDate(this.now()) });
    return { source: "fred", fetched, inserted: fetched, latencyMs: null, skipped: null };
  }

  /** Daily bars for every Tiingo symbol, last `REFRESH_DAYS` (37 requests, inside the 50-per-hour limit). */
  private async tiingo(): Promise<IngestResult> {
    const tiingo = new TiingoClient(defaultHttp());
    const start = isoDate(new Date(this.now().getTime() - REFRESH_DAYS * DAY));
    let fetched = 0;
    for (const symbol of TIINGO_SYMBOLS) {
      const bars = await tiingo.daily(symbol, start);
      await this.upsertBars(bars.map((b) => ({ ...b, volume: b.volume })));
      fetched += bars.length;
    }
    await publishLive({ type: "prices.updated", symbols: [...TIINGO_SYMBOLS], date: isoDate(this.now()) });
    return { source: "tiingo", fetched, inserted: fetched, latencyMs: null, skipped: null };
  }

  private async upsertBars(rows: NewPriceBarRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insert(priceBars)
      .values(rows)
      .onConflictDoUpdate({
        target: [priceBars.symbol, priceBars.date],
        set: {
          open: sql`excluded.open`,
          high: sql`excluded.high`,
          low: sql`excluded.low`,
          close: sql`excluded.close`,
          adjClose: sql`excluded.adj_close`,
          volume: sql`excluded.volume`,
        },
      });
  }
}
