import { describe, expect, it } from "vitest";
import { DEFAULT_REPLAY_PRESET_ID, REPLAY_PRESETS } from "@repo/contracts";
import {
  asOfParams,
  inputValueToIso,
  isValidAsOf,
  isoToInputValue,
  modeParams,
  parseTerminalParams,
  presetParams,
  resolveAsOf,
  serializeTerminalParams,
} from "./url-state";

const NOW = Date.parse("2026-10-03T12:00:00.000Z");
const parse = (query: string) => parseTerminalParams(new URLSearchParams(query), NOW);

describe("parseTerminalParams", () => {
  it("replays the default preset for a bare URL and for junk", () => {
    const expected = { mode: "replay", presetId: DEFAULT_REPLAY_PRESET_ID, asOf: null };
    expect(parse("")).toEqual(expected);
    expect(parse("mode=banana&preset=nope&asOf=yesterday")).toEqual(expected);
  });

  it("reads live mode and ignores a preset or as-of next to it", () => {
    expect(parse("mode=live")).toEqual({ mode: "live", presetId: null, asOf: null });
    expect(parse("mode=live&preset=disaster-hurricane-ida-2021")).toEqual({ mode: "live", presetId: null, asOf: null });
  });

  it("reads every known preset", () => {
    for (const p of REPLAY_PRESETS) {
      expect(parse(`mode=replay&preset=${p.id}`)).toEqual({ mode: "replay", presetId: p.id, asOf: null });
    }
  });

  it("reads a custom as-of and lets it replace the preset", () => {
    const asOf = "2022-03-01T21:00:00.000Z";
    expect(parse(`mode=replay&asOf=${asOf}`)).toEqual({ mode: "replay", presetId: null, asOf });
    expect(parse(`mode=replay&preset=disaster-hurricane-ida-2021&asOf=${asOf}`)).toEqual({
      mode: "replay",
      presetId: null,
      asOf,
    });
  });

  it("rejects an as-of before 2017, in the future, or malformed", () => {
    for (const bad of ["2016-12-31T23:59:00.000Z", "2026-10-03T12:00:01.000Z", "2022-03-01", "not-a-date"]) {
      expect(parse(`mode=replay&asOf=${bad}`).asOf).toBeNull();
    }
    expect(isValidAsOf("2017-01-01T00:00:00.000Z", NOW)).toBe(true);
    expect(isValidAsOf("2026-10-03T12:00:00.000Z", NOW)).toBe(true);
  });
});

describe("serializeTerminalParams", () => {
  it("round-trips every state the controls can produce", () => {
    const states = [
      modeParams("live"),
      modeParams("replay"),
      presetParams("disaster-hurricane-ida-2021"),
      asOfParams("2022-03-01T21:00:00.000Z"),
    ];
    for (const s of states) {
      expect(parseTerminalParams(new URLSearchParams(serializeTerminalParams(s)), NOW)).toEqual(s);
    }
  });

  it("writes only what the mode needs", () => {
    expect(serializeTerminalParams(modeParams("live"))).toBe("mode=live");
    expect(serializeTerminalParams(presetParams("disaster-hurricane-ida-2021"))).toBe(
      "mode=replay&preset=disaster-hurricane-ida-2021",
    );
  });
});

describe("resolveAsOf", () => {
  it("is null for live, the preset's as-of for a preset, and the typed value for a custom as-of", () => {
    expect(resolveAsOf(modeParams("live"))).toBeNull();
    expect(resolveAsOf(presetParams("disaster-hurricane-ida-2021"))).toBe("2021-08-27T21:00:00.000Z");
    expect(resolveAsOf(asOfParams("2022-03-01T21:00:00.000Z"))).toBe("2022-03-01T21:00:00.000Z");
  });
});

describe("datetime-local conversion", () => {
  it("reads and writes UTC without shifting", () => {
    expect(isoToInputValue("2022-02-25T03:00:00.000Z")).toBe("2022-02-25T03:00");
    expect(inputValueToIso("2022-02-25T03:00")).toBe("2022-02-25T03:00:00.000Z");
    expect(inputValueToIso("")).toBeNull();
    expect(inputValueToIso("2022-02-25")).toBeNull();
  });
});
