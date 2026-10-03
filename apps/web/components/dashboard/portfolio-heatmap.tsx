"use client";

import { useMemo } from "react";
import { ResponsiveContainer, Treemap } from "recharts";
import { formatValue, Sector, type PositionView } from "@repo/contracts";
import { humanize } from "~/lib/display";

/** Moves of this size or more get the full colour; smaller ones fade toward the card. */
const FULL_COLOUR_MOVE = 0.025;

interface Tile {
  name: string;
  size: number;
  change: number | null;
  sector: string;
}

function tileFill(change: number | null): string {
  if (change === null || change === 0) return "color-mix(in oklch, var(--muted) 85%, var(--card))";
  const strength = Math.min(Math.abs(change) / FULL_COLOUR_MOVE, 1);
  const tone = change > 0 ? "var(--positive)" : "var(--negative)";
  return `color-mix(in oklch, ${tone} ${Math.round(18 + strength * 62)}%, var(--card))`;
}

interface ContentProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  change?: number | null;
  onPick(symbol: string): void;
}

function TileContent({ x = 0, y = 0, width = 0, height = 0, depth, name = "", change = null, onPick }: ContentProps) {
  if (depth === 1) {
    // Sector frame and label.
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} style={{ fill: "none", stroke: "var(--background)", strokeWidth: 3 }} />
        {width > 70 && height > 34 && (
          <text x={x + 6} y={y + 13} style={{ fill: "var(--muted-foreground)", fontSize: 9, letterSpacing: "0.08em" }}>
            {humanize(name).toUpperCase()}
          </text>
        )}
      </g>
    );
  }
  if (depth !== 2) return null;
  const big = width > 54 && height > 38;
  const small = !big && width > 30 && height > 18;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${name}: ${change === null ? "no change data" : formatValue("pct_signed", change)}. Open the stock`}
      onClick={() => onPick(name)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onPick(name)}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <rect x={x + 1} y={y + 1} width={Math.max(width - 2, 0)} height={Math.max(height - 2, 0)} rx={6} style={{ fill: tileFill(change), stroke: "var(--border)" }} />
      {big && (
        <>
          <text x={x + 9} y={y + 21} style={{ fill: "var(--foreground)", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
            {name}
          </text>
          <text x={x + 9} y={y + 37} style={{ fill: "var(--foreground)", opacity: 0.8, fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {change === null ? "n/a" : formatValue("pct_signed", change)}
          </text>
        </>
      )}
      {small && (
        <text x={x + 5} y={y + 14} style={{ fill: "var(--foreground)", fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
          {name}
        </text>
      )}
    </g>
  );
}

/** Box size is the position's value, colour its one-day move; grouped by sector. */
export function PortfolioHeatmap({ positions, onPick }: { positions: PositionView[]; onPick(symbol: string): void }) {
  const data = useMemo(() => {
    const bySector = new Map<string, Tile[]>();
    for (const p of positions) {
      const sector = p.sector ?? "other";
      bySector.set(sector, [...(bySector.get(sector) ?? []), { name: p.symbol, size: p.value, change: p.change1d, sector }]);
    }
    return [...Sector.options, "other"].flatMap((s) => {
      const children = bySector.get(s);
      return children ? [{ name: s, children }] : [];
    });
  }, [positions]);

  return (
    <div className="h-[340px] w-full" role="group" aria-label="Portfolio heatmap: size is weight, colour is today's move">
      <ResponsiveContainer width="100%" height="100%">
        <Treemap data={data} dataKey="size" isAnimationActive={false} content={<TileContent onPick={onPick} />} />
      </ResponsiveContainer>
    </div>
  );
}
