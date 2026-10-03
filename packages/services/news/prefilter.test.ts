import { describe, expect, it } from "vitest";
import { fixtureJson } from "../test-fixtures";
import { AvNews, normaliseAvFeed } from "../clients/alphavantage";
import { GdeltArtlist, normaliseArticles } from "../clients/gdelt";
import { prefilter } from "./prefilter";

const item = (title: string, summary: string | null = null, tickerSentiment: Record<string, number> | null = null) =>
  prefilter({ title, summary, tickerSentiment });

describe("news prefilter", () => {
  it("passes a title naming universe companies and tags them as tickers", () => {
    const r = item("Exxon and Chevron shares rise after refinery explosion in Texas");
    expect(r.match).toBe(true);
    expect(r.tickers).toEqual(["CVX", "XOM"]);
    expect(r.peerTickers).toEqual([]);
    expect(r.eventTypes).toContain("accident");
  });

  it("tags the universe symbols of a named competitor as peer tickers", () => {
    const r = item("Shell shuts Gulf platform; Airbus deliveries slip");
    expect(r.match).toBe(true);
    expect(r.tickers).toEqual([]);
    expect(r.peerTickers).toEqual(["BA", "CVX", "XOM"]);
  });

  it("keeps a symbol named directly out of peer tickers", () => {
    const r = item("Goldman Sachs and JPMorgan lead bank rally");
    expect(r.tickers).toEqual(["JPM"]);
    expect(r.peerTickers).toEqual(["BAC"]);
  });

  it("passes on event keywords alone", () => {
    const r = item("Central bank signals rate hike as inflation climbs");
    expect(r).toMatchObject({ match: true, tickers: [], peerTickers: [] });
    expect(r.eventTypes).toEqual(["macro"]);
  });

  it("passes an item Alpha Vantage tagged with a universe ticker, and ignores other tags", () => {
    expect(item("Quarterly update", null, { NVDA: 0.2 })).toMatchObject({ match: true, tickers: ["NVDA"] });
    expect(item("Quarterly update", null, { AWK: 0.4 }).match).toBe(false);
  });

  it("reads the summary as well as the title", () => {
    expect(item("Markets today", "Valero restarts its Port Arthur units").tickers).toEqual(["VLO"]);
  });

  it("fails an unrelated title", () => {
    expect(item("Local team wins the weekend football derby").match).toBe(false);
  });

  it("matches whole words only, and external peer names case-sensitively", () => {
    expect(item("Pineapple prices at the farmers market").tickers).toEqual([]);
    expect(item("Volunteers reach their target for the food drive").peerTickers).toEqual([]);
    expect(item("Target cuts its outlook").peerTickers).toEqual(["WMT"]);
    expect(item("S&P 500 slips at the open").tickers).toEqual(["SPY"]);
  });

  it("runs on the recorded GDELT and Alpha Vantage fixtures", () => {
    const gdelt = normaliseArticles(GdeltArtlist.parse(fixtureJson("gdelt-artlist-ida-2021.json")).articles ?? [], null, new Date());
    // Three recorded Ida titles name the hurricane and pass; the other two ("EBR Mayor declares
    // emergency...", "Parish, state officials warn of Ida...") carry no keyword or name and fail.
    expect(gdelt.map((g) => prefilter(g).match)).toEqual(gdelt.map((g) => /hurricane|storm|flood/i.test(g.title)));
    const av = normaliseAvFeed(AvNews.parse(fixtureJson("alphavantage-news-energy.json")).feed, "k", new Date());
    expect(av.every((a) => typeof prefilter(a).match === "boolean")).toBe(true);
  });
});
