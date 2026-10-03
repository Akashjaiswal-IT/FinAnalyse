import { z } from "zod";
import { notImplemented } from "../not-implemented";

/** BullMQ queue names (SPEC 6). No `:` in queue names or job ids (ROADMAP gotcha 13). */
export const QUEUE_NAMES = {
  gdelt: "ingest-gdelt",
  alphavantage: "ingest-alphavantage",
  nhc: "ingest-nhc",
  openmeteo: "ingest-openmeteo",
  fred: "ingest-fred",
  tiingo: "ingest-tiingo",
  enrich: "enrich",
  detect: "detect",
} as const;
export type QueueKey = keyof typeof QUEUE_NAMES;

/** Ingest jobs carry no payload beyond why they were queued. */
export const IngestJob = z.object({ trigger: z.enum(["schedule", "manual"]) });
export type IngestJob = z.infer<typeof IngestJob>;

/** New prefiltered news ids to score (SPEC 5.2). */
export const EnrichJob = z.object({ newsIds: z.array(z.uuid()).max(20) });
export type EnrichJob = z.infer<typeof EnrichJob>;

export const DetectJob = z.object({ trigger: z.enum(["schedule", "manual"]) });
export type DetectJob = z.infer<typeof DetectJob>;

export interface JobPayloads {
  gdelt: IngestJob;
  alphavantage: IngestJob;
  nhc: IngestJob;
  openmeteo: IngestJob;
  fred: IngestJob;
  tiingo: IngestJob;
  enrich: EnrichJob;
  detect: DetectJob;
}

/** Producer: validates the payload and adds one job. Returns the job id. */
export async function enqueue<K extends QueueKey>(queue: K, payload: JobPayloads[K]): Promise<string> {
  return notImplemented(queue, payload);
}
