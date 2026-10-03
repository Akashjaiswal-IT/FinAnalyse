import { z } from "zod";
import { IsoDate } from "@repo/contracts";

/** Last close at or before `asOf` (bar date + 21:00 UTC <= asOf, SPEC 5.1). */
export const CloseAt = z.object({
  symbol: z.string(),
  date: IsoDate,
  close: z.number(),
  adjClose: z.number(),
});
export type CloseAt = z.infer<typeof CloseAt>;

/**
 * Daily log returns of adjusted closes, aligned by inner join on dates (ROADMAP gotcha 14).
 * `returns[i][j]` is the return of `symbols[j]` from `dates[i - 1]` to `dates[i]`.
 */
export const ReturnsMatrix = z.object({
  symbols: z.array(z.string()),
  dates: z.array(IsoDate),
  returns: z.array(z.array(z.number())),
});
export type ReturnsMatrix = z.infer<typeof ReturnsMatrix>;
