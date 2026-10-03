import { DEMO_PORTFOLIO, UNIVERSE } from "../constants";
import type { PortfolioSnapshot, PositionView } from "../schemas";

// Fixture closes (not market data), reused for both fixture runs. Quantities follow SPEC 5.10:
// floor(weight x NAV / close). Symbols that are not held are priced for hedge notionals.
const FIXTURE_CLOSES: Record<string, number> = {
  XOM: 56.5, CVX: 98, VLO: 74, MPC: 56, XLE: 47.5, USO: 49, GLD: 168, NEM: 60,
  AAPL: 148, MSFT: 299, NVDA: 226, TSM: 120, JPM: 160, BAC: 41, XLF: 38, LMT: 355,
  RTX: 85, BA: 216, DAL: 39, WMT: 148, TLT: 149, FXI: 40, SPY: 446,
  CRAK: 30, UNG: 17, ITA: 105, JETS: 24.5,
};
const FIXTURE_CHANGE_1D: Record<string, number> = {
  XOM: -0.004, CVX: -0.002, VLO: 0.006, MPC: 0.004, XLE: -0.001, USO: 0.008, GLD: 0.003, NEM: 0.005,
  AAPL: 0.002, MSFT: 0.001, NVDA: 0.009, TSM: 0.004, JPM: -0.003, BAC: -0.002, XLF: -0.002, LMT: 0.007,
  RTX: 0.004, BA: -0.006, DAL: -0.008, WMT: 0.001, TLT: 0.002, FXI: -0.005, SPY: 0.002,
};

export const FIXTURE_AS_OF = "2021-08-27T21:00:00.000Z";
export const FIXTURE_AS_OF_UKRAINE = "2022-02-25T02:40:00.000Z";
export const FIXTURE_PRICES = FIXTURE_CLOSES;

const nav = DEMO_PORTFOLIO.nav;

export function buildFixturePortfolio(asOf: string): PortfolioSnapshot {
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
  return {
    portfolioId: "00000000-0000-4000-8000-000000000001",
    name: DEMO_PORTFOLIO.name,
    asOf,
    nav,
    cash: nav - holdings.reduce((sum, p) => sum + p.value, 0),
    positions: holdings,
  };
}

export const fixturePortfolio = buildFixturePortfolio(FIXTURE_AS_OF);
export const fixturePortfolioUkraine = buildFixturePortfolio(FIXTURE_AS_OF_UKRAINE);
