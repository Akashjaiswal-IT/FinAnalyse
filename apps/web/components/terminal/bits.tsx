import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

/** Tiny uppercase label used above every group of values. */
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-[10px] font-medium tracking-wider text-muted-foreground uppercase", className)}>
      {children}
    </h3>
  );
}

/** A label over a value, for the compact fact rows of the event card and drilldown. */
export function Stat({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-[13px] text-foreground">{children}</div>
    </div>
  );
}

/** Raw JSON for the audit views: exactly what the server sent, collapsed by default. */
export function JsonBlock({ value, label, defaultOpen = false }: { value: unknown; label: string; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="rounded border bg-background/50">
      <summary className="cursor-pointer px-2 py-1 text-[11px] text-muted-foreground select-none hover:text-foreground">
        {label}
      </summary>
      <pre className="max-h-72 overflow-auto border-t p-2 font-mono text-[11px] leading-snug wrap-break-word whitespace-pre-wrap">
        {JSON.stringify(value, null, 2) ?? "null"}
      </pre>
    </details>
  );
}

/** Empty, waiting and failure messages share one look so every panel reads the same. */
export function PanelMessage({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: "muted" | "negative";
  className?: string;
}) {
  return (
    <div
      role={tone === "negative" ? "alert" : undefined}
      className={cn(
        "rounded-md border border-dashed px-3 py-6 text-center text-xs",
        tone === "negative" ? "border-negative/40 text-negative" : "border-border text-muted-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}
