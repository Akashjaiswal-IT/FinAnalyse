import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CuratedEventSeed, EventType, EVENT_SUBTYPES, REPLAY_PRESETS, UNIVERSE_SYMBOLS } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// data/seed/analog-events.json: hand-written, every event sourced (SPEC 10.5, ROADMAP Phase 1).
const raw: unknown = JSON.parse(readFileSync(resolve(__dirname, "../../../data/seed/analog-events.json"), "utf8"));
const events = z.array(CuratedEventSeed).parse(raw);

describe("curated analog events", () => {
  it("has at least 30 events and at least 3 per type", () => {
    expect(events.length).toBeGreaterThanOrEqual(30);
    for (const type of EventType.options) {
      expect(events.filter((e) => e.type === type).length, type).toBeGreaterThanOrEqual(3);
    }
  });

  it("has unique ids that start with the event type's prefix", () => {
    expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    const prefix: Record<EventType, string> = {
      geopolitical: "geopolitical-",
      policy: "policy-",
      macro: "macro-",
      statement: "statement-",
      accident: "accident-",
      disaster: "disaster-",
      corporate: "corporate-",
      supply_shock: "supply-",
    };
    for (const e of events) expect(e.id.startsWith(prefix[e.type]), e.id).toBe(true);
  });

  it("gives every event at least one https source URL", () => {
    for (const e of events) {
      expect(e.sources.length, e.id).toBeGreaterThanOrEqual(1);
      for (const url of e.sources) expect(/^https?:\/\//.test(url), url).toBe(true);
    }
  });

  it("uses known subtypes, universe entities and a GDELT query in the documented syntax", () => {
    for (const e of events) {
      if (e.subtype !== null) expect(EVENT_SUBTYPES[e.type], e.id).toContain(e.subtype);
      for (const s of e.entities) expect(UNIVERSE_SYMBOLS, `${e.id} ${s}`).toContain(s);
      expect(e.gdeltQuery.endsWith("sourcelang:english"), e.id).toBe(true);
      // OR must be uppercase (ROADMAP gotcha 3).
      expect(/\bor\b/.test(e.gdeltQuery.replace(/"[^"]*"/g, "")), e.id).toBe(false);
    }
  });

  it("dates every event from 2017 onward and never in the future", () => {
    for (const e of events) {
      expect(e.firstReportAt >= "2017-01-01", e.id).toBe(true);
      expect(Date.parse(e.firstReportAt)).toBeLessThan(Date.now());
    }
  });

  it("includes every curated replay preset (hurricanes come from HURDAT2)", () => {
    const ids = new Set(events.map((e) => e.id));
    for (const p of REPLAY_PRESETS.filter((p) => p.firstReportAt !== null)) expect(ids, p.id).toContain(p.id);
  });
});
