import { Refinery, Storm, StormTrack, WeatherStormsInput, WeatherTrackInput } from "@repo/contracts";
import { WeatherService } from "@repo/services/weather";
import { TRPCError } from "@trpc/server";
import { z, zodUndefinedModel } from "../../schema";
import { publicProcedure, router } from "../../trpc";

// Owner: Track A. Static paths come before the parameterised `/weather/storms/{stormId}` (ROADMAP gotcha 11).
const weather = new WeatherService();

export const weatherRouter = router({
  storms: publicProcedure
    .meta({ openapi: { method: "GET", path: "/weather/storms" } })
    .input(WeatherStormsInput)
    .output(z.array(Storm))
    .query(({ input }) => weather.stormsAt(input.asOf ? new Date(input.asOf) : new Date())),

  refineries: publicProcedure
    .meta({ openapi: { method: "GET", path: "/weather/refineries" } })
    .input(zodUndefinedModel)
    .output(z.array(Refinery))
    .query(() => weather.refineries()),

  track: publicProcedure
    .meta({ openapi: { method: "GET", path: "/weather/storms/{stormId}" } })
    .input(WeatherTrackInput)
    .output(StormTrack)
    .query(async ({ input }) => {
      const track = await weather.track(input.stormId, input.asOf ? new Date(input.asOf) : new Date());
      if (!track) throw new TRPCError({ code: "NOT_FOUND", message: `storm ${input.stormId} not found` });
      return track;
    }),
});
