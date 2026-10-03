# Tempest: build roadmap (24 hours, team of 2 to 4)

**Inputs:** `docs/SPEC.md` (what to build) and this file (who, in what order, how we know it works, how we demo it).
**Clock:** H0 is the moment Phase 0 starts. If fewer than 24 hours remain, keep Phases 0 to 2 intact and apply the cut order in section 0.

---

## 0. Start here

### Tracks and owners

| Track | Scope | Owns (files) |
|---|---|---|
| **A: Data** | Postgres models, external clients, seeds, Pinecone, worker, live relay source side | `packages/database`, `packages/services/clients/*` (except `anthropic.ts`), `packages/services/{market,macro,news,weather,analogs,portfolio,ingest,system,queues}`, `apps/worker`, `scripts/seed*`, `data/` |
| **B: Agents and API** | Contracts, LLM layer, LangGraph graph, runs, tRPC, api app | `packages/contracts`, `packages/services/{llm,runs}`, `packages/services/clients/anthropic.ts`, `packages/agents`, `packages/trpc`, `apps/api`, `scripts/{run-query,stream-run}.ts` |
| **C: Quant and proof** | Pure math, forecast, event builder, backtest, eval, bench, drills | `packages/quant`, `scripts/{backtest,eval-queries,ingest-bench,drills}.ts`, `data/eval/` |
| **D: Terminal** | Next.js terminal and pages | `apps/web` |

| Team size | Person 1 | Person 2 | Person 3 | Person 4 |
|---|---|---|---|---|
| 4 | A | B | C | D |
| 3 | A + C's event builder, backtest, bench | B + C's quant library (risk, hedge, geo, forecast), eval, drills | D | |
| 2 | A + C | B + D (apply the cut order from H7) | | |

### Timeline

| Phase | Hours | Who | Done when |
|---|---|---|---|
| 0 Scaffold and contracts | H0:00 to H1:30 | all, led by B | template cleaned, packages created, contracts v1 merged, SSE heartbeat visible in the browser |
| 1 Foundations in parallel | H1:30 to H7:00 | A, B, C, D | each track's gate green; merge point at H7 |
| 2 Vertical slice: Ida replay end to end | H7:00 to H12:00 | all | integration gate in the browser; tag `slice-1` |
| 3 Live data, robustness, proof | H12:00 to H18:00 | all | worker live, eval, drills, backtest and bench recorded; P1 UI done |
| 4 Polish and demo | H18:00 to H21:00 | all | README, rehearsals, backup video; **freeze at H21** |
| 5 Buffer and submission | H21:00 to H24:00 | all | bug fixes only, submit |

### Cut order if behind schedule (drop from the top)

1. Every P2 item.
2. Open-Meteo hubs.
3. Alpha Vantage live polling (keep GDELT and NHC live).
4. Price chart and analog table (keep weather map and news feed).
5. Automated drills (run them by hand once and record the results).
6. Eval set reduced to 8 queries.

Never cut: as-of rules, evidence placeholders and the verifier, fallbacks, the backtest (it is the reliability proof), the drilldown.

### Working agreement

1. `main` is always green. One branch per track (`track/a-data`, `track/b-agents`, `track/c-quant`, `track/d-web`). Rebase on `main` often; merge at H1:30, H7, H12, H18.
2. `packages/contracts` belongs to Track B. After H1:30 changes are additive only (no renames), announced in the team chat, and come with updated fixtures.
3. At every merge point each track appends to `docs/PROGRESS.md`: what works, what is next, blockers. Any deviation from the spec goes in `docs/DECISIONS.md`. `docs/RESULTS.md` is filled only from script output.
4. Blocked for 30 minutes: tell the team and take the documented fallback.
5. Commits are small and named `track <x>: <what>`.
6. If anyone sleeps, do it after the H12 merge, in pairs, so every track keeps one person awake.

### Before H0 (15 minutes, everyone)

- [ ] Keys: Anthropic, Pinecone, Tiingo, FRED, Alpha Vantage. Each person creates their own Tiingo, FRED and Alpha Vantage keys, which spreads quota. Keep keys in `.env` only.
- [ ] Docker running, Node 22 LTS, pnpm 9 (the template pins `pnpm@9.0.0`).
- [ ] Anthropic credit of about $20 covers the whole event (a run costs about $0.10; the eval about $2).

