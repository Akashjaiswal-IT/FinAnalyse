import { describe, expect, it } from "vitest";
import { upsertResultsSection } from "./results-doc";

const HEADER = "# Results\n\nTables below are written only from script output.\n\nNothing has been measured yet.\n";
const mark = (name: string, body: string) => `<!-- results:${name}:start -->\n${body}\n<!-- results:${name}:end -->`;

describe("upsertResultsSection", () => {
  it("appends a new section after the header and drops the placeholder", () => {
    const out = upsertResultsSection(HEADER, "backtest", "## Backtest\n\n| a | b |");
    expect(out).toBe(`# Results\n\nTables below are written only from script output.\n\n${mark("backtest", "## Backtest\n\n| a | b |")}\n`);
    expect(out).not.toContain("Nothing has been measured yet.");
  });
  it("replaces an existing section in place and leaves the rest untouched", () => {
    const first = upsertResultsSection(HEADER, "backtest", "old");
    const withEval = upsertResultsSection(first, "eval", "eval table");
    const again = upsertResultsSection(withEval, "backtest", "new backtest");
    expect(again).toContain(mark("backtest", "new backtest"));
    expect(again).toContain(mark("eval", "eval table"));
    expect(again).not.toContain("old");
    expect(again.indexOf("results:backtest:start")).toBeLessThan(again.indexOf("results:eval:start"));
  });
  it("is idempotent", () => {
    const once = upsertResultsSection(HEADER, "backtest", "body");
    expect(upsertResultsSection(once, "backtest", "body")).toBe(once);
    const two = upsertResultsSection(once, "eval", "e");
    expect(upsertResultsSection(two, "eval", "e")).toBe(two);
  });
  it("trims the body and keeps blank lines tidy", () => {
    const out = upsertResultsSection(HEADER, "backtest", "\n\n  body  \n\n");
    expect(out).toContain(mark("backtest", "body"));
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.endsWith("\n")).toBe(true);
  });
  it("starts a file that has no header", () => {
    expect(upsertResultsSection("", "backtest", "b")).toBe(`${mark("backtest", "b")}\n`);
  });
  it("does not touch another section's markers when the names share a prefix", () => {
    const out = upsertResultsSection(upsertResultsSection(HEADER, "bench", "1"), "bench:ingest", "2");
    expect(out).toContain(mark("bench", "1"));
    expect(out).toContain(mark("bench:ingest", "2"));
  });
  it("throws on unpaired, reversed or repeated markers instead of guessing", () => {
    expect(() => upsertResultsSection("<!-- results:backtest:start -->\nx", "backtest", "b")).toThrow(/only one marker/);
    expect(() => upsertResultsSection("x\n<!-- results:backtest:end -->", "backtest", "b")).toThrow(/only one marker/);
    expect(() =>
      upsertResultsSection("<!-- results:backtest:end -->\n<!-- results:backtest:start -->", "backtest", "b"),
    ).toThrow(/misplaced/);
    expect(() => upsertResultsSection(`${mark("backtest", "a")}\n${mark("backtest", "b")}`, "backtest", "c")).toThrow(/misplaced/);
  });
});
