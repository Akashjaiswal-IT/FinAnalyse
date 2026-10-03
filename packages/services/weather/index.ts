import type { HubForecast, HypotheticalStormParams, Refinery, Storm, StormTrack } from "@repo/contracts";
import type { Maybe } from "../news";
import { notImplemented } from "../not-implemented";

/** Storms, tracks and refineries (SPEC 5.8, 5.12). */
export class WeatherService {
  /** Replay: HURDAT2 storms with an observed point in the 12 hours before `asOf`. Live: NHC active storms. */
  async stormsAt(asOf: Date): Promise<Storm[]> {
    return notImplemented(asOf);
  }

  /**
   * Observed points up to `asOf` plus forecast points: the latest NHC advisory (live), or the next 72 hours
   * of best track labelled `perfect_forecast_replay` (replay). With at-risk refineries.
   */
  async track(stormId: string, asOf: Date): Promise<StormTrack | null> {
    return notImplemented(stormId, asOf);
  }

  /** Straight 6-hourly line from 24.5N 89.0W to the region anchor (SPEC 5.12), labelled `hypothetical`. */
  async hypotheticalTrack(params: HypotheticalStormParams, asOf: Date): Promise<StormTrack> {
    return notImplemented(params, asOf);
  }

  async refineries(): Promise<Refinery[]> {
    return notImplemented();
  }

  /** Live only: maximum gust and precipitation in the next 120 hours at each hub (Open-Meteo). */
  async hubForecasts(): Promise<Maybe<HubForecast[]>> {
    return notImplemented();
  }
}
