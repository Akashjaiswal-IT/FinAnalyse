import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DIR = resolve(__dirname, "../../data/fixtures");

/** A recorded upstream response from `data/fixtures/` (tests never call live HTTP). */
export function fixtureText(name: string): string {
  return readFileSync(resolve(DIR, name), "utf8");
}

export function fixtureJson(name: string): unknown {
  return JSON.parse(fixtureText(name));
}
