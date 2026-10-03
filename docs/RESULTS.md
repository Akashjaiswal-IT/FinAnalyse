This file is written only by Track C's scripts.

# Results

Tables below are written only from script output (`pnpm backtest`, `pnpm eval`, `pnpm bench:ingest`, `pnpm drills`), each with date, machine and commit. Never typed by hand.

<!-- results:backtest:start -->
## Backtest (leave-one-out, SPEC 9.1)

- Run: 2026-10-03T12:18:14.232Z on Akashs-MacBook-Air.local, commit `668c570`.
- Events: 64 (accident 7, corporate 4, disaster 31, geopolitical 6, macro 5, policy 3, statement 3, supply_shock 5). Targets: SPY, WTI, GULF_GASOLINE, HH_NATGAS, GLD, TLT.
- Reported result: bandwidth h = 1, type weight 1.5. Both are fixed and were not tuned on these results.
- Models:
  - N: unconditional mean of all events
  - T: mean of same-type events
  - S: news features only
  - M: market-regime (VIX) only
  - W: weather features only (hurricanes)
  - C: combined (type, news, regime, weather)
- n counts every (event, target) pair with a prediction and a realized return. Directional accuracy uses the pairs whose realized 5-day move is at least 0.25% in size; the others are counted in "Small moves excluded". MAE is in log-return percentage points.

### Pooled (all targets)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 384 | 49.3% | 29 | 5.49% | -0.23 |
| T | 384 | 61.4% | 29 | 5.78% | 0.17 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 384 | 56.6% | 29 | 5.22% | -0.04 |
| W | 156 | 53.5% | 14 | 4.83% | -0.00 |
| C | 384 | 52.4% | 29 | 5.23% | -0.02 |

### Per target

#### SPY

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 33.9% | 8 | 1.97% | -1.00 |
| T | 64 | 64.3% | 8 | 1.83% | -0.06 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 60.7% | 8 | 1.89% | -0.71 |
| W | 26 | 68.2% | 4 | 1.57% | -0.05 |
| C | 64 | 46.4% | 8 | 1.90% | -0.30 |

#### WTI

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 35.5% | 2 | 5.88% | -1.00 |
| T | 64 | 61.3% | 2 | 5.81% | 0.04 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 58.1% | 2 | 5.18% | -0.58 |
| W | 26 | 54.2% | 2 | 4.27% | -0.56 |
| C | 64 | 58.1% | 2 | 5.18% | -0.24 |

#### GULF_GASOLINE

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 57.1% | 1 | 8.04% | -1.00 |
| T | 64 | 61.9% | 1 | 8.40% | 0.04 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 52.4% | 1 | 7.19% | -0.53 |
| W | 26 | 34.6% | 0 | 6.48% | -0.30 |
| C | 64 | 36.5% | 1 | 7.25% | -0.34 |

#### HH_NATGAS

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 48.4% | 2 | 13.62% | -1.00 |
| T | 64 | 66.1% | 2 | 14.92% | 0.00 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 53.2% | 2 | 13.41% | -0.06 |
| W | 26 | 68.0% | 1 | 13.59% | 0.13 |
| C | 64 | 56.5% | 2 | 13.44% | -0.07 |

#### GLD

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 68.4% | 7 | 1.72% | -1.00 |
| T | 64 | 63.2% | 7 | 1.86% | -0.19 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 66.7% | 7 | 1.85% | -0.82 |
| W | 26 | 82.6% | 3 | 1.63% | -0.45 |
| C | 64 | 66.7% | 7 | 1.82% | -0.59 |

#### TLT

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 64 | 52.7% | 9 | 1.69% | -1.00 |
| T | 64 | 50.9% | 9 | 1.86% | -0.24 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 64 | 49.1% | 9 | 1.78% | -0.86 |
| W | 26 | 13.6% | 4 | 1.46% | -0.62 |
| C | 64 | 50.9% | 9 | 1.77% | -0.62 |

### Per event type

#### accident (7 events)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 42 | 47.2% | 6 | 7.26% | -0.32 |
| T | 42 | 50.0% | 6 | 9.58% | -0.02 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 42 | 50.0% | 6 | 7.09% | -0.22 |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 42 | 50.0% | 6 | 7.14% | -0.18 |

#### corporate (4 events, fewer than 5: no per-type claim)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 24 | n/a | 4 | n/a | n/a |
| T | 24 | n/a | 4 | n/a | n/a |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 24 | n/a | 4 | n/a | n/a |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 24 | n/a | 4 | n/a | n/a |

