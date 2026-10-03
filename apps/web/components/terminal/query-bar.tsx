"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Activity, CloudLightning, CornerDownLeft, Flame, LoaderCircle, Ship, Swords, Wind } from "lucide-react";
import { DEFAULT_REPLAY_PRESET_ID, EXAMPLE_QUERIES, MAX_QUERY_LENGTH, REPLAY_PRESETS } from "@repo/contracts";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";

/**
 * The example whose recorded fixture run matches the question. Picking a chip also selects that preset, so a
 * replay answers the question that was asked. Examples without a preset leave the selection alone.
 */
const EXAMPLE_PRESETS: Partial<Record<(typeof EXAMPLE_QUERIES)[number], string>> = {
  [EXAMPLE_QUERIES[0]]: DEFAULT_REPLAY_PRESET_ID,
  [EXAMPLE_QUERIES[1]]: "disaster-hurricane-ida-2021",
};

/** The question a preset is about: its example when there is one, otherwise a question naming the event. */
export function presetQuestion(presetId: string): string | null {
  const example = Object.entries(EXAMPLE_PRESETS).find(([, id]) => id === presetId)?.[0];
  if (example) return example;
  const preset = REPLAY_PRESETS.find((p) => p.id === presetId);
  return preset ? `How will "${preset.name}" affect our portfolio?` : null;
}

/** One icon per example, in the order of `EXAMPLE_QUERIES`. */
const EXAMPLE_ICONS = [Swords, CloudLightning, Flame, Ship, Activity, Wind] as const;

interface QueryBarProps {
  /** True from submit until the run completes or fails. */
  disabled: boolean;
  /** Set when the last submit could not start (for example no recorded run in fixture mode). */
  notice: string | null;
  onSubmit: (query: string) => void;
  onPickExample: (presetId: string) => void;
  /** A question passed in the URL (`?q=`), for example from the command menu. */
  initialQuery?: string | null;
  /** The selected replay preset; choosing another one puts its question in the box. */
  presetId?: string | null;
  /** The question of the run on screen (after a reload or from a link). */
  runQuery?: string | null;
}

export function QueryBar({ disabled, notice, onSubmit, onPickExample, initialQuery, presetId, runQuery }: QueryBarProps) {
  const [query, setQuery] = useState<string>(
    initialQuery?.slice(0, MAX_QUERY_LENGTH) || (presetId ? presetQuestion(presetId) : null) || EXAMPLE_QUERIES[0],
  );
  const lastPreset = useRef(presetId);
  useEffect(() => {
    if (presetId && presetId !== lastPreset.current) {
      const q = presetQuestion(presetId);
      if (q) setQuery(q);
    }
    lastPreset.current = presetId;
  }, [presetId]);
  useEffect(() => {
    if (runQuery) setQuery(runQuery);
  }, [runQuery]);
  const trimmed = query.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (canSubmit) onSubmit(trimmed);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends, Shift+Enter adds a line.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function pick(example: string) {
    setQuery(example);
    const presetId = EXAMPLE_PRESETS[example as keyof typeof EXAMPLE_PRESETS];
    if (presetId) onPickExample(presetId);
  }

  return (
    <form onSubmit={submit} className="space-y-2" aria-label="Ask a question">
      <div className="relative">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, MAX_QUERY_LENGTH))}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={2}
          maxLength={MAX_QUERY_LENGTH}
          placeholder="Ask about anything that moves markets…"
          aria-label="Question"
          className="min-h-[3.75rem] resize-none bg-card/70 pr-24 pb-6 text-[15px] shadow-[0_0_0_1px_oklch(1_0_0/4%)] backdrop-blur-md transition-shadow focus-visible:shadow-[0_0_24px_-6px_var(--primary)]"
        />
        <span className="pointer-events-none absolute bottom-1.5 left-3 font-mono text-[10px] text-muted-foreground">
          {query.length}/{MAX_QUERY_LENGTH}
        </span>
        <Button type="submit" size="sm" disabled={!canSubmit} className="absolute right-2 bottom-2 h-7 gap-1.5 px-2.5 text-xs">
          {disabled ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <CornerDownLeft className="size-3.5" aria-hidden />}
          {disabled ? "Running" : "Ask"}
        </Button>
      </div>

      {notice && (
        <p role="status" className="text-xs text-warning">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5" aria-label="Example questions">
        {EXAMPLE_QUERIES.map((example, i) => {
          const Icon = EXAMPLE_ICONS[i] ?? Activity;
          return (
            <button
              key={example}
              type="button"
              disabled={disabled}
              onClick={() => pick(example)}
              title={example}
              className="group flex max-w-[17rem] cursor-pointer items-center gap-1.5 rounded-full border bg-card/60 px-2.5 py-1 text-[11px] text-muted-foreground backdrop-blur-md transition-colors hover:border-primary/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon className="size-3 shrink-0 text-primary/70 transition-colors group-hover:text-primary" aria-hidden />
              <span className="truncate">{example}</span>
            </button>
          );
        })}
      </div>
    </form>
  );
}
