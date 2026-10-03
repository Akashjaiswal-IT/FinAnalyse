import { MACRO_SERIES, UNIVERSE, type AnalogEvent, type Evidence } from "@repo/contracts";

const REPO = "https://github.com/Akashjaiswal-IT/FinAnalyse/blob/main";
const EIA_SERIES = new Set(["WGTSTUS1", "WCESTUS1"]);
/** Series ids the macro node can name; a reference may also hold thresholds or a window, which are not series. */
const KNOWN_SERIES = new Set<string>([...MACRO_SERIES, ...UNIVERSE.flatMap((u) => (u.sourceRef ? [u.sourceRef] : []))]);

function seriesLink(id: string): EvidenceLink {
  return EIA_SERIES.has(id)
    ? { href: `https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s=${id}&f=W`, label: `EIA series ${id}` }
    : { href: `https://fred.stlouisfed.org/series/${id}`, label: `FRED series ${id}` };
}

/** Where the code that computed a number lives, by the node that produced it. */
const CODE_BY_NODE: Record<string, { path: string; label: string }[]> = {
  risk: [
    { path: "packages/quant/risk.ts", label: "Risk formulas" },
    { path: "packages/quant/exposure.ts", label: "Exposure channels" },
  ],
  hedging: [{ path: "packages/quant/hedge.ts", label: "Hedge sizing and simulation" }],
  analogs: [{ path: "packages/quant/forecast.ts", label: "Analog forecast" }],
  weather: [{ path: "packages/quant/geo.ts", label: "Storm distance and capacity at risk" }],
  event: [{ path: "packages/quant/detect.ts", label: "Event severity" }],
  macro: [{ path: "packages/services/macro/index.ts", label: "Macro calculations" }],
};

export type EvidenceLink = { href: string; label: string } | { action: "news"; label: string };

/**
 * Links that let a reader check an evidence row at its source: the data series, the storm archive, the news
 * query, the past event's own references, or the code that computed it. Built from the row; no number is derived.
 */
export function evidenceLinks(e: Evidence, analogs: readonly AnalogEvent[] = []): EvidenceLink[] {
  const ref = e.sourceRef ?? "";
  switch (e.source) {
    case "fred":
    case "eia": {
      const series = [...new Set(ref.split(/[^A-Z0-9_]+/).filter((t) => KNOWN_SERIES.has(t)))].map(seriesLink);
      return [...series, ...(CODE_BY_NODE.macro ?? []).map((c) => ({ href: `${REPO}/${c.path}`, label: c.label }))];
    }
    case "hurdat2": {
      const year = /^AL\d{2}(\d{4})$/.exec(ref)?.[1];
      return [
        ...(year ? [{ href: `https://www.nhc.noaa.gov/data/tcr/index.php?season=${year}&basin=atl`, label: `NHC storm reports, ${year}` }] : []),
        { href: "https://www.nhc.noaa.gov/data/#hurdat", label: "HURDAT2 best-track data" },
        ...(CODE_BY_NODE.weather ?? []).map((c) => ({ href: `${REPO}/${c.path}`, label: c.label })),
      ];
    }
    case "nhc":
      return [{ href: "https://www.nhc.noaa.gov/", label: "National Hurricane Center" }];
    case "gdelt":
      return ref
        ? [{ href: `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(ref)}&mode=artlist&format=html&maxrecords=50`, label: "The articles behind this number (GDELT)" }]
        : [];
    case "news":
      return [{ action: "news", label: "Read the articles" }];
    case "analog_events": {
      const event = analogs.find((a) => a.id === ref);
      return (event?.sources ?? []).map((url) => ({ href: url, label: new URL(url).hostname.replace(/^www\./, "") }));
    }
    case "analogs":
    case "tempest":
      return (CODE_BY_NODE[e.producedBy] ?? []).map((c) => ({ href: `${REPO}/${c.path}`, label: c.label }));
    case "portfolio":
      return [{ href: "/", label: "Portfolio on the dashboard" }];
    default:
      return e.sourceRef && /^https?:\/\//.test(e.sourceRef) ? [{ href: e.sourceRef, label: "Source" }] : [];
  }
}
