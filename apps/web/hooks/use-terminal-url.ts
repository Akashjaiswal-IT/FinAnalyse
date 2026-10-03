"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  asOfParams,
  modeParams,
  parseTerminalParams,
  presetParams,
  resolveAsOf,
  serializeTerminalParams,
  type TerminalParams,
} from "~/lib/url-state";
import type { Mode } from "@repo/contracts";

/** Mode, preset, as-of and the run on screen, read from and written to the URL query so a reload restores them. */
export function useTerminalUrl() {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const params = useMemo(() => parseTerminalParams(search, Date.now()), [search]);

  const write = useCallback(
    (next: TerminalParams) => router.replace(`${pathname}?${serializeTerminalParams(next)}`, { scroll: false }),
    [router, pathname],
  );

  const runId = search.get("run");
  const setRunId = useCallback(
    (id: string | null) => {
      const base = serializeTerminalParams(params);
      router.replace(`${pathname}?${base}${id ? `${base ? "&" : ""}run=${encodeURIComponent(id)}` : ""}`, { scroll: false });
    },
    [router, pathname, params],
  );

  return {
    /** A question handed over in the URL; read once, when the query bar mounts. */
    initialQuery: search.get("q"),
    /** `go=1`: start the run as soon as the page opens (links from alerts and ideas). */
    autoRun: search.get("go") === "1",
    /** The run on screen, so a reload can follow it again. */
    runId,
    setRunId,
    mode: params.mode,
    presetId: params.presetId,
    /** The as-of that runs and panels use: the preset's, a custom one, or null in live mode. */
    asOf: resolveAsOf(params),
    setMode: useCallback((mode: Mode) => write(modeParams(mode)), [write]),
    setPreset: useCallback((presetId: string) => write(presetParams(presetId)), [write]),
    setAsOf: useCallback((asOf: string) => write(asOfParams(asOf)), [write]),
  };
}
