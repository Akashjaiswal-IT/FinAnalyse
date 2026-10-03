import type { RunEvent } from "@repo/contracts";
import { fixtureRunForPreset, hasFixtureRun } from "./fixture-data";
import type { RunDriver, RunStartRequest } from "./run-driver";

/**
 * Pause before delivering an event, so the graph animates at a watchable pace (about ten seconds a run).
 * Step durations shown in the UI are the fixture's own `durationMs`; only the playback is compressed.
 */
export function fixtureEventDelayMs(event: RunEvent): number {
  switch (event.type) {
    case "run.started":
      return 0;
    case "step.started":
      return 150;
    case "step.progress":
      return 500;
    case "step.completed":
      return Math.min(1_800, Math.max(200, event.durationMs * 0.3));
    case "step.failed":
      return 300;
    case "evidence.added":
      return 100;
    case "run.completed":
      return 600;
    case "run.failed":
      return 300;
  }
}

function unavailableReason(request: RunStartRequest): string {
  if (request.mode === "live") {
    return "Live runs need the API. Fixture mode only replays recorded runs: switch to Replay.";
  }
  if (request.replayPresetId !== null && !hasFixtureRun(request.replayPresetId)) {
    return "This preset has no recorded fixture run. Pick Russia invades Ukraine or Hurricane Ida.";
  }
  return "A custom as-of has no recorded fixture run. Pick a preset.";
}

/** Plays a recorded run for the selected preset. `speed` above 1 plays faster (tests use a large value). */
export function createFixtureDriver({ speed = 1 }: { speed?: number } = {}): RunDriver {
  return {
    start(request, handlers) {
      const run = request.mode === "replay" ? fixtureRunForPreset(request.replayPresetId) : null;
      if (!run) {
        handlers.onError(unavailableReason(request));
        return () => {};
      }

      handlers.onRunId(run.runId);
      const timers: ReturnType<typeof setTimeout>[] = [];
      let elapsed = 0;
      run.events.forEach((event, index) => {
        elapsed += Math.round(fixtureEventDelayMs(event) / speed);
        timers.push(setTimeout(() => handlers.onEvent(index + 1, event), elapsed));
      });
      timers.push(setTimeout(() => handlers.onDone(), elapsed + 1));
      return () => timers.forEach(clearTimeout);
    },
  };
}
