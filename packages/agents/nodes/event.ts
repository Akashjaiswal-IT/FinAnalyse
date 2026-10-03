import {
  EXTERNAL_PEERS,
  EventClassification,
  MAX_TOKENS,
  NEWS_WINDOW_HOURS,
  EVENT_FEATURE_WINDOW_HOURS,
  NEWS_SCAN_MAX_EVENTS,
  PEERS,
  SEVERITY_VOLZ,
  UNIVERSE,
  UNIVERSE_SYMBOLS,
  type EventOutput,
  type EventProfile,
  type FactorDirectionEntry,
  type FactorName,
  type MarketEventView,
  type NewsItem,
  type Plan,
  type Sector,
  type Severity,
} from "@repo/contracts";
import { severityFromVolZ } from "@repo/quant";
import type { NodeEnv, NodeImpl, NodeOutcome } from "../context";
import { loadPortfolio } from "../data";
import { DEFAULT_FACTORS, classifyEventByKeywords } from "../fallbacks";
import { finding } from "../notes";
import { EVENT_CLASSIFICATION_SYSTEM, eventClassificationUser } from "../prompts/event";
import type { RunStateValue } from "../state";
import { TAG } from "../tags";

type Source = EventProfile["source"];

const sectorOf = (symbol: string): Sector | undefined => UNIVERSE.find((u) => u.symbol === symbol)?.sector;
const universe = new Set<string>(UNIVERSE_SYMBOLS);
const externalByLower = new Map(Object.keys(EXTERNAL_PEERS).map((n) => [n.toLowerCase(), n]));

export const keepSymbols = (list: readonly string[]) => [...new Set(list.map((s) => s.trim().toUpperCase()).filter((s) => universe.has(s)))];
export const keepExternal = (list: readonly string[]) => [...new Set(list.flatMap((n) => externalByLower.get(n.trim().toLowerCase()) ?? []))];

/** Universe symbols whose competitor the event names: peers of an entity and symbols an external name points to. */
function peersOf(entities: readonly string[], externalNames: readonly string[]): string[] {
  const set = new Set<string>();
  for (const e of entities) for (const p of PEERS[e] ?? []) set.add(p);
  for (const n of externalNames) for (const p of EXTERNAL_PEERS[n] ?? []) set.add(p);
  for (const e of entities) set.delete(e);
  return [...set];
}

function sectorsOf(entities: readonly string[], more: readonly Sector[] = []): Sector[] {
  return [...new Set<Sector>([...more, ...entities.flatMap((e) => sectorOf(e) ?? [])])];
}

/** Majority direction per factor over the news items that state one; `unclear` votes do not count. */
export function voteFactors(items: readonly Pick<NewsItem, "factorDirections">[]): FactorDirectionEntry[] {
  const votes = new Map<FactorName, { up: number; down: number }>();
  for (const item of items) {
    for (const { factor, direction } of item.factorDirections ?? []) {
      if (direction === "unclear") continue;
      const v = votes.get(factor) ?? { up: 0, down: 0 };
      v[direction] += 1;
      votes.set(factor, v);
    }
  }
  return [...votes].flatMap(([factor, v]) => (v.up === v.down ? [] : [{ factor, direction: v.up > v.down ? ("up" as const) : ("down" as const) }]));
}

interface Hits {
  items: NewsItem[];
  failed: string | null;
}

async function searchNews(env: NodeEnv, text: string): Promise<Hits> {
  try {
    const hits = await env.ctx.deps.news.search(text, { asOf: new Date(env.ctx.asOf), windowHours: NEWS_WINDOW_HOURS, topK: 50 });
    return { items: hits.map((h) => h.item), failed: null };
  } catch (err) {
    return { items: [], failed: err instanceof Error ? err.message : String(err) };
  }
}

