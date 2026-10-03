# Demo script

About five minutes. Rehearse it twice on the machine you present from.

## Before you present

1. `docker compose up -d`, then start the api, worker and web in three terminals. If your shell exports `ANTHROPIC_API_KEY` or `ANTHROPIC_BASE_URL`, unset them first:
   ```sh
   env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL pnpm --filter @repo/api dev
   env -u ANTHROPIC_API_KEY -u ANTHROPIC_BASE_URL pnpm --filter @repo/worker dev
   pnpm --filter web dev
   ```
2. Run `pnpm score:replay` once (idempotent), so replay runs do not wait on news scoring.
3. Open <http://localhost:3000>, open the Sources tab and check that anthropic, pinecone, tiingo and fred are green. Run the Ukraine question once so every cache is warm.
4. If the Anthropic key has no credit, answers are built from templates and the run ends `partial`. Say so if asked; the numbers are the same, only the prose differs.
5. If the network fails during the demo, restart web with `NEXT_PUBLIC_DATA_SOURCE=fixture` to play the recorded Ukraine and Ida runs. The header then shows a "fixture data" badge.

A run takes about a minute. If the page is reloaded mid-run, it follows the same run again (the run id is in the URL). A finished run opens instantly from its URL, which is the quickest fallback when the model or network is slow: on the demo machine, the Ida run `05647989-c68a-4e39-af9a-0ad1d2a60612` is at `/?mode=replay&preset=disaster-hurricane-ida-2021&run=05647989-c68a-4e39-af9a-0ad1d2a60612`. Run ids exist only in the database that ran them.

A recorded walkthrough (Ukraine, Ida, Live tabs, Reliability; 4 minutes, 1600x1000) is kept outside the repository as `tempest-demo-backup.webm`; it plays in Chrome.

## The story

1. **The problem (30 s).** A portfolio manager hears about an event and needs to know, in minutes, which holdings it reaches, how far markets moved after similar events, and what to hedge. Hurricanes are one case; wars, tariffs, central-bank surprises, accidents and competitor news are the others.
2. **Replay: Russia invades Ukraine (90 s).** Replay, preset "Russia invades Ukraine (2022)". The as-of is 25 Feb 2022, 02:40 UTC; nothing after that time can be read. Ask the example question.
   - The agent graph: planner, event, then weather (skipped: not a storm), sentiment and macro in parallel, then analogs, risk, hedging, synthesizer, verifier.
   - The portfolio panel: direct, peer and factor exposure badges per holding.
   - The answer: every number is a chip. Hover one to show its source and as-of time; click to open the evidence row. The verifier line says how many numbers were ungrounded (zero).
   - Risk: scenario P&L by sector, VaR, and the hedge plan's before and after.
   - Analog forecast: the closest past events and their weights.
3. **Replay: Hurricane Ida (60 s).** Pick the hurricane example. Weather runs this time: the storm track, the refineries inside the impact radius, Gulf refining capacity at risk, then the hedge on the energy sleeve.
4. **Live (45 s).** Switch to Live. Sources tab: health and last latency per source. News tab: "Ingest now" queues GDELT, NHC and Alpha Vantage; the measured ingest latency is above the list. Events tab: clusters the worker detected; "Analyse" runs the graph on one.
5. **Proof (45 s).** Click Reliability. A leave-one-out backtest over 64 past events against five baselines, with the caveats printed under the tables. Then `docs/RESULTS.md`: the eval over 20 questions and the robustness drills, each with date and commit.
6. **Close (15 s).** Real data end to end, numbers never written by the model, and each claim traceable to a source.

## Likely questions

- *Where do the numbers come from?* Every figure is an evidence row added by a node (observed, computed, model or assumption), with source and as-of time. The model writes `{{E12}}` placeholders; the verifier rejects any digit outside one.
- *How good is the forecast?* See the reliability page. With 64 events the samples per type are small, and the page says so; the same-type mean is the strongest baseline.
- *What if a data source is down?* The node ends degraded, the run continues, the answer names the gap and confidence drops. `pnpm drills` checks this for every source.
- *Is the portfolio real?* No: a fixed paper portfolio of 23 positions. Hedges use ETFs and nothing is sent to a broker.
