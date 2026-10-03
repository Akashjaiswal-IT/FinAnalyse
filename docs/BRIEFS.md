# Track briefs

One detailed brief per track. Paste your track's brief at the start of every work session. These briefs extend the short session briefs in `docs/ROADMAP.md` section 0, and `docs/TEAM.md` stays binding.

| Track | Who |
|---|---|
| A: Data | assign in the team chat |
| B: Agents and API (integrator) | Akash |
| C: Quant and proof | assign in the team chat |
| D: Terminal | assign in the team chat |

**Clock.** The times assume the event started at 11:50 IST on 3 Oct, so the deadline is 11:50 IST on 4 Oct. If the real deadline differs, shift every time by the same amount.

**Keys.** Ask for your keys in the team chat and put them only in `.env`. Never paste keys into a brief, an issue or a commit.

---

## Track A: Data

```text
You are working on Tempest, a financial intelligence terminal for Codeutsav problem statement 5, in a 24-hour hackathon. Repository: https://github.com/Akashjaiswal-IT/FinAnalyse (pnpm + Turborepo, TypeScript only). Four people work in parallel, one per track. You are Track A (Data).

Clock (IST): H7 merge 18:50 today, H12 integration 23:50 today, H18 merge 05:50 tomorrow, H21 freeze 08:50, H24 submission 11:50.

Setup, once:
1. git clone https://github.com/Akashjaiswal-IT/FinAnalyse.git && cd FinAnalyse && git checkout -b track/a-data
2. cp .env.example .env. Ask me for the keys and fill them in: TIINGO_API_KEY, FRED_API_KEY, ALPHAVANTAGE_API_KEY, PINECONE_API_KEY, ANTHROPIC_API_KEY. Then run ./setup.sh. Never commit .env.
3. docker compose up -d (Postgres and Redis must be healthy), then pnpm install.
4. Run pnpm check-types && pnpm lint && pnpm test && pnpm build. It must be green before you change anything.

Read first: docs/TEAM.md; docs/SPEC.md sections 0, 1, 3, 4, 5.1 to 5.4, 5.8, 5.9, 5.12, 5.14, 6, 10, 11; docs/ROADMAP.md sections 1, 2, 4 (Track A tasks), 5.

You own: packages/database (every model and migration); packages/services/clients/* except anthropic.ts; packages/services/{market,macro,news,events,weather,analogs,portfolio,ingest,system,queues}; apps/worker; scripts/seed.ts and scripts/seed/; data/ except data/eval/; tRPC route folders system, portfolio, market, news, events, weather, macro, analogs.

Rules (docs/TEAM.md is binding):
- Edit only files you own. If you need a change in packages/contracts, write the exact request for Track B and keep working on something else. Never edit contracts yourself.
- Git:
  - Never commit to main. Never force-push. Bring main in with `git merge origin/main`, never rebase.
  - Small commits named "track a: <what>". No co-author or tool-attribution lines in commits, PRs or files.
  - After each task, run check-types, lint and the tests of what you touched, then commit and push your branch.
  - Everything reaches main through a pull request with green CI. Track B merges it.
- Verify every library and API against the installed version and real responses before building on it. Log what you find in the Track A section of docs/DECISIONS.md.
- Never invent data, numbers, dates or sources. Never weaken, skip or delete a test to get green.
- If another track blocks you, build against a fake with the same signature, note it in your docs/PROGRESS.md section, and keep going.
- If a gate still fails after 3 real fix attempts, write the blocker in PROGRESS, tell me, and move on.
- When resuming in a new session, first read docs/TEAM.md, your PROGRESS section and `git log --oneline -15`.

First 60 minutes:
1. ROADMAP section 2 checks 1 to 8 and 12 to 16. Run each with curl and record each result in DECISIONS (Track A).
   For check 15, confirm the first-report time of each replay preset from a real source. Send the confirmed times to Track B, who owns REPLAY_PRESETS in contracts.
2. Interfaces pull request ("track a: models and service interfaces"):
   - Drizzle models for every table in SPEC 6 (PKs, FKs, CHECKs, indexes) and the first migration with pnpm db:generate. Migrate must work on an empty database, and a second run must change nothing.
   - A service class per domain you own, with the SPEC section 3 signatures typed with @repo/contracts types. Method bodies throw new Error("not implemented").
   - Open the PR and tell Track B. Tracks B and C build on it.

Phase 1, until 18:50: do the ROADMAP Phase 1 Track A list.
- clients/http.ts per SPEC 5.3, with fake-fetch tests.
- Clients for tiingo, fred, gdelt, alphavantage, nhc, openmeteo, pinecone and redis. Each has a recorded fixture in data/fixtures/ and a parse test; tests never call live HTTP.
- Seed steps 1 to 4, and the Pinecone index.
- market and macro services with as-of filtering, plus the as-of test from SPEC 5.1.
- data/seed/analog-events.json:
  - At least 30 events, at least 3 per type. Start with the six presets.
  - Every event has a source URL that confirms its date.
  - If a source gives only a date, use 23:59 UTC that day.
  - Validate the file with CuratedEventSeed from contracts.
- The news prefilter with tests.
- Zip data/cache/ for the team once prices are downloaded.
Finish with GATE A.

Phase 2, until 23:50: seed steps 5 (with Track C's event builders) and 6. Then these services:
- news.search
- news.newsFeatures (one function for every event's news features, SPEC 5.9)
- events.profileFromNews and events.buildEventQuery
- weather: stormsAt, track (perfect-forecast replay), hypotheticalTrack, refineries
- analogs.search
- portfolio.snapshot
Then the read routes. Finish with GATE A2.

Phase 3, until 05:50:
- apps/worker: queues, job schedulers and per-queue limiters. Jobs gdelt, alphavantage (quota counter, AV_ROTATION), nhc, openmeteo, fred, tiingo, enrich (daily cap) and detect (rule clustering from Track C's quant/detect.ts).
- market_events, plus events.list and events.get.
- LiveEvent publishing.
- services/system: status, latency SQL, and Redis publish and subscribe functions that Track B wires into live.feed.
- Routes system.status and system.ingestNow.
- The ingest bench, with Track C.
Finish with GATE A3.

Phase 4: help polish, and write the data part of the README.

Never commit data/cache/ or any Tiingo data (licence; the repository is public). Watch quotas: Alpha Vantage 25 calls a day, GDELT 1 request per 5 s, Tiingo 50 an hour, Pinecone at most 96 records per upsert.
```

