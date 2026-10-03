"use client";

import { useState } from "react";
import { trpc } from "~/trpc/client";

/** Phase 0 probe: shows the SSE stub from live.feed and logs every event to the console. */
export function LiveHeartbeat() {
  const [last, setLast] = useState<string | null>(null);

  const sub = trpc.live.feed.useSubscription(undefined, {
    onData: (event) => {
      console.log("[live.feed]", event);
      if (event.type === "heartbeat") setLast(event.at);
    },
    onError: (err) => console.error("[live.feed] error", err),
  });

  return (
    <p className="font-mono text-sm text-muted-foreground">
      live feed: {sub.status}
      {last ? ` · last heartbeat ${last}` : ""}
    </p>
  );
}
