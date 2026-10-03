import { randomUUID } from "node:crypto";
import type { BacktestRecord, BacktestStore } from "./index";

/** In-memory store for tests and for running a backtest without a database. */
export class MemoryBacktestStore implements BacktestStore {
  private readonly rows: BacktestRecord[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async insert(row: { config: unknown; metrics: unknown; predictions: unknown }): Promise<BacktestRecord> {
    const record: BacktestRecord = { id: randomUUID(), createdAt: this.now(), ...structuredClone(row) };
    this.rows.push(record);
    return structuredClone(record);
  }

  /** The newest row; rows saved in the same millisecond resolve to the one saved last. */
  async latest(): Promise<BacktestRecord | null> {
    let newest: BacktestRecord | undefined;
    for (const row of this.rows) {
      if (!newest || row.createdAt.getTime() >= newest.createdAt.getTime()) newest = row;
    }
    return newest ? structuredClone(newest) : null;
  }
}
