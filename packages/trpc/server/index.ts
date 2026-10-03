import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { liveRouter } from "./routes/live/route";

export const serverRouter = router({
  health: healthRouter,
  live: liveRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
