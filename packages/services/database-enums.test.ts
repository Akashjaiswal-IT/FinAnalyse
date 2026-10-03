import { EventType, NewsSource } from "@repo/contracts";
import { DB_EVENT_TYPES, DB_NEWS_SOURCES } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

// `database` cannot import `contracts`, so its CHECK lists repeat the contract values.
describe("database CHECK lists", () => {
  it("event types match the contracts", () => {
    expect([...DB_EVENT_TYPES]).toEqual(EventType.options);
  });
  it("news sources match the contracts", () => {
    expect([...DB_NEWS_SOURCES]).toEqual(NewsSource.options);
  });
});
