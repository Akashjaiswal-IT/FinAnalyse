import { Suspense } from "react";
import { Terminal } from "~/components/terminal/terminal";

// The terminal reads mode, preset and as-of from the URL query, which needs a Suspense boundary.
export default function AnalyzePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <Terminal />
    </Suspense>
  );
}
