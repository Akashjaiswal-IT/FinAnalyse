import { createFixtureDriver } from "./fixture-driver";

// Phase 1 runs entirely on the contracts fixtures. Phase 2 replaces this module's driver with one that calls
// `runs.create` and subscribes to `runs.stream`; `useRunStream` and every component stay as they are.

export const DATA_SOURCE: "fixture" | "api" = "fixture";

/** Module-level so its identity is stable across renders. */
export const runDriver = createFixtureDriver();
