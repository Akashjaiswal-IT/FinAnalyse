import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  GdeltFilesClient,
  MARKET_THEMES,
  decodeEntities,
  latestGkgStamp,
  msToStamp,
  parseGkg,
  readZipText,
  stampToMs,
  stampsToFetch,
  toNewsItems,
} from "./gdelt-files";
import { HttpClient } from "./http";
import { MemoryKvStore } from "./kv";

/** A one-entry zip archive, built by hand so the reader is checked against the format, not against itself. */
function makeZip(content: string, method: 0 | 8 = 8): Uint8Array {
  const raw = Buffer.from(content, "utf8");
  const data = method === 8 ? deflateRawSync(raw) : raw;
  const name = Buffer.from("file.csv");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(local.length + name.length + data.length, 16);
  return new Uint8Array(Buffer.concat([local, name, data, central, name, eocd]));
}

/** One GKG 2.1 line (27 tab-separated columns). */
function line(p: {
  id?: string;
  date?: string;
  domain?: string;
  url?: string;
  themes?: string[];
  tone?: string;
  title?: string;
  translated?: boolean;
}): string {
  const c = Array.from({ length: 27 }, () => "");
  c[0] = p.id ?? "20261003163000-1";
  c[1] = p.date ?? "20261003163000";
  c[3] = p.domain ?? "example.com";
  c[4] = p.url ?? "https://example.com/a";
  c[8] = (p.themes ?? []).map((t, i) => `${t},${i * 10}`).join(";");
  c[15] = p.tone ?? "2.5,3,0.5,3.5,20,1.2";
  c[25] = p.translated ? "srclc:fra;eng:Moses 2.1.1" : "";
  c[26] = p.title === undefined ? "" : `<PAGE_TITLE>${p.title}</PAGE_TITLE>`;
  return c.join("\t");
}

describe("stamps", () => {
  it("convert to and from UTC milliseconds", () => {
    expect(stampToMs("20261003163000")).toBe(Date.UTC(2026, 9, 3, 16, 30, 0));
    expect(msToStamp(Date.UTC(2026, 9, 3, 16, 30, 0))).toBe("20261003163000");
    expect(() => stampToMs("2026-10-03")).toThrow();
  });
  it("latestGkgStamp reads the article file out of lastupdate.txt", () => {
    const text =
      "53016 aaa http://data.gdeltproject.org/gdeltv2/20261003174500.export.CSV.zip\n" +
      "73948 bbb http://data.gdeltproject.org/gdeltv2/20261003174500.mentions.CSV.zip\n" +
      "2862904 ccc http://data.gdeltproject.org/gdeltv2/20261003174500.gkg.csv.zip\n";
    expect(latestGkgStamp(text)).toBe("20261003174500");
    expect(latestGkgStamp("nothing here")).toBeNull();
  });
  it("stampsToFetch: the first pass takes the newest 12 files, oldest first", () => {
    const s = stampsToFetch(null, "20261003174500");
    expect(s).toHaveLength(12);
    expect(s[0]).toBe("20261003150000"); // 2.75 hours before the newest
    expect(s[11]).toBe("20261003174500");
  });
  it("stampsToFetch: later passes continue after the last file and never repeat it", () => {
    expect(stampsToFetch("20261003170000", "20261003174500")).toEqual(["20261003171500", "20261003173000", "20261003174500"]);
    expect(stampsToFetch("20261003174500", "20261003174500")).toEqual([]);
  });
  it("stampsToFetch: a pass after a long pause is capped to the newest 12 files", () => {
    const s = stampsToFetch("20261001000000", "20261003174500");
    expect(s).toHaveLength(12);
    expect(s[11]).toBe("20261003174500");
  });
});

describe("readZipText", () => {
  it("reads a deflated entry", () => {
    expect(readZipText(makeZip("hello\tworld\nsecond line"))).toBe("hello\tworld\nsecond line");
  });
  it("reads a stored entry and non-ASCII text", () => {
    expect(readZipText(makeZip("café — ünïcode", 0))).toBe("café — ünïcode");
  });
  it("rejects data that is not a zip archive", () => {
    expect(() => readZipText(new Uint8Array([1, 2, 3, 4, 5]))).toThrow(/not a zip/);
    expect(() => readZipText(new Uint8Array(0))).toThrow();
  });
});

describe("decodeEntities", () => {
  it("decodes numeric, hex and named entities and leaves unknown ones", () => {
    expect(decodeEntities("P1S plunges &#x2014; 30% off &amp; more")).toBe("P1S plunges — 30% off & more");
    expect(decodeEntities("it&#8217;s &quot;ok&quot; &lt;b&gt; &unknown;")).toBe("it’s \"ok\" <b> &unknown;");
  });
});

