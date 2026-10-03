import type { Llm } from "@repo/services/llm";
import type { RunsService } from "@repo/services/runs";
import type { AnalogsService } from "@repo/services/analogs";
import type { EventsService } from "@repo/services/events";
import type { MacroService } from "@repo/services/macro";
import type { MarketService } from "@repo/services/market";
import type { NewsService } from "@repo/services/news";
import type { PortfolioService } from "@repo/services/portfolio";
import type { WeatherService } from "@repo/services/weather";

/** The slice of each data service the nodes use. Real services satisfy it; tests pass fakes. */
export interface AgentServices {
  market: Pick<MarketService, "closesAt" | "returns" | "adv">;
  macro: Pick<MacroService, "snapshot">;
  news: Pick<NewsService, "search" | "newsFeatures" | "scoreUnscored">;
  events: Pick<EventsService, "active" | "get" | "buildEventQuery">;
  weather: Pick<WeatherService, "stormsAt" | "track" | "hypotheticalTrack" | "refineries" | "hubForecasts">;
  analogs: Pick<AnalogsService, "search" | "list" | "presetEvent">;
  portfolio: Pick<PortfolioService, "snapshot">;
}

/** Everything a node may touch, passed in so tests can swap each part for a fake. */
export interface AgentDeps extends AgentServices {
  llm: Llm;
  runs: RunsService;
  now: () => Date;
}
