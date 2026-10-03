# Progress

Each track appends here at every merge point: what works, what is next, blockers.

## Phase 0: scaffold and contracts (2026-10-03)

Done by one contributor across all tracks.

**Works**
- `packages/contracts`: every schema and constant named in SPEC 5 to 8 and 11, `format.ts` (units, placeholder rendering, `barAvailableAt`), the Ida run fixture, and 41 passing tests.
- New packages and apps: `packages/quant`, `packages/agents` (empty shells), `apps/worker` (starts, logs, shuts down on SIGTERM).
- Dependency rules from SPEC 3 enforced by `no-restricted-imports` through `@repo/eslint-config/boundaries`. Checked by adding a forbidden import to `quant`, `contracts` and `web`: lint failed each time.
- `docker compose up -d`: Postgres and Redis both report healthy.
- `GET localhost:8000/health` returns 200; `/api/health` returns `{"status":"healthy"}`.
- `live.feed` streams a heartbeat every 5 s over SSE; the web page logs each one to the browser console.
- `pnpm check-types` (10 tasks), `pnpm test` (41 tests) and `pnpm build` (api, worker, web) are green.

**Gate (2026-10-03):** `pnpm check-types`, `pnpm lint`, `pnpm test` and `pnpm build` are all green. Template files (Google OAuth, user service, auth route, user model and migration, dead `.eslintrc.cjs`) are removed.

**Open**
- `components/ui/resizable.tsx` was updated for `react-resizable-panels` v4 (`Group`, `Separator`). The `aria-[orientation=...]` styles are untested until the terminal layout renders them.
- Root scripts `seed`, `backtest`, `eval`, `bench:ingest` and `drills` point at files that Phase 1 and 2 create.
- The first Drizzle migration is regenerated in Phase 1, Track A, once the models exist.

## Track A: Data

Entries at H7, H12 and H18.



## Track B: Agents and API

Entries at H7, H12 and H18.

### Phase 0b: contracts v2 (2026-10-03)

**Works**
- `schemas/event.ts`: event types and subtypes, factor directions, severity, `EventProfile`, `EventClassification`, `HypotheticalEventParams`, `MarketEvent` and its feed view, exposure channels, `CuratedEventSeed` (in `analog.ts`) for `data/seed/analog-events.json`.
- `Plan` describes any event (type, subtype, name, entities, external names, market event id, hypothetical event or storm); intent `news_scan`; the `event` node joins the graph (10 nodes).
- News items carry prefilter, peer tickers, event type, entity sentiment and factor directions; live messages `event.detected` and `event.updated`; runs carry `eventProfile` and `marketEventId`.
- Forecast per holding with variant, groups used and news basis; risk report with exposure channels, exposed value and P&L per sector and channel; backtest models N, T, S, M, W, C.
- Constants: 37 Tiingo symbols plus 4 FRED factors, multi-sector demo portfolio (23 positions, 95%), factors, peers, external peers, event keywords, news queries per type, Alpha Vantage rotation, six replay presets, detection and severity thresholds.
- Fixtures: Ida run with the `event` step, a complete Ukraine run (weather skipped; direct and factor channels), three live market events, news for both runs.

**Gate:** `pnpm check-types`, `pnpm lint`, `pnpm test` (62 tests) and `pnpm build` are green. Both fixture runs validate against the schemas, complete the ten nodes in order, resolve every placeholder, keep digits out of authored text, stay inside the hedge limits and reconcile scenario P&L across holdings, sectors and channels.

**Open**
- Replay preset times other than Ida are provisional until Track A confirms them (ROADMAP section 2, check 15).



## Track C: Quant and proof

Entries at H7, H12 and H18.

### Phase 1: quant library (2026-10-03)

**Works** (`packages/quant`, 328 tests; every exported function is referenced by a test)
- `series`, `stats`: aligned log returns (a day with a non-positive price is dropped for all symbols), rolling sums, forward returns on each series' own calendar, OLS beta and R², Spearman, weighted mean and spread, effective n, `trailingZ`, `windowZ`.
- `risk`: historical-simulation P&L (1 and 5 days), discrete VaR/CVaR, scenario and analog-replay P&L, P&L by sector and by channel, factor betas, top exposures, `riskSnapshot`.
- `exposure`: direct, peer and factor channels, exposed sleeve, exposed value by channel.
- `hedge`: limit checks (SPEC 5.11), largest allowed quantity, minimum-variance ratios and suggestions, fallback, `simulateHedges`.
- `geo`: haversine, hourly track interpolation, capacity at risk, Saffir-Simpson category, HURDAT2 landfall rule, Gulf hurricane test.
- `forecast`: feature scaler, grouped kernel weights, per-target and per-holding forecasts with the SPY-beta fallback, variants N, T, S, M, W, C, analog eligibility.
- `detect`: title tokens, `sameStory`, connected-component clustering, `isEvent`, severity, `clusterZ`, matching to active events, fade status.
- `backtest`: metrics, leave-one-out predictions, pooled / per-target / per-type summary, caveats.
- `event-builder`: curated and hurricane event builders (t0, features, reactions, `realizedUntil`) and the description template.
- Known-answer values come from independent Python calculations (`statistics`, `math`), not from this code. The kernel kNN and the leave-one-out backtest were re-implemented in Python and compared on a six-event pool, all six models, pooled, per target and per type.

**Gate C:** `pnpm check-types`, `pnpm lint`, `pnpm test` (390 tests across the repo) and `pnpm build` are green.

**For the other tracks**
- Track A: `buildCuratedEvent` and `buildHurricaneEvent` are what seed step 5 calls. They return `realizedUntil: null` when the price data does not yet reach 20 trading days after t0; skip such an event. `describeEvent` builds the Pinecone text. `windowZ` and `trailingZ` are the z-score maths for `newsFeatures` and the VIX z-score.
- Track B: `buildForecast` (then `withSimilarity`), `exposureChannels`, `factorExposures`, `riskSnapshot`, `suggestHedges` / `checkHedgeLimits` / `simulateHedges` are the calls for the analogs, risk and hedging nodes. See my decisions for the shapes that differ from the first signatures.

**Open**
- Backtest, eval, bench and drill scripts, `services/backtest` and the `backtest` route wait for Track A's tables and Track B's graph (Phase 2 and 3).
- The hand-check of one VaR and one scenario P&L at the Ukraine as-of needs the seeded prices.



## Track D: Terminal

Entries at H7, H12 and H18.


