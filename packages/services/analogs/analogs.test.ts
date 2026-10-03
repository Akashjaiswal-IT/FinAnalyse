import db, { inArray } from "@repo/database";
import { analogEvents, type NewAnalogEventRow } from "@repo/database/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PineconeClient, type PineconeIndexLike } from "../clients/pinecone";
import { AnalogsService, isRealizedAt, searchFilter } from "./index";

// GATE A2: analogs.search at a preset as-of never returns that event or any later event.

const UKRAINE_AS_OF = new Date("2022-02-25T02:40:00.000Z");
const features = { volZ: 1, toneZ: -1, vixZ: 0.5, windKt: null, capAtRisk: null, offshoreExposure: null };
const row = (id: string, type: string, firstReportAt: string, t0: string, realizedUntil: string): NewAnalogEventRow => ({
  id,
  type,
  subtype: null,
  name: id,
  firstReportAt: new Date(firstReportAt),
  featureAt: new Date(Date.parse(firstReportAt) + 86_400_000),
  t0,
  gdeltQuery: "q",
  features,
  reactions: { SPY: { d1: 0.01, d5: 0.02, d20: null } },
  realizedUntil,
  description: id,
  sources: ["https://example.test"],
});
const ROWS = [
  row("zz-test-earlier", "geopolitical", "2020-01-02T21:47:00Z", "2020-01-03", "2020-02-03"),
  row("zz-test-ukraine", "geopolitical", "2022-02-24T02:40:00Z", "2022-02-24", "2022-03-24"),
  row("zz-test-later", "supply_shock", "2023-04-02T13:57:00Z", "2023-04-03", "2023-05-01"),
  row("zz-test-boundary", "macro", "2022-01-20T00:00:00Z", "2022-01-21", "2022-02-24"),
];

/** A fake Pinecone that returns every row as a hit and records the filter it was given. */
const filters: object[] = [];
const fake: PineconeIndexLike = {
  upsertRecords: async () => {},
  searchRecords: async (o) => {
    filters.push(o.query.filter ?? {});
    return { result: { hits: ROWS.map((r, i) => ({ _id: `e_${r.id}`, _score: 1 - i / 10, fields: {} })) } };
  },
  describeIndexStats: async () => ({}),
};
const service = new AnalogsService(db, () => new PineconeClient(fake));

beforeAll(async () => {
  await db.insert(analogEvents).values(ROWS).onConflictDoNothing();
});

afterAll(async () => {
  await db.delete(analogEvents).where(inArray(analogEvents.id, ROWS.map((r) => r.id)));
  await db.$client.end();
});

describe("analogs", () => {
  it("search never returns the replayed event or a later one, even if Pinecone does", async () => {
    const hits = await service.search("Russia invades Ukraine", { asOf: UKRAINE_AS_OF });
    // The boundary event's window ends 2022-02-24, readable at 21:00 UTC that day: eligible.
    expect(hits.map((h) => h.event.id)).toEqual(["zz-test-earlier", "zz-test-boundary"]);
    expect(filters.at(-1)).toEqual({ realizedUntil: { $lte: Math.floor((UKRAINE_AS_OF.getTime() - 21 * 3_600_000) / 1000) } });
  });

  it("treats a window ending on the as-of date as realized only after that close is readable", () => {
    expect(isRealizedAt("2022-02-24", UKRAINE_AS_OF)).toBe(true);
    expect(isRealizedAt("2022-02-24", new Date("2022-02-24T20:59:00Z"))).toBe(false);
  });

  it("passes the type filter to Pinecone and enforces it on the rows", async () => {
    const hits = await service.search("x", { asOf: new Date("2024-01-01T00:00:00Z"), types: ["geopolitical"] });
    expect(hits.map((h) => h.event.id)).toEqual(["zz-test-earlier", "zz-test-ukraine"]);
    expect(searchFilter(new Date("2024-01-01T00:00:00Z"), ["geopolitical"])).toMatchObject({ type: { $in: ["geopolitical"] } });
  });

  it("presetEvent returns only pre-outcome fields", async () => {
    const preset = await service.presetEvent("zz-test-ukraine");
    expect(preset).toMatchObject({ id: "zz-test-ukraine", type: "geopolitical", firstReportAt: "2022-02-24T02:40:00.000Z" });
    expect(preset).not.toHaveProperty("reactions");
    expect(preset).not.toHaveProperty("features");
    expect(await service.presetEvent("zz-test-missing")).toBeNull();
  });

  it("lists and gets rows as contract events", async () => {
    const [e] = await service.get(["zz-test-later"]);
    expect(e).toMatchObject({ type: "supply_shock", t0: "2023-04-03", realizedUntil: "2023-05-01", features });
    expect((await service.list("supply_shock")).map((x) => x.id)).toContain("zz-test-later");
  });
});
