import type { Backtest } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { BacktestService, MemoryBacktestStore, toBacktest } from "./index";
import { backtestServiceSuite, sampleRun } from "./suite";

backtestServiceSuite("memory", () => new MemoryBacktestStore(), { startsEmpty: true });

const clock = (...times: string[]) => {
  let i = 0;
  return () => new Date(times[Math.min(i++, times.length - 1)] as string);
};

describe("MemoryBacktestStore", () => {
  it("stamps rows with its clock and returns the newest by time", async () => {
    const service = new BacktestService(new MemoryBacktestStore(clock("2026-10-03T12:00:00.000Z", "2026-10-03T10:00:00.000Z")));
    const later = await service.save(sampleRun);
    await service.save({ ...sampleRun, config: { ...sampleRun.config, bandwidth: 0.75 } }); // stamped earlier
    expect(later.createdAt).toBe("2026-10-03T12:00:00.000Z");
    expect((await service.latest())?.id).toBe(later.id);
  });
  it("resolves rows saved in the same millisecond to the one saved last", async () => {
    const service = new BacktestService(new MemoryBacktestStore(() => new Date("2026-10-03T12:00:00.000Z")));
    await service.save(sampleRun);
    const second = await service.save({ ...sampleRun, config: { ...sampleRun.config, bandwidth: 1.5 } });
    expect((await service.latest())?.id).toBe(second.id);
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