async function features(env: NodeEnv, query: string | null, firstReportAt: string | null) {
  if (!query || !firstReportAt) return { volZ: null, toneZ: null, stale: false };
  const start = new Date(firstReportAt);
  const end = new Date(Math.min(start.getTime() + EVENT_FEATURE_WINDOW_HOURS * 3_600_000, Date.parse(env.ctx.asOf)));
  try {
    const r = await env.ctx.deps.news.newsFeatures(query, start, end);
    return "data" in r ? { volZ: r.data.volZ, toneZ: r.data.toneZ, stale: r.stale } : { volZ: null, toneZ: null, stale: false };
  } catch {
    return { volZ: null, toneZ: null, stale: false };
  }
}

const distinct = (xs: (string | null)[]) => new Set(xs.filter((x): x is string => Boolean(x))).size;

interface Built {
  profile: EventProfile;
  how: string;
  stale: boolean;
  classifier: string;
}

/** An analog or market event is "resolved"; the profile adds the news counts and features visible at as-of. */
async function profileFromParts(
  env: NodeEnv,
  base: Pick<EventProfile, "id" | "source" | "type" | "subtype" | "title" | "firstReportAt" | "entities" | "externalNames" | "affectedSectors"> & {
    gdeltQuery: string | null;
    factorDirections?: FactorDirectionEntry[];
    topNewsIds?: string[];
    articleCount?: number | null;
    domainCount?: number | null;
    volZ?: number | null;
    toneZ?: number | null;
  },
  hits: Hits,
  how: string,
  classifier: string,
): Promise<Built> {
  const f =
    base.volZ !== undefined || base.toneZ !== undefined
      ? { volZ: base.volZ ?? null, toneZ: base.toneZ ?? null, stale: false }
      : await features(env, base.gdeltQuery, base.firstReportAt);
  const voted = voteFactors(hits.items);
  const factorDirections = base.factorDirections?.length ? base.factorDirections : voted.length > 0 ? voted : DEFAULT_FACTORS[base.type];
  const profile: EventProfile = {
    ...base,
    peerSymbols: peersOf(base.entities, base.externalNames),
    factorDirections,
    articleCount: base.articleCount ?? (hits.items.length > 0 ? hits.items.length : null),
    domainCount: base.domainCount ?? (hits.items.length > 0 ? distinct(hits.items.map((i) => i.domain)) : null),
    volZ: f.volZ,
    toneZ: f.toneZ,
    newsBasis: f.volZ === null && f.toneZ === null ? "unavailable" : "observed",
    severity: severityFromVolZ(f.volZ),
    topNewsIds: base.topNewsIds ?? hits.items.slice(0, 5).map((i) => i.id),
  };
  return { profile, how, stale: f.stale, classifier };
}

function fromMarketEvent(view: MarketEventView, source: Source): Built["profile"] {
  return {
    id: view.id,
    source,
    type: view.type,
    subtype: view.subtype,
    title: view.title,
    firstReportAt: view.firstSeenAt,
    entities: view.entities,
    externalNames: [],
    peerSymbols: peersOf(view.entities, []),
    affectedSectors: sectorsOf(view.entities),
    factorDirections: view.factorDirections,
    articleCount: view.articleCount,
    domainCount: view.domainCount,
    gdeltQuery: view.gdeltQuery,
    volZ: view.volZ,
    toneZ: view.toneZ,
    newsBasis: view.volZ === null && view.toneZ === null ? "unavailable" : "observed",
    severity: severityFromVolZ(view.volZ),
    topNewsIds: view.topNewsIds,
  };
}

async function presetProfile(env: NodeEnv, plan: Plan, presetId: string): Promise<Built | null> {
  const preset = await env.ctx.deps.analogs.presetEvent(presetId);
  if (!preset) return null;
  const hits = await searchNews(env, preset.gdeltQuery || preset.name);
  return profileFromParts(
    env,
    {
      id: preset.id,
      source: "replay",
      type: preset.type,
      subtype: preset.subtype,
      title: preset.name,
      firstReportAt: preset.firstReportAt,
      entities: keepSymbols([...preset.entities, ...plan.event.entities]),
      externalNames: keepExternal(plan.event.externalNames),
      affectedSectors: preset.affectedSectors,
      gdeltQuery: preset.gdeltQuery,
    },
    hits,
    "replay preset",
    "analog_events",
  );
}

