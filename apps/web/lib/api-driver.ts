import { RunEvent } from "@repo/contracts";
import type { RunDriver } from "./run-driver";

// Phase 2 driver: `runs.create`, then the `runs.stream` subscription. tRPC's SSE link resumes a dropped stream
// from the last tracked id on its own, so a reconnect never replays or skips an event.

interface TrackedEvent {
  id: string;
  data: unknown;
}

export interface RunsClient {
  runs: {
    create: {
      mutate(input: {
        query: string;
        mode: "live" | "replay";
        asOf?: string;
        replayPresetId?: string;
        marketEventId?: string;
        threadId?: string;
      }): Promise<{ runId: string; threadId: string }>;
    };
    stream: {
      subscribe(
        input: { runId: string; lastEventId?: string },
        opts: { onData(value: TrackedEvent): void; onError(err: unknown): void },
      ): { unsubscribe(): void };
    };
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function createApiDriver(client: RunsClient): RunDriver {
  return {
    start(request, handlers) {
      let stopped = false;
      let sub: { unsubscribe(): void } | null = null;
      const stop = () => {
        stopped = true;
        sub?.unsubscribe();
      };
      void (async () => {
        try {
          const { runId } = await client.runs.create.mutate({
            query: request.query,
            mode: request.mode,
            ...(request.mode === "replay" && request.asOf ? { asOf: request.asOf } : {}),
            ...(request.mode === "replay" && request.replayPresetId ? { replayPresetId: request.replayPresetId } : {}),
            ...(request.marketEventId ? { marketEventId: request.marketEventId } : {}),
            ...(request.threadId ? { threadId: request.threadId } : {}),
          });
          if (stopped) return;
          handlers.onRunId(runId);
          sub = client.runs.stream.subscribe(
            { runId },
            {
              onData(value) {
                if (stopped) return;
                const parsed = RunEvent.safeParse(value.data);
                if (!parsed.success) return;
                handlers.onEvent(Number(value.id), parsed.data);
                if (parsed.data.type === "run.completed" || parsed.data.type === "run.failed") {
                  stop();
                  handlers.onDone();
                }
              },
              onError(err) {
                if (!stopped) handlers.onError(message(err));
              },
            },
          );
        } catch (err) {
          if (!stopped) handlers.onError(message(err));
        }
      })();
      return stop;
    },
  };
}
