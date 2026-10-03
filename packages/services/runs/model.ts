import type { Evidence, Run, RunEvent } from "@repo/contracts";

export interface StoredEvent {
  seq: number;
  event: RunEvent;
  createdAt: string;
}

export interface NewThread {
  portfolioId: string | null;
  title: string;
}

/** Storage behind `RunsService`. `MemoryRunsRepo` backs tests and the api until Track A's tables land;
 * `DrizzleRunsRepo` is the persistent one. */
export interface RunsRepo {
  createThread(input: NewThread): Promise<string>;
  threadExists(threadId: string): Promise<boolean>;
  insertRun(run: Run): Promise<void>;
  updateRun(runId: string, patch: Partial<Run>): Promise<void>;
  getRun(runId: string): Promise<Run | null>;
  listRuns(filter: { threadId?: string; limit: number }): Promise<Run[]>;
  insertEvent(runId: string, event: StoredEvent): Promise<void>;
  eventsAfter(runId: string, seq: number): Promise<StoredEvent[]>;
  maxSeq(runId: string): Promise<number>;
  insertEvidence(runId: string, rows: Evidence[]): Promise<void>;
  listEvidence(runId: string): Promise<Evidence[]>;
  /** Marks runs left `running` as failed. Returns their ids. `onlyIds` limits it to those runs (tests). */
  failRunning(reason: string, finishedAt: string, onlyIds?: readonly string[]): Promise<string[]>;
}
