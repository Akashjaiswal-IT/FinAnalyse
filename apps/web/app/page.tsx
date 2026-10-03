import { Suspense } from "react";
import { Terminal } from "~/components/terminal/terminal";

// The terminal reads mode, preset and as-of from the URL query, which needs a Suspense boundary.
export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center font-mono text-sm tracking-[0.25em] text-muted-foreground">
          TEMPEST
        </div>
      }
    >
      <Terminal />
    </Suspense>
  );
}
