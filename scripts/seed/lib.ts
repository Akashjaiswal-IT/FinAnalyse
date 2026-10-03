import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// `scripts/` is not a workspace package, so the seed imports packages by relative path; each package
// resolves its own dependencies (docs/DECISIONS.md, Track A).

export const ROOT = resolve(__dirname, "../..");
export const CACHE = resolve(ROOT, "data/cache");
export const SEED = resolve(ROOT, "data/seed");

export interface SeedOptions {
  /** Refetch upstream data even when a cached response exists. */
  refresh: boolean;
}

/** Raw upstream responses live in `data/cache/` (gitignored) so a re-run costs no quota (SPEC 10). */
export async function cachedText(path: string, options: SeedOptions, fetch: () => Promise<string>): Promise<string> {
  const file = resolve(CACHE, path);
  if (!options.refresh && existsSync(file)) return readFileSync(file, "utf8");
  const text = await fetch();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
  return text;
}

export async function cachedJson<T>(path: string, options: SeedOptions, fetch: () => Promise<T>): Promise<T> {
  return JSON.parse(await cachedText(path, options, async () => JSON.stringify(await fetch()))) as T;
}

export function chunked<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function log(step: string, message: string): void {
  console.log(`[seed:${step}] ${message}`);
}
