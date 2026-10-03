import { PINECONE_UPSERT_BATCH } from "@repo/contracts";
import { Pinecone } from "@pinecone-database/pinecone";
import { z } from "zod";
import { sourceRecorder, type SourceRecorder } from "./redis";

// One integrated-embedding index, `llama-text-embed-v2`, field map { text: "text" } (SPEC 5.4).

export const PINECONE_MODEL = "llama-text-embed-v2";
export const NAMESPACES = { news: "news", events: "events", weather: "weather" } as const;
export type Namespace = (typeof NAMESPACES)[keyof typeof NAMESPACES];

/** Metadata must be flat: strings, numbers, booleans or string lists (ROADMAP gotcha 7). */
export type FlatMetadata = Record<string, string | number | boolean | string[]>;

export interface TextRecord {
  id: string;
  text: string;
  metadata: FlatMetadata;
}

export interface SearchHit {
  id: string;
  score: number;
  fields: Record<string, unknown>;
}

/** The parts of the SDK index this client uses, so tests can pass a fake. */
export interface PineconeIndexLike {
  upsertRecords(options: { records: Record<string, unknown>[]; namespace?: string }): Promise<void>;
  searchRecords(options: {
    query: { topK: number; inputs: { text: string }; filter?: object };
    fields?: string[];
    namespace?: string;
  }): Promise<unknown>;
  describeIndexStats(): Promise<{ namespaces?: Record<string, { recordCount?: number }> }>;
}

/** The `searchRecords` response, validated (shape read from SDK 9.0.0 `SearchRecordsResponse`). */
export const SearchRecordsResponse = z.object({
  result: z.object({
    hits: z.array(z.object({ _id: z.string(), _score: z.number(), fields: z.record(z.string(), z.unknown()) })),
  }),
});

const PineconeEnv = z.object({
  PINECONE_API_KEY: z.string().min(1, "PINECONE_API_KEY is required"),
  PINECONE_INDEX: z.string().min(1).default("tempest"),
});

/** `PINECONE_INDEX` may be an index name or a host (docs/DECISIONS.md, Track A). */
export function indexTarget(value: string): { host: string } | { name: string } {
  return value.includes(".pinecone.io") ? { host: value.replace(/^https?:\/\//, "") } : { name: value };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function parseSearch(body: unknown): SearchHit[] {
  return SearchRecordsResponse.parse(body).result.hits.map((h) => ({ id: h._id, score: h._score, fields: h.fields }));
}

/** Pinecone's SDK reports dropped connections as "Request failed to reach Pinecone"; those are retried. */
const RETRY_DELAYS_MS = [1_000, 3_000] as const;
const isConnectionError = (e: unknown) => e instanceof Error && (e.name === "PineconeConnectionError" || /failed to reach pinecone/i.test(e.message));

async function withRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined || !isConnectionError(error)) throw error;
      await sleep(delay);
    }
  }
}

export class PineconeClient {
  constructor(
    private readonly index: PineconeIndexLike,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly record: SourceRecorder = () => undefined,
  ) {}

  private async recorded<T>(fn: () => Promise<T>): Promise<T> {
    const started = Date.now();
    try {
      const result = await withRetry(fn, this.sleep);
      this.record(null, Date.now() - started);
      return result;
    } catch (error) {
      this.record(error, Date.now() - started);
      throw error;
    }
  }

  /** Upserts in batches of at most 96 records (ROADMAP gotcha 7). */
  async upsert(namespace: Namespace, records: readonly TextRecord[]): Promise<number> {
    for (const batch of chunk(records, PINECONE_UPSERT_BATCH)) {
      await this.recorded(() =>
        this.index.upsertRecords({ namespace, records: batch.map((r) => ({ _id: r.id, text: r.text, ...r.metadata })) }),
      );
    }
    return records.length;
  }

  async search(namespace: Namespace, text: string, topK: number, filter?: object, fields?: string[]): Promise<SearchHit[]> {
    const body = await this.recorded(() =>
      this.index.searchRecords({
        namespace,
        query: { topK, inputs: { text }, ...(filter ? { filter } : {}) },
        ...(fields ? { fields } : {}),
      }),
    );
    return parseSearch(body);
  }

  async namespaceCounts(): Promise<Record<string, number>> {
    const stats = await this.index.describeIndexStats();
    return Object.fromEntries(Object.entries(stats.namespaces ?? {}).map(([k, v]) => [k, v.recordCount ?? 0]));
  }
}

let shared: { sdk: Pinecone; client: PineconeClient; target: { host: string } | { name: string } } | null = null;

function connect() {
  if (!shared) {
    const env = PineconeEnv.parse(process.env);
    const sdk = new Pinecone({ apiKey: env.PINECONE_API_KEY });
    const target = indexTarget(env.PINECONE_INDEX);
    shared = { sdk, target, client: new PineconeClient(sdk.index(target) as unknown as PineconeIndexLike, undefined, sourceRecorder("pinecone")) };
  }
  return shared;
}

export function getPinecone(): PineconeClient {
  return connect().client;
}

/**
 * Creates the integrated-embedding index when `PINECONE_INDEX` is a name and the index is missing
 * (SPEC 5.4). A host is used as is.
 */
export async function ensureIndex(): Promise<"exists" | "created" | "host"> {
  const { sdk, target } = connect();
  if ("host" in target) return "host";
  const { indexes = [] } = await sdk.listIndexes();
  if (indexes.some((i) => i.name === target.name)) return "exists";
  await sdk.createIndexForModel({
    name: target.name,
    cloud: "aws",
    region: "us-east-1",
    embed: { model: PINECONE_MODEL, fieldMap: { text: "text" } },
    waitUntilReady: true,
  });
  return "created";
}
