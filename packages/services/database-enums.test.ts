import { EventType } from "@repo/contracts";
import { DB_EVENT_TYPES } from "@repo/database/schema";
import { describe, expect, it } from "vitest";

// `database` cannot import `contracts`, so its CHECK lists repeat the contract values.
describe("database CHECK lists", () => {
  it("event types match the contracts", () => {
    expect([...DB_EVENT_TYPES]).toEqual(EventType.options);
  });
});
