import { UNIVERSE, type FactorExposure, type Sector } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import {
  exposedSleeve,
  exposedValueByChannel,
  exposureChannels,
  primaryChannel,
  touchedHoldings,
} from "./exposure";

const sectorOf = Object.fromEntries(UNIVERSE.map((u) => [u.symbol, u.sector])) as Record<string, Sector>;

const beta = (holding: string, factor: FactorExposure["factor"], b: number, r2: number): FactorExposure => ({
  holding,
  factor,
  beta: b,
  r2,
});

const HOLDINGS = ["LMT", "RTX", "BA", "XOM", "DAL", "VLO", "NEM", "SPY", "WMT"];
const betas: FactorExposure[] = [
  beta("XOM", "WTI", 0.8, 0.4),
  beta("DAL", "WTI", -0.6, 0.18),
  beta("VLO", "WTI", 0.4, 0.3), // |beta| below 0.5: no link
  beta("NEM", "WTI", 0.7, 0.3),
  beta("NEM", "MARKET", 0.9, 0.4),
  beta("SPY", "MARKET", 1, 1),
  beta("XOM", "MARKET", 0.3, 0.05), // too small
  beta("WMT", "MARKET", 0.8, 0.05), // R² below 0.1: no link
  beta("DAL", "MARKET", 1.1, 0.5),
];

const event = {
  entities: ["LMT"],
  externalNames: ["Airbus"],
  affectedSectors: ["defense" as const],
  factorDirections: [
    { factor: "WTI" as const, direction: "up" as const },
    { factor: "MARKET" as const, direction: "down" as const },
    { factor: "GOLD" as const, direction: "unclear" as const },
  ],
};

describe("exposureChannels", () => {
  const out = exposureChannels({ holdings: HOLDINGS, event, sectorOf, betas });
  const get = (s: string) => out.find((e) => e.symbol === s);

  it("gives an entity the direct channel only (no redundant peer links)", () => {
    expect(get("LMT")?.channels).toEqual([
      { channel: "direct", reason: "named_in_news", detail: "LMT", evidenceKeys: [] },
    ]);
  });
  it("links peers through the peer group and a shared affected sector", () => {
    expect(get("RTX")?.channels.map((c) => [c.channel, c.reason, c.detail])).toEqual([
      ["peer", "peer_group", "LMT"],
      ["peer", "shared_sector", "defense"],
    ]);
  });
  it("links an external competitor name to the holdings it affects", () => {
    expect(get("BA")?.channels.map((c) => [c.channel, c.reason, c.detail])).toEqual([["peer", "external_peer", "Airbus"]]);
  });
  it("adds a factor link when |beta| >= 0.5 and R² >= 0.1, and sets the expected sign", () => {
    expect(get("XOM")?.channels.map((c) => [c.channel, c.detail])).toEqual([["factor", "WTI"]]);
    expect(get("XOM")?.expectedSign).toBe("up");
    expect(get("DAL")?.expectedSign).toBe("down"); // WTI up x beta -0.6 -> down; MARKET down x beta 1.1 -> down
    expect(get("NEM")?.expectedSign).toBe("unclear"); // WTI up x beta 0.7 -> up; MARKET down x beta 0.9 -> down
  });
  it("leaves out holdings with no channel and weak betas", () => {
    expect(get("VLO")).toBeUndefined();
    expect(get("WMT")).toBeUndefined();
  });
  it("ignores factor directions that are unclear", () => {
    expect(out.flatMap((e) => e.channels).some((c) => c.detail === "GOLD")).toBe(false);
  });
  it("follows the order of the holdings", () => {
    expect(out.map((e) => e.symbol)).toEqual(["LMT", "RTX", "BA", "XOM", "DAL", "NEM", "SPY"]);
  });
});