### Session briefs (paste at the start of a work session)

```text
Track A (Data) for Tempest in this repository.
Read first: docs/SPEC.md sections 1, 3, 4, 5.1 to 5.4, 6, 10, 11; docs/ROADMAP.md sections 1, 2, 4 (Track A tasks), 5.
You own: packages/database, packages/services/clients (except anthropic.ts), packages/services/{market,macro,news,weather,analogs,portfolio,ingest,system,queues}, apps/worker, scripts/seed*, data/.
Do not edit packages/contracts (ask Track B), packages/agents or apps/web.
Work through your tasks phase by phase. After each task: typecheck, lint, test what you touched, commit.
At each merge point: update docs/PROGRESS.md, rebase on main, merge if green.
Ambiguity: take the documented default and log it in docs/DECISIONS.md. Never invent data or results.
```

```text
Track B (Agents and API) for Tempest in this repository.
Read first: docs/SPEC.md sections 1 to 3, 5 (all), 6, 7; docs/ROADMAP.md sections 1, 2, 4 (Track B tasks), 5.
You own: packages/contracts, packages/services/{llm,runs}, packages/services/clients/anthropic.ts, packages/agents, packages/trpc, apps/api, scripts/{run-query,stream-run}.ts.
Contract changes after H1:30 are additive only and must update the fixtures; announce them to the team.
Work through your tasks phase by phase. After each task: typecheck, lint, test what you touched, commit.
At each merge point: update docs/PROGRESS.md, rebase on main, merge if green.
Ambiguity: take the documented default and log it in docs/DECISIONS.md. Never let an LLM produce a number that reaches the user.
```

```text
Track C (Quant and proof) for Tempest in this repository.
Read first: docs/SPEC.md sections 1, 3, 5.1, 5.8 to 5.11, 9, 10.5, 11; docs/ROADMAP.md sections 1, 2, 4 (Track C tasks), 5.
You own: packages/quant, scripts/{backtest,eval-queries,ingest-bench,drills}.ts, data/eval/.
packages/quant stays pure: no I/O, no clock, no unseeded randomness. Every exported function gets a known-answer test.
Work through your tasks phase by phase. After each task: typecheck, lint, test, commit.
At each merge point: update docs/PROGRESS.md, rebase on main, merge if green.
Report every metric exactly as measured. Never tune the forecast on backtest results beyond the variants the spec allows.
```

```text
Track D (Terminal) for Tempest in this repository.
Read first: docs/SPEC.md sections 1, 2, 5.6, 5.13, 7, 8; docs/ROADMAP.md sections 1, 4 (Track D tasks), 5, 6.
You own: apps/web. Import only @repo/contracts and types from @repo/trpc/client.
Build against packages/contracts/fixtures first, then switch to the real API without changing component interfaces.
The UI never computes a financial number; it formats what it receives with contracts/format.ts.
After each task: typecheck, lint, build web, commit. At each merge point: update docs/PROGRESS.md, rebase on main, merge if green.
```

---

## 1. Operating rules

1. **Precedence:** `docs/SPEC.md`, then this file, then judgment. Log every conflict in `docs/DECISIONS.md`.
2. **Build exactly the spec,** in priority order: P0, then P1, then P2. No P2 work before the H12 gate passes. Nothing from the cut list.
3. **Gates define done.** Never weaken, skip or delete a test to get green.
4. **Never fabricate** numbers, results, benchmarks, sources or historical facts. Curated files (`data/seed/analog-events.json`, `outage_days`) carry a source URL for every fact.
5. **Verify library APIs against the installed versions** before building on them (section 2). Log what you find.
6. **Dependency rules** from SPEC 3 are enforced by lint, not by convention.
7. **Code:** strict TypeScript, no `any`, Zod at every boundary, each app and package validates its environment.
8. **Security:** keys only in `.env` (gitignored by the template); never log keys or full request headers; set `DEMO_TOKEN` on anything reachable from the internet; never commit `data/cache/` or any Tiingo data.
9. **Dependencies:** SPEC-named libraries plus `@anthropic-ai/sdk`, `@langchain/langgraph`, `@langchain/core`, `@langchain/langgraph-checkpoint-postgres`, `@pinecone-database/pinecone`, `bullmq`, `ioredis`, `@xyflow/react`, `leaflet`, `react-leaflet`, `tsx`, `vitest`. Log any other addition with its reason. Where the chat-app repository (`../chat-app`) already pins a shared dependency, use that version.

