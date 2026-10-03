import { describe, expect, it } from "vitest";
import { splitTemplate } from "./template";

describe("splitTemplate", () => {
  it("returns one text segment when there are no placeholders", () => {
    expect(splitTemplate("Trim airlines.")).toEqual([{ kind: "text", text: "Trim airlines." }]);
  });

  it("splits text and placeholders in order", () => {
    expect(splitTemplate("Oil is forecast {{E9}} and gold {{E10}} today.")).toEqual([
      { kind: "text", text: "Oil is forecast " },
      { kind: "evidence", key: "E9" },
      { kind: "text", text: " and gold " },
      { kind: "evidence", key: "E10" },
      { kind: "text", text: " today." },
    ]);
  });

  it("handles a placeholder at the start, at the end, and back to back", () => {
    expect(splitTemplate("{{E1}}{{E2}}")).toEqual([
      { kind: "evidence", key: "E1" },
      { kind: "evidence", key: "E2" },
    ]);
    expect(splitTemplate("{{E1}} rose")).toEqual([
      { kind: "evidence", key: "E1" },
      { kind: "text", text: " rose" },
    ]);
  });

  it("leaves malformed placeholders as text and is repeatable", () => {
    const t = "Not a key: {{e1}} or {{E}} or {E1}";
    expect(splitTemplate(t)).toEqual([{ kind: "text", text: t }]);
    // PLACEHOLDER_RE is global; calling twice must not depend on lastIndex state.
    expect(splitTemplate("{{E3}}")).toEqual(splitTemplate("{{E3}}"));
  });

  it("returns nothing for an empty template", () => {
    expect(splitTemplate("")).toEqual([]);
  });
});
