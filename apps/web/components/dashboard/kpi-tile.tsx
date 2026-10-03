"use client";

import type { ReactNode } from "react";
import NumberFlow, { type Format } from "@number-flow/react";
import { cn } from "~/lib/utils";

/** A headline number. `value` comes from the server; NumberFlow only formats and rolls it. */
export function KpiTile({
  label,
  value,
  format,
  suffix,
  sub,
  icon,
  className,
}: {
  label: string;
  value: number | null;
  format: Format;
  suffix?: string;
  sub?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border bg-card/80 px-5 py-4 backdrop-blur-md", className)}>
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 font-mono text-[30px] leading-none font-semibold tracking-[-0.02em]">
        {value === null ? <span className="text-muted-foreground">–</span> : <NumberFlow value={value} format={format} suffix={suffix} locales="en-US" />}
      </div>
      {sub && <div className="mt-2 text-[12px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
