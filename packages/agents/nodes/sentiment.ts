import { DEMO_PORTFOLIO, UNIVERSE, type NewsItem, type SentimentOutput, type Sector } from "@repo/contracts";
import { NEWS_WINDOW_HOURS } from "@repo/contracts";
import type { NodeEnv, NodeImpl } from "../context";
import { loadPortfolio } from "../data";
import { finding, writeFindings } from "../notes";
import { aggregateSentiment, withSourceScores } from "../sentiment-math";
import type { RunStateValue } from "../state";

const sectorName = (s: Sector) => s.replaceAll("_", " ");
const symbolName = (symbol: string) => UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol;

async function gather(env: NodeEnv, text: string, tickers: string[]): Promise<NewsItem[]> {
  const asOf = new Date(env.ctx.asOf);
  const searches = [
    env.ctx.deps.news.search(text, { asOf, windowHours: NEWS_WINDOW_HOURS, topK: 50 }),
    ...(tickers.length > 0 ? [env.ctx.deps.news.search("news about the company", { asOf, windowHours: NEWS_WINDOW_HOURS, tickers, topK: 50 })] : []),
  ];
  const settled = await Promise.allSettled(searches);
  if (settled.every((r) => r.status === "rejected")) {
    throw new Error(`news search failed: ${(settled[0] as PromiseRejectedResult).reason instanceof Error ? ((settled[0] as PromiseRejectedResult).reason as Error).message : "unknown error"}`);
  }
  const byId = new Map<string, NewsItem>();
  for (const r of settled) if (r.status === "fulfilled") for (const h of r.value) byId.set(h.item.id, h.item);
  return [...byId.values()];
}

export const sentimentNode: NodeImpl = async (state: RunStateValue, env) => {
  const plan = state.plan;
  if (!plan?.specialists.sentiment) {
    const output: SentimentOutput = { status: "skipped" };
    return { update: { sentimentOut: output }, status: "skipped", summary: "Sentiment not needed.", output };
  }
  const profile = state.eventOut?.status === "ok" ? state.eventOut.profile : null;
  const positions = await loadPortfolio(env.ctx)
    .then((p) => p.positions.map((x) => x.symbol))
    .catch(() => DEMO_PORTFOLIO.positions.map((p) => p.symbol));
  const relevant = new Set<string>([...(profile?.entities ?? []), ...(profile?.peerSymbols ?? []), ...plan.focusSymbols]);
  const watch = positions.filter((s) => relevant.has(s));
  const query = profile?.title ?? plan.event.name ?? env.ctx.query;

  let items = await gather(env, query, watch);
  if (items.filter((i) => i.sentiment === null).length * 2 > items.length) {
    // Most hits are unscored: score a batch and look again (SPEC 5.5).
    const scored = await env.ctx.deps.news.scoreUnscored(20).catch(() => []);
    if (scored.length > 0) items = await gather(env, query, watch);
  }

  items = items.map(withSourceScores);
  const agg = aggregateSentiment(items, env.ctx.asOf, positions);
  if (agg.scoredIds.length === 0) {
    const output: SentimentOutput = { status: "unavailable", reason: "no scored news in the window" };
    return { update: { sentimentOut: output }, status: "degraded", summary: `Unavailable: ${output.reason}`, output };
  }

  const affected = new Set<Sector>(profile?.affectedSectors ?? []);
  const sectors = [...agg.sectors].map(([sector, a]) => ({ sector, score: a.score, n: a.n }))
    .sort((x, y) => Number(affected.has(y.sector)) - Number(affected.has(x.sector)) || y.n - x.n).slice(0, 8);
  const holdings = [...agg.holdings].map(([symbol, a]) => ({ symbol, score: a.score, n: a.n })).sort((x, y) => y.n - x.n).slice(0, 10);
  const peerGroups = agg.peerGroups.map((g) => ({ symbols: g.symbols, score: g.agg.score, n: g.agg.n }));

  const scoreModel = items.find((i) => i.scoreModel)?.scoreModel ?? "news_items.sentiment";
  const keys: string[] = [];
  const row = (label: string, score: number) => {
    const key = env.evidence({ kind: "model", label, value: score, unit: "score", basis: "model", source: "news", sourceRef: scoreModel, asOf: env.ctx.asOf });
    keys.push(key);
    return key;
  };
  const sectorKeys = sectors.filter((s) => affected.has(s.sector)).slice(0, 4).map((s) => [s, row(`${sectorName(s.sector)} news sentiment`, s.score)] as const);
  const holdingKeys = holdings.filter((h) => (profile?.entities ?? []).includes(h.symbol)).slice(0, 3).map((h) => [h, row(`${symbolName(h.symbol)} news sentiment`, h.score)] as const);
  if (sectorKeys.length === 0 && holdingKeys.length === 0 && sectors[0]) sectorKeys.push([sectors[0], row(`${sectorName(sectors[0].sector)} news sentiment`, sectors[0].score)]);

  const output: SentimentOutput = {
    status: "ok",
    sectors,
    peerGroups,
    holdings,
    gdelt: { toneZ: profile?.toneZ ?? null, volZ: profile?.volZ ?? null },
    newsIds: agg.scoredIds.slice(0, 20),
    findings: [],
  };
  const fallback = [...sectorKeys.map(([s, k]) => finding(env, `News sentiment for ${sectorName(s.sector)} holdings is {{${k}}}.`, [k])), ...holdingKeys.map(([h, k]) => finding(env, `News sentiment for ${symbolName(h.symbol)} is {{${k}}}.`, [k]))].slice(0, 3);
  output.findings = await writeFindings(env, "notes:sentiment", "Relevance-weighted news sentiment around the event", { sectors: sectorKeys.map(([s, k]) => ({ sector: s.sector, key: k })), holdings: holdingKeys.map(([h, k]) => ({ symbol: h.symbol, key: k })) }, keys, fallback);
  return {
    update: { sentimentOut: output },
    status: "done",
    summary: `${agg.scoredIds.length} scored articles; ${sectors.length} sectors, ${holdings.length} holdings`,
    output,
  };
};