#### disaster (31 events)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 186 | 51.5% | 17 | 4.69% | -0.12 |
| T | 186 | 62.7% | 17 | 4.71% | -0.04 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 186 | 61.5% | 17 | 4.68% | 0.01 |
| W | 156 | 53.5% | 14 | 4.83% | -0.00 |
| C | 186 | 53.8% | 17 | 4.72% | -0.03 |

#### geopolitical (6 events)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 36 | 50.0% | 0 | 4.31% | -0.35 |
| T | 36 | 58.3% | 0 | 4.59% | -0.02 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 36 | 61.1% | 0 | 4.17% | -0.16 |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 36 | 61.1% | 0 | 4.22% | -0.20 |

#### macro (5 events)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 30 | 41.4% | 1 | 10.18% | -0.11 |
| T | 30 | 58.6% | 1 | 8.88% | 0.39 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 30 | 58.6% | 1 | 7.06% | 0.31 |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 30 | 55.2% | 1 | 6.93% | 0.33 |

#### policy (3 events, fewer than 5: no per-type claim)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 18 | n/a | 0 | n/a | n/a |
| T | 18 | n/a | 0 | n/a | n/a |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 18 | n/a | 0 | n/a | n/a |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 18 | n/a | 0 | n/a | n/a |

#### statement (3 events, fewer than 5: no per-type claim)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 18 | n/a | 0 | n/a | n/a |
| T | 18 | n/a | 0 | n/a | n/a |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 18 | n/a | 0 | n/a | n/a |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 18 | n/a | 0 | n/a | n/a |

#### supply_shock (5 events)

| Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|
| N | 30 | 41.4% | 1 | 6.29% | -0.51 |
| T | 30 | 58.6% | 1 | 7.19% | 0.21 |
| S | 0 | n/a | 0 | n/a | n/a |
| M | 30 | 62.1% | 1 | 5.90% | 0.13 |
| W | 0 | n/a | 0 | n/a | n/a |
| C | 30 | 55.2% | 1 | 6.02% | 0.04 |

### Bandwidth sensitivity (pooled)

The reported result is h = 1. The other bandwidths are shown next to it, never instead of it.

| h | Model | n | Directional accuracy | Small moves excluded | MAE | Spearman |
|---|---|---|---|---|---|---|
| 0.75 | N | 384 | 49.3% | 29 | 5.49% | -0.23 |
| 0.75 | T | 384 | 61.4% | 29 | 5.78% | 0.17 |
| 0.75 | S | 0 | n/a | 0 | n/a | n/a |
| 0.75 | M | 384 | 56.9% | 29 | 5.22% | 0.01 |
| 0.75 | W | 156 | 52.1% | 14 | 5.12% | 0.03 |
| 0.75 | C | 384 | 51.0% | 29 | 5.22% | 0.04 |
| 1 (reported) | N | 384 | 49.3% | 29 | 5.49% | -0.23 |
| 1 (reported) | T | 384 | 61.4% | 29 | 5.78% | 0.17 |
| 1 (reported) | S | 0 | n/a | 0 | n/a | n/a |
| 1 (reported) | M | 384 | 56.6% | 29 | 5.22% | -0.04 |
| 1 (reported) | W | 156 | 53.5% | 14 | 4.83% | -0.00 |
| 1 (reported) | C | 384 | 52.4% | 29 | 5.23% | -0.02 |
| 1.5 | N | 384 | 49.3% | 29 | 5.49% | -0.23 |
| 1.5 | T | 384 | 61.4% | 29 | 5.78% | 0.17 |
| 1.5 | S | 0 | n/a | 0 | n/a | n/a |
| 1.5 | M | 384 | 57.2% | 29 | 5.24% | -0.06 |
| 1.5 | W | 156 | 53.5% | 14 | 4.72% | -0.01 |
| 1.5 | C | 384 | 55.5% | 29 | 5.34% | -0.05 |

### Caveats

- Small samples: 64 events (accident 7, corporate 4, disaster 31, geopolitical 6, macro 5, policy 3, statement 3, supply_shock 5). Types with fewer than 5 events (corporate, policy, statement) carry no per-type claim.
- Curated events were chosen with hindsight, because each is known to have moved markets (selection bias).
- Hurricane weather features use the best track, which is more accurate than the forecast available at the time.
- Leave-one-out also trains on events that happened after the one it predicts; it is not a walk-forward test.
- An event with no realized 5-day return for a target is left out of that target's metrics.
- Under leave-one-out the unconditional mean (N) predicts each event from all the others, so its prediction falls as the event's own return rises: its per-target Spearman is -1 by construction when every event has data, and the same effect lowers T within a type. Compare models on MAE and directional accuracy before Spearman.
<!-- results:backtest:end -->

<!-- results:eval:start -->
## Orchestration eval (SPEC 9.2)

