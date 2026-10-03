import { BAR_AVAILABLE_HOUR_UTC, WEEKLY_SERIES_LAG_DAYS } from "@repo/contracts";

// As-of discipline (SPEC 5.1) as date cut-offs, so reads can filter with `date <= cutoff`.

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** The newest daily bar date usable at `asOf`: a bar dated D is available at D 21:00 UTC. */
export function lastDailyDate(asOf: Date): string {
  const today = isoDate(asOf);
  return asOf.getUTCHours() >= BAR_AVAILABLE_HOUR_UTC ? today : addDays(today, -1);
}

/** The newest weekly observation date usable at `asOf`: a weekly value dated D is available at D + 5 days. */
export function lastWeeklyDate(asOf: Date): string {
  return addDays(isoDate(asOf), -WEEKLY_SERIES_LAG_DAYS);
}

export { addDays, isoDate };
