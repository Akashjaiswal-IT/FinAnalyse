/**
 * Prints the stored and live events of a run from the api's SSE endpoint.
 *
 *   pnpm tsx scripts/stream-run.ts <runId> [--url=http://localhost:8000] [--from=<seq>] [--drop-after=<n>]
 *
 * --drop-after=n closes the connection after n events and reconnects with lastEventId, to show that a
 * stream resumes where it stopped (SPEC 5.13).
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const runId = args.find((a) => !a.startsWith("--"));
if (!runId) {
  console.error("usage: stream-run.ts <runId> [--url=...] [--from=<seq>] [--drop-after=<n>]");
  process.exit(1);
}
const base = flag("url") ?? process.env.API_URL ?? "http://localhost:8000";
let lastEventId = flag("from") ?? "";
const dropAfter = flag("drop-after") ? Number(flag("drop-after")) : null;

const TERMINAL = new Set(["run.completed", "run.failed"]);

function describe(event: Record<string, unknown>): string {
  const node = typeof event.node === "string" ? ` ${event.node}` : "";
  const detail =
    event.type === "step.completed" ? ` ${event.status} ${event.durationMs}ms: ${event.summary}`
    : event.type === "step.progress" ? ` ${event.message}`
    : event.type === "evidence.added" ? ` +${(event.evidence as unknown[]).length}`
    : event.type === "run.completed" ? ` ${event.status}, confidence ${event.confidence}`
    : event.type === "run.failed" ? ` ${event.error}`
    : "";
  return `${event.type}${node}${detail}`;
}

/** Reads one SSE connection. Returns true when a terminal event was seen. */
async function connect(maxEvents: number | null): Promise<boolean> {
  const input = encodeURIComponent(JSON.stringify({ runId }));
  const url = `${base}/trpc/runs.stream?input=${input}${lastEventId ? `&lastEventId=${lastEventId}` : ""}`;
  const controller = new AbortController();
  const res = await fetch(url, { headers: { accept: "text/event-stream" }, signal: controller.signal });
  if (!res.ok || !res.body) throw new Error(`stream failed: HTTP ${res.status} ${await res.text()}`);
  const decoder = new TextDecoder();
  let buffer = "";
  let seen = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const lines = frame.split("\n");
      const data = lines.find((l) => l.startsWith("data: "))?.slice(6);
      const id = lines.find((l) => l.startsWith("id: "))?.slice(4);
      const eventName = lines.find((l) => l.startsWith("event: "))?.slice(7);
      if (eventName === "return") return true;
      if (!data || !id) continue;
      const event = JSON.parse(data) as Record<string, unknown>;
      lastEventId = id;
      seen += 1;
      console.log(`#${id.padStart(3)} ${describe(event)}`);
      if (TERMINAL.has(event.type as string)) {
        controller.abort();
        return true;
      }
      if (maxEvents !== null && seen >= maxEvents) {
        controller.abort();
        return false;
      }
    }
  }
  return false;
}

async function main() {
  let done = false;
  let firstPass = dropAfter !== null;
  while (!done) {
    done = await connect(firstPass ? dropAfter : null).catch((err) => {
      if (err instanceof Error && err.name === "AbortError") return false;
      throw err;
    });
    if (!done) console.log(`-- reconnecting with lastEventId=${lastEventId}`);
    firstPass = false;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
