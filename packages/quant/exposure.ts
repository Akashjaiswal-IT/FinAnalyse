import type {
  ChannelLink,
  ChannelReason,
  EventProfile,
  ExposureChannel,
  FactorExposure,
  HoldingExposure,
  Sector,
} from "@repo/contracts";
import { notImplemented } from "./not-implemented";

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

/**
 * Direct, peer and factor channels per holding (SPEC 5.14). Holdings with no channel are left out.
 * Order of the result follows `holdings`.
 */
export const exposureChannels: (input: ExposureInput) => HoldingExposure[] = notImplemented("exposureChannels");

/** The channel that carries a holding's value in per-channel sums: direct, then peer, then factor. */
export const primaryChannel: (channels: readonly ChannelLink[]) => ExposureChannel = notImplemented("primaryChannel");

/** Holdings with at least one channel; the whole portfolio when none has (SPEC 5.11). */
export const exposedSleeve: (exposures: readonly HoldingExposure[], holdings: readonly string[]) => string[] =
  notImplemented("exposedSleeve");

/** Exposed value per channel, each holding counted once under its primary channel; all three channels listed. */
export const exposedValueByChannel: (
  exposures: readonly HoldingExposure[],
  values: Readonly<Record<string, number>>,
) => { channel: ExposureChannel; value: number }[] = notImplemented("exposedValueByChannel");

/** `MarketEventView.touchedHoldings`: held symbols with the channels that reach them. */
export const touchedHoldings: (
  exposures: readonly HoldingExposure[],
) => { symbol: string; channels: ExposureChannel[] }[] = notImplemented("touchedHoldings");
