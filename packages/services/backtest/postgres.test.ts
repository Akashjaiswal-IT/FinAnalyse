import { afterAll } from "vitest";
import { db, inArray } from "@repo/database";
import { backtests } from "@repo/database/schema";
import type { BacktestRecord } from "./index";
import { PostgresBacktestStore } from "./postgres";
import { backtestServiceSuite } from "./suite";

// Needs the compose Postgres with migrations applied (`pnpm db:migrate`), as CI does.
const created: string[] = [];

class TrackingStore extends PostgresBacktestStore {
  override async insert(row: { config: unknown; metrics: unknown; predictions: unknown }): Promise<BacktestRecord> {
    const record = await super.insert(row);
    created.push(record.id);
    return record;
  }
}

afterAll(async () => {
  if (created.length > 0) await db.delete(backtests).where(inArray(backtests.id, created));
});

// The table may hold real backtests saved with `pnpm backtest --save`, so "empty" is not assumed.
backtestServiceSuite("Postgres", () => new TrackingStore(), { startsEmpty: false });
