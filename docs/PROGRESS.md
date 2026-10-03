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

### Phase 1: foundations (2026-10-03)

**Works**
- `services/llm`: `parseStructured` (effort, adaptive summarized thinking, fallbacks, refusal and `max_tokens` handling, usage and cost from `MODEL_PRICES`), `runTools` (strict tools, at most 6 iterations), `FakeLlm`. Tested against a stub client for the request shape.
- `agents`: evidence ledger, verifier (placeholders, digits, hedge limits, universe, caveats), answer rendering, computed confidence, rule-based plan and event classifier, template answer, ten-node graph with `PostgresSaver` and the `history` reducer. Real planner, synthesizer and verifier; the seven data nodes return the Ukraine and Ida fixture outputs until Phase 2.
- `services/runs`: create, append event with `seq`, add evidence, complete, get, list, `eventsAfter`, resumable `stream`, boot cleanup. In-memory repo until Track A's tables land.
- Routes `runs.create/get/list/stream` (tracked SSE with `lastEventId`), the concurrency guard (2 runs, one per thread), the `x-demo-token` check, boot cleanup. `live.feed` stays the heartbeat stub.
- `scripts/stream-run.ts <runId> [--drop-after=n]` prints a run's events and reconnects with `lastEventId`.

**Gate B:** `pnpm check-types`, `pnpm lint`, `pnpm test` (162 tests) and `pnpm build` are green. The fake-LLM graph tests cover the full event order, a node that throws ending `degraded` with the run still completing, and one raw digit causing exactly one repair and then the template answer. `curl -X POST localhost:8000/api/runs` returns a run id; `stream-run.ts` printed all 28 events across a reconnect at `lastEventId=7`. The PostgresSaver was checked against the compose Postgres: a second run on the same thread saw the first run in `history`.

**Open**
- The Anthropic key in `.env` answers with "credit balance is too low", so no live model call has succeeded yet. The run above finished `partial` through the planner and synthesizer fallbacks, which doubles as the first robustness drill. Request shapes (including `fallbacks`) are unverified against the live API until credit is added.
- `system.status` and `portfolio.get` belong to Track A's route folders; Track D should not wait on them from Track B.


## Track C: Quant and proof

Entries at H7, H12 and H18.



## Track D: Terminal

Entries at H7, H12 and H18.