describe("expectedSign", () => {
  const run = (factorDirections: { factor: "WTI" | "MARKET"; direction: "up" | "down" }[], holdingBetas: FactorExposure[]) =>
    exposureChannels({
      holdings: ["X"],
      event: { entities: [], externalNames: [], affectedSectors: [], factorDirections },
      sectorOf: {},
      betas: holdingBetas,
    })[0]?.expectedSign;
  it("is the sign of beta times direction when every factor link agrees", () => {
    expect(run([{ factor: "WTI", direction: "down" }], [beta("X", "WTI", 0.9, 0.5)])).toBe("down");
    expect(run([{ factor: "WTI", direction: "down" }], [beta("X", "WTI", -0.9, 0.5)])).toBe("up");
    expect(
      run(
        [
          { factor: "WTI", direction: "up" },
          { factor: "MARKET", direction: "up" },
        ],
        [beta("X", "WTI", 0.9, 0.5), beta("X", "MARKET", 1, 0.5)],
      ),
    ).toBe("up");
  });
  it("is unclear when factor links disagree", () => {
    expect(
      run(
        [
          { factor: "WTI", direction: "up" },
          { factor: "MARKET", direction: "down" },
        ],
        [beta("X", "WTI", 0.9, 0.5), beta("X", "MARKET", 1, 0.5)],
      ),
    ).toBe("unclear");
  });
});

describe("entity reasons, evidence keys and custom peers", () => {
  it("uses the reason supplied per entity (hypothetical events name entities in the plan)", () => {
    const out = exposureChannels({
      holdings: ["LMT"],
      event: { ...event, factorDirections: [] },
      sectorOf,
      betas: [],
      entityReasons: { LMT: "named_in_plan" },
    });
    expect(out[0]?.channels[0]?.reason).toBe("named_in_plan");
  });
  it("lets the caller attach ledger keys to every link", () => {
    const out = exposureChannels({
      holdings: ["RTX"],
      event: { ...event, factorDirections: [] },
      sectorOf,
      betas: [],
      evidenceKeys: (symbol, l) => [`${symbol}:${l.reason}`],
    });
    expect(out[0]?.channels.map((c) => c.evidenceKeys)).toEqual([["RTX:peer_group"], ["RTX:shared_sector"]]);
  });
  it("accepts injected peer tables", () => {
    const out = exposureChannels({
      holdings: ["B"],
      event: { entities: ["A"], externalNames: ["Z"], affectedSectors: [], factorDirections: [] },
      sectorOf: {},
      betas: [],
      peers: { A: ["B"] },
      externalPeers: { Z: ["B"] },
    });
    expect(out[0]?.channels.map((c) => c.reason)).toEqual(["peer_group", "external_peer"]);
  });
});

describe("primaryChannel, exposedSleeve, exposedValueByChannel, touchedHoldings", () => {
  const exposures = exposureChannels({ holdings: HOLDINGS, event, sectorOf, betas });
  it("prefers direct, then peer, then factor", () => {
    const l = (channel: "direct" | "peer" | "factor") => ({ channel, reason: "named_in_news" as const, detail: "", evidenceKeys: [] });
    expect(primaryChannel([l("factor"), l("peer"), l("direct")])).toBe("direct");
    expect(primaryChannel([l("factor"), l("peer")])).toBe("peer");
    expect(primaryChannel([l("factor")])).toBe("factor");
    expect(() => primaryChannel([])).toThrow(RangeError);
  });
  it("the exposed sleeve is the holdings with a channel, or everything when none has", () => {
    expect(exposedSleeve(exposures, HOLDINGS)).toEqual(["LMT", "RTX", "BA", "XOM", "DAL", "NEM", "SPY"]);
    expect(exposedSleeve([], ["A", "B"])).toEqual(["A", "B"]);
  });
  it("sums absolute position value per primary channel", () => {
    const values = { LMT: 300, RTX: 200, BA: 100, XOM: 600, DAL: -200, NEM: 200, SPY: 1200, VLO: 400 };
    expect(exposedValueByChannel(exposures, values)).toEqual([
      { channel: "direct", value: 300 },
      { channel: "peer", value: 300 }, // RTX + BA
      { channel: "factor", value: 2200 }, // XOM + |DAL| + NEM + SPY; VLO has no channel
    ]);
  });
  it("lists the channels that reach each holding", () => {
    expect(touchedHoldings(exposures).find((t) => t.symbol === "RTX")).toEqual({ symbol: "RTX", channels: ["peer"] });
    expect(touchedHoldings(exposures).find((t) => t.symbol === "NEM")).toEqual({ symbol: "NEM", channels: ["factor"] });
  });
});
