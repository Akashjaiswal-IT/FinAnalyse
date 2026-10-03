"use client";

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, createSeriesMarkers, type IChartApi, type UTCTimestamp } from "lightweight-charts";
import { useTheme } from "next-themes";
import type { PriceBar } from "@repo/contracts";
import { themeColor } from "~/lib/css-color";

const toTime = (isoDate: string) => (Date.parse(`${isoDate}T00:00:00Z`) / 1000) as UTCTimestamp;

/** Daily closes as an area chart, with a marker on each day that has news about the stock. */
export function PriceChart({ bars, newsDays }: { bars: PriceBar[]; newsDays: string[] }) {
  const host = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const el = host.current;
    if (!el || bars.length === 0) return;
    const first = bars[0]!.adjClose;
    const last = bars[bars.length - 1]!.adjClose;
    const tone = last >= first ? "--positive" : "--negative";
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: themeColor("--muted-foreground"),
        fontFamily: getComputedStyle(document.body).fontFamily,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: themeColor("--foreground", 0.06) } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: { horzLine: { labelBackgroundColor: themeColor("--primary") }, vertLine: { labelBackgroundColor: themeColor("--primary") } },
    });
    const series = chart.addSeries(AreaSeries, {
      lineColor: themeColor(tone),
      topColor: themeColor(tone, 0.28),
      bottomColor: themeColor(tone, 0.02),
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(bars.map((b) => ({ time: toTime(b.date), value: b.adjClose })));
    const barDays = new Set(bars.map((b) => b.date));
    createSeriesMarkers(
      series,
      [...new Set(newsDays)]
        .filter((d) => barDays.has(d))
        .sort()
        .map((d) => ({ time: toTime(d), position: "aboveBar" as const, shape: "circle" as const, color: themeColor("--primary"), size: 0.6 })),
    );
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, newsDays, resolvedTheme]);

  return <div ref={host} className="h-64 w-full" role="img" aria-label="Daily closing price; dots mark days with news" />;
}
