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

A run takes about a minute. If the page is reloaded mid-run, it follows the same run again (the run id is in the URL). A finished run opens instantly from its URL, which is the quickest fallback when the model or network is slow: on the demo machine, the Ida run `05647989-c68a-4e39-af9a-0ad1d2a60612` is at `/analyze?mode=replay&preset=disaster-hurricane-ida-2021&run=05647989-c68a-4e39-af9a-0ad1d2a60612`. Run ids exist only in the database that ran them.

A recorded walkthrough (Ukraine, Ida, Live tabs, Reliability; 4 minutes, 1600x1000) is kept outside the repository as `tempest-demo-backup.webm`; it plays in Chrome.

## The story

1. **The problem (30 s).** A portfolio manager hears about an event and needs to know, in minutes, which holdings it reaches, how far markets moved after similar events, and what to hedge. Hurricanes are one case; wars, tariffs, central-bank surprises, accidents and competitor news are the others.
2. **Dashboard (30 s).** The portfolio now: value, cash, volatility regime, the heatmap (box size is weight, colour is today's move), holdings tagged short-term or long-term with their recent prices. Click a box: the stock drawer shows the price chart with news days marked and every article with its source.
3. **An alert arrives (20 s).** Alerts, then "Simulate an incoming alert": the toast and the bell show an event that reached the refiners, with the holdings, the expected direction, the confidence and the sources. Nobody asked a question.
4. **Analysis (90 s).** "Run the full analysis" opens Analyze and starts the run. Replay fixes the clock at the event's time; nothing later can be read.
   - The agent graph: planner, event, then weather, sentiment and macro in parallel, then analogs, risk, hedging, synthesizer, verifier, with a progress bar.
   - The headline numbers: scenario result before and after hedges, value at risk, exposed value by channel, confidence.
   - The answer: every number is a chip. Hover one for its source and time; click it for the evidence row. The verifier line says how many numbers were ungrounded (zero).
   - Hurricane Ida adds the storm track and the refineries inside the impact radius; "What happened next" compares the forecast with what markets did.
5. **Ideas (30 s).** What to sell and what to buy, each with its reasons, sources, horizon and the risk before and after.
6. **Proof (45 s).** Reliability: the backtest against five baselines with its caveats; then `docs/RESULTS.md`: the eval over 20 questions and the robustness drills.
7. **Close (15 s).** Light mode for the projector (the sun icon), the tour for a new user (Tour), and the line: real data end to end, numbers never written by the model, every claim traceable to a source.

The Alerts and Ideas pages show preview data (a label says so) until their services are built; their buttons run the real analysis.

## Likely questions

- *Where do the numbers come from?* Every figure is an evidence row added by a node (observed, computed, model or assumption), with source and as-of time. The model writes `{{E12}}` placeholders; the verifier rejects any digit outside one.
- *How good is the forecast?* See the reliability page. With 64 events the samples per type are small, and the page says so; the same-type mean is the strongest baseline.
- *What if a data source is down?* The node ends degraded, the run continues, the answer names the gap and confidence drops. `pnpm drills` checks this for every source.
- *Is the portfolio real?* No: a fixed paper portfolio of 23 positions. Hedges use ETFs and nothing is sent to a broker.