---

## Track B: Agents and API (integrator)

```text
You are working on Tempest, a financial intelligence terminal for Codeutsav problem statement 5, in a 24-hour hackathon. Repository: GitHub Akashjaiswal-IT/FinAnalyse. Four people work in parallel, one per track. You are Track B (Agents and API) and the integrator.

Clock (IST): H7 merge 18:50 today, H12 integration 23:50 today, H18 merge 05:50 tomorrow, H21 freeze 08:50, H24 submission 11:50.

Setup: git checkout main && git pull && git checkout -b track/b-agents. Run docker compose up -d, then the gate (pnpm check-types && pnpm lint && pnpm test && pnpm build).

Read first: docs/TEAM.md; docs/SPEC.md sections 0 to 3, 5 (all), 6, 7; docs/ROADMAP.md sections 1, 2, 4 (Track B tasks), 5, 6; the Track B rows in docs/DECISIONS.md (installed library findings: messages.parse with betaZodOutputFormat, StateSchema with Zod 4, PostgresSaver.fromConnString plus setup()).

You own: packages/contracts; packages/services/{llm,runs}; packages/services/clients/anthropic.ts; packages/services/env.ts and package.json; packages/agents; packages/trpc except the route folders owned by Tracks A and C; apps/api; scripts/run-query.ts and scripts/stream-run.ts; root config files.

Integrator duties:
- Merge pull requests that have green CI, with merge commits, in the order A, C, B, D at H7, H12 and H18. Merge small additive PRs whenever they are green.
- Apply contract change requests from other tracks: additive only, with fixtures updated in the same PR.
- Put Track A's confirmed replay times into REPLAY_PRESETS and set confirmed: true.

Rules: the same as docs/TEAM.md.
- Small commits named "track b: <what>". No co-author or tool-attribution lines.
- After each task run check-types, lint and tests. Never weaken, skip or delete a test.
- No LLM-written number may ever reach the user (SPEC 5.6).

Phase 1, until 18:50:
1. services/clients/anthropic.ts and services/llm:
   - parseStructured: messages.parse with zodOutputFormat. Explicit effort on Sonnet. Adaptive thinking with display summarized. Check stop_reason (refusal degrades the node; max_tokens gets one retry). Usage and cost from MODEL_PRICES. Server-side fallbacks per the DECISIONS finding.
   - runTools: strict betaZodTool tools, at most 6 iterations.
   - A fake LLM for tests.
2. agents/ledger.ts, verify.ts and rendering, with tests:
   - a digit outside a placeholder is rejected
   - an unknown key is rejected
   - every NUMERIC_ALLOWLIST entry passes
   - missing caveats are appended
3. services/runs: create, append event with seq, add evidence, complete, get, list, eventsAfter, plus an in-process EventEmitter. It uses Track A's tables: start on their interfaces PR and use a fake until it merges.
4. agents/context.ts (registry, instrumentNode) and agents/graph.ts:
   - 10 nodes, each a stub returning the contracts fixture outputs (idaNodeOutputs, ukraineNodeOutputs).
   - PostgresSaver and the history reducer.
   - fallbacks.ts: rule-based plan, keyword event classifier, template answer.
5. The real planner (prompt and Plan schema), with one planner test per event type.
6. Routes runs.create, runs.get, runs.list and runs.stream (tracked SSE, lastEventId), the live.feed stub, the concurrency guard (2 runs), the DEMO_TOKEN check and boot cleanup. Plus scripts/stream-run.ts.
Finish with GATE B.

Phase 2, until 23:50:
- Real event node: preset, news-search and hypothetical paths; Haiku classification with the keyword fallback.
- Weather node: runs only for weather subtypes, otherwise skipped.
- Sentiment, macro and analogs nodes, with Track C's forecast.
- Risk node with exposure channels from quant/exposure.ts.
- Hedging node: simulate_hedges and submit_plan tools, the fallback, the exposed sleeve.
- Synthesizer with placeholders, the verifier loop and template answer, the confidence rule, run totals.
- Prompts in agents/prompts/.
- scripts/run-query.ts.
Finish with GATE B2, then lead the whole-team integration gate at 23:50 and tag slice-1.

Phase 3, until 05:50:
- Live mode, news_scan, hypothetical events and storms, follow-ups on a thread.
- Wire Track A's relay functions into live.feed and apps/api.
- data/eval/queries.json (20 queries) and the eval script, with Track C.
- Drills, with Track C.
Finish with GATE B3.

Phase 4: README, lead the demo rehearsals (ROADMAP section 6), backup video, five slides.
```

