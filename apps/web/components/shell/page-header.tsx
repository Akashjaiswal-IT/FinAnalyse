import type { ReactNode } from "react";

/** Page title block: a small eyebrow, a title in the display size, one line of context and optional actions. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl space-y-1.5">
        <div className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">{eyebrow}</div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance">{title}</h1>
        {description && <p className="text-sm leading-relaxed text-muted-foreground text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
