import {
  EXTERNAL_PEERS,
  FACTOR_BETA_MIN,
  MIN_FACTOR_R2,
  PEERS,
} from "@repo/contracts";
import type {
  ChannelLink,
  ChannelReason,
  EventProfile,
  ExposureChannel,
  FactorDirection,
  FactorExposure,
  HoldingExposure,
  Sector,
} from "@repo/contracts";

/** The event fields that decide exposure (SPEC 5.14). */
export type ExposureEvent = Pick<EventProfile, "entities" | "externalNames" | "affectedSectors" | "factorDirections">;

export interface ExposureInput {
  /** Held symbols to classify. */
  holdings: readonly string[];
  event: ExposureEvent;
  sectorOf: Readonly<Record<string, Sector | null | undefined>>;
  /** OLS betas of holdings to factors (`risk.factorExposures`). */
  betas: readonly FactorExposure[];
  /** Why an entity is an entity; defaults to `named_in_news`. Use `named_in_plan` for hypothetical events. */
  entityReasons?: Readonly<Record<string, ChannelReason>>;
  /** Defaults to `PEERS` and `EXTERNAL_PEERS` from contracts. */
  peers?: Readonly<Record<string, readonly string[]>>;
  externalPeers?: Readonly<Record<string, readonly string[]>>;
  /** Fills `ChannelLink.evidenceKeys` (the caller owns the ledger). */
  evidenceKeys?: (symbol: string, link: Omit<ChannelLink, "evidenceKeys">) => string[];
}

const CHANNEL_ORDER: readonly ExposureChannel[] = ["direct", "peer", "factor"];

/**
 * Direct, peer and factor channels per holding (SPEC 5.14). Holdings with no channel are left out.
 * Order of the result follows `holdings`.
 *
 * - Direct: the holding is one of the event's entities.
 * - Peer (not for direct holdings): it is a peer of an entity (`peers`), an external name points to it
 *   (`externalPeers`), or its sector is one of the event's affected sectors.
 * - Factor: the event moves a factor up or down and the holding's beta to it is at least `FACTOR_BETA_MIN` in
 *   size with R² of at least `MIN_FACTOR_R2`. `expectedSign` is the sign of beta times the direction when every
 *   factor link agrees, else `unclear`; the size always comes from the forecast, never from here.
 */
export function exposureChannels(input: ExposureInput): HoldingExposure[] {
  const { holdings, event, sectorOf, betas, entityReasons = {} } = input;
  const peers = input.peers ?? PEERS;
  const externalPeers = input.externalPeers ?? EXTERNAL_PEERS;
  const entities = new Set(event.entities);
  const affected = new Set<Sector>(event.affectedSectors);
  const betaOf = new Map(betas.map((b) => [`${b.holding}|${b.factor}`, b] as const));
  const moves = event.factorDirections.filter((f) => f.direction !== "unclear");

  const out: HoldingExposure[] = [];
  for (const symbol of holdings) {
    const links: Omit<ChannelLink, "evidenceKeys">[] = [];
    const isDirect = entities.has(symbol);

    if (isDirect) {
      links.push({ channel: "direct", reason: entityReasons[symbol] ?? "named_in_news", detail: symbol });
    } else {
      for (const entity of event.entities) {
        if ((peers[entity] ?? []).includes(symbol)) {
          links.push({ channel: "peer", reason: "peer_group", detail: entity });
        }
      }
      for (const name of event.externalNames) {
        if ((externalPeers[name] ?? []).includes(symbol)) {
          links.push({ channel: "peer", reason: "external_peer", detail: name });
        }
      }
      const sector = sectorOf[symbol];
      if (sector && affected.has(sector)) {
        links.push({ channel: "peer", reason: "shared_sector", detail: sector });
      }
    }

    const signs: number[] = [];
    const seen = new Set<string>();
    for (const move of moves) {
      if (seen.has(move.factor)) continue;
      seen.add(move.factor);
      const fit = betaOf.get(`${symbol}|${move.factor}`);
      if (!fit || Math.abs(fit.beta) < FACTOR_BETA_MIN || fit.r2 < MIN_FACTOR_R2) continue;
      links.push({ channel: "factor", reason: "factor_beta", detail: move.factor });
      signs.push(Math.sign(fit.beta) * (move.direction === "up" ? 1 : -1));
    }

    if (links.length === 0) continue;
    let expectedSign: FactorDirection = "unclear";
    if (signs.length > 0 && signs.every((s) => s === signs[0])) expectedSign = signs[0] === 1 ? "up" : "down";
    out.push({
      symbol,
      channels: links.map((link) => ({ ...link, evidenceKeys: input.evidenceKeys?.(symbol, link) ?? [] })),
      expectedSign,
    });
  }
  return out;
}

/** The channel that carries a holding's value in per-channel sums: direct, then peer, then factor. */
export function primaryChannel(channels: readonly ChannelLink[]): ExposureChannel {
  for (const channel of CHANNEL_ORDER) {
    if (channels.some((c) => c.channel === channel)) return channel;
  }
  throw new RangeError("a holding needs at least one channel");
}

/** Holdings with at least one channel; the whole portfolio when none has (SPEC 5.11). */
export function exposedSleeve(exposures: readonly HoldingExposure[], holdings: readonly string[]): string[] {
  const exposed = new Set(exposures.map((e) => e.symbol));
  const sleeve = holdings.filter((s) => exposed.has(s));
  return sleeve.length > 0 ? sleeve : [...holdings];
}

/**
 * Exposed value per channel, each holding counted once under its primary channel, as an absolute position value
 * (a short touches the event as much as a long); all three channels listed.
 */
export function exposedValueByChannel(
  exposures: readonly HoldingExposure[],
  values: Readonly<Record<string, number>>,
): { channel: ExposureChannel; value: number }[] {
  const sums = new Map<ExposureChannel, number>(CHANNEL_ORDER.map((c) => [c, 0]));
  for (const e of exposures) {
    const channel = primaryChannel(e.channels);
    sums.set(channel, (sums.get(channel) as number) + Math.abs(values[e.symbol] ?? 0));
  }
  return CHANNEL_ORDER.map((channel) => ({ channel, value: sums.get(channel) as number }));
}

/** `MarketEventView.touchedHoldings`: held symbols with the channels that reach them. */
export function touchedHoldings(
  exposures: readonly HoldingExposure[],
): { symbol: string; channels: ExposureChannel[] }[] {
  return exposures.map((e) => ({
    symbol: e.symbol,
    channels: CHANNEL_ORDER.filter((c) => e.channels.some((l) => l.channel === c)),
  }));
}
