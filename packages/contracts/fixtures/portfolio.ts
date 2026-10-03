import { DEMO_PORTFOLIO, UNIVERSE } from "../constants";
import type { PortfolioSnapshot, PositionView } from "../schemas";

// Fixture closes (not market data). Quantities follow SPEC 5.10: floor(weight x NAV / close).
const FIXTURE_CLOSES: Record<string, number> = {
  XOM: 56.5, CVX: 98, MUR: 28, VLO: 74, MPC: 56, PSX: 82, PBF: 20,
  XLE: 47.5, USO: 49, JETS: 24.5, SPY: 446,
};
const FIXTURE_CHANGE_1D: Record<string, number> = {
  XOM: -0.004, CVX: -0.002, MUR: 0.003, VLO: 0.006, MPC: 0.004, PSX: 0.002, PBF: 0.011,
  XLE: -0.001, USO: 0.008, JETS: -0.006, SPY: 0.002,
};

export const FIXTURE_AS_OF = "2021-08-27T21:00:00.000Z";
export const FIXTURE_PRICES = FIXTURE_CLOSES;

const nav = DEMO_PORTFOLIO.nav;

const holdings: PositionView[] = DEMO_PORTFOLIO.positions.map(({ symbol, targetWeight }) => {
  const u = UNIVERSE.find((x) => x.symbol === symbol);
  const price = FIXTURE_CLOSES[symbol] as number;
  const quantity = Math.floor((targetWeight * nav) / price);
  const value = quantity * price;
  return {
    symbol,
    name: u?.name ?? symbol,
    sector: u?.sector ?? null,
    targetWeight,
    quantity,
    price,
    value,
    weight: value / nav,
    change1d: FIXTURE_CHANGE_1D[symbol] ?? null,
  };
});

export const fixturePortfolio: PortfolioSnapshot = {
  portfolioId: "00000000-0000-4000-8000-000000000001",
  name: DEMO_PORTFOLIO.name,
  asOf: FIXTURE_AS_OF,
  nav,
  cash: nav - holdings.reduce((sum, p) => sum + p.value, 0),
  positions: holdings,
};