describe("parseGkg", () => {
  it("reads id, time, domain, url, themes, tone and the headline", () => {
    const [row] = parseGkg(line({ themes: ["ECON_STOCKMARKET", "EPU_ECONOMY"], tone: "-3.25,1,4,5,20,1", title: "Stocks fall &amp; oil rises" }));
    expect(row).toMatchObject({
      id: "20261003163000-1",
      publishedAt: "2026-10-03T16:30:00.000Z",
      domain: "example.com",
      url: "https://example.com/a",
      tone: -3.25,
      title: "Stocks fall & oil rises",
      translated: false,
    });
    expect([...(row?.themes ?? [])]).toEqual(["ECON_STOCKMARKET", "EPU_ECONOMY"]);
  });
  it("marks translated rows, tolerates a missing title or tone, and skips malformed lines", () => {
    const rows = parseGkg(
      [
        line({ translated: true, title: "Une nouvelle" }),
        line({ id: "x-2", url: "https://example.com/b", tone: "" }),
        "too\tfew\tcolumns",
        "",
        line({ id: "x-3", date: "not-a-stamp" }),
      ].join("\n"),
    );
    expect(rows.map((r) => r.id)).toEqual(["20261003163000-1", "x-2"]);
    expect(rows[0]?.translated).toBe(true);
    expect(rows[1]).toMatchObject({ tone: null, title: null });
  });
});

describe("toNewsItems", () => {
  const rows = (...l: Parameters<typeof line>[0][]) => parseGkg(l.map(line).join("\n"));
  const at = "2026-10-03T17:50:00.000Z";

  it("keeps an article that names a universe company, with GDELT's tone scaled to -1..1", () => {
    const [item] = toNewsItems(rows({ title: "NVIDIA unveils 64GB DGX Spark starting at $4,999", tone: "5,6,1,7,20,1", url: "https://t.example/n" }), at);
    expect(item).toMatchObject({
      source: "gdelt",
      url: "https://t.example/n",
      queryKey: "gkg",
      publishedAt: "2026-10-03T16:30:00.000Z",
      fetchedAt: at,
      summary: null,
      tickerSentiment: null,
      sourceSentiment: 0.5,
    });
  });
  it("keeps an article with a precise market theme even when it names no company", () => {
    const [item] = toNewsItems(rows({ title: "Wall Street ends lower as yields climb", themes: ["ECON_STOCKMARKET", "EPU_ECONOMY"] }), at);
    expect(item?.topics).toEqual(["ECON_STOCKMARKET"]);
  });
  it("keeps a policy, geopolitical, macro, supply or disaster keyword on its own, with no company or theme", () => {
    const out = toNewsItems(
      rows(
        { title: "India-US trade deal not imminent as tariffs remain unresolved", url: "https://t.example/p" },
        { title: "North Korea says it test-fired an intermediate-range missile", url: "https://t.example/g" },
        { title: "Jobs report misses expectations as the Federal Reserve watches", url: "https://t.example/m" },
        { title: "Trump shoots down diesel export ban after European talks", url: "https://t.example/s" },
        { title: "Magnitude 6.1 earthquake rattles the coast overnight", url: "https://t.example/d" },
      ),
      at,
    );
    expect(out.map((i) => i.url)).toEqual(["https://t.example/p", "https://t.example/g", "https://t.example/m", "https://t.example/s", "https://t.example/d"]);
    expect(out.every((i) => i.topics.length === 0)).toBe(true); // kept on the keyword: no GDELT theme
  });
  it("a statement or accident keyword needs a market term beside it; corporate words never keep an article alone", () => {
    const kept = (title: string) => toNewsItems(rows({ title, url: `https://t.example/${title.length}` }), at).length;
    expect(kept("White House press conference on oil supply tonight")).toBe(1);
    expect(kept("White House press conference about the school year")).toBe(0);
    expect(kept("Explosion halts output at the Gulf refinery")).toBe(1);
    expect(kept("Explosion rocks the neighbourhood overnight")).toBe(0);
    expect(kept("Securities class action lawsuit filed against Taboola")).toBe(0);
    expect(kept("Quarterly earnings guidance for the retail sector")).toBe(0);
  });
  it("drops what is not market news: a bare event keyword, no theme, translated, or too short", () => {
    const out = toNewsItems(
      rows(
        { title: "Windsor man killed in Hwy 40 crash: OPP", url: "https://t.example/1" },
        { title: "Broad topics only but no market theme here", themes: ["EPU_ECONOMY", "WB_135_TRANSPORT"], url: "https://t.example/2" },
        { title: "Boeing annonce un nouveau contrat important", translated: true, url: "https://t.example/3" },
        { title: "Boeing wins", url: "https://t.example/4" },
        { title: "", url: "https://t.example/5" },
      ),
      at,
    );
    expect(out).toEqual([]);
  });
  it("clamps an extreme tone and passes a missing one through as null", () => {
    const out = toNewsItems(
      rows(
        { title: "Chevron shares slide after refinery outage", tone: "-25,1,26,27,20,1", url: "https://t.example/a" },
        { title: "Chevron shares recover after refinery outage", tone: "", url: "https://t.example/b" },
      ),
      at,
    );
    expect(out.map((i) => i.sourceSentiment)).toEqual([-1, null]);
  });
  it("keeps a syndicated headline once, whatever the domain, case or spacing", () => {
    const out = toNewsItems(
      rows(
        { title: "Fed rate decision: why a pause looks likely", themes: ["ECON_INTEREST_RATES"], domain: "a.com", url: "https://a.com/1" },
        { title: "FED rate  decision: why a pause looks likely", themes: ["ECON_INTEREST_RATES"], domain: "b.com", url: "https://b.com/1" },
        { title: "Fed rate decision: a different story", themes: ["ECON_INTEREST_RATES"], domain: "c.com", url: "https://c.com/1" },
      ),
      at,
    );
    expect(out.map((i) => i.domain)).toEqual(["a.com", "c.com"]);
  });
  it("a headline dropped by the filter does not hide a later copy that passes", () => {
    const out = toNewsItems(
      rows(
        { title: "Oil tanker delays hit the trading desks", themes: [], url: "https://t.example/1" },
        { title: "Oil tanker delays hit the trading desks", themes: ["ECON_OILPRICE"], url: "https://t.example/2" },
      ),
      at,
    );
    expect(out.map((i) => i.url)).toEqual(["https://t.example/2"]);
  });
  it("only the strict themes count as market themes", () => {
    expect(MARKET_THEMES.has("ECON_STOCKMARKET")).toBe(true);
    expect(MARKET_THEMES.has("EPU_ECONOMY")).toBe(false);
    expect(MARKET_THEMES.has("WB_135_TRANSPORT")).toBe(false);
    expect(MARKET_THEMES.has("ENV_OIL")).toBe(false); // tags every fuel mention: a car review, a bridge strike
  });
});

