"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { CornerDownLeft, LoaderCircle } from "lucide-react";
import { DEFAULT_REPLAY_PRESET_ID, EXAMPLE_QUERIES, MAX_QUERY_LENGTH } from "@repo/contracts";
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

interface QueryBarProps {
  /** True from submit until the run completes or fails. */
  disabled: boolean;
  /** Set when the last submit could not start (for example no recorded run in fixture mode). */
  notice: string | null;
  onSubmit: (query: string) => void;
  onPickExample: (presetId: string) => void;
}

export function QueryBar({ disabled, notice, onSubmit, onPickExample }: QueryBarProps) {
  const [query, setQuery] = useState<string>(EXAMPLE_QUERIES[0]);
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
          className="min-h-[3.5rem] resize-none pr-24 pb-6 text-sm"
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
        {EXAMPLE_QUERIES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={disabled}
            onClick={() => pick(example)}
            title={example}
            className="max-w-[16rem] cursor-pointer truncate rounded-full border bg-secondary/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
}
