import {
  COAST_ANCHOR_RADIUS_KM,
  HUB_FORECAST_HOURS,
  OFFSHORE_BOX,
  SAFFIR_SIMPSON_KT,
  UNIVERSE_SYMBOLS,
  type HubForecast,
  type StormPoint,
  type StormTrack,
  type WeatherOutput,
} from "@repo/contracts";
import {
  capacityAtRisk,
  hurricaneShareInBox,
  impactPoints,
  impactSourcePoints,
  maxWindBetween,
  nearestLandfallRegion,
  peakCategory,
  refineriesAtRisk,
  saffirSimpsonCategory,
  findLandfall,
  type TrackPoint,
} from "@repo/quant";
import type { NodeEnv, NodeImpl, NodeOutcome } from "../context";
import { weatherRequired } from "../inputs";
import { finding, writeFindings } from "../notes";
import type { RunStateValue } from "../state";

const HOUR = 3_600_000;
const KMH_TO_KT = 0.539957;

/** The highest wind a storm of this category can have: capped forecasts model "what if it only reaches Category N". */
const categoryCeilingKt = (category: number) => (category >= 5 ? Infinity : (SAFFIR_SIMPSON_KT[category] as number) - 1);

async function chooseStorm(state: RunStateValue, env: NodeEnv): Promise<StormTrack | { reason: string }> {
  const { deps, asOf } = env.ctx;
  const when = new Date(asOf);
  const plan = state.plan;
  if (plan?.event.hypotheticalStorm) {
    const params = { ...plan.event.hypotheticalStorm };
    if (plan.event.categoryOverride) params.category = plan.event.categoryOverride;
    return deps.weather.hypotheticalTrack(params, when);
  }
  const storms = await deps.weather.stormsAt(when);
  if (storms.length === 0) return { reason: "no active Gulf storm at as-of" };
  const hint = [plan?.event.stormId, plan?.event.stormName, state.previous?.weather?.status === "ok" ? state.previous.weather.storm.id : null]
    .filter((h): h is string => Boolean(h))
    .map((h) => h.toLowerCase());
  const title = (state.eventOut?.status === "ok" ? state.eventOut.profile.title : "").toLowerCase();
  const named = storms.find((s) => hint.includes(s.id.toLowerCase()) || hint.includes(s.name.toLowerCase()) || (title && title.includes(s.name.toLowerCase())));
  const pick = named ?? (storms.length === 1 ? storms[0] : undefined);
  if (pick) return (await deps.weather.track(pick.id, when)) ?? { reason: `no track for storm ${pick.name}` };
  // Several candidates and none named: the one with a position inside the Gulf box.
  for (const s of storms) {
    const t = await deps.weather.track(s.id, when);
    if (t?.points.some((p) => p.lat >= 18 && p.lat <= 31 && p.lon >= -98 && p.lon <= -80)) return t;
  }
  return { reason: "no active Gulf storm at as-of" };
}

/** Landfall (SPEC 5.8): replay uses the best-track `L` record; live uses the first forecast point within 50 km of a
 * coast anchor; both fall back to the nearest anchor of the track's closest point. */
function landfallOf(track: StormTrack): { point: StormPoint; region: string; viaRecord: boolean } | null {
  const sorted = [...track.points].sort((a, b) => Date.parse(a.validAt) - Date.parse(b.validAt));
  if (track.forecastLabel === "perfect_forecast_replay" || track.forecastLabel === "hypothetical") {
    const lf = findLandfall(sorted.map((p) => ({ ...p, kind: "observed" as const })));
    if (lf) return { point: lf.point, region: nearestLandfallRegion(lf.point.lat, lf.point.lon).region, viaRecord: lf.method === "hurdat2_record" };
  }
  for (const p of sorted.filter((q) => q.kind === "forecast")) {
    const near = nearestLandfallRegion(p.lat, p.lon);
    if (near.distanceKm <= COAST_ANCHOR_RADIUS_KM) return { point: p, region: near.region, viaRecord: false };
  }
  return null;
}

function applyCeiling(points: readonly TrackPoint[], category: number | null): TrackPoint[] {
  if (!category) return [...points];
  const ceiling = categoryCeilingKt(category);
  return points.map((p) => ({ ...p, windKt: Math.min(p.windKt, ceiling) }));
}

function maxGust(hubs: HubForecast[]): HubForecast | undefined {
  return [...hubs].sort((a, b) => b.maxGustKmh - a.maxGustKmh)[0];
}

