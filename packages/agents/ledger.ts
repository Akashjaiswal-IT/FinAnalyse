import { renderTemplate, type Evidence, type TemplateText } from "@repo/contracts";
import { logger } from "@repo/logger";

export type NewEvidence = Pick<Evidence, "kind" | "label" | "unit" | "basis" | "source"> &
  Partial<Pick<Evidence, "value" | "textValue" | "sourceRef" | "asOf" | "stale" | "payload">> & {
    /** In-process handle so the template answer can find a row without the key; never persisted. */
    tag?: string;
  };

/** The evidence ledger of one run (SPEC 5.6). Every number a user can read is a row here; LLM-written text
 * only references rows as `{{E12}}`. */
export class Ledger {
  private readonly rows: Evidence[] = [];
  private readonly byKey = new Map<string, Evidence>();
  private readonly byTag = new Map<string, string>();
  private readonly undrained = new Map<string, Evidence[]>();
  private counter = 0;

  add(producedBy: string, input: NewEvidence): string {
    const { tag, ...rest } = input;
    let value = rest.value ?? null;
    if (value !== null && !Number.isFinite(value)) {
      logger.warn("non-finite evidence value stored as null", { producedBy, label: rest.label });
      value = null;
    }
    const row: Evidence = {
      key: `E${this.counter + 1}`,
      kind: rest.kind,
      label: rest.label,
      value,
      textValue: rest.textValue ?? null,
      unit: rest.unit,
      basis: rest.basis,
      source: rest.source,
      sourceRef: rest.sourceRef ?? null,
      asOf: rest.asOf ?? null,
      stale: rest.stale ?? false,
      producedBy,
      payload: rest.payload ?? null,
    };
    this.store(row);
    if (tag) this.byTag.set(tag, row.key);
    return row.key;
  }

  /** Inserts a row with its own key. For the fixture stubs and tests; real nodes use `add`. */
  restore(row: Evidence): void {
    this.store(row);
  }

  private store(row: Evidence): void {
    this.counter = Math.max(this.counter, Number(row.key.slice(1)));
    this.rows.push(row);
    this.byKey.set(row.key, row);
    const pending = this.undrained.get(row.producedBy) ?? [];
    pending.push(row);
    this.undrained.set(row.producedBy, pending);
  }

  /** An adder with `producedBy` fixed, for a node. */
  forNode(node: string): { add: (input: NewEvidence) => string } {
    return { add: (input) => this.add(node, input) };
  }

  /** Rows added by `node` since the last drain, for the `evidence.added` event. */
  drain(node: string): Evidence[] {
    const rows = this.undrained.get(node) ?? [];
    this.undrained.delete(node);
    return rows;
  }

  get(key: string): Evidence | undefined {
    return this.byKey.get(key);
  }

  has(key: string): boolean {
    return this.byKey.has(key);
  }

  all(): Evidence[] {
    return [...this.rows];
  }

  keys(): string[] {
    return this.rows.map((r) => r.key);
  }

  /** Key of the row added with `tag`, if any. */
  tagged(tag: string): string | undefined {
    return this.byTag.get(tag);
  }

  render(template: string): { text: string; missing: string[] } {
    return renderTemplate(template, (k) => this.byKey.get(k));
  }

  /** A template and its rendering. An unresolved key stays visible in `rendered`; the verifier rejects it. */
  text(template: string): TemplateText {
    return { template, rendered: this.render(template).text };
  }
}
