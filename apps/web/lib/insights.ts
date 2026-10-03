import { previewAlerts, previewIdeas } from "@repo/contracts/fixtures";
import type { Alert, Idea } from "@repo/contracts";

// The alert and idea services are not built yet: these hooks serve the preview fixtures and say so, and are the one
// place to switch to the tRPC routes when they exist.

export function useAlerts(): { alerts: Alert[]; preview: boolean } {
  return { alerts: previewAlerts, preview: true };
}

export function useIdeas(): { ideas: Idea[]; preview: boolean } {
  return { ideas: previewIdeas, preview: true };
}