describe("GdeltFilesClient", () => {
  function client(replies: ({ status: number; body: string | Uint8Array } | Error)[]) {
    const calls: string[] = [];
    const store = new MemoryKvStore(() => 0);
    const http = new HttpClient({
      fetch: (async (input: string | URL | Request) => {
        calls.push(String(input));
        const reply = replies.shift();
        if (!reply) throw new Error("no reply queued");
        if (reply instanceof Error) throw reply;
        return new Response(reply.body as BodyInit, { status: reply.status });
      }) as typeof globalThis.fetch,
      store,
      now: () => 0,
      sleep: async () => undefined,
      random: () => 0.5,
      disabledSources: [],
      log: () => undefined,
    });
    return { files: new GdeltFilesClient(http), calls, store };
  }

  it("newestStamp reads lastupdate.txt", async () => {
    const { files, calls } = client([{ status: 200, body: "1 a http://x/20261003174500.gkg.csv.zip\n" }]);
    expect(await files.newestStamp()).toBe("20261003174500");
    expect(calls[0]).toBe("https://data.gdeltproject.org/gdeltv2/lastupdate.txt");
  });
  it("file downloads, unzips and parses one 15-minute file", async () => {
    const { files, calls } = client([{ status: 200, body: makeZip(line({ title: "Exxon Mobil raises dividend again" })) }]);
    const rows = await files.file("20261003163000");
    expect(calls[0]).toBe("https://data.gdeltproject.org/gdeltv2/20261003163000.gkg.csv.zip");
    expect(rows).toHaveLength(1);
    expect(rows?.[0]?.title).toBe("Exxon Mobil raises dividend again");
  });
  it("a file that is not published yet (404) is null, and repeated 404s never open the circuit breaker", async () => {
    const { files, store } = client([
      { status: 404, body: "" },
      { status: 404, body: "" },
      { status: 404, body: "" },
      { status: 404, body: "" },
      { status: 200, body: makeZip(line({ title: "Chevron cuts spending plan for next year" })) },
    ]);
    for (let i = 0; i < 4; i++) expect(await files.file("20261003174500")).toBeNull();
    expect((await store.hgetall("source:gdelt")).status).toBeUndefined(); // a 404 is not a health event
    expect(await files.file("20261003173000")).toHaveLength(1); // the breaker is still closed
  });
  it("other failures are still errors: a 500, or a body that is not a zip", async () => {
    const { files } = client([
      { status: 500, body: "" },
      { status: 500, body: "" },
      { status: 500, body: "" },
      { status: 200, body: new Uint8Array([1, 2, 3]) },
    ]);
    await expect(files.file("20261003163000")).rejects.toThrow(/upstream error/);
    await expect(files.file("20261003163000")).rejects.toThrow(/not a zip/);
  });
});
