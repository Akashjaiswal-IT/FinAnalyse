# Team rules

Four tracks work in parallel (docs/ROADMAP.md section 0). These rules keep merges clean. They add to the roadmap and change nothing in it. Hours (H7, H12, H18, H21) count from the start of Phase 0.

## Who owns what

| Track | Owns |
|---|---|
| A: Data | packages/database (every model and every migration); packages/services/clients/* except anthropic.ts; packages/services/{market,macro,news,events,weather,analogs,portfolio,ingest,system,queues}; apps/worker; scripts/seed.ts and scripts/seed/; data/ except data/eval/; tRPC routes system, portfolio, market, news, events, weather, macro, analogs |
| B: Agents and API (integrator) | packages/contracts; packages/services/{llm,runs}; packages/services/clients/anthropic.ts; packages/services/env.ts and package.json; packages/agents; packages/trpc except the route folders owned by A and C; apps/api; scripts/run-query.ts and scripts/stream-run.ts; root files (package.json, pnpm-lock.yaml, turbo.json, vitest.config.mts, docker-compose.yml, .env.example, .github/), packages/eslint-config, packages/typescript-config |
| C: Quant and proof | packages/quant; packages/services/backtest; tRPC route backtest; scripts/backtest.ts, eval-queries.ts, ingest-bench.ts, drills.ts; data/eval/; docs/RESULTS.md |
| D: Terminal | apps/web |

Each track edits only its own section of docs/PROGRESS.md and docs/DECISIONS.md.

## Rules

1. Branches: track/a-data, track/b-agents, track/c-quant, track/d-web. Never commit to main. Never force-push. Bring main in with `git merge origin/main`, not rebase.
2. Everything reaches main through a pull request with green CI. Track B merges with a merge commit (no squash, no rebase).
3. Need a change in a file you do not own: ask its owner. Never edit it yourself.
4. packages/contracts belongs to Track B. Changes are additive only (new fields optional; nothing renamed or removed) and update the fixtures in the same pull request.
5. Only Track A edits database models and runs `pnpm db:generate`. Others ask Track A for schema changes.
6. Add dependencies only to a package you own. If pnpm-lock.yaml conflicts, never edit it by hand: `git checkout origin/main -- pnpm-lock.yaml`, then `pnpm install`, then commit.
7. Interfaces first: within 45 minutes of starting, Track A opens a pull request with the service classes and model types for every domain it owns (SPEC section 3 service table), each method throwing "not implemented". Track C does the same for the quant function signatures. Track B merges both at once. Until real code lands, consumers use fakes with the same signatures.
8. Small additive pull requests may merge whenever CI is green. Full merge points are H7, H12 and H18, in the order A, C, B, D. After each merge, everyone else runs `git merge origin/main`.
9. Never commit .env, data/cache/ or any Tiingo data. The repository is public.
10. Live relay: Track A writes the Redis publish and subscribe functions in services/system. Track B wires them into the live route and apps/api.
11. Blocked: put a fake behind the same signature, note it in your PROGRESS section, and keep going.
12. Phase 0b first: Track B merges contracts v2 (docs/ROADMAP.md Phase 0b) before any track imports the new event types. Until then, start with work that needs no event types: Track A the HTTP wrapper, clients and Drizzle models; Track C stats, risk, geo and hedge math; Track D theme, layout and the graph component.
