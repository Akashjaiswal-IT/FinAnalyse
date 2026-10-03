import { initTRPC } from "@trpc/server";
import { OpenApiMeta } from "trpc-to-openapi";

import { createContext } from "./context";

export const tRPCContext = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createContext>()
  .create({
    sse: {
      // The ping keeps proxies from closing idle streams; the client reconnects with lastEventId.
      ping: { enabled: true, intervalMs: 15_000 },
      client: { reconnectAfterInactivityMs: 30_000 },
    },
  });

export const router = tRPCContext.router;

export const publicProcedure = tRPCContext.procedure;
