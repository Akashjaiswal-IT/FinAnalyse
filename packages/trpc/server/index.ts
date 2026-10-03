import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { liveRouter } from "./routes/live/route";
import { systemRouter } from "./routes/system/route";
import { portfolioRouter } from "./routes/portfolio/route";
import { marketRouter } from "./routes/market/route";
import { newsRouter } from "./routes/news/route";
import { weatherRouter } from "./routes/weather/route";
import { macroRouter } from "./routes/macro/route";
import { analogsRouter } from "./routes/analogs/route";
import { runsRouter } from "./routes/runs/route";
import { backtestRouter } from "./routes/backtest/route";

export const serverRouter = router({
  health: healthRouter,
  live: liveRouter,
  system: systemRouter,
  portfolio: portfolioRouter,
  market: marketRouter,
  news: newsRouter,
  weather: weatherRouter,
  macro: macroRouter,
  analogs: analogsRouter,
  runs: runsRouter,
  backtest: backtestRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
