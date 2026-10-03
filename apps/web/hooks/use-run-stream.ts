"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";
import type { RunEvent } from "@repo/contracts";
import { applyRunEvent, initialRunView, type RunView } from "~/lib/run-state";
import type { RunDriver, RunStartRequest } from "~/lib/run-driver";

export type RunStreamStatus = "idle" | "starting" | "streaming" | "completed" | "failed";

/** A delivered event with its position in the run's log and the time the browser received it. */
export interface StampedEvent {
  seq: number;
  receivedAt: number;
  event: RunEvent;
}

interface StreamState {
  status: RunStreamStatus;
  runId: string | null;
  events: StampedEvent[];
  view: RunView;
  error: string | null;
}

type Action =
  | { type: "start" }
  | { type: "run-id"; runId: string }
  | { type: "event"; stamped: StampedEvent }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "reset" };

const idle = (): StreamState => ({ status: "idle", runId: null, events: [], view: initialRunView(), error: null });

function statusOf(view: RunView): RunStreamStatus {
  switch (view.phase) {
    case "succeeded":
    case "partial":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "streaming";
  }
}

/** A run that is mid-flight when its stream breaks is failed in the view too. A run that never started stays idle. */
function failIfRunning(view: RunView, error: string): RunView {
  return view.phase === "running" ? applyRunEvent(view, { type: "run.failed", error }) : view;
}

function reducer(state: StreamState, action: Action): StreamState {
  switch (action.type) {
    case "start":
      return { ...idle(), status: "starting" };
    case "run-id":
      return { ...state, runId: action.runId };
    case "event": {
      const view = applyRunEvent(state.view, action.stamped.event);
      return { ...state, events: [...state.events, action.stamped], view, status: statusOf(view) };
    }
    case "error":
      return { ...state, status: "failed", error: action.message, view: failIfRunning(state.view, action.message) };
    case "done": {
      // The stream closed. If no terminal event arrived, the run did not finish.
      if (state.status !== "starting" && state.status !== "streaming") return state;
      const error = "The run stream ended before the run finished.";
      return { ...state, status: "failed", error, view: failIfRunning(state.view, error) };
    }
    case "reset":
      return idle();
  }
}

export interface RunStream {
  status: RunStreamStatus;
  runId: string | null;
  /** Every event delivered so far, oldest first. The step log reads this. */
  events: readonly StampedEvent[];
  /** The events folded into what the panels render. */
  view: RunView;
  error: string | null;
  /** True from submit until the run completes or fails. */
  isActive: boolean;
  start: (request: RunStartRequest) => void;
  reset: () => void;
}

/**
 * One hook for every run source. The `driver` is the fixture player today and the tRPC subscription in
 * Phase 2; components only see `view`, `events` and `status`, so they do not change when it is swapped.
 * Pass a stable driver (module-level or memoised).
 */
export function useRunStream(driver: RunDriver): RunStream {
  const [state, dispatch] = useReducer(reducer, undefined, idle);
  const cancelRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);

  // Bumping the generation makes a stopped driver's late callbacks no-ops.
  const stop = useCallback(() => {
    generationRef.current += 1;
    cancelRef.current?.();
    cancelRef.current = null;
  }, []);

  const start = useCallback(
    (request: RunStartRequest) => {
      stop();
      const generation = generationRef.current;
      const current = () => generation === generationRef.current;
      dispatch({ type: "start" });
      cancelRef.current = driver.start(request, {
        onRunId: (runId) => current() && dispatch({ type: "run-id", runId }),
        onEvent: (seq, event) =>
          current() && dispatch({ type: "event", stamped: { seq, event, receivedAt: Date.now() } }),
        onError: (message) => current() && dispatch({ type: "error", message }),
        onDone: () => current() && dispatch({ type: "done" }),
      });
    },
    [driver, stop],
  );

  const reset = useCallback(() => {
    stop();
    dispatch({ type: "reset" });
  }, [stop]);

  useEffect(() => stop, [stop]);

  return {
    status: state.status,
    runId: state.runId,
    events: state.events,
    view: state.view,
    error: state.error ?? state.view.error,
    isActive: state.status === "starting" || state.status === "streaming",
    start,
    reset,
  };
}