export const weatherNode: NodeImpl = async (state, env): Promise<NodeOutcome> => {
  const { ctx } = env;
  if (!weatherRequired(state)) {
    const output: WeatherOutput = { status: "skipped" };
    return { update: { weatherOut: output }, status: "skipped", summary: "Not a weather event.", output };
  }
  const chosen = await chooseStorm(state, env);
  if ("reason" in chosen) {
    const output: WeatherOutput = { status: "unavailable", reason: chosen.reason };
    return { update: { weatherOut: output }, status: "degraded", summary: `Unavailable: ${chosen.reason}`, output };
  }
  const track = chosen;
  const asOf = ctx.asOf;
  const override = state.plan?.event.categoryOverride ?? null;
  const refineries = await ctx.deps.weather.refineries();

  const source = applyCeiling(impactSourcePoints(track.points, asOf), track.forecastLabel === "hypothetical" ? null : override);
  const impact = impactPoints(source);
  const atRisk = refineriesAtRisk(refineries, impact);
  const cap = capacityAtRisk(refineries, atRisk);
  const observed = track.points.filter((p) => p.kind === "observed" && Date.parse(p.validAt) <= Date.parse(asOf));
  const latest = [...observed].sort((a, b) => Date.parse(b.validAt) - Date.parse(a.validAt))[0];
  const currentCategory = latest ? saffirSimpsonCategory(Math.min(latest.windKt, override ? categoryCeilingKt(override) : Infinity)) : 0;
  const peak = peakCategory(source);
  const landfall = landfallOf(track);
  const landfallAt = landfall?.point.validAt ?? null;
  const live = track.forecastLabel === "nhc_forecast" || track.forecastLabel === "persistence_forecast";

  let hubs: HubForecast[] | null = null;
  if (live) {
    const h = await ctx.deps.weather.hubForecasts().catch(() => null);
    if (h && "data" in h) hubs = h.data;
  }

  const features = {
    windKt: landfallAt
      ? maxWindBetween(source, new Date(Date.parse(landfallAt) - 24 * HOUR).toISOString(), landfallAt)
      : null,
    capAtRisk: cap.gulfShare,
    offshoreExposure: hurricaneShareInBox(impact, OFFSHORE_BOX),
  };

  // Evidence (SPEC 5.8 outputs).
  const label = track.forecastLabel;
  const common = { source: track.storm.source === "hurdat2" ? "hurdat2" : "nhc", asOf, sourceRef: track.storm.id } as const;
  const assumed = track.forecastLabel === "hypothetical";
  const keys: string[] = [];
  const add = (input: Omit<Parameters<NodeEnv["evidence"]>[0], "source"> & { source?: string }) => {
    const key = env.evidence({ ...common, ...(assumed ? { source: "user", basis: "assumption" as const } : {}), ...input } as Parameters<NodeEnv["evidence"]>[0]);
    keys.push(key);
    return key;
  };
  const nameKey = add({ kind: "weather", label: "Storm", textValue: track.storm.name, unit: "text", basis: assumed ? "assumption" : "observed" });
  const currentKey = add({ kind: "weather", label: "Current category", value: currentCategory, unit: "category", basis: assumed ? "assumption" : "observed" });
  const peakKey = add({ kind: "weather", label: "Peak forecast category", value: peak, unit: "category", basis: assumed ? "assumption" : "computed" });
  if (override) add({ kind: "assumption", label: "Category assumed in the follow-up", value: override, unit: "category", basis: "assumption", source: "user", sourceRef: "query" });
  const landfallKey = landfallAt ? add({ kind: "weather", label: "Forecast landfall", value: Date.parse(landfallAt), unit: "date", basis: assumed ? "assumption" : "computed", sourceRef: label ?? track.storm.id }) : null;
  const regionKey = landfall ? add({ kind: "weather", label: "Nearest landfall region", textValue: landfall.region.replace("_", " "), unit: "text", basis: "computed", sourceRef: "LANDFALL_REGIONS" }) : null;
  const countKey = add({ kind: "computation", label: "Refineries within the impact radius", value: cap.refineryCount, unit: "count", basis: "computed", sourceRef: "wind of at least 64 kt within 100 km", payload: { refineries: atRisk.map((r) => r.id) } });
  const gulfKey = add({ kind: "computation", label: "Gulf Coast refining capacity at risk", value: cap.gulfShare, unit: "pct", basis: "computed", sourceRef: "at-risk PADD 3 capacity over the PADD 3 total", payload: { atRiskBpd: cap.atRiskBpd, padd3Bpd: cap.padd3Bpd } });
  const companyKeys: [string, string][] = [];
  const universe = new Set<string>(UNIVERSE_SYMBOLS);
  for (const [ticker, share] of Object.entries(cap.company).filter(([t]) => universe.has(t))) {
    companyKeys.push([ticker, add({ kind: "computation", label: `${ticker} capacity at risk`, value: share, unit: "pct", basis: "computed", sourceRef: "at-risk capacity over the company's US capacity" })]);
  }
  if (hubs && hubs.length > 0) {
    const g = maxGust(hubs) as HubForecast;
    add({ kind: "weather", label: `Maximum gust at ${g.hub}, next ${HUB_FORECAST_HOURS} hours`, value: g.maxGustKmh * KMH_TO_KT, unit: "kt", basis: "observed", source: "openmeteo", payload: hubs });
  }

  const output: WeatherOutput = {
    status: "ok",
    storm: track.storm,
    forecastLabel: track.forecastLabel,
    currentCategory,
    peakCategory: peak,
    landfallAt,
    landfallRegion: landfall?.region ?? null,
    refineriesAtRisk: cap.refineryCount,
    gulfCapAtRisk: cap.gulfShare,
    companyCapAtRisk: Object.fromEntries(Object.entries(cap.company).filter(([t]) => universe.has(t))),
    atRisk,
    hubs,
    features,
    findings: [],
  };

  const fallback = [
    finding(env, `{{${nameKey}}} is forecast to peak at category {{${peakKey}}}, with {{${countKey}}} Gulf Coast refineries inside the impact radius, {{${gulfKey}}} of regional capacity.`, [nameKey, peakKey, countKey, gulfKey]),
    ...(landfallKey && regionKey ? [finding(env, `Landfall is expected near {{${regionKey}}} around {{${landfallKey}}}.`, [landfallKey, regionKey])] : []),
  ];
  const findings = await writeFindings(env, "notes:weather", "Storm track and refinery capacity at risk", { storm: track.storm.name, label, currentKey, companyKeys }, keys, fallback);
  output.findings = findings;
  return {
    update: { weatherOut: output },
    status: "done",
    summary: `${track.storm.name}: peak category ${peak}, ${cap.refineryCount} refineries at risk${label ? ` (${label.replaceAll("_", " ")})` : ""}`,
    output,
  };
};
