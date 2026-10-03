"use client";

import { useEffect, useMemo, useState } from "react";
import { REPLAY_PRESETS, type EventType, type Mode, type ReplayPreset } from "@repo/contracts";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
import { humanize } from "~/lib/display";
import { findPreset, inputValueToIso, isValidAsOf, isoToInputValue } from "~/lib/url-state";

interface ModeSwitchProps {
  mode: Mode;
  presetId: string | null;
  /** The as-of in use: the preset's, a custom one, or null in live mode. */
  asOf: string | null;
  disabled: boolean;
  onModeChange: (mode: Mode) => void;
  onPresetChange: (presetId: string) => void;
  onAsOfChange: (asOf: string) => void;
}

/** Presets grouped by event type, in the order the types first appear in `REPLAY_PRESETS`. */
function groupPresets(): { type: EventType; presets: ReplayPreset[] }[] {
  const groups = new Map<EventType, ReplayPreset[]>();
  for (const p of REPLAY_PRESETS) groups.set(p.type, [...(groups.get(p.type) ?? []), p]);
  return [...groups].map(([type, presets]) => ({ type, presets }));
}

/** Live, or Replay at a preset or any past as-of. Mode, preset and as-of live in the URL (see useTerminalUrl). */
export function ModeSwitch({ mode, presetId, asOf, disabled, onModeChange, onPresetChange, onAsOfChange }: ModeSwitchProps) {
  const groups = useMemo(groupPresets, []);
  const selected = findPreset(presetId);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={mode}
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "live" || value === "replay") onModeChange(value);
        }}
        aria-label="Mode"
      >
        <ToggleGroupItem value="live" className="px-3 text-xs">
          Live
        </ToggleGroupItem>
        <ToggleGroupItem value="replay" className="px-3 text-xs">
          Replay
        </ToggleGroupItem>
      </ToggleGroup>

      {mode === "replay" && asOf !== null ? (
        <>
          <Select value={presetId ?? ""} onValueChange={onPresetChange} disabled={disabled}>
            <SelectTrigger size="sm" className="w-[270px] text-xs" aria-label="Replay preset">
              <SelectValue placeholder="Custom as-of">{selected && `${selected.name} (${selected.year})`}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groups.map(({ type, presets }) => (
                <SelectGroup key={type}>
                  <SelectLabel className="capitalize">{humanize(type)}</SelectLabel>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.year})
                      {!p.confirmed && <span className="text-[10px] text-muted-foreground">provisional time</span>}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <AsOfInput asOf={asOf} disabled={disabled} onCommit={onAsOfChange} />
        </>
      ) : (
        <span className="text-xs text-muted-foreground">As of now. Markets are closed at weekends: prices are end of day.</span>
      )}
    </div>
  );
}

function AsOfInput({ asOf, disabled, onCommit }: { asOf: string; disabled: boolean; onCommit: (asOf: string) => void }) {
  const fromProps = isoToInputValue(asOf);
  // The draft holds what the user is typing; datetime-local is only valid once every segment is filled.
  const [draft, setDraft] = useState(fromProps);
  const [error, setError] = useState<string | null>(null);

  // Show a preset's as-of when it changes from outside.
  useEffect(() => {
    setDraft(fromProps);
    setError(null);
  }, [fromProps]);

  function change(value: string) {
    setDraft(value);
    const iso = inputValueToIso(value);
    if (iso === null) return;
    if (!isValidAsOf(iso, Date.now())) {
      setError("From 2017-01-01 to now");
      return;
    }
    setError(null);
    if (iso !== asOf) onCommit(iso);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      As of (UTC)
      <Input
        type="datetime-local"
        value={draft}
        min="2017-01-01T00:00"
        disabled={disabled}
        aria-invalid={error !== null}
        onChange={(e) => change(e.target.value)}
        className="h-8 w-[185px] px-2 text-xs [color-scheme:dark]"
      />
      {error && (
        <span role="alert" className="text-negative">
          {error}
        </span>
      )}
    </label>
  );
}
