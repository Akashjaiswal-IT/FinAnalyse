import type { Backtest } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { BacktestService, MemoryBacktestStore, toBacktest, type BacktestInput } from "./index";

const run: BacktestInput = {
  config: { bandwidth: 1, typeWeight: 1.5, targets: ["SPY", "WTI"] },
  metrics: {
    pooled: {
      N: { directionalAccuracy: 0.7272727, mae: 0.033, spearman: 0.1719298, n: 12, excludedSmallMoves: 1 },
      C: { directionalAccuracy: null, mae: null, spearman: null, n: 0, excludedSmallMoves: 0 },
    },
    "type:macro": { N: { directionalAccuracy: null, mae: null, spearman: null, n: 2, excludedSmallMoves: 1 } },
  },
  predictions: [
    { eventId: "e1", eventType: "geopolitical", target: "SPY", model: "N", predicted: -0.022, realized: 0.02 },
    { eventId: "e1", eventType: "geopolitical", target: "SPY", model: "W", predicted: null, realized: 0.02 },
  ],
  caveats: ["Small samples.", "Selection bias."],
};

const clock = (...times: string[]) => {
  let i = 0;
  return () => new Date(times[Math.min(i++, times.length - 1)] as string);
};

describe("BacktestService", () => {
  it("saves a run and reads it back unchanged, with its id and time", async () => {
    const service = new BacktestService(new MemoryBacktestStore(clock("2026-10-03T16:40:00.000Z")));
    const saved = await service.save(run);
    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.createdAt).toBe("2026-10-03T16:40:00.000Z");
    expect({ config: saved.config, metrics: saved.metrics, predictions: saved.predictions, caveats: saved.caveats }).toEqual(run);
    expect(await service.latest()).toEqual(saved);
  });
  it("keeps the caveats inside config in the store and not in the returned config", async () => {
    const store = new MemoryBacktestStore();
    const saved = await new BacktestService(store).save(run);
    const row = await store.latest();
    expect((row?.config as { caveats: string[] }).caveats).toEqual(run.caveats);
    expect(Object.keys(saved.config).sort()).toEqual(["bandwidth", "targets", "typeWeight"]);
  });
  it("latest is null when nothing was saved and the newest run when several were", async () => {
    const service = new BacktestService(new MemoryBacktestStore(clock("2026-10-03T10:00:00.000Z", "2026-10-03T12:00:00.000Z")));
    expect(await service.latest()).toBeNull();
    const first = await service.save(run);
    const second = await service.save({ ...run, config: { ...run.config, bandwidth: 0.75 } });
    expect((await service.latest())?.id).toBe(second.id);
    expect((await service.latest())?.config.bandwidth).toBe(0.75);
    expect(first.id).not.toBe(second.id);
  });
  it("refuses to store a malformed run", async () => {
    const store = new MemoryBacktestStore();
    const service = new BacktestService(store);
    await expect(service.save({ ...run, caveats: "not a list" } as unknown as BacktestInput)).rejects.toThrow();
    await expect(
      service.save({ ...run, metrics: { pooled: { N: { n: 1.5 } } } } as unknown as BacktestInput),
    ).rejects.toThrow();
    expect(await store.latest()).toBeNull();
  });
  it("does not let a caller change a stored row through the objects it passed in or got back", async () => {
    const service = new BacktestService(new MemoryBacktestStore());
    const input = structuredClone(run);
    const saved = await service.save(input);
    input.caveats.push("changed after saving");
    saved.caveats.push("changed after reading");
    expect((await service.latest())?.caveats).toEqual(run.caveats);
  });
});

describe("toBacktest", () => {
  const record = {
    id: "0b9e7d6e-6f0a-4d63-9c7b-1c1f8a8f3a11",
    createdAt: new Date("2026-10-03T16:40:00.000Z"),
    config: { bandwidth: 1, typeWeight: 1.5, targets: ["SPY"], caveats: ["x"] },
    metrics: {},
    predictions: [],
  };
  it("maps a row to the contract type", () => {
    const b: Backtest = toBacktest(record);
    expect(b.createdAt).toBe("2026-10-03T16:40:00.000Z");
    expect(b.caveats).toEqual(["x"]);
    expect(b.config).toEqual({ bandwidth: 1, typeWeight: 1.5, targets: ["SPY"] });
  });
  it("treats a row without caveats as having none", () => {
    expect(toBacktest({ ...record, config: { bandwidth: 1, typeWeight: 1.5, targets: [] } }).caveats).toEqual([]);
  });
  it("throws on a corrupt row instead of returning a partial result", () => {
    expect(() => toBacktest({ ...record, metrics: "oops" })).toThrow();
    expect(() => toBacktest({ ...record, config: null })).toThrow();
    expect(() => toBacktest({ ...record, id: "not-a-uuid" })).toThrow();
  });
});
