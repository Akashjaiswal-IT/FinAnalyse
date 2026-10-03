import { createTRPCClient, type ServerRouter } from "@repo/trpc/client";
import { env } from "~/env.js";
import { createTRPCSplitLink } from "~/trpc/create-client";
import { createApiDriver, type RunsClient } from "./api-driver";
import { createFixtureDriver } from "./fixture-driver";

// Runs come from the api (`runs.create` + `runs.stream`) unless NEXT_PUBLIC_DATA_SOURCE=fixture, which replays the
// contracts fixtures offline.

export const DATA_SOURCE: "fixture" | "api" = env.NEXT_PUBLIC_DATA_SOURCE === "fixture" ? "fixture" : "api";

// The vanilla client's tracked-subscription types are wider than the driver needs; the driver re-validates
// every event with the contracts schema.
const client = () => createTRPCClient<ServerRouter>({ links: [createTRPCSplitLink()] }) as unknown as RunsClient;

/** Module-level so its identity is stable across renders. */
export const runDriver = DATA_SOURCE === "api" ? createApiDriver(client()) : createFixtureDriver();
