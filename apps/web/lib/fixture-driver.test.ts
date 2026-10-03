import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@repo/contracts";
import { idaRunEvents, ukraineRunEvents } from "@repo/contracts/fixtures";
import { createFixtureDriver, fixtureEventDelayMs } from "./fixture-driver";
import type { RunDriverHandlers, RunStartRequest } from "./run-driver";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function recorder() {
  const log: { seq: number; event: RunEvent }[] = [];
  const handlers = {
    onRunId: vi.fn(),
    onEvent: vi.fn((seq: number, event: RunEvent) => log.push({ seq, event })),
    onError: vi.fn(),
    onDone: vi.fn(),
  } satisfies RunDriverHandlers;
  return { log, handlers };
}

const replay = (replayPresetId: string | null): RunStartRequest => ({
  query: "q",
  mode: "replay",
  asOf: null,
  replayPresetId,
});

describe("fixture driver", () => {
  it.each([
    ["geopolitical-russia-ukraine-2022", ukraineRunEvents],
    ["disaster-hurricane-ida-2021", idaRunEvents],
  ])("plays the recorded run for %s in order, numbers events from 1, then finishes", (preset, events) => {
    const { log, handlers } = recorder();
    createFixtureDriver().start(replay(preset), handlers);
    expect(handlers.onRunId).toHaveBeenCalledOnce();

    vi.runAllTimers();

    expect(log.map((l) => l.event)).toEqual(events);
    expect(log.map((l) => l.seq)).toEqual(events.map((_, i) => i + 1));
    expect(handlers.onDone).toHaveBeenCalledOnce();
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("delivers events over time, not all at once", () => {
    const { log, handlers } = recorder();
    createFixtureDriver().start(replay("geopolitical-russia-ukraine-2022"), handlers);
    vi.advanceTimersByTime(1);
    expect(log.length).toBe(1);
    expect(log[0]?.event.type).toBe("run.started");
    vi.advanceTimersByTime(60_000);
    expect(log.length).toBe(ukraineRunEvents.length);
  });

  it("stops delivering after it is cancelled", () => {
    const { log, handlers } = recorder();
    const cancel = createFixtureDriver().start(replay("geopolitical-russia-ukraine-2022"), handlers);
    vi.advanceTimersByTime(2_000);
    const seen = log.length;
    expect(seen).toBeGreaterThan(0);
    cancel();
    vi.runAllTimers();
    expect(log.length).toBe(seen);
    expect(handlers.onDone).not.toHaveBeenCalled();
  });

  it("plays faster when asked to", () => {
    const { log, handlers } = recorder();
    createFixtureDriver({ speed: 100 }).start(replay("disaster-hurricane-ida-2021"), handlers);
    vi.advanceTimersByTime(500);
    expect(log.length).toBe(idaRunEvents.length);
  });

  it("explains why it cannot play live mode, a preset without a recording, or a custom as-of", () => {
    const cases: RunStartRequest[] = [
      { query: "q", mode: "live", asOf: null, replayPresetId: null },
      replay("supply-opec-cut-2023"),
      replay(null),
    ];
    for (const request of cases) {
      const { handlers } = recorder();
      createFixtureDriver().start(request, handlers);
      expect(handlers.onError).toHaveBeenCalledOnce();
      expect(handlers.onRunId).not.toHaveBeenCalled();
    }
  });
});

describe("fixtureEventDelayMs", () => {
  it("compresses long steps to a watchable pace and never returns a negative or unbounded delay", () => {
    for (const event of [...ukraineRunEvents, ...idaRunEvents]) {
      const ms = fixtureEventDelayMs(event);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(1_800);
    }
  });
});