- Run: 2026-10-03T16:06:07.173Z on Akashs-MacBook-Air.local, commit `16059a0 (uncommitted changes)`, 20 queries from data/eval/queries.json.
- Runs: 19 succeeded, 1 partial, 0 failed.
- Plans: 20 model, 0 rule-based. Answers: 20 model, 0 template.

| Metric | Value |
|---|---|
| Intent accuracy | 95.0% (19/20) |
| Event-type accuracy | 95.0% (19/20) |
| Event-source accuracy | 95.0% (19/20) |
| Specialist recall | 94.3% (50/53) |
| Specialist precision | 94.3% (50/53) |
| Verifier pass, first try | 95.0% |
| Verifier pass, after repair | 100.0% |
| Hedge-limit pass | 100.0% (15 plans) |
| Run latency p50 / p95 | 44.9 s / 78.8 s |
| First completed step p50 / p95 | 3.7 s / 5.2 s |
| Cost per run (mean) | $0.0444 |

| Query | Group | Status | Intent | Event type | Source | Specialists called | Answer |
|---|---|---|---|---|---|---|---|
| q01 | event_impact | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q02 | event_impact | succeeded | ok | ok | ok | weather, sentiment, macro, analogs | model |
| q03 | event_impact | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q04 | event_impact | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q05 | event_impact | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q06 | event_impact | succeeded | wrong | ok | ok | sentiment, analogs | model |
| q07 | what_if | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q08 | what_if | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q09 | what_if | succeeded | ok | ok | ok | weather, sentiment, macro, analogs | model |
| q10 | follow_up | succeeded | ok | ok | ok | weather, sentiment, macro, analogs | model |
| q11 | follow_up | succeeded | ok | wrong | ok | sentiment, macro, analogs | model |
| q12 | portfolio_risk | succeeded | ok | ok | ok | macro | model |
| q13 | portfolio_risk | succeeded | ok | ok | ok | macro | model |
| q14 | reallocation | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q15 | reallocation | succeeded | ok | ok | ok | weather, sentiment, analogs | model |
| q16 | news_scan | succeeded | ok | ok | wrong | sentiment, macro | model |
| q17 | news_scan | partial | ok | ok | ok | sentiment, macro, analogs | model |
| q18 | competitor | succeeded | ok | ok | ok | sentiment, analogs | model |
| q19 | statement | succeeded | ok | ok | ok | sentiment, macro, analogs | model |
| q20 | out_of_scope | succeeded | ok | ok | ok | none | model |
<!-- results:eval:end -->

<!-- results:drills:start -->
## Robustness drills (SPEC 9.4)

- Run: 2026-10-03T16:48:29.082Z on Akashs-MacBook-Air.local, commit `ad9730f (uncommitted changes)`. 26/26 drill runs pass every check.
- Checks: the run does not fail; a caveat or warning names the missing input (n/a where the input is read from Postgres at run time); confidence is not above the baseline; no unresolved placeholders; no digits outside placeholders.

| Drill | Question | Status | Confidence | Not failed | Caveat | Confidence | Placeholders | Digits |
|---|---|---|---|---|---|---|---|---|
| baseline | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| baseline | ida | succeeded | high | pass | n/a | pass | pass | pass |
| tiingo disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| tiingo disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| fred disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| fred disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| eia disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| eia disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| alphavantage disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| alphavantage disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| nhc disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| nhc disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| gdelt disabled | ukraine | succeeded | medium | pass | pass | pass | pass | pass |
| gdelt disabled | ida | succeeded | high | pass | pass | pass | pass | pass |
| openmeteo disabled | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| openmeteo disabled | ida | succeeded | high | pass | n/a | pass | pass | pass |
| pinecone unreachable | ukraine | partial | medium | pass | pass | pass | pass | pass |
| pinecone unreachable | ida | partial | medium | pass | pass | pass | pass | pass |
| all news sources disabled | ukraine | partial | medium | pass | pass | pass | pass | pass |
| all news sources disabled | ida | partial | medium | pass | pass | pass | pass | pass |
| alpha vantage quota at 24 | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| alpha vantage quota at 24 | ida | succeeded | high | pass | n/a | pass | pass | pass |
| enrichment quota exhausted | ukraine | succeeded | medium | pass | n/a | pass | pass | pass |
| enrichment quota exhausted | ida | succeeded | high | pass | n/a | pass | pass | pass |
| invalid ANTHROPIC_API_KEY | ukraine | partial | medium | pass | pass | pass | pass | pass |
| invalid ANTHROPIC_API_KEY | ida | partial | high | pass | pass | pass | pass | pass |
<!-- results:drills:end -->
