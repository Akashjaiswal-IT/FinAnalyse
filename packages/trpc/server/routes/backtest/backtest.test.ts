import type { Backtest } from "@repo/contracts";
import { BacktestService, MemoryBacktestStore } from "@repo/services/backtest";
import { describe, expect, it } from "vitest";
import { generateOpenApiDocument } from "trpc-to-openapi";
import { serverRouter } from "../../index";
import { router, tRPCContext } from "../../trpc";
import { createBacktestRouter } from "./route";

const run = {
  config: { bandwidth: 1, typeWeight: 1.5, targets: ["SPY"] },
  metrics: {
    pooled: { C: { directionalAccuracy: 0.72, mae: 0.03, spearman: 0.49, n: 12, excludedSmallMoves: 1 } },
    "type:macro": { N: { directionalAccuracy: null, mae: null, spearman: null, n: 2, excludedSmallMoves: 1 } },
  },
  predictions: [{ eventId: "e1", eventType: "macro" as const, target: "SPY", model: "C" as const, predicted: null, realized: 0.01 }],
  caveats: ["Small samples."],
};

function caller(service: BacktestService) {
  const testRouter = router({ backtest: createBacktestRouter(async () => service) });
  return tRPCContext.createCallerFactory(testRouter)({ demoToken: undefined });
}

describe("backtest.latest", () => {
  it("is null before any backtest was saved", async () => {
    expect(await caller(new BacktestService(new MemoryBacktestStore())).backtest.latest()).toBeNull();
  });
  it("returns the newest saved backtest in the contract shape", async () => {
    const service = new BacktestService(new MemoryBacktestStore());
    await service.save(run);
    const newest = await service.save({ ...run, config: { ...run.config, bandwidth: 0.75 } });
    const got: Backtest | null = await caller(service).backtest.latest();
    expect(got).toEqual(newest);
    expect(got?.config.bandwidth).toBe(0.75);
    expect(got?.caveats).toEqual(["Small samples."]);
  });
  it("fails loudly on a corrupt stored row instead of returning a partial backtest", async () => {
    const store = new MemoryBacktestStore();
    await store.insert({ config: { bandwidth: 1, typeWeight: 1.5, targets: [] }, metrics: "oops", predictions: [] });
    await expect(caller(new BacktestService(store)).backtest.latest()).rejects.toThrow();
  });
});

describe("OpenAPI", () => {
  const options = { title: "test", version: "1.0.0", baseUrl: "http://localhost:8000/api" };

  it("documents GET /backtest/latest with a nullable Backtest response", () => {
    const doc = generateOpenApiDocument(
      router({ backtest: createBacktestRouter(async () => new BacktestService(new MemoryBacktestStore())) }),
      options,
    );
    const op = doc.paths?.["/backtest/latest"]?.get;
    expect(op?.tags).toEqual(["backtest"]);
    expect(JSON.stringify(op?.responses)).toContain("caveats");
  });
  it("the whole server router still generates an OpenAPI document (the api does this at boot)", () => {
    const doc = generateOpenApiDocument(serverRouter, options);
    expect(Object.keys(doc.paths ?? {})).toContain("/backtest/latest");
    expect(Object.keys(doc.paths ?? {})).toContain("/health");
  });
});
