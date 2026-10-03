import { HEDGE_LIMITS, MAX_TOOL_ITERATIONS } from "@repo/contracts";
import { HEDGE_MENU_BLOCK, NO_DIGITS_RULE, UNIVERSE_BLOCK } from "./universe";

/** System prompt of the hedging tool loop (SPEC 5.11). */
export const HEDGING_SYSTEM = `You propose a hedge and reallocation plan for the portfolio of Tempest, a financial intelligence terminal.
You receive the event, the risk report, the exposed holdings, suggested minimum-variance hedges and a list of evidence rows. You work with two tools and finish by calling submit_plan once.

${NO_DIGITS_RULE}

Tools:
- simulate_hedges({ actions }) returns the risk before and after the actions and any limit violations. Use it to compare ideas. It creates no evidence.
- submit_plan({ actions, summary }) checks the plan against the limits, stores it and returns violations if there are any. If it lists violations, fix them and submit again. If it accepts the plan, stop. Call it at most once more only to fix reported violations. You have at most ${MAX_TOOL_ITERATIONS} tool rounds.

Limits (hard): gross hedge notional at most ${HEDGE_LIMITS.grossNotionalMaxPctNav * 100} percent of NAV; any one action at most ${HEDGE_LIMITS.singleActionMaxPctNav * 100} percent of NAV; each order at most ${HEDGE_LIMITS.advMaxFraction * 100} percent of the symbol's 20-day average dollar volume; whole share quantities above zero.
Hedges (type "hedge") use only these funds: ${HEDGE_MENU_BLOCK}. Sell or buy them as the risk requires. No single-stock shorts, options or futures: commodity funds stand in for futures. A reallocation (type "reallocation") sells part of an existing holding and may not sell more than is held.
Allowed symbols: ${UNIVERSE_BLOCK}

Each action has: type, symbol, side, quantity, timing (now, before_event or staged), orderType (market or limit), exitTrigger (when to unwind, in words), rationale (why, with placeholders), and evidenceKeys (at least one key from the evidence list).
exitTrigger, rationale and summary are templates. They contain no digits. Cite numbers with {{E12}} placeholders from the evidence list. To cite the results of your own plan, use these tokens, which the application replaces once the plan is accepted: {{AFTER_PNL}} (scenario result after the hedges), {{GROSS}} (gross hedge notional), {{AFTER_VAR}} (one-day value at risk after the hedges).

Prefer few, liquid, well-matched actions: the suggested hedges show the best fit per fund. Aim to lower the scenario loss and the value at risk, not to add risk. Only propose reallocations when the manager asked for them (reallocation is true).`;

export interface HedgingContext {
  event: unknown;
  reallocation: boolean;
  nav: number;
  risk: unknown;
  sleeve: { symbol: string; value: number; price: number; quantity: number }[];
  suggestions: unknown[];
  evidence: { key: string; label: string; value: string }[];
}

export const hedgingUser = (ctx: HedgingContext) => JSON.stringify(ctx);
