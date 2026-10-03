import type { PortfolioSnapshot } from "@repo/contracts";
import { notImplemented } from "../not-implemented";

export class PortfolioService {
  /**
   * quantity = floor(target weight x NAV / close at `asOf`); the remainder is cash (SPEC 5.10).
   * `portfolioId` null means the demo portfolio.
   */
  async snapshot(portfolioId: string | null, asOf: Date): Promise<PortfolioSnapshot> {
    return notImplemented(portfolioId, asOf);
  }
}
