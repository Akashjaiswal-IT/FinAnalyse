import { FRED_FACTOR_SYMBOLS, MACRO_SERIES, TIINGO_SYMBOLS, UNIVERSE } from "../../packages/contracts/index";
import { db, sql } from "../../packages/database/index";
import { macroObservations, priceBars, type NewPriceBarRow } from "../../packages/database/schema";
import { defaultHttp } from "../../packages/services/clients/default-http";
import { EiaClient } from "../../packages/services/clients/eia";
import { FredClient } from "../../packages/services/clients/fred";
import { parseTiingoDaily, TiingoClient, TiingoDaily } from "../../packages/services/clients/tiingo";
import { cachedJson, chunked, log, type SeedOptions } from "./lib";

export const SEED_START = "2015-01-01";
/** Weekly inventories come from the EIA API; FRED does not carry them (docs/DECISIONS.md). */
export const EIA_SERIES = ["WGTSTUS1", "WCESTUS1"] as const;
/** The 5-year same-week inventory average needs 5 years before the earliest replay (2017). */
export const EIA_START = "2012-01-01";

async function upsertBars(rows: NewPriceBarRow[]): Promise<void> {
  for (const batch of chunked(rows, 2_000)) {
    await db
      .insert(priceBars)
      .values(batch)
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

async function upsertMacro(rows: { seriesId: string; date: string; value: number }[]): Promise<void> {
  for (const batch of chunked(rows, 5_000)) {
    await db
      .insert(macroObservations)
      .values(batch)
      .onConflictDoUpdate({
        target: [macroObservations.seriesId, macroObservations.date],
        set: { value: sql`excluded.value` },
      });
  }
}

/** Step 2: Tiingo bars and FRED factors into `price_bars`; macro series into `macro_observations`. */
export async function seedPrices(options: SeedOptions): Promise<void> {
  const http = defaultHttp();
  const tiingo = new TiingoClient(http);
  const fred = new FredClient(http);
  const eia = new EiaClient(http);

  // Tiingo: 37 requests on a cold cache (limit 50 an hour); the cache is never committed.
  for (const symbol of TIINGO_SYMBOLS) {
    const raw = TiingoDaily.parse(
      await cachedJson(`tiingo/daily/${symbol}.json`, options, () => tiingo.dailyRaw(symbol, SEED_START)),
    );
    const bars = parseTiingoDaily(symbol, raw);
    await upsertBars(bars);
    log("prices", `${symbol}: ${bars.length} bars ${bars[0]?.date} to ${bars.at(-1)?.date}`);
  }

  // FRED factors store the value in every price column (SPEC 6).
  for (const symbol of FRED_FACTOR_SYMBOLS) {
    const seriesId = UNIVERSE.find((u) => u.symbol === symbol)?.sourceRef;
    if (!seriesId) throw new Error(`no FRED series for ${symbol}`);
    const obs = await cachedJson(`fred/${seriesId}.json`, options, () => fred.observations(seriesId, SEED_START));
    await upsertBars(
      obs.map((o) => ({ symbol, date: o.date, open: o.value, high: o.value, low: o.value, close: o.value, adjClose: o.value, volume: null })),
    );
    log("prices", `${symbol} (${seriesId}): ${obs.length} observations to ${obs.at(-1)?.date}`);
  }

  for (const seriesId of MACRO_SERIES) {
    const isEia = (EIA_SERIES as readonly string[]).includes(seriesId);
    const obs = isEia
      ? await cachedJson(`eia/${seriesId}-${EIA_START}.json`, options, () => eia.weekly(seriesId, EIA_START))
      : await cachedJson(`fred/${seriesId}.json`, options, () => fred.observations(seriesId, SEED_START));
    await upsertMacro(obs);
    log("prices", `${seriesId} (${isEia ? "eia" : "fred"}): ${obs.length} observations to ${obs.at(-1)?.date}`);
  }
}
