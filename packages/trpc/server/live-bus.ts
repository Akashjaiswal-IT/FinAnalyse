import { EventEmitter } from "node:events";
import type { LiveEvent } from "@repo/contracts";

// In-process fan-out of the Redis `live` channel (SPEC 5.13): the api subscribes once and publishes here, and
// every `live.feed` subscription listens.
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishLiveEvent(event: LiveEvent): void {
  bus.emit("live", event);
}

/** Returns the function that stops listening. */
export function onLiveEvent(listener: (event: LiveEvent) => void): () => void {
  bus.on("live", listener);
  return () => bus.off("live", listener);
}
