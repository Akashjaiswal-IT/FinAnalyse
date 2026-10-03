import { describe, expect, it } from "vitest";
import * as quant from "./index";

// Gate C: every exported function has at least one test. The test sources are read as text, so a function that
// is exported but never mentioned by any other test file fails here.
const sources = import.meta.glob("./*.test.ts", { query: "?raw", import: "default", eager: true });

describe("test coverage of the public API", () => {
  const others = Object.entries(sources)
    .filter(([file]) => !file.endsWith("exports.test.ts"))
    .map(([, text]) => text);
  const functions = Object.entries(quant)
    .filter(([, value]) => typeof value === "function")
    .map(([name]) => name)
    .sort();

  it("exports the functions the modules define", () => {
    expect(functions.length).toBeGreaterThan(60);
    expect(others.length).toBeGreaterThanOrEqual(10);
  });

  it.each(functions)("%s is referenced by a test", (name) => {
    const pattern = new RegExp(`\\b${name}\\b`);
    expect(others.some((text) => pattern.test(text))).toBe(true);
  });
});
