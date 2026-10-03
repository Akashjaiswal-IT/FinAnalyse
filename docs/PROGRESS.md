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

### H7: Phase 1 on fixtures (2026-10-03)

**Works** (all in `apps/web`, built on `@repo/contracts` fixtures; no API or keys needed)
- Dark terminal theme on the template tokens (blue-black surfaces, amber accent, green/red for direction, blue/violet for factor/model), tabular numerals, three resizable columns. Resizing checked with mouse and keyboard, which closes the Phase 0 open item on `components/ui/resizable.tsx`.
- `mode-switch`: Live or Replay, `REPLAY_PRESETS` grouped by event type, as-of field (UTC, 2017-01-01 to now). Mode, preset and as-of live in the URL and survive a reload.
- `query-bar` with `EXAMPLE_QUERIES` (500 characters, Enter sends, disabled while a run is active). Two chips also select the matching preset.
- `agent-graph` (React Flow, `NODE_ORDER`, `GRAPH_EDGES`): pending, running, done, skipped, degraded and failed, with durations; a node click opens the drilldown.
- `step-log`, `event-card`, `answer-card`, `evidence-chip` (hover: label, source, as-of, basis; click: the row), `hedge-table`, `drilldown-sheet` (steps with model, tokens, cost and thinking summary; evidence ledger with links; verifier report; detail views for a hedge action and for an exposure badge), `portfolio-panel` (sector groups, a badge per exposure channel from the risk report, a sentiment chip per holding).
- `hooks/use-run-stream.ts`: one hook over a `RunDriver`. The fixture player replays `idaRunEvents` and `ukraineRunEvents` in about ten seconds each. Evidence and run state come from one pure reducer (`lib/run-state.ts`).
- Every number on screen is a chip or text from the server, formatted with `formatValue` / `formatEvidence` / the template split. An unknown evidence key renders as a red `E99?` chip, never a guessed value. A run that fails (or whose stream breaks) marks the nodes still running as failed.

**Gate D**
- `pnpm --filter web check-types`, `pnpm --filter web lint`, `pnpm --filter web build` green. `pnpm --filter web test`: 41 tests green.
- Both fixture runs play end to end in a real browser (Edge, production build): all ten nodes finish, Ukraine shows `weather` skipped, Ida shows it done with the "perfect-forecast replay" badge, the verifier reports 0 ungrounded numbers. A scripted browser pass of 24 checks (graph states, chip, node, badge, hedge row and verification drilldowns, preset switch, URL persistence on reload, live and unrecorded-preset messages, as-of validation, Enter to submit, hover card, panel resize) passes with no console errors or warnings.
- Not checked: Safari and Firefox, narrow (mobile) widths (cut list), screen readers. 1280x720, 1600x1000 and 1920x1080 checked with Edge.

Screenshots (Ukraine replay, Ida replay, drilldown):

![Ukraine, before the run](../apps/web/screenshots/phase1-ukraine-idle.png)
![Ukraine, mid-run: weather skipped, specialists done, factor badges on the portfolio](../apps/web/screenshots/phase1-ukraine-midrun.png)
![Ukraine, complete](../apps/web/screenshots/phase1-ukraine-complete.png)
![Ida, complete: weather ran, perfect-forecast replay](../apps/web/screenshots/phase1-ida-complete.png)
![Drilldown on an evidence row](../apps/web/screenshots/phase1-drilldown-evidence.png)
![Drilldown on a step](../apps/web/screenshots/phase1-drilldown-step.png)
![Drilldown on an exposure badge](../apps/web/screenshots/phase1-drilldown-exposure.png)

The fixtures never fail, so the failed, degraded and repaired nodes, the template-answer and partial badges, an unresolved placeholder, a stale chip, a fallback hedge plan with a violation and a failed run were rendered from synthetic events by a throwaway page (not committed):

![Non-happy states](../apps/web/screenshots/phase1-nonhappy-states.png)

**Next (Phase 2)**
- A `RunDriver` over `runs.create` and `runs.stream` (resume with `lastEventId`), plus `portfolio.get`, `runs.get` for the drilldown, `analogs.list`, `news.list`, `weather.track`. Needs Track B's routes: `runsRouter` is still empty on `main`.
- Loading, empty and error states per panel, and a toast on failure.

**Open**
- Replay preset times other than Ida are provisional (`confirmed: false`); the UI says so in the preset list and the event card until Track A confirms them.
- Requests to Track B are in DECISIONS (Track D): register `apps/web` in `vitest.config.mts`, an optional `input` on `step.completed`, a log-return formatter.
- In fixture mode the question text is ignored: the run played is the recorded one for the selected preset.


