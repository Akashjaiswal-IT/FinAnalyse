import type { AlertSeverity } from "@repo/contracts";

export const SEVERITY_DOT: Record<AlertSeverity, string> = {
  info: "bg-info",
  watch: "bg-muted-foreground",
  warning: "bg-warning",
  critical: "bg-negative",
};

export const SEVERITY_TONE: Record<AlertSeverity, string> = {
  info: "border-info/40 bg-info/10 text-info",
  watch: "border-border bg-muted text-muted-foreground",
  warning: "border-warning/40 bg-warning/10 text-warning",
  critical: "border-negative/40 bg-negative/10 text-negative",
};