---

## Track C: Quant and proof

```text
You are working on Tempest, a financial intelligence terminal for Codeutsav problem statement 5, in a 24-hour hackathon. Repository: https://github.com/Akashjaiswal-IT/FinAnalyse (pnpm + Turborepo, TypeScript only). Four people work in parallel, one per track. You are Track C (Quant and proof).

Clock (IST): H7 merge 18:50 today, H12 integration 23:50 today, H18 merge 05:50 tomorrow, H21 freeze 08:50, H24 submission 11:50.

Setup, once:
1. git clone https://github.com/Akashjaiswal-IT/FinAnalyse.git && cd FinAnalyse && git checkout -b track/c-quant
2. cp .env.example .env. Ask me for FRED_API_KEY now and ANTHROPIC_API_KEY before Phase 3. Then run ./setup.sh. Never commit .env.
3. docker compose up -d, then pnpm install.
4. Run pnpm check-types && pnpm lint && pnpm test && pnpm build. It must be green before you change anything.

Read first: docs/TEAM.md; docs/SPEC.md sections 0, 1, 3, 5.1, 5.8 to 5.11, 5.14, 9, 10.5, 11; docs/ROADMAP.md sections 1, 2, 4 (Track C tasks), 5.

You own: packages/quant; packages/services/backtest; the tRPC route folder backtest; scripts/backtest.ts, eval-queries.ts, ingest-bench.ts, drills.ts; data/eval/; docs/RESULTS.md.

Rules (docs/TEAM.md is binding):
- Edit only files you own. Contract changes go through Track B; database changes through Track A.
- Git:
  - Never commit to main. Never force-push. Bring main in with `git merge origin/main`, never rebase.
  - Small commits named "track c: <what>". No co-author or tool-attribution lines.
  - After each task, run check-types, lint and tests, then commit and push. Everything reaches main through a pull request with green CI.
- packages/quant stays pure: no I/O, no clock, no unseeded randomness. Every exported function gets a known-answer test.
- Report every metric exactly as measured. docs/RESULTS.md is filled only from script output.
  - Never tune the forecast on backtest results.
  - h = 1.0 is the reported result. 0.75 and 1.5 may be shown alongside it, never instead of it.
  - TYPE_WEIGHT stays 1.5.
- If a gate still fails after 3 real fix attempts, write the blocker in your PROGRESS section and tell me.
- When resuming, first read docs/TEAM.md, your PROGRESS section and `git log --oneline -15`.

First 45 minutes: open an interfaces pull request ("track c: quant signatures") with exported, typed signatures for every quant module in SPEC section 3: series, stats, risk, exposure, hedge, geo, forecast, detect, backtest. Use types from @repo/contracts; bodies throw new Error("not implemented"). Tell Track B.

Phase 1, until 18:50:
- Implement every module, with the known-answer tests listed in ROADMAP Phase 1 Track C:
  - beta and R²
  - VaR and CVaR on a fixed series
  - overlapping 5-day sums
  - haversine
  - grouped kNN: a type mismatch adds exactly TYPE_WEIGHT² to the type group; the weather group is used only between two hurricanes; leave-one-out; effective n; the fewer-than-3-analogs fallback
  - exposure channels
  - detection clustering: same type plus a shared ticker or title-word Jaccard ≥ DETECT_JACCARD; no API calls
  - severity
  - hedge sizing limits and integer quantities
  - capacity at risk
- Pure event builders for hurricanes and curated events, tested on synthetic data. Seed step 5 calls them.
Finish with GATE C.

Phase 2, until 23:50:
- Live grouped kNN forecast per holding and per target, and exposure channels, wired with Track B into the analogs and risk nodes.
- Backtest skeleton, pooled and per type.
- Hand-check one VaR and one scenario P&L at the Ukraine as-of in a spreadsheet, and record it.
Finish with GATE C2.

Phase 3, until 05:50:
- Final backtest per SPEC 9.1, models N, T, S, M, W, C:
  - a backtests row
  - tables and caveats in RESULTS.md
  - services/backtest and the backtest.latest route
- The eval script and 20 queries, with Track B.
- Drills, with Track B.
- The ingest bench, with Track A.
Finish with GATE C3 (re-running reproduces the numbers exactly).
```

