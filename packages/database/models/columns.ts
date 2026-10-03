import { sql, type SQL } from "drizzle-orm";
import { timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

// `database` imports no internal package (SPEC 3, rule 4), so the CHECK lists repeat the values of
// `@repo/contracts`. A test in `@repo/services` asserts they match.
export const NEWS_SOURCES = ["gdelt", "alphavantage", "googlenews"] as const;
export const EVENT_TYPES = [
  "geopolitical",
  "policy",
  "macro",
  "statement",
  "accident",
  "disaster",
  "corporate",
  "supply_shock",
] as const;

/** `timestamptz` read and written as a JS `Date`, always UTC (SPEC 6). */
export const tstz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** `CHECK (column IN (...))` from a list of string literals. */
export function inList(column: AnyPgColumn, values: readonly string[]): SQL {
  return sql`${column} in (${sql.join(
    values.map((v) => sql.raw(`'${v.replaceAll("'", "''")}'`)),
    sql`, `,
  )})`;
}
