import { describe, expect, it } from "vitest";
import {
  barAvailableAt,
  extractPlaceholders,
  formatValue,
  renderTemplate,
  weeklyAvailableAt,
} from "./format";

describe("formatValue", () => {
  it.each([
    ["pct", 0.4, "40%"],
    ["pct", 0.1234, "12.3%"],
    ["pct", 1, "100%"],
    ["pct_signed", 0.081, "+8.1%"],
    ["pct_signed", -0.04, "-4.0%"],
    ["pct_signed", 0, "0.0%"],
    ["pct_signed", -0.0004, "0.0%"],
    ["usd", 1_200_000, "$1.2M"],
    ["usd", 10_000_000, "$10M"],
    ["usd", -412_000, "-$412K"],
    ["usd", 2_500_000_000, "$2.5B"],
    ["usd", 950, "$950"],
    ["kt", 112.6, "113 kt"],
    ["bpd", 1_250_000, "1.25M b/d"],
    ["bpd", 500_000, "500K b/d"],
    ["days", 5, "5 days"],
    ["days", 1, "1 day"],
    ["days", 2.5, "2.5 days"],
    ["score", -0.314, "-0.31"],
    ["z", -1.44, "-1.4"],
    ["ratio", 4.3, "4.30"],
    ["count", 12_345.4, "12,345"],
    ["category", 3.9, "4"],
    ["date", Date.UTC(2021, 7, 29, 17), "Aug 29, 2021"],
  ] as const)("%s %s -> %s", (unit, value, expected) => {
    expect(formatValue(unit, value)).toBe(expected);
  });

  it("renders text from textValue and n/a for missing values", () => {
    expect(formatValue("text", null, "Ida")).toBe("Ida");
    expect(formatValue("text", null, null)).toBe("n/a");
    expect(formatValue("pct", null)).toBe("n/a");
    expect(formatValue("pct", Number.NaN)).toBe("n/a");
  });
});

describe("renderTemplate", () => {
  const rows = {
    E1: { value: 0.4, textValue: null, unit: "pct" as const },
    E2: { value: null, textValue: "Ida", unit: "text" as const },
  };
  const lookup = (k: string) => rows[k as keyof typeof rows];

  it("resolves placeholders", () => {
    expect(renderTemplate("{{E2}} risks {{E1}} of capacity.", lookup)).toEqual({
      text: "Ida risks 40% of capacity.",
      missing: [],
    });
  });

  it("reports unresolved keys and leaves them in place", () => {
    expect(renderTemplate("{{E9}} and {{E1}}", lookup)).toEqual({
      text: "{{E9}} and 40%",
      missing: ["E9"],
    });
  });

  it("extracts placeholder keys", () => {
    expect(extractPlaceholders("a {{E1}} b {{E12}} c {E3}")).toEqual(["E1", "E12"]);
  });
});

describe("availability", () => {
  it("makes a daily bar readable from 21:00 UTC on its date", () => {
    expect(barAvailableAt("2021-08-27").toISOString()).toBe("2021-08-27T21:00:00.000Z");
  });

  it("makes a weekly observation readable 5 days later", () => {
    expect(weeklyAvailableAt("2021-08-20").toISOString()).toBe("2021-08-25T00:00:00.000Z");
    expect(weeklyAvailableAt("2021-08-28").toISOString()).toBe("2021-09-02T00:00:00.000Z");
  });

  it("rolls a value that rounds up into the next unit", () => {
    expect(formatValue("usd", 999_970)).toBe("$1M");
    expect(formatValue("usd", -999_970)).toBe("-$1M");
    expect(formatValue("usd", 999_940)).toBe("$999.9K");
    expect(formatValue("usd", 999.7)).toBe("$1K");
    expect(formatValue("usd", 999.2)).toBe("$999");
    expect(formatValue("usd", 999_960_000)).toBe("$1B");
    expect(formatValue("bpd", 999_996)).toBe("1M b/d");
  });
});
