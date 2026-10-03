import { and, asc, desc, eq, gt, inArray, max, sql, type db } from "@repo/database";
import { analogEvents, evidence, marketEvents, portfolios, runEvents, runs, threads, type RunRow } from "@repo/database/schema";
import { DEMO_PORTFOLIO, type Evidence, type Run, type RunEvent } from "@repo/contracts";
import { logger } from "@repo/logger";
import type { NewThread, RunsRepo, StoredEvent } from "./model";

type Db = typeof db;

const iso = (d: Date) => d.toISOString();

function toRun(row: RunRow): Run {
  return {
    id: row.id,
    threadId: row.threadId,
    query: row.query,
    mode: row.mode as Run["mode"],
    asOf: iso(row.asOf),
    replayEventId: row.replayEventId,
    marketEventId: row.marketEventId,
    status: row.status as Run["status"],
    plan: row.plan as Run["plan"],
    eventProfile: row.eventProfile as Run["eventProfile"],
    answer: row.answer as Run["answer"],
    hedgePlan: row.hedgePlan as Run["hedgePlan"],
    risk: row.risk as Run["risk"],
    forecast: row.forecast as Run["forecast"],
    verification: row.verification as Run["verification"],
    confidence: row.confidence as Run["confidence"],
    warnings: row.warnings,
    tokensIn: row.tokensIn,
    tokensOut: row.tokensOut,
    costUsd: row.costUsd,
    startedAt: iso(row.startedAt),
    finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
    error: row.error,
  };
}

/** Postgres-backed runs (SPEC 6). Takes the Drizzle handle so importing this file opens no connection. */
export class DrizzleRunsRepo implements RunsRepo {
  constructor(private readonly db: Db) {}

  async createThread(input: NewThread): Promise<string> {
    let portfolioId = input.portfolioId;
    if (!portfolioId) {
      const [demo] = await this.db.select({ id: portfolios.id }).from(portfolios).where(eq(portfolios.name, DEMO_PORTFOLIO.name));
      if (!demo) throw new Error("The demo portfolio is not in the database. Run `pnpm seed`.");
      portfolioId = demo.id;
    }
    const [row] = await this.db.insert(threads).values({ portfolioId, title: input.title }).returning({ id: threads.id });
    return (row as { id: string }).id;
  }

  async threadExists(threadId: string): Promise<boolean> {
    const rows = await this.db.select({ id: threads.id }).from(threads).where(eq(threads.id, threadId));
    return rows.length > 0;
  }

  /** The replay and market-event references are foreign keys. A preset that the seed has not loaded yet is
   * stored as null rather than refusing the run. */
  async insertRun(run: Run): Promise<void> {
    const replayExists = run.replayEventId
      ? (await this.db.select({ id: analogEvents.id }).from(analogEvents).where(eq(analogEvents.id, run.replayEventId))).length > 0
      : false;
    const marketExists = run.marketEventId
      ? (await this.db.select({ id: marketEvents.id }).from(marketEvents).where(eq(marketEvents.id, run.marketEventId))).length > 0
      : false;
    if (run.replayEventId && !replayExists) logger.warn("replay event not in analog_events; storing null", { id: run.replayEventId });
    await this.db.insert(runs).values({
      id: run.id,
      threadId: run.threadId,
      query: run.query,
      mode: run.mode,
      asOf: new Date(run.asOf),
      replayEventId: replayExists ? run.replayEventId : null,
      marketEventId: marketExists ? run.marketEventId : null,
      status: run.status,
      warnings: run.warnings,
      startedAt: new Date(run.startedAt),
    });
  }

  async updateRun(runId: string, patch: Partial<Run>): Promise<void> {
    const { asOf, startedAt, finishedAt, id: _id, ...rest } = patch;
    void _id;
    await this.db
      .update(runs)
      .set({
        ...rest,
        ...(asOf ? { asOf: new Date(asOf) } : {}),
        ...(startedAt ? { startedAt: new Date(startedAt) } : {}),
        ...(finishedAt !== undefined ? { finishedAt: finishedAt ? new Date(finishedAt) : null } : {}),
      })
      .where(eq(runs.id, runId));
  }

  async getRun(runId: string): Promise<Run | null> {
    const [row] = await this.db.select().from(runs).where(eq(runs.id, runId));
    return row ? toRun(row) : null;
  }

  async listRuns({ threadId, limit }: { threadId?: string; limit: number }): Promise<Run[]> {
    const rows = await this.db
      .select()
      .from(runs)
      .where(threadId ? eq(runs.threadId, threadId) : undefined)
      .orderBy(desc(runs.startedAt))
      .limit(limit);
    return rows.map(toRun);
  }

  async insertEvent(runId: string, event: StoredEvent): Promise<void> {
    await this.db.insert(runEvents).values({
      runId,
      seq: event.seq,
      type: event.event.type,
      node: "node" in event.event ? event.event.node : null,
      payload: event.event,
      createdAt: new Date(event.createdAt),
    });
  }

  async eventsAfter(runId: string, seq: number): Promise<StoredEvent[]> {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), gt(runEvents.seq, seq)))
      .orderBy(asc(runEvents.seq));
    return rows.map((r) => ({ seq: r.seq, event: r.payload as RunEvent, createdAt: iso(r.createdAt) }));
  }

  async maxSeq(runId: string): Promise<number> {
    const [row] = await this.db.select({ m: max(runEvents.seq) }).from(runEvents).where(eq(runEvents.runId, runId));
    return row?.m ?? 0;
  }

  async insertEvidence(runId: string, rows: Evidence[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db
      .insert(evidence)
      .values(
        rows.map((e) => ({
          runId,
          key: e.key,
          kind: e.kind,
          label: e.label,
          value: e.value,
          textValue: e.textValue,
          unit: e.unit,
          basis: e.basis,
          source: e.source,
          sourceRef: e.sourceRef,
          asOf: e.asOf ? new Date(e.asOf) : null,
          stale: e.stale,
          producedBy: e.producedBy,
          payload: e.payload,
        })),
      )
      .onConflictDoNothing();
  }

  async listEvidence(runId: string): Promise<Evidence[]> {
    const rows = await this.db
      .select()
      .from(evidence)
      .where(eq(evidence.runId, runId))
      .orderBy(sql`length(${evidence.key})`, evidence.key);
    return rows.map((r) => ({
      key: r.key,
      kind: r.kind as Evidence["kind"],
      label: r.label,
      value: r.value,
      textValue: r.textValue,
      unit: r.unit as Evidence["unit"],
      basis: r.basis as Evidence["basis"],
      source: r.source,
      sourceRef: r.sourceRef,
      asOf: r.asOf ? iso(r.asOf) : null,
      stale: r.stale,
      producedBy: r.producedBy,
      payload: r.payload,
    }));
  }

  async failRunning(reason: string, finishedAt: string, onlyIds?: readonly string[]): Promise<string[]> {
    const rows = await this.db
      .update(runs)
      .set({ status: "failed", error: reason, finishedAt: new Date(finishedAt) })
      .where(and(eq(runs.status, "running"), onlyIds ? inArray(runs.id, [...onlyIds]) : undefined))
      .returning({ id: runs.id });
    return rows.map((r) => r.id);
  }
}