## 2. Verify first (H0 to H1, before anything is built on it)

| # | Check | How | Owner | If it fails |
|---|---|---|---|---|
| 1 | Tiingo daily endpoint returns `adjClose` from 2015 for XLE | one `curl` with the key | A | Log it; use unadjusted `close` and note the limitation |
| 2 | FRED series exist and are current: `DGASUSGULF`, `DCOILWTICO`, `DCOILBRENTEU`, `DHHNGSP`, `WGTSTUS1`, `WCESTUS1`, `VIXCLS`, `DGS10`, `DFF`, `DTWEXBGS` | `fred/series?series_id=...` | A | Replace a discontinued id with its FRED successor and log it |
| 3 | GDELT `timelinetone` and `timelinevol` return data for an Aug 2017 window; `artlist` returns articles for 25 to 27 Aug 2021 | `curl` with `STARTDATETIME`/`ENDDATETIME` | A | Sentiment features fall back to `volZ` only, or the replay news window narrows; log it |
| 4 | The newest HURDAT2 file includes the 2025 season | nhc.noaa.gov/data | A | Use 2017 to 2024 |
| 5 | EIA refinery GeoJSON fields and capacity units | open the download | A | Map fields in the seed; note units |
| 6 | `CurrentStorms.json` reachable; MapServer `/layers?f=json` lists `AT1 Forecast Points` | `curl` | A | Live forecast uses the persistence fallback |
| 7 | Alpha Vantage `NEWS_SENTIMENT` with `topics=energy_transportation` works on a free key | `curl` | A | Live news from GDELT only |
| 8 | Pinecone SDK shapes: `createIndexForModel`, `index(...)` or `.namespace(...)`, `upsertRecords`, `searchRecords` with `filter` | installed package types | A | Adapt the client; log it |
| 9 | Anthropic SDK: `messages.parse` with `zodOutputFormat` accepts the repository's Zod major; `beta.messages.toolRunner` with `betaZodTool`; whether these accept `fallbacks` | installed package types and a one-call test | B | Zod mismatch: build the JSON schema with `z.toJSONSchema`, pass it in `output_config.format`, validate the reply with the same Zod schema. No `fallbacks`: omit and log |
| 10 | LangGraph.js major: `StateSchema`/`ReducedValue` or `Annotation`; `PostgresSaver` package and `setup()` | installed package types | B | Use whichever API is installed |
| 11 | tRPC version supports `httpSubscriptionLink`, `tracked` and the Express adapter | installed package | B | Must be v11; upgrade within v11 |
| 12 | BullMQ version supports job schedulers (`upsertJobScheduler`) | installed package | A | Use repeatable jobs |

## 3. Phase overview

| # | Phase | SPEC | Gate |
|---|---|---|---|
| 0 | Scaffold and contracts | 3, 4, 7 | install, check-types, lint, test, build green; compose healthy; SSE heartbeat in the browser |
| 1 | Foundations (A, B, C, D in parallel) | 5, 6, 8, 10 | per-track gates below |
| 2 | Vertical slice: Ida replay end to end | 5, 7, 8 | the PS question answered in the browser, verified, under 90 s |
| 3 | Live data, robustness, proof | 5.2, 5.3, 9 | worker live 30 minutes, eval and drills pass, backtest and bench recorded |
| 4 | Polish and demo | 8, 9.5 | fresh clone works from the README; 3 clean rehearsals |
| 5 | Buffer and submission | none | submitted |

---

## 4. Phases

Gate commands: `pnpm check-types && pnpm lint && pnpm test && pnpm build` (add `test` in Phase 0).

### Phase 0: Scaffold and contracts (H0:00 to H1:30, all, led by B)