async function classify(env: NodeEnv, question: string, titles: string[]): Promise<{ c: EventClassification; by: string } | null> {
  if (titles.length > 0) {
    const r = await env.llm.parseStructured({
      label: "event_classification",
      tier: "fast",
      system: EVENT_CLASSIFICATION_SYSTEM,
      user: eventClassificationUser(question, titles),
      schema: EventClassification,
      maxTokens: MAX_TOKENS.eventClassification,
    });
    if (r.ok) return { c: r.data, by: r.usage.model };
    env.ctx.warnings.push(`event: keyword classification used (${r.reason})`);
  }
  const rules = classifyEventByKeywords([question, ...titles].join(". "));
  return rules ? { c: rules, by: "keyword rules" } : null;
}

async function newsSearchProfile(env: NodeEnv, plan: Plan): Promise<Built | null> {
  const question = env.ctx.query;
  const hits = await searchNews(env, plan.event.name ?? question);
  const top = [...hits.items].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0)).slice(0, 10);
  const classified = await classify(env, question, top.map((i) => i.title));
  if (!classified) return null;
  const { c, by } = classified;
  const entities = keepSymbols([...c.entities, ...plan.event.entities]);
  const externalNames = keepExternal([...c.externalNames, ...plan.event.externalNames]);
  const first = [...top].sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))[0];
  const type = plan.event.type ?? c.type;
  let gdeltQuery: string | null = null;
  try {
    gdeltQuery = env.ctx.deps.events.buildEventQuery({ type, entities, externalNames });
  } catch {
    gdeltQuery = null;
  }
  return profileFromParts(
    env,
    {
      id: "news-search",
      source: env.ctx.mode === "replay" ? "replay" : "live",
      type,
      subtype: plan.event.subtype ?? c.subtype,
      title: top[0]?.title ?? question.replace(/[?.!]+$/, ""),
      firstReportAt: first?.publishedAt ?? null,
      entities,
      externalNames,
      affectedSectors: sectorsOf(entities, c.affectedSectors),
      gdeltQuery,
      factorDirections: c.factorDirections,
    },
    hits,
    "news search",
    by,
  );
}

function severityOfCategory(category: number): Severity {
  return category >= 4 ? "high" : category === 3 ? "medium" : "low";
}

/** What-if events have no articles: type, entities and severity come from the plan, and the severity sets the news
 * features (SPEC 5.12). Every number here is an assumption. */
function hypotheticalProfile(env: NodeEnv, plan: Plan): Built | null {
  const storm = plan.event.hypotheticalStorm;
  const h = plan.event.hypothetical;
  if (!storm && !h) return null;
  const severity = storm ? severityOfCategory(storm.category) : (h as NonNullable<typeof h>).severity;
  const entities = keepSymbols(h?.entities ?? plan.event.entities);
  const externalNames = keepExternal(h?.externalNames ?? plan.event.externalNames);
  const type = storm ? "disaster" : (h as NonNullable<typeof h>).type;
  return {
    profile: {
      id: "hypothetical",
      source: "hypothetical",
      type,
      subtype: storm ? "hurricane" : (h as NonNullable<typeof h>).subtype,
      title: env.ctx.query.replace(/[?.!]+$/, ""),
      firstReportAt: null,
      entities,
      externalNames,
      peerSymbols: peersOf(entities, externalNames),
      affectedSectors: storm ? ["energy", "refiner"] : sectorsOf(entities, h?.affectedSectors),
      factorDirections: storm ? [{ factor: "GULF_GASOLINE", direction: "up" }] : (h as NonNullable<typeof h>).factorDirections,
      articleCount: null,
      domainCount: null,
      gdeltQuery: null,
      volZ: SEVERITY_VOLZ[severity],
      toneZ: 0,
      newsBasis: "assumed",
      severity,
      topNewsIds: [],
    },
    how: "hypothetical",
    stale: false,
    classifier: "plan",
  };
}

/** Evidence rows for one profile (SPEC 5.14: counts, z-scores and severity are computed; type, subtype, entities
 * and factor directions are model or rule outputs). Returns the keys the findings cite. */
