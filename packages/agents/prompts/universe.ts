import { EVENT_SUBTYPES, EventType, FACTORS, HEDGE_MENU, LANDFALL_REGIONS, UNIVERSE } from "@repo/contracts";

// Blocks that every prompt shares, so the allowed symbols, event types and the no-digits rule are worded once.

export const UNIVERSE_BLOCK = UNIVERSE.filter((u) => u.tradable)
  .map((u) => `${u.symbol} (${u.name}, ${u.sector})`)
  .join("; ");

export const EVENT_TYPES_BLOCK = EventType.options.map((t) => `${t}: ${EVENT_SUBTYPES[t].join(", ")}`).join("\n");

export const FACTORS_BLOCK = Object.keys(FACTORS).join(", ");

export const HEDGE_MENU_BLOCK = HEDGE_MENU.join(", ");

export const REGIONS_BLOCK = Object.keys(LANDFALL_REGIONS).join(", ");

export const NO_DIGITS_RULE =
  "Never write a number in digits anywhere in your output, and never write a ticker or company that is not in the allowed list. " +
  "Every quantity (a price move, a dollar amount, a count, a z-score, a date) is an evidence placeholder such as {{E12}}; the application replaces it with the formatted value. " +
  "Do not write all-capital words other than allowed symbols and the acronyms VIX, NAV, ETF, OPEC and WTI.";
