import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@repo/contracts";
import { serverRouter } from "../../index";
import { publishLiveEvent } from "../../live-bus";
import { createCallerFactory } from "../../trpc";

const caller = createCallerFactory(serverRouter)({ demoToken: undefined });

describe("live.feed", () => {
  it("yields relayed events in order and stops listening when the subscription ends", async () => {
    const iterator = (await caller.live.feed())[Symbol.asyncIterator]();
    const first = iterator.next();
    await new Promise((r) => setTimeout(r, 5));
    const a: LiveEvent = { type: "weather.updated", stormIds: ["AL092021"] };
    const b: LiveEvent = { type: "source.status", source: "gdelt", status: "degraded", detail: "slow" };
    publishLiveEvent(a);
    publishLiveEvent(b);
    expect((await first).value).toEqual(a);
    expect((await iterator.next()).value).toEqual(b);
    await iterator.return?.();
    publishLiveEvent(a); // nobody is listening; must not throw
  });

  it("fans one event out to every subscriber", async () => {
    const one = (await caller.live.feed())[Symbol.asyncIterator]();
    const two = (await caller.live.feed())[Symbol.asyncIterator]();
    const p1 = one.next();
    const p2 = two.next();
    await new Promise((r) => setTimeout(r, 5));
    const event: LiveEvent = { type: "prices.updated", symbols: ["SPY"], date: "2026-10-02" };
    publishLiveEvent(event);
    expect((await p1).value).toEqual(event);
    expect((await p2).value).toEqual(event);
    await one.return?.();
    await two.return?.();
  });
});
