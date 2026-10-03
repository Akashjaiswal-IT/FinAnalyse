import { DEMO_PORTFOLIO, UNIVERSE } from "../../packages/contracts/index";
import { and, db, eq, notInArray, sql } from "../../packages/database/index";
import { instruments, portfolios, positions } from "../../packages/database/schema";
import { log } from "./lib";

/** Step 1: constants (SPEC 11) into `instruments`, `portfolios`, `positions`. */
export async function seedUniverse(): Promise<void> {
  await db
    .insert(instruments)
    .values(
      UNIVERSE.map((u) => ({
        symbol: u.symbol,
        name: u.name,
        assetClass: u.assetClass,
        sector: u.sector,
        tradable: u.tradable,
        source: u.source,
        sourceRef: u.sourceRef,
        proxyFor: u.proxyFor,
      })),
    )
    .onConflictDoUpdate({
      target: instruments.symbol,
      set: {
        name: sql`excluded.name`,
        assetClass: sql`excluded.asset_class`,
        sector: sql`excluded.sector`,
        tradable: sql`excluded.tradable`,
        source: sql`excluded.source`,
        sourceRef: sql`excluded.source_ref`,
        proxyFor: sql`excluded.proxy_for`,
      },
    });

  const [portfolio] = await db
    .insert(portfolios)
    .values({ name: DEMO_PORTFOLIO.name, nav: DEMO_PORTFOLIO.nav })
    .onConflictDoUpdate({ target: portfolios.name, set: { nav: sql`excluded.nav` } })
    .returning({ id: portfolios.id });
  if (!portfolio) throw new Error("demo portfolio upsert returned no row");

  const symbols = DEMO_PORTFOLIO.positions.map((p) => p.symbol);
  await db
    .delete(positions)
    .where(and(eq(positions.portfolioId, portfolio.id), notInArray(positions.symbol, symbols)));
  await db
    .insert(positions)
    .values(DEMO_PORTFOLIO.positions.map((p) => ({ portfolioId: portfolio.id, symbol: p.symbol, targetWeight: p.targetWeight })))
    .onConflictDoUpdate({
      target: [positions.portfolioId, positions.symbol],
      set: { targetWeight: sql`excluded.target_weight` },
    });

  const weight = DEMO_PORTFOLIO.positions.reduce((s, p) => s + p.targetWeight, 0);
  log("universe", `${UNIVERSE.length} instruments; portfolio ${portfolio.id} with ${symbols.length} positions, weights ${weight.toFixed(2)}`);
}
