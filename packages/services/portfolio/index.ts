import { DEMO_PORTFOLIO, type PortfolioSnapshot, type PositionView, type Sector } from "@repo/contracts";
import defaultDb, { and, desc, eq, lte } from "@repo/database";
import { instruments, portfolios, positions, priceBars } from "@repo/database/schema";
import { lastDailyDate } from "../as-of";

type Db = typeof defaultDb;

export class PortfolioError extends Error {}

export class PortfolioService {
  constructor(private readonly db: Db = defaultDb) {}

  /**
   * quantity = floor(target weight x NAV / close at `asOf`); the remainder is cash (SPEC 5.10). The 1-day
   * change is the simple return of adjusted closes between the last two bars available at `asOf`.
   * `portfolioId` null means the demo portfolio. A holding with no price at `asOf` throws.
   */
  async snapshot(portfolioId: string | null, asOf: Date): Promise<PortfolioSnapshot> {
    const [portfolio] = await this.db
      .select()
      .from(portfolios)
      .where(portfolioId ? eq(portfolios.id, portfolioId) : eq(portfolios.name, DEMO_PORTFOLIO.name));
    if (!portfolio) throw new PortfolioError(`portfolio ${portfolioId ?? DEMO_PORTFOLIO.name} not found; run pnpm seed`);

    const held = await this.db
      .select({ symbol: positions.symbol, targetWeight: positions.targetWeight, name: instruments.name, sector: instruments.sector })
      .from(positions)
      .innerJoin(instruments, eq(instruments.symbol, positions.symbol))
      .where(eq(positions.portfolioId, portfolio.id));

    const cutoff = lastDailyDate(asOf);
    const views: PositionView[] = [];
    for (const h of held) {
      const bars = await this.db
        .select({ close: priceBars.close, adjClose: priceBars.adjClose })
        .from(priceBars)
        .where(and(eq(priceBars.symbol, h.symbol), lte(priceBars.date, cutoff)))
        .orderBy(desc(priceBars.date))
        .limit(2);
      const [last, prev] = bars;
      if (!last) throw new PortfolioError(`no price for ${h.symbol} at ${asOf.toISOString()}`);
      const quantity = Math.floor((h.targetWeight * portfolio.nav) / last.close);
      const value = quantity * last.close;
      views.push({
        symbol: h.symbol,
        name: h.name,
        sector: h.sector as Sector | null,
        targetWeight: h.targetWeight,
        quantity,
        price: last.close,
        value,
        weight: value / portfolio.nav,
        change1d: prev ? last.adjClose / prev.adjClose - 1 : null,
      });
    }
    views.sort((a, b) => b.value - a.value);
    const invested = views.reduce((s, p) => s + p.value, 0);
    return {
      portfolioId: portfolio.id,
      name: portfolio.name,
      asOf: asOf.toISOString(),
      nav: portfolio.nav,
      cash: portfolio.nav - invested,
      positions: views,
    };
  }

  /** Symbols held by a portfolio (null: the demo portfolio). */
  async symbols(portfolioId: string | null): Promise<string[]> {
    const rows = await this.db
      .select({ symbol: positions.symbol })
      .from(positions)
      .innerJoin(portfolios, eq(portfolios.id, positions.portfolioId))
      .where(portfolioId ? eq(portfolios.id, portfolioId) : eq(portfolios.name, DEMO_PORTFOLIO.name));
    return rows.map((r) => r.symbol);
  }
}

