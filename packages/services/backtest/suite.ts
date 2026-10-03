import { describe, expect, it } from "vitest";
import { BacktestService, type BacktestInput, type BacktestStore } from "./index";

/** A small run in the shape `runBacktest` returns, with nulls and a missing model in it. */
export const sampleRun: BacktestInput = {
  config: { bandwidth: 1, typeWeight: 1.5, targets: ["SPY", "WTI"] },
  metrics: {
    pooled: {
      N: { directionalAccuracy: 0.7272727272727273, mae: 0.033, spearman: 0.17192982456140352, n: 12, excludedSmallMoves: 1 },
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

/**
 * What every `BacktestStore` must do behind `BacktestService`. Run it against the in-memory store and against
 * Postgres. `startsEmpty` is false for a store that may hold rows from elsewhere.
 */
export function backtestServiceSuite(name: string, createStore: () => BacktestStore, options: { startsEmpty: boolean }) {
  describe(`BacktestService on ${name}`, () => {
    it("saves a run and reads it back unchanged, with an id and a time", async () => {
      const service = new BacktestService(createStore());
      const saved = await service.save(sampleRun);
      expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(Number.isNaN(Date.parse(saved.createdAt))).toBe(false);
      expect({ config: saved.config, metrics: saved.metrics, predictions: saved.predictions, caveats: saved.caveats }).toEqual(
        sampleRun,
      );
      expect(await service.latest()).toEqual(saved);
    });

    it("keeps the caveats inside config in the store and not in the returned config", async () => {
      const store = createStore();
      const saved = await new BacktestService(store).save(sampleRun);
      const row = await store.latest();
      expect(row?.id).toBe(saved.id);
      expect((row?.config as { caveats: string[] }).caveats).toEqual(sampleRun.caveats);
      expect(Object.keys(saved.config).sort()).toEqual(["bandwidth", "targets", "typeWeight"]);
    });

    it("latest is the run saved last", async () => {
      const service = new BacktestService(createStore());
      const first = await service.save(sampleRun);
      const second = await service.save({ ...sampleRun, config: { ...sampleRun.config, bandwidth: 0.75 } });
      const latest = await service.latest();
      expect(latest?.id).toBe(second.id);
      expect(latest?.config.bandwidth).toBe(0.75);
      expect(first.id).not.toBe(second.id);
    });

    it("refuses a malformed run and leaves the latest one alone", async () => {
      const service = new BacktestService(createStore());
      const before = await service.save(sampleRun);
      await expect(service.save({ ...sampleRun, caveats: "not a list" } as unknown as BacktestInput)).rejects.toThrow();
      await expect(
        service.save({ ...sampleRun, metrics: { pooled: { N: { n: 1.5 } } } } as unknown as BacktestInput),
      ).rejects.toThrow();
      expect((await service.latest())?.id).toBe(before.id);
    });

    it("does not let a caller change a stored row through the objects it passed in or got back", async () => {
      const service = new BacktestService(createStore());
      const input = structuredClone(sampleRun);
      const saved = await service.save(input);
      input.caveats.push("changed after saving");
      saved.caveats.push("changed after reading");
      expect((await service.latest())?.caveats).toEqual(sampleRun.caveats);
    });

    if (options.startsEmpty) {
      it("latest is null when nothing was saved", async () => {
        expect(await new BacktestService(createStore()).latest()).toBeNull();
      });
    }
  });
}
