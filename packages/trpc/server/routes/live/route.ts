import { setTimeout as sleep } from "node:timers/promises";
import type { LiveEvent } from "@repo/contracts";
import { publicProcedure, router } from "../../trpc";
import { onLiveEvent } from "../../live-bus";

const HEARTBEAT_MS = 5_000;

export const liveRouter = router({
  // Relayed worker events as they arrive, and a heartbeat when the channel is quiet (SPEC 5.13). No resume: the UI
  // refetches its lists on reconnect.
  feed: publicProcedure.subscription(async function* ({ signal }) {
    const queue: LiveEvent[] = [];
    let wake: (() => void) | undefined;
    const off = onLiveEvent((event) => {
      queue.push(event);
      wake?.();
    });
    try {
      while (!signal?.aborted) {
        const next = queue.shift();
        if (next) {
          yield next;
          continue;
        }
        const idle = new AbortController();
        const timer = sleep(HEARTBEAT_MS, undefined, { signal: idle.signal }).then(() => "idle" as const, () => "woken" as const);
        const arrived = new Promise<"woken">((resolve) => {
          wake = () => resolve("woken");
        });
        const outcome = await Promise.race([timer, arrived]);
        idle.abort();
        wake = undefined;
        if (outcome === "idle" && queue.length === 0 && !signal?.aborted) {
          yield { type: "heartbeat", at: new Date().toISOString() } satisfies LiveEvent;
        }
      }
    } finally {
      off();
    }
  }),
});