---

## Track D: Terminal

```text
You are working on Tempest, a financial intelligence terminal for Codeutsav problem statement 5, in a 24-hour hackathon. Repository: https://github.com/Akashjaiswal-IT/FinAnalyse (pnpm + Turborepo, Next.js 16, TypeScript only). Four people work in parallel, one per track. You are Track D (Terminal).

Clock (IST): H7 merge 18:50 today, H12 integration 23:50 today, H18 merge 05:50 tomorrow, H21 freeze 08:50, H24 submission 11:50.

Setup, once:
1. git clone https://github.com/Akashjaiswal-IT/FinAnalyse.git && cd FinAnalyse && git checkout -b track/d-web
2. cp .env.example .env, then ./setup.sh. No API keys are needed: Phase 1 runs on fixtures.
3. pnpm install, then pnpm check-types && pnpm lint && pnpm build. It must be green before you change anything.
4. For real data in Phase 2, set NEXT_PUBLIC_API_URL=http://<Track B laptop IP>:8000/trpc (same Wi-Fi) and restart web.

Read first: docs/TEAM.md; docs/SPEC.md sections 0, 1, 2, 5.5, 5.6, 5.12, 5.13, 5.14, 7, 8; docs/ROADMAP.md sections 1, 4 (Track D tasks), 5, 6.

You own: apps/web only. Import only @repo/contracts and types from @repo/trpc/client.

Rules (docs/TEAM.md is binding):
- Edit only apps/web. Contract changes go through Track B, and must be additive.
- Git:
  - Never commit to main. Never force-push. Bring main in with `git merge origin/main`, never rebase.
  - Small commits named "track d: <what>". No co-author or tool-attribution lines.
  - After each task, run check-types, lint and pnpm --filter web build, then commit and push. Everything reaches main through a pull request with green CI.
- The UI never computes a financial number. It formats what it receives with formatValue and renderTemplate from @repo/contracts.
- Leaflet only through next/dynamic with ssr: false, and import its CSS. Import the React Flow stylesheet. Recharts only in client components.
- If a gate still fails after 3 real fix attempts, write the blocker in your PROGRESS section and tell me.
- When resuming, first read docs/TEAM.md, your PROGRESS section and `git log --oneline -15`.

Phase 1, until 18:50, built on @repo/contracts fixtures:
- Dark terminal theme on the template tokens, tabular numerals, three resizable columns (components/ui/resizable.tsx).
- mode-switch: Live or Replay, with REPLAY_PRESETS grouped by event type. Keep the state in the URL.
- query-bar with EXAMPLE_QUERIES.
- agent-graph: React Flow, the 10 nodes from NODE_ORDER and GRAPH_EDGES. Shows pending, running, done, skipped, degraded and failed, plus durations. Clicking a node opens the drilldown.
- step-log, event-card, answer-card, evidence-chip (hover shows label, source and as-of; click opens the row), hedge-table, drilldown-sheet.
- portfolio-panel: sector groups, plus exposure badges from the risk report's channels.
- hooks/use-run-stream.ts: one interface for a fixture player and for the real subscription. The fixture player replays idaRunEvents and ukraineRunEvents with delays.
Finish with GATE D: web builds, both fixture runs play end to end, screenshots in your PROGRESS section.

Phase 2, until 23:50:
- Wire portfolio.get, runs.create, runs.stream (resume with lastEventId), runs.get for the drilldown, analogs.list, news.list, and weather.track for the map.
- Loading, empty and error states. Disable the query bar while a run is active.
Then join the integration gate at 23:50.

Phase 3, until 05:50, the P1 components:
- event-feed: fixtureMarketEvents first, then events.list and the live messages; "Analyse" starts a run with marketEventId.
- risk-summary and risk-compare-chart.
- forecast-chart.
- weather-map: shows "no storm" for other events.
- news-feed with "Ingest now" and the measured latency.
- price-chart, source-health, analog-table grouped by type.
- The reliability page with per-type tables.
Finish with GATE D3: no console errors.

Phase 4: P2 only if time remains (realized-panel, audit report page), polish, demo rehearsals.
```
