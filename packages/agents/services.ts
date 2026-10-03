import { fakeServices } from "./fakes";
import type { AgentServices } from "./deps";
import { AnalogsService } from "@repo/services/analogs";
import { EventsService } from "@repo/services/events";
import { MacroService } from "@repo/services/macro";
import { MarketService } from "@repo/services/market";
import { NewsService } from "@repo/services/news";
import { PortfolioService } from "@repo/services/portfolio";
import { WeatherService } from "@repo/services/weather";

/** The data services the agent graph reads. `fake` swaps in fixture data, for interface work before the seed. */
export function createServices(fake: boolean): AgentServices {
  if (fake) return fakeServices();
  return {
    market: new MarketService(),
    macro: new MacroService(),
    news: new NewsService(),
    events: new EventsService(),
    weather: new WeatherService(),
    analogs: new AnalogsService(),
    portfolio: new PortfolioService(),
  };
}
