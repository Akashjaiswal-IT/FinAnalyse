import { db, desc } from "@repo/database";
import { backtests } from "@repo/database/schema";
import { BacktestService, type BacktestRecord, type BacktestStore } from "./index";

/** The `backtests` table on the shared Postgres connection. */
export class PostgresBacktestStore implements BacktestStore {
  constructor(private readonly database: typeof db = db) {}

  async insert(row: { config: unknown; metrics: unknown; predictions: unknown }): Promise<BacktestRecord> {
    const [saved] = await this.database.insert(backtests).values(row).returning();
    if (!saved) throw new Error("the backtests insert returned no row");
    return saved;
  }

  async latest(): Promise<BacktestRecord | null> {
    const [row] = await this.database
      .select()
      .from(backtests)
      .orderBy(desc(backtests.createdAt), desc(backtests.id))
      .limit(1);
    return row ?? null;
  }
}

/** The backtest service on Postgres, for the api process and `pnpm backtest --save`. */
export const createPostgresBacktests = () => new BacktestService(new PostgresBacktestStore());