function recordEvidence(env: NodeEnv, b: Built, tag: boolean): string[] {
  const { profile: p } = b;
  const assumed = p.source === "hypothetical";
  const asOf = env.ctx.asOf;
  const basis = assumed ? "assumption" : "observed";
  const source = assumed ? "user" : p.id === "news-search" || b.how === "market event" ? "news" : "analog_events";
  const keys: string[] = [];
  const t = (name: string) => (tag ? name : undefined);
  const add = (input: Omit<Parameters<NodeEnv["evidence"]>[0], "source"> & { source?: string }) => {
    const key = env.evidence({ source, asOf, ...input });
    keys.push(key);
    return key;
  };
  add({ kind: assumed ? "assumption" : "event", label: "Event", textValue: p.title, unit: "text", basis, sourceRef: p.gdeltQuery ?? p.id, tag: t(TAG.eventTitle) });
  add({
    kind: "event", label: "Event type", textValue: p.subtype ? `${p.type.replace("_", " ")}, ${p.subtype.replace("_", " ")}` : p.type.replace("_", " "),
    unit: "text", basis: assumed ? "assumption" : "model", source: assumed ? "user" : b.classifier, sourceRef: b.classifier,
  });
  if (p.firstReportAt) add({ kind: "event", label: "First report", value: Date.parse(p.firstReportAt), unit: "date", basis: "observed", sourceRef: p.id });
  if (p.articleCount !== null) add({ kind: "news", label: "Articles retrieved", value: p.articleCount, unit: "count", basis: "observed", source: "news", stale: b.stale, tag: t(TAG.eventArticles) });
  if (p.domainCount !== null) add({ kind: "news", label: "Distinct news domains", value: p.domainCount, unit: "count", basis: "observed", source: "news" });
  if (p.volZ !== null) {
    add({ kind: assumed ? "assumption" : "computation", label: "News volume z-score", value: p.volZ, unit: "z", basis: assumed ? "assumption" : "computed", source: assumed ? "user" : "gdelt", sourceRef: p.gdeltQuery ?? "severity", stale: b.stale, tag: t(TAG.eventVolZ) });
  }
  if (p.toneZ !== null) {
    add({ kind: assumed ? "assumption" : "computation", label: "News tone z-score", value: p.toneZ, unit: "z", basis: assumed ? "assumption" : "computed", source: assumed ? "user" : "gdelt", sourceRef: p.gdeltQuery ?? "severity", stale: b.stale, tag: t(TAG.eventToneZ) });
  }
  add({ kind: "event", label: "Severity", textValue: p.severity, unit: "text", basis: assumed ? "assumption" : "computed", source: assumed ? "user" : "tempest", sourceRef: "SEVERITY_BOUNDS" });
  if (p.factorDirections.length > 0) {
    add({
      kind: "event", label: "Factor directions", textValue: p.factorDirections.map((f) => `${f.factor} ${f.direction}`).join(", "),
      unit: "text", basis: assumed ? "assumption" : "model", source: assumed ? "user" : b.classifier, sourceRef: b.classifier, payload: p.factorDirections,
    });
  }
  return keys;
}

function findingsFor(env: NodeEnv, b: Built, keys: string[]): EventOutput extends infer O ? (O extends { findings: infer F } ? F : never) : never {
  const { profile: p } = b;
  const kinds = new Map(keys.map((k) => [k, env.ctx.ledger.get(k)?.label ?? ""]));
  const keyOf = (label: string) => [...kinds].find(([, l]) => l === label)?.[0];
  const title = keyOf("Event");
  const articles = keyOf("Articles retrieved");
  const volZ = keyOf("News volume z-score");
  const toneZ = keyOf("News tone z-score");
  const severity = keyOf("Severity");
  if (p.source === "hypothetical") {
    return [finding(env, `{{${title}}} is a hypothetical event with assumed {{${severity}}} severity; its news features are assumptions, not observations.`, [title as string, severity as string])];
  }
  const parts: string[] = [`{{${title}}} dominates the news`];
  const cited = [title as string];
  if (articles && volZ) {
    parts.push(`: {{${articles}}} articles, volume z-score {{${volZ}}}`);
    cited.push(articles, volZ);
  }
  if (toneZ) {
    parts.push(`, tone z-score {{${toneZ}}}`);
    cited.push(toneZ);
  }
  return [finding(env, `${parts.join("")}.`, cited)];
}

