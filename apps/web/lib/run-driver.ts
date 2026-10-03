import type { Mode, RunEvent } from "@repo/contracts";

// The one interface behind `useRunStream`. The fixture player implements it today; the tRPC
// `runs.create` + `runs.stream` subscription implements it in Phase 2. Components never see the difference.

export interface RunStartRequest {
  query: string;
  mode: Mode;
  /** ISO time for replay; null in live mode, where the server uses the current time. */
  asOf: string | null;
  replayPresetId: string | null;
  marketEventId?: string;
  threadId?: string;
}

export interface RunDriverHandlers {
  onRunId(runId: string): void;
  /** `seq` is the 1-based position in the run's event log: the tracked id a reconnect resumes from. */
  onEvent(seq: number, event: RunEvent): void;
  onError(message: string): void;
  onDone(): void;
}

export interface RunDriver {
  /** Begins a run and returns a function that stops delivery. A stopped driver never calls a handler again. */
  start(request: RunStartRequest, handlers: RunDriverHandlers): () => void;
}
