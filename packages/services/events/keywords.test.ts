import { describe, expect, it } from "vitest";
import { keywordEventType } from "./index";

describe("keywordEventType", () => {
  it("picks the type whose keywords the text names most", () => {
    expect(keywordEventType("Russia launches missile strikes as sanctions widen")).toBe("geopolitical");
    expect(keywordEventType("Fed signals a rate cut as inflation cools")).toBe("macro");
  });

  it("matches whole words only, and returns null without a keyword", () => {
    expect(keywordEventType("Warehouse rents climb in the Midwest")).toBeNull();
    expect(keywordEventType("Apple unveils a new phone")).toBeNull();
  });
});