function outcomeFor(env: NodeEnv, built: Built, others: Built[], summary: string): NodeOutcome {
  const keys = recordEvidence(env, built, true);
  for (const o of others) recordEvidence(env, o, false);
  const output: EventOutput = {
    status: "ok",
    profile: built.profile,
    others: others.map((o) => o.profile),
    findings: findingsFor(env, built, keys),
  };
  return { update: { eventOut: output }, status: "done", summary, output };
}

function unavailable(reason: string): NodeOutcome {
  const output: EventOutput = { status: "unavailable", reason };
  return { update: { eventOut: output }, status: "degraded", summary: `Unavailable: ${reason}`, output };
}

async function newsScan(env: NodeEnv): Promise<NodeOutcome> {
  const views = await env.ctx.deps.events.active(new Date(env.ctx.asOf));
  if (views.length === 0) return unavailable("no active market events at as-of");
  const portfolio = await loadPortfolio(env.ctx).catch(() => null);
  const value = new Map(portfolio?.positions.map((p) => [p.symbol, Math.abs(p.value)]) ?? []);
  const exposed = (v: MarketEventView) => v.touchedHoldings.reduce((s, h) => s + (value.get(h.symbol) ?? 0), 0);
  const ranked = [...views].sort((a, b) => exposed(b) - exposed(a) || b.articleCount - a.articleCount).slice(0, NEWS_SCAN_MAX_EVENTS);
  const source: Source = env.ctx.mode === "replay" ? "replay" : "live";
  const builts: Built[] = ranked.map((v) => ({ profile: fromMarketEvent(v, source), how: "market event", stale: false, classifier: "detection" }));
  const [top, ...rest] = builts as [Built, ...Built[]];
  return outcomeFor(env, top, rest, `${builts.length} active events ranked by exposed value; top: ${top.profile.type}`);
}

/** Resolve and profile the event (SPEC 5.5, `event`; SPEC 5.14). */
export const eventNode: NodeImpl = async (state: RunStateValue, env) => {
  const plan = state.plan;
  if (!plan) throw new Error("the event node received no plan");
  const { ctx } = env;
  if (plan.event.source === "none") {
    const output: EventOutput = { status: "skipped" };
    return { update: { eventOut: output }, status: "skipped", summary: "No event in this question.", output };
  }
  if (plan.intent === "news_scan") return newsScan(env);

  const prev = state.previous;
  if (plan.intent === "what_if" && plan.event.source !== "hypothetical" && prev?.event?.status === "ok" && prev.plan?.event.name === plan.event.name) {
    return outcomeFor(env, { profile: prev.event.profile, how: "previous run", stale: false, classifier: "previous run" }, [], `Reusing the event of the previous run: ${prev.event.profile.type}`);
  }

  let built: Built | null;
  if (plan.event.source === "hypothetical") built = hypotheticalProfile(env, plan);
  else if (ctx.replayEventId) built = (await presetProfile(env, plan, ctx.replayEventId)) ?? (await newsSearchProfile(env, plan));
  else if (plan.event.marketEventId) {
    const detail = await ctx.deps.events.get(plan.event.marketEventId);
    if (detail) {
      const hits = await searchNews(env, detail.gdeltQuery);
      built = await profileFromParts(env, { ...fromMarketEvent({ ...detail, touchedHoldings: [] }, "live"), volZ: detail.volZ, toneZ: detail.toneZ, articleCount: detail.articleCount, domainCount: detail.domainCount }, hits, "market event", "detection");
    } else built = null;
  } else built = await newsSearchProfile(env, plan);

  if (!built) return unavailable(plan.event.source === "hypothetical" ? "the plan has no hypothetical event" : "could not identify the event");
  return outcomeFor(env, built, [], `${built.how}: ${built.profile.type}, severity ${built.profile.severity}`);
};
