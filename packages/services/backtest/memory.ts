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

  async latest(): Promise<BacktestRecord | null> {
    const newest = [...this.rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return newest ? structuredClone(newest) : null;
  }
}
