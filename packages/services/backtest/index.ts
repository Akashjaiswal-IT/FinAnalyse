import { Backtest } from "@repo/contracts";

export { MemoryBacktestStore } from "./memory";

/** A backtest to store: the run without the id and time the store assigns. */
export type BacktestInput = Omit<Backtest, "id" | "createdAt">;

/** A stored row, as the `backtests` table holds it (jsonb columns are `unknown` until parsed). */
export interface BacktestRecord {
  id: string;
  createdAt: Date;
  config: unknown;
  metrics: unknown;
  predictions: unknown;
}

/** Storage behind the service: Postgres in the app, memory in tests. */
export interface BacktestStore {
  insert(row: { config: unknown; metrics: unknown; predictions: unknown }): Promise<BacktestRecord>;
  /** The newest row, or null when none was saved. */
  latest(): Promise<BacktestRecord | null>;
}

const BacktestInput = Backtest.omit({ id: true, createdAt: true });

/**
 * The `backtests` table has no column for caveats, so they are kept inside `config` next to the bandwidth, type
 * weight and targets. `toBacktest` takes them back out.
 */
export function toBacktest(record: BacktestRecord): Backtest {
  const { caveats, ...config } = (record.config ?? {}) as Record<string, unknown>;
  return Backtest.parse({
    id: record.id,
    createdAt: record.createdAt.toISOString(),
    config,
    metrics: record.metrics,
    predictions: record.predictions,
    caveats: caveats ?? [],
  });
}

/** Saves and reads backtests (SPEC 9.1, 7: `backtest.latest`). Running one is `@repo/quant`'s job (`runBacktest`). */
export class BacktestService {
  constructor(private readonly store: BacktestStore) {}

  async save(run: BacktestInput): Promise<Backtest> {
    const valid = BacktestInput.parse(run);
    const record = await this.store.insert({
      config: { ...valid.config, caveats: valid.caveats },
      metrics: valid.metrics,
      predictions: valid.predictions,
    });
    return toBacktest(record);
  }

  async latest(): Promise<Backtest | null> {
    const record = await this.store.latest();
    return record ? toBacktest(record) : null;
  }
}
