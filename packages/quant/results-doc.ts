const PLACEHOLDER = "Nothing has been measured yet.";

const markers = (name: string): { start: string; end: string } => ({
  start: `<!-- results:${name}:start -->`,
  end: `<!-- results:${name}:end -->`,
});

/**
 * Puts `body` between the `results:<name>` markers of `docs/RESULTS.md`, replacing what was there or appending
 * the section when it is new (SPEC 9.5: the file is written only from script output). Other sections are left
 * untouched; the "nothing measured yet" placeholder goes once there is a result. Running it twice with the same
 * body gives the same text. Throws when the markers are unpaired or out of order.
 */
export function upsertResultsSection(text: string, name: string, body: string): string {
  const { start, end } = markers(name);
  const block = `${start}\n${body.trim()}\n${end}`;
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if ((from === -1) !== (to === -1)) throw new Error(`results section "${name}" has only one marker`);
  if (from !== -1 && (to < from || text.indexOf(start, from + 1) !== -1 || text.indexOf(end, to + 1) !== -1)) {
    throw new Error(`results section "${name}" has misplaced or repeated markers`);
  }

  let out: string;
  if (from !== -1) {
    out = text.slice(0, from) + block + text.slice(to + end.length);
  } else {
    const head = text.replace(/\s+$/, "");
    out = head === "" ? `${block}\n` : `${head}\n\n${block}\n`;
  }
  return out.replace(new RegExp(`\\n*${PLACEHOLDER}\\n*`), "\n\n").replace(/\n{3,}/g, "\n\n");
}

/** The body between the `results:<name>` markers (without them, trimmed), or null when the section is absent. */
export function getResultsSection(text: string, name: string): string | null {
  const { start, end } = markers(name);
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from === -1 || to === -1 || to < from) return null;
  return text.slice(from + start.length, to).trim();
}

/** Lines that say when and where a section was produced; they change on every run and are not results. */
const PROVENANCE_LINE = /^- Run: /;

export interface ResultsDiff {
  same: boolean;
  /** Why not, in one line: the section is missing, or the first line that differs. */
  reason: string | null;
}

/**
 * Whether the recorded `results:<name>` section of `docs/RESULTS.md` equals `body`, ignoring the "- Run:" line
 * (date, machine, commit). Used to check that re-running a script reproduces the recorded numbers (Gate C3).
 */
export function diffResultsSection(text: string, name: string, body: string): ResultsDiff {
  const recorded = getResultsSection(text, name);
  if (recorded === null) return { same: false, reason: `no "${name}" section is recorded in the results file` };
  const lines = (s: string) => s.split("\n").filter((l) => !PROVENANCE_LINE.test(l));
  const a = lines(recorded);
  const b = lines(body.trim());
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return { same: false, reason: `line ${i + 1} differs: recorded ${JSON.stringify(a[i] ?? null)}, fresh ${JSON.stringify(b[i] ?? null)}` };
    }
  }
  return { same: true, reason: null };
}
