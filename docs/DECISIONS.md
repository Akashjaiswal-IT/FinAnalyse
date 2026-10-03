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
| 2026-10-03 | Per-channel P&L and exposed value count each holding once, under its primary channel (direct, then peer, then factor). Channel rows sum to the exposed holdings' P&L. | Matches the Ukraine and Ida fixtures, whose channel rows reconcile to the total. A holding with several channels would otherwise be counted twice. Holdings with no channel are in no row. |
| 2026-10-03 | Exposed value uses the absolute position value. | A short touches the event as much as a long; it is the size of the position the event reaches. |
| 2026-10-03 | Peer channel: a holding is a peer when its sector is in the event's `affectedSectors`, in addition to `PEERS` and `EXTERNAL_PEERS`. A holding that is itself an entity gets the direct channel only, no peer links. | SPEC 5.14 says it "shares an affectedSectors entry with an entity"; read as: its sector is one the event affects. An entity in an affected sector would otherwise carry a redundant peer link. |
| 2026-10-03 | `expectedSign` is the sign of beta times the factor direction when every factor link agrees, else `unclear`. Entities and peers with no factor link are `unclear`. | The sign is all the channel logic can know. Summing betas of different factors would mix units. |
| 2026-10-03 | VaR and CVaR are discrete: with `k = ceil(n x (1 - 0.95))`, VaR is the k-th worst P&L and CVaR the mean of the k worst. With n = 20 they coincide. | No interpolation, so the numbers are reproducible by hand. The tests also use n = 40 and 100, where they differ. |
| 2026-10-03 | `vixZ`, and the macro node's VIX z-score, use the 252 observations strictly before the date, and need all 252. Both call `trailingZ`. | "VIX at t0 against its 252-day mean and std" leaves open whether t0 is in the baseline. Excluding it is the usual z-score and the same function serves the backtest and the live macro node. |
| 2026-10-03 | Analog eligibility is `barAvailableAt(realizedUntil) <= asOf` (`eligibleAnalogs`), not `realized_until < asOf` on dates. | A window ending on day D uses D's close, which is readable from D 21:00 UTC (SPEC 5.1). Comparing dates alone would admit it up to 21 hours early. |
| 2026-10-03 | Log returns drop, for every symbol, any day on which one symbol has a price of zero or below (WTI on 2020-04-20 and 21). `forwardLogReturn` gives null for such a price, and for a start more than 5 days before the date. | `ln` is undefined there. Dropping the day for all symbols keeps the columns aligned; the 504-day VaR window for the Ukraine as-of includes April 2020. |
| 2026-10-03 | The weather group is used between two events that both have all three weather features, which in practice means two hurricanes. | Same rule as "only between two hurricanes", but robust to a hurricane whose weather features are null. |
| 2026-10-03 | Variant T is the unweighted mean of same-type events (null if none); N is the unweighted mean of all. Neither uses the kernel. | SPEC 5.9: "T, mean of same-type events"; "N, plain mean". |
| 2026-10-03 | Backtest: `n` counts every pair; directional accuracy uses the pairs with a realized move of at least 0.25% and counts the rest in `excludedSmallMoves`; a prediction of exactly 0 is a miss. A type with fewer than 5 events keeps `n` and `excludedSmallMoves` but all other metrics are null. | SPEC 9.1: "no per-type claim" for thin types. A zero prediction calls no direction. |
| 2026-10-03 | Hurricane builder: `featureAt` is the availability time of t0's close; the track is the best track as a perfect forecast at that time (observed in the last 12 hours plus the next 72 hours); `offshoreExposure` is null when that window has no hurricane-force point, so the weather group is unavailable for that event. | Keeps the stored feature equal to what the live weather node would compute in replay. A share of zero points is undefined. |
| 2026-10-03 | `withSimilarity` sets similarity to 0 for an analog Pinecone did not return. | `AnalogMatch.similarity` is required and is the Pinecone score; the kernel weight does not need it. Track B may ask for it to become nullable. |
| 2026-10-03 | The fallback hedge takes the side its minimum-variance ratio implies (normally a sell), not always a sell. | Selling an ETF the sleeve is negatively correlated with would add risk. |
| 2026-10-03 | Interfaces changed after the signatures commit: `SimulateHedgesInput` has no `quantities` (the after-book is the before-book plus the signed order value); `summarizePredictions(predictions, minTypeEvents)` replaces the event-type map; `HedgeLimits` is an interface. New files in `packages/quant`: `event-builder.ts`, `globals.d.ts`, `exports.test.ts`; its tsconfig uses `module: ESNext`, `moduleResolution: Bundler`. | Nobody imports `@repo/quant` yet. `exports.test.ts` fails if an exported function is not referenced by a test (Gate C). |
| 2026-10-03 | `backtests` rows keep the caveats inside `config` (next to bandwidth, type weight and targets); `BacktestService` puts them back as `Backtest.caveats` when it reads a row. | The table has config, metrics and predictions columns only, and contracts `Backtest` requires caveats. Storing them in `config` needs no migration. Track A can add a column later; `toBacktest` is the only code that would change. |
| 2026-10-03 | `packages/services/backtest` saves and reads rows behind a `BacktestStore` interface and does not import `@repo/quant`; the caller passes in the run. The Postgres store is written in `scripts/backtest.ts` for now and moves into the service once Track A's schema is on `main`. | `services` has no `@repo/quant` dependency (Track B owns its package.json) and `@repo/database` on `main` has no `backtests` table yet. The service and its in-memory store compile and are tested today. |
| 2026-10-03 | `backtest-report.ts` (Markdown tables) and `results-doc.ts` (`upsertResultsSection`) live in `packages/quant`. | Both are pure string functions with tests. `RESULTS.md` is written only by scripts (SPEC 9.5), through marked sections that each script replaces in place, so the eval, bench and drills scripts can reuse the helper. |
| 2026-10-03 | The backtest report states that the unconditional mean N has a per-target Spearman of -1 under leave-one-out by construction, and that T is pushed down the same way within a type. | N predicts event i with (sum - x_i)/(n - 1), which falls as x_i rises. Found while running the script on synthetic events and confirmed against the Python reference. Models should be compared on MAE and directional accuracy first. |

## Track D: Terminal

| Date | Decision | Reason |
|---|---|---|
