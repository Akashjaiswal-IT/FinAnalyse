# Decisions

Every deviation from `docs/SPEC.md` or `docs/ROADMAP.md`, with the reason.

## Phase 0

| Date | Decision | Reason |
|---|---|---|
| 2026-10-03 | Root test config is `vitest.config.mts` with `test.projects`, not `vitest.workspace.ts`. | Vitest 5 removed `defineWorkspace`. |
| 2026-10-03 | Ida fixture is `packages/contracts/fixtures/ida-run.ts` (typed `RunEvent[]`), not `ida-run.json`. | The type checker and a schema test keep it valid. A JSON dump can be generated if Track D prefers it. |
| 2026-10-03 | `LiveEvent` gains a `heartbeat` member (`{ type, at }`). | The stub `live.feed` subscription needs something to yield. Remove it when the Redis relay lands. |
| 2026-10-03 | `NEWS_QUERIES` has three GDELT queries (refinery, oil and gasoline, natural gas), all hurricane-scoped. | SPEC 5.2 names the constant but not its values. |
| 2026-10-03 | Legacy `.eslintrc.cjs` files were deleted; each package has a flat `eslint.config.mjs`. | ESLint 9 only reads flat config. The template files extended a config that does not exist. |
| 2026-10-03 | `docker-compose.yml` gets healthchecks on both services. | The Phase 0 gate asks for a healthy stack. |
| 2026-10-03 | ESLint configs are `eslint.config.mjs`, not `.js`. | The packages are CommonJS; `.mjs` avoids a module-type warning without changing the tsup builds. |
| 2026-10-03 | `components/ui/resizable.tsx` rewritten for `react-resizable-panels` v4. | The shadcn template used the v3 names, so `check-types` failed. |
| 2026-10-03 | SPEC v2 (proposal): the market event is the centre of the design, not the Gulf hurricane. Eight event types, multi-sector universe (37 symbols), new `event` node, exposure channels, curated event library, per-type backtest. See SPEC section 0. | PS5 uses the hurricane only as an example ("For example") and asks for global news, geopolitical events and cross-asset impact. Pending team review; contracts v2 is ROADMAP Phase 0b. |

## Track A: Data

| Date | Decision | Reason |
|---|---|---|

## Track B: Agents and API

| Date | Decision | Reason |
|---|---|---|
| 2026-10-03 | Sonnet calls that need `fallbacks` go through `client.beta.messages.parse` and `client.beta.messages.toolRunner` with `betaZodOutputFormat` and `betaZodTool`. The non-beta `messages.parse` has no `fallbacks`. `zodOutputFormat` takes Zod 4 schemas. | Read from the @anthropic-ai/sdk 0.131.0 type definitions (Part 1, finding a). |
| 2026-10-03 | Graph state uses `StateSchema` and `ReducedValue` with Zod 4 schemas; `Annotation` is also exported. | @langchain/langgraph 1.4.18 accepts schemas that implement Standard Schema and Standard JSON Schema, and its peer range allows zod ^4.2. Read from types, not yet run (Part 1, finding b). |
| 2026-10-03 | The checkpointer is `PostgresSaver.fromConnString(url)` followed by `setup()`; `agents` has no direct `pg` dependency. | @langchain/langgraph-checkpoint-postgres 1.0.5 exports both and depends on pg itself (Part 1, finding c). |
| 2026-10-03 | Deleted packages/trpc/server/services/index.ts; each route file creates its own service instances. | A shared registry would be edited by three tracks. |
| 2026-10-03 | Phase 0b: `ExposureChannel`, `ChannelLink` and `HoldingExposure` live in `schemas/event.ts`, not `agents.ts`. | `portfolio.ts` needs them and `agents.ts` imports `portfolio.ts`; this avoids a circular import. |
| 2026-10-03 | `EventProfile` adds `externalNames`, `gdeltQuery` and `newsBasis` to the SPEC 5.14 fields. | Peers come from non-universe names; the query and the news basis (observed, assumed, unavailable) are shown in the drilldown and drive the hypothetical path. |
| 2026-10-03 | Factor directions and entity sentiment are lists of entries, not records. | Structured LLM output handles lists reliably, and Zod 4 records with enum keys require every key. Track A maps them to the jsonb columns. |
| 2026-10-03 | `event.detected` and `event.updated` carry the event type as `eventType`. | `type` is the discriminator of `LiveEvent`. |
| 2026-10-03 | Replay preset times other than Ida are provisional (`confirmed: false`). | Track A confirms each `firstReportAt` against a source (ROADMAP section 2, check 15) and updates `asOf`. |
| 2026-10-03 | `NUMERIC_ALLOWLIST` adds `737 MAX 9`, `737 MAX`, `COVID-19`, `G20`, `G7`. | Names in the presets and analogs contain digits; longer entries come first because the verifier strips them in order. |
| 2026-10-03 | `RiskReport` drops the refiner elasticity `gamma`; `analogPnl` is in USD. | SPEC v2 5.10 forecasts every holding directly, so the capacity elasticity is no longer used. |
| 2026-10-03 | Backtest metrics are partial records per model. | The weather-only model (W) exists only for hurricanes. |
| 2026-10-03 | Tickers that are also common words (SPY, BA, DAL, USO) are matched by company or fund name only; Alpha Vantage ticker entries hold one ticker each. | Broad news would tag "spy" or "ba" wrongly; several tickers in one Alpha Vantage call means AND. |

## Track C: Quant and proof

| Date | Decision | Reason |
|---|---|---|

## Track D: Terminal

| Date | Decision | Reason |
|---|---|---|
