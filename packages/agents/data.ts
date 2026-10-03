import type { PortfolioSnapshot } from "@repo/contracts";
import type { ReturnsBySymbol } from "@repo/quant";
import type { RunContext } from "./context";

/** One read per run: nodes that need the same data share the promise. A failed read is dropped so the next
 * node can try again. */
export function once<T>(ctx: RunContext, key: string, load: () => Promise<T>): Promise<T> {
  const cached = ctx.memo.get(key) as Promise<T> | undefined;
  if (cached) return cached;
  const pending = load();
  ctx.memo.set(key, pending);
  pending.catch(() => ctx.memo.delete(key));
  return pending;
}

export const loadPortfolio = (ctx: RunContext): Promise<PortfolioSnapshot> =>
  once(ctx, "portfolio", () => ctx.deps.portfolio.snapshot(ctx.portfolioId, new Date(ctx.asOf)));

/** Aligned daily log returns per symbol, oldest first, read once per symbol set. */
export function loadReturns(ctx: RunContext, symbols: readonly string[], lookback: number): Promise<ReturnsBySymbol> {
  const sorted = [...new Set(symbols)].sort();
  return once(ctx, `returns:${lookback}:${sorted.join(",")}`, async () => {
    const m = await ctx.deps.market.returns(sorted, lookback, new Date(ctx.asOf));
    const out: Record<string, number[]> = {};
    m.symbols.forEach((symbol, j) => {
      out[symbol] = m.returns.map((row) => row[j] as number);
    });
    return out;
  });
}

/** Last `n` values of every column. */
export function tail(returns: ReturnsBySymbol, n: number): ReturnsBySymbol {
  return Object.fromEntries(Object.entries(returns).map(([k, v]) => [k, v.slice(-n)]));
}
