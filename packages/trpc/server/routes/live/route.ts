import { setTimeout as sleep } from "node:timers/promises";
import type { LiveEvent } from "@repo/contracts";
import { publicProcedure, router } from "../../trpc";

const HEARTBEAT_MS = 5_000;

export const liveRouter = router({
  // Stub until the Redis relay lands (Phase 1, Track B): a heartbeat every 5 s.
  feed: publicProcedure.subscription(async function* ({ signal }) {
    while (!signal?.aborted) {
      yield { type: "heartbeat", at: new Date().toISOString() } satisfies LiveEvent;
      await sleep(HEARTBEAT_MS, undefined, { signal }).catch(() => undefined);
    }
  }),
});