- [ ] Remove what SPEC 3 lists (Google OAuth client, user service, auth route, user model and migration, `google-auth-library`, "Streamyst"). Rename the root package to `tempest`; API title "Tempest OpenAPI".
- [ ] Create `apps/worker`, `packages/contracts`, `packages/quant`, `packages/agents` by copying `apps/api`'s tsup, tsconfig, ESLint and package.json patterns (`../chat-app/apps/worker` is a working reference). tsup bundles workspace packages (`noExternal: [/^@repo\//]`).
- [ ] `docker-compose.yml`: keep the template's `postgresdb`; add `redis` (`redis:7`, `redis-server --maxmemory-policy noeviction`, port 6379).
- [ ] Root `.env.example` with every variable in SPEC 4 (the template's `setup.sh` links `.env` into every app and package).
- [ ] Vitest: root `vitest.workspace.ts` (pattern in `../chat-app/vitest.workspace.ts`). Root scripts: `test`, `seed`, `backtest`, `eval`, `bench:ingest`, `drills` (all through `tsx`).
- [ ] Lint rules for SPEC 3 dependency rules; add one forbidden import, watch lint fail, revert.
- [ ] api: CORS origin from `CORS_ORIGIN`. web: remove `credentials: "include"` from `trpc/create-client.ts` (a wildcard CORS origin with credentials is rejected by browsers, and there are no cookies). Enable the tRPC SSE ping. `providers/global.tsx` uses `splitLink`: subscriptions to `httpSubscriptionLink`, everything else to the template link.
- [ ] A stub `live.feed` subscription that yields a heartbeat every 5 s, logged in the browser console.
- [ ] `packages/contracts` v1: every schema and constant named in SPEC 5 to 8 and 11, and `format.ts` (units, placeholder rendering, `barAvailableAt`) with unit tests.
- [ ] `packages/contracts/fixtures/`: a complete hand-built `RunEvent` sequence for the Ida question (values marked as fixture data), plus portfolio, news and storm fixtures. Track D builds on these from H1:30.
- [ ] 10-minute team review of the contracts. Merge to `main`.
- [ ] Create `docs/PROGRESS.md`, `docs/DECISIONS.md`, `docs/RESULTS.md`.

**GATE:** gate commands green; `docker compose up -d` healthy; `curl localhost:8000/health` returns 200; the heartbeat appears in the browser.

### Phase 1: Foundations in parallel (H1:30 to H7:00)

**Track A: Data**
- [ ] Drizzle models for every table in SPEC 6 (PKs, FKs, CHECKs, indexes); first migration; migrate on an empty database works and a second run is a no-op.
- [ ] `clients/http.ts` per SPEC 5.3 with tests against a fake fetch: timeout, retry, 429 and throttle bodies, Zod failure, breaker, stale cache, `DISABLE_SOURCES`, status hash.
- [ ] Clients `tiingo`, `fred`, `gdelt`, `alphavantage`, `nhc`, `openmeteo`, `pinecone`, `redis`. Each has a recorded fixture in `data/fixtures/` and a parse test; tests never call live HTTP.
- [ ] Seed steps 1 to 4 and the Pinecone index (SPEC 10). HURDAT2 parser test on a two-storm sample.
- [ ] Services `market` and `macro` with as-of filtering; the as-of test from SPEC 5.1.
- [ ] Zip `data/cache/` and share it inside the team once prices are downloaded.

**GATE A:** seeding twice changes nothing; counts printed; every Tiingo symbol has bars from 2015 (or its launch) to the last close; the as-of test passes; `market.returns` for the universe at the Ida as-of returns 504 aligned rows.

**Track B: Agents and API**
- [ ] `services/clients/anthropic.ts` and `services/llm`: `parseStructured` (parse, effort, summarized thinking, stop-reason handling, usage and cost) and `runTools` (strict tools, at most 6 iterations). A fake implementation for tests.
- [ ] `agents/ledger.ts`, `agents/verify.ts`, rendering. Tests: a digit outside a placeholder is rejected; an unknown key is rejected; `S&P 500` passes; missing caveats are appended.
- [ ] `services/runs`: create, append event with `seq`, add evidence, complete, get, list, `eventsAfter`; in-process EventEmitter.
- [ ] `agents/context.ts` (registry, `instrumentNode`), `agents/graph.ts` with all 9 nodes as stubs returning fixture outputs, `PostgresSaver`, the `history` reducer, `fallbacks.ts`.
- [ ] Real planner (prompt and schema) with the rule-based fallback.
- [ ] Routes `runs.create/get/list/stream`, `live.feed` (stub), `system.status` (stub), `portfolio.get` (fixture until Track A's service lands). Concurrency guard, `DEMO_TOKEN` check, boot cleanup of `running` runs.

**GATE B:** fake-LLM graph test: the full event order for one run; a node that throws ends `degraded` and the run still completes; an answer with a raw digit triggers exactly one repair, then the template answer. `curl -X POST localhost:8000/api/runs` returns a run id, and `scripts/stream-run.ts <runId>` prints the streamed events, including after a reconnect with `lastEventId`.

**Track C: Quant and proof**
- [ ] `quant` modules from SPEC 3: series, stats, risk, hedge, geo, forecast, backtest. Pure functions only.
- [ ] Known-answer tests: beta and R² against a hand calculation; VaR and CVaR on a fixed 20-value series; overlapping 5-day sums; haversine against two independently computed distances (within 1 km); kNN weights (identical vectors equal, a far event near zero, leave-one-out excludes self, effective n formula); hedge sizing respects every limit and yields integers; capacity at risk counts each refinery once and interpolates to 1-hour steps.
- [ ] Pure event builder: storm points, refineries, price and timeline series in; t0, features, company capacity at risk, reactions and `realized_until` out. Tested on synthetic data. Seed step 5 calls it.

**GATE C:** `pnpm --filter @repo/quant test` green; every exported function has at least one test.

**Track D: Terminal**
- [ ] Dark terminal theme on the template tokens, tabular numerals, three resizable columns.
- [ ] `mode-switch` with `REPLAY_PRESETS`; mode and preset kept in the URL query so a reload keeps them.
- [ ] `query-bar` with example chips.
- [ ] `agent-graph` (fixed positions for the 9 nodes) and `step-log`, driven by a fixture player that replays `fixtures/ida-run.json` with delays.
- [ ] `answer-card`, `evidence-chip`, `hedge-table`, `drilldown-sheet`, `portfolio-panel` from fixtures; all formatting through `contracts/format.ts`.
- [ ] `use-run-stream` with one interface for the fixture player and the real subscription.

**GATE D:** `pnpm --filter web build` green; the fixture run plays end to end in the browser; screenshots in `docs/PROGRESS.md`.

**MERGE POINT H7:** every track merged; `main` green.

### Phase 2: Vertical slice, Ida replay end to end (H7:00 to H12:00)

**Track A**
- [ ] Seed step 5 with Track C's builder: hurricanes 2017 to 2025 with GDELT timeline features, plus `data/seed/analog-events.json` (six parallels, each with a source URL). Upsert Pinecone `events`.
- [ ] Seed step 6: replay news for the four presets, scored through `services/llm` (Haiku), upserted to Pinecone `news`.
- [ ] Services `news.search` (Pinecone, then Postgres hydration, as-of window), `weather` (`stormsAt`, `track` with the replay perfect forecast, `hypotheticalTrack`, `refineries`), `analogs.search`, `portfolio.snapshot`.
- [ ] Read routes: `portfolio.get`, `market.bars`, `news.list`, `weather.storms`, `weather.track`, `weather.refineries`, `macro.snapshot`, `analogs.list`.

**GATE A2:** at the Ida as-of, `weather.track` returns observed points plus 72 hours of labelled forecast; a news search for "Ida refinery" returns only items inside the 72-hour window; `analogs.search` never returns Ida or any later event.

**Track B**
- [ ] Real `weather`, `sentiment`, `macro` and `analogs` nodes with evidence and Haiku notes; `risk` node; `hedging` node (tools and fallback); `synthesizer` with placeholders; verifier loop and template answer; confidence rule; run totals.
- [ ] Prompts in `agents/prompts/` state the evidence-key list, the no-digits rule and the allowed symbols.

**GATE B2:** `scripts/run-query.ts --preset=hurricane-ida-2021 "<PS question>"` ends `succeeded`, the verifier passes, the answer cites at least 8 evidence rows, and the hedge plan is within limits.

**Track C**
- [ ] Live forecast (kNN over eligible events), refiner elasticity fit and factor mapping, wired into the `risk` node with Track B.
- [ ] Backtest script skeleton runs on the seeded events and prints metrics.
- [ ] Hand-check one VaR and one scenario P&L at the Ida as-of in a spreadsheet; record the check in `docs/PROGRESS.md`.

**GATE C2:** the backtest prints a table for N, S, W and C; the hand-checked numbers match within 1%.

**Track D**
- [ ] Real data: `portfolio.get`, `runs.create`, `runs.stream` (resume with `lastEventId`), `runs.get` for the drilldown, `analogs.list`, `news.list`, and `weather.track` for the map if time allows.
- [ ] Loading, empty and error states; query bar disabled during a run; toast on failure.

**INTEGRATION GATE (whole team, H12):** in the browser: Replay, Ida, the PS question. The graph animates in order; the answer appears with evidence chips; the hedge table is within limits; the drilldown shows steps and evidence; the run takes under 90 s. Reloading mid-run resumes the stream. Merge to `main`; tag `slice-1`.
**DEMO CHECK:** run it 3 times; note latency and cost from the run rows in `docs/PROGRESS.md`.

### Phase 3: Live data, robustness, proof (H12:00 to H18:00)

**Track A**
- [ ] `apps/worker`: queues, job schedulers and per-queue limiters (SPEC 5.2, 5.3); jobs `gdelt`, `alphavantage` (quota counter), `nhc`, `openmeteo`, `fred`, `tiingo`, `enrich`; `LiveEvent` publishing; graceful shutdown.
- [ ] api side of the relay: one Redis subscriber feeding `live.feed`; `system.status` (Redis hashes plus the latency SQL); `system.ingestNow`.
- [ ] `scripts/ingest-bench.ts` (SPEC 9.3), with Track C.

**GATE A3:** the worker runs 30 minutes without errors; `news.ingested` events reach the browser; `system.status` shows p50/p95; bench results in `docs/RESULTS.md`.

**Track B**
- [ ] Live mode: `asOf` = now, NHC storms, the no-storm path, hypothetical storms, follow-ups on a thread (what-if category override).
- [ ] `data/eval/queries.json` (15 queries) and `scripts/eval-queries.ts` (SPEC 9.2), with Track C; results in `docs/RESULTS.md`.
- [ ] `scripts/drills.ts` (SPEC 9.4), with Track C.

**GATE B3:** eval and drills run; every drill passes; results recorded.

**Track C**
- [ ] Final backtest (SPEC 9.1): `backtests` row, tables and caveats in `docs/RESULTS.md`, `backtest.latest` route.
- [ ] Eval and drills with Track B; bench with Track A.

**GATE C3:** re-running the backtest reproduces the recorded numbers exactly.

**Track D**
- [ ] P1 components: `risk-summary`, `risk-compare-chart`, `forecast-chart`, `weather-map`, `news-feed` (with "Ingest now" and measured latency), `price-chart`, `source-health`, `analog-table`; the reliability page.

**GATE D3:** every P1 component shows real data in live and replay modes; no console errors.

**MERGE POINT H18.**

### Phase 4: Polish and demo (H18:00 to H21:00)

- [ ] P2 only if every Phase 3 gate passed, in this order: `realized-panel`, audit report page, apply to paper portfolio, NHC discussions namespace, `outage_days`.
- [ ] `README.md`: what it is, architecture (the SPEC 5.5 diagram plus a data-flow diagram), quickstart (keys, compose, seed, dev), scripts, environment table, a results summary that links `docs/RESULTS.md`.
- [ ] Rehearse the demo script (section 6) three times with a timer. Fix only what breaks the script.
- [ ] Record a backup video of the full demo. Keep the id of a finished Ida run for offline showing.
- [ ] Five slides: problem, the demo flow in one screenshot, architecture, proof (latency, eval, backtest), what is real and what is simulated.

**GATE:** a fresh clone followed by the README reaches a working app (with keys); three clean rehearsals in a row. **Freeze at H21:** bug fixes only from here.

### Phase 5: Buffer and submission (H21:00 to H24:00)

- [ ] Fix only demo-breaking bugs. Re-run the gate commands after each fix.
- [ ] Submit: repository link, video, slides, `docs/RESULTS.md`.
- [ ] Each person rehearses two answers from the judge questions in section 6.

---

## 5. Gotchas

1. **Alpha Vantage** answers throttling and premium endpoints with HTTP 200 and an `Information` or `Note` body. Treat it as rate limited. 25 requests per day per key.
2. **FRED** sends missing values as `"."`. Weekly series lag their observation date (SPEC 5.1).
3. **GDELT:** `OR` must be uppercase, parentheses only around OR'd terms, phrases in double quotes, `sourcelang:english`. At most 1 request per 5 s. `artlist` returns at most 250 records and only the last 3 months of a window. Errors can arrive as plain text with status 200: check before parsing JSON. Timeline JSON shapes differ by mode.
4. **Tiingo:** 50 requests per hour, 500 symbols per month. Use `adjClose`. Cache every response. The licence forbids committing the data.
5. **NOAA:** send the `User-Agent`. `CurrentStorms.json` fields may be null or missing. MapServer layer ids differ between services: look them up by name. Forecast-point field names cannot be confirmed without an active storm.
6. **HURDAT2:** "90.2W" is longitude -90.2; times are `HHMM` UTC; `L` in the record-identifier column marks landfall; header lines and data lines alternate.
7. **Pinecone:** metadata must be flat; store timestamps as numbers for range filters; at most 96 records per `upsertRecords`; new records become searchable after a delay (seeds wait); Starter indexes live in us-east-1 only; reranking quota is 500 requests per month, so it is not used.
8. **Claude Sonnet 5.5:** forced `tool_choice` (`any`, `tool`) returns 400; `temperature`, `top_p` and `top_k` are rejected; `thinking: { type: "disabled" }` returns 400 (lower the effort instead); set effort explicitly; check `stop_reason` before reading content. Haiku 4.5 rejects the `effort` parameter.
9. **Zod and the SDK helper:** confirm the Zod helper works with the repository's Zod major before writing schemas around it (section 2, check 9).
10. **LangGraph:** two parallel nodes writing the same key without a reducer throw `InvalidUpdateError`; nodes return partial state; keep non-serializable objects out of state; call `checkpointer.setup()` once.
11. **tRPC over SSE:** the template's wildcard CORS plus `credentials: "include"` fails in browsers; subscriptions need `splitLink`; no OpenAPI meta on subscriptions; never add compression middleware to the api (it buffers SSE); declare static REST paths before parameterised siblings.
12. **Next.js:** import Leaflet through `next/dynamic` with `ssr: false` and include its CSS; import the React Flow stylesheet; Recharts only in client components; `NEXT_PUBLIC_*` values are fixed at build time.
13. **BullMQ:** no `:` in queue names or job ids; worker connections need `maxRetriesPerRequest: null`; Redis must be `noeviction`; limiters are per queue.
14. **Time:** store UTC; a daily bar is usable from 21:00 UTC on its date; Tiingo and FRED calendars differ, so align by inner join and count trading days on each series' own calendar.
15. **Returns:** `quant` works in log returns; the UI shows simple percent (`e^r - 1`), converted only in `quant` or `format.ts`.
16. **tsup** must bundle workspace packages (`noExternal: [/^@repo\//]`).
17. **Demo network:** replay still needs Anthropic and Pinecone. Keep a phone hotspot ready; a finished run renders from local Postgres without network.

---

## 6. Demo and judging pack

### Demo script (3 minutes)

| Time | Show | Say |
|---|---|---|
| 0:00 | Terminal in live mode: news feed, source health, ingest p95 badge. Press "Ingest now"; new items arrive with their measured latency | The problem in one sentence. Live news and weather are embedded and indexed within the measured latency |
| 0:30 | Switch to Replay, preset Hurricane Ida, as of Friday 27 Aug 2021 close. The map shows the track and refineries in its path in red | Markets are closed this weekend, so we replay a real Category 4 storm with no look-ahead |
| 0:45 | Ask the problem-statement question. The graph lights up node by node | Planner, then weather, sentiment and macro in parallel, then analogs from Pinecone, risk, hedging, synthesis, verification |
| 1:30 | Answer card, hedge table, before/after risk chart | Read the headline sentence. Every number is a chip |
| 2:00 | Click the capacity-at-risk chip, then a graph node | The refineries summed and their EIA source; the step's inputs, outputs, thinking summary, tokens and cost; "0 ungrounded numbers" |
| 2:20 | "What happened next" (P2) or the analog table | What the market actually did after this as-of, next to the forecast |
| 2:35 | Reliability page | Combined model against weather-only and sentiment-only baselines, leave-one-out, with n and caveats |
| 2:50 | A drill run with a source disabled | It still answers, names the gap and lowers confidence |

### Acceptance matrix (fill the last column with links before submitting)

| Problem-statement item | Built in | Proven by |
|---|---|---|
| Multi-modal ingestion: financial APIs, weather APIs, vector database | Track A, phases 1 to 3 | live feed, source health, `docs/RESULTS.md` bench |
| Multi-agent engine: sentiment, weather and macro, quant risk, hedging | Track B, phase 2 | live graph, drilldown, eval |
| Historical parallels and cross-asset reactions from the vector database | Tracks A, B, C, phase 2 | analog table, evidence rows sourced from Pinecone |
| Sentiment, macro trend and quantitative risk across asset classes | Tracks B and C, phase 2 | risk summary, evidence rows |
| Hedging, reallocation and risk assessment from natural language | Track B, phase 2 | hedge table, before/after chart |
| Terminal: live graph, charts, risk breakdown, recommendations, drilldown | Track D, phases 1 to 3 | the demo |
| NFR ingestion latency | SPEC 5.2, phase 3 | `docs/RESULTS.md` (bench and live p95) |
| NFR orchestration accuracy | phase 3 eval | `docs/RESULTS.md` |
| NFR forecast reliability against single-source baselines | phase 3 backtest | reliability page, `docs/RESULTS.md` |
| NFR auditability | SPEC 5.6 | drilldown, verifier report |
| NFR robustness | SPEC 5.3, fallbacks | drills in `docs/RESULTS.md` |

### Judge questions (answers must cite real files and measured numbers)

1. **Why TypeScript and LangGraph.js, not Python?** The same graph, state, checkpoints and streaming, with one language and one set of typed contracts from database to UI.
2. **How do you stop invented numbers?** The LLM never writes digits. It references evidence keys; the verifier rejects anything else; a deterministic template answer is the fallback.
3. **Is the forecast real?** Kernel kNN over historical Gulf hurricanes using storm and news-coverage features, evaluated leave-one-out against weather-only, sentiment-only and unconditional baselines. Show n and the caveats.
4. **How do you prevent look-ahead?** Every read takes an as-of time; bars count from 21:00 UTC on their date; analog events must be fully realized before the as-of. There is a test.
5. **What does "sub-second" mean here?** Upstream response received to Postgres and Pinecone writes acknowledged, per batch, p95 from the bench and from live data. Time until searchable is reported separately.
6. **What about rate limits?** Per-source queue limiters, a daily quota counter, a response cache with stale fallback and a circuit breaker. Show a drill.
7. **Why Pinecone?** The problem statement asks for it; integrated embedding removes a separate embedding service; metadata filters enforce the as-of window.
8. **What is simulated?** The portfolio is paper; ETFs stand in for futures; replay uses the best track as a perfect forecast; prices are end-of-day this weekend; hypothetical storms are labelled.
9. **Cost per question?** Read it from the runs table (`docs/RESULTS.md`).
10. **How would it scale?** Move runs to a worker queue, run several api instances with run events over Redis, a paid Pinecone tier, and an intraday market data provider.

### Backup plan

- The backup video (Phase 4) is the first fallback.
- A finished Ida run renders from local Postgres without network.
- If the Anthropic API fails during the demo, the fallback path still answers; present it as the robustness drill.
