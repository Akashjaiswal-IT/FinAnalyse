import { randomUUID } from "node:crypto";
import type { Evidence, Run } from "@repo/contracts";
import type { NewThread, RunsRepo, StoredEvent } from "./model";

/** In-process repo. Runs are lost on restart, which is why the api swaps in the Drizzle repo once it exists. */
export class MemoryRunsRepo implements RunsRepo {
  private readonly threads = new Map<string, NewThread>();
  private readonly runs = new Map<string, Run>();
  private readonly events = new Map<string, StoredEvent[]>();
  private readonly evidence = new Map<string, Evidence[]>();

  async createThread(input: NewThread): Promise<string> {
    const id = randomUUID();
    this.threads.set(id, input);
    return id;
  }

  async threadExists(threadId: string): Promise<boolean> {
    return this.threads.has(threadId);
  }

  async insertRun(run: Run): Promise<void> {
    this.runs.set(run.id, run);
  }

  async updateRun(runId: string, patch: Partial<Run>): Promise<void> {
    const run = this.runs.get(runId);
    if (run) this.runs.set(runId, { ...run, ...patch });
  }

  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) ?? null;
  }

  async listRuns({ threadId, limit }: { threadId?: string; limit: number }): Promise<Run[]> {
    return [...this.runs.values()]
      .filter((r) => !threadId || r.threadId === threadId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(0, limit);
  }

  async insertEvent(runId: string, event: StoredEvent): Promise<void> {
    const list = this.events.get(runId) ?? [];
    list.push(event);
    this.events.set(runId, list);
  }

  async eventsAfter(runId: string, seq: number): Promise<StoredEvent[]> {
    return (this.events.get(runId) ?? []).filter((e) => e.seq > seq);
  }

  async maxSeq(runId: string): Promise<number> {
    return (this.events.get(runId) ?? []).reduce((m, e) => Math.max(m, e.seq), 0);
  }

  async insertEvidence(runId: string, rows: Evidence[]): Promise<void> {
    const list = this.evidence.get(runId) ?? [];
    for (const row of rows) if (!list.some((r) => r.key === row.key)) list.push(row);
    this.evidence.set(runId, list);
  }

  async listEvidence(runId: string): Promise<Evidence[]> {
    return [...(this.evidence.get(runId) ?? [])];
  }

  async failRunning(reason: string, finishedAt: string): Promise<string[]> {
    const ids: string[] = [];
    for (const [id, run] of this.runs) {
      if (run.status === "running") {
        this.runs.set(id, { ...run, status: "failed", error: reason, finishedAt });
        ids.push(id);
      }
    }
    return ids;
  }
}
