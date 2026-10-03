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



## Track D: Terminal

Entries at H7, H12 and H18.


