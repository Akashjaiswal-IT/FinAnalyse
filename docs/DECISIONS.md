# Decisions

Every deviation from `docs/SPEC.md` or `docs/ROADMAP.md`, with the reason.

| Date | Decision | Reason |
|---|---|---|
| 2026-10-03 | Root test config is `vitest.config.ts` with `test.projects`, not `vitest.workspace.ts`. | Vitest 5 removed `defineWorkspace`. |
| 2026-10-03 | Ida fixture is `packages/contracts/fixtures/ida-run.ts` (typed `RunEvent[]`), not `ida-run.json`. | The type checker and a schema test keep it valid. A JSON dump can be generated if Track D prefers it. |
| 2026-10-03 | `LiveEvent` gains a `heartbeat` member (`{ type, at }`). | The stub `live.feed` subscription needs something to yield. Remove it when the Redis relay lands. |
| 2026-10-03 | `NEWS_QUERIES` has three GDELT queries (refinery, oil and gasoline, natural gas), all hurricane-scoped. | SPEC 5.2 names the constant but not its values. |
| 2026-10-03 | Legacy `.eslintrc.cjs` files are ignored; each package has a flat `eslint.config.js`. | ESLint 9 only reads flat config. The template files extended a config that does not exist. |
| 2026-10-03 | `docker-compose.yml` gets healthchecks on both services. | The Phase 0 gate asks for a healthy stack. |
| 2026-10-03 | ESLint configs are `eslint.config.mjs`, not `.js`. | The packages are CommonJS; `.mjs` avoids a module-type warning without changing the tsup builds. |
| 2026-10-03 | `components/ui/resizable.tsx` rewritten for `react-resizable-panels` v4. | The shadcn template used the v3 names, so `check-types` failed. |
