import { describe, expect, it } from "vitest";
import { HEDGE_LIMITS, NUMERIC_ALLOWLIST, type AnswerDraft, type Evidence, type HedgePlan } from "@repo/contracts";
import { idaEvidence, idaNodeOutputs, ukraineEvidence, ukraineNodeOutputs } from "@repo/contracts/fixtures";
import { Ledger } from "./ledger";
import { caveatNeeds, digitViolations, unknownSymbols, verifyAnswer } from "./verify";
import { renderAnswer } from "./render";

function ledgerWith(rows: Evidence[] = []): Ledger {
  const l = new Ledger();
  rows.forEach((r) => l.restore(r));
  return l;
}

const base = (): { ledger: Ledger; draft: AnswerDraft } => {
  const ledger = new Ledger();
  ledger.add("risk", { kind: "computation", label: "Scenario P&L", value: -142_000, unit: "usd", basis: "computed", source: "test" });
  ledger.add("analogs", { kind: "model", label: "WTI forecast", value: 0.07, unit: "pct_signed", basis: "model", source: "test" });
  return {
    ledger,
    draft: {
      headline: "Oil is forecast {{E2}}.",
      summary: "The scenario loss is {{E1}}.",
      bullets: [{ text: "WTI is forecast {{E2}}.", evidenceKeys: ["E2"] }],
      caveats: [],
    },
  };
};

const inputs = (over: Partial<Parameters<typeof caveatNeeds>[0][number]> = {}) => caveatNeeds([{ name: "sentiment", label: "Sentiment", unavailable: false, stale: false, ...over }]);
const verify = (draft: AnswerDraft, ledger: Ledger, extra: Partial<Parameters<typeof verifyAnswer>[0]> = {}) =>
  verifyAnswer({ draft, hedgePlan: null, ledger, needs: [], nav: 10_000_000, ...extra });

describe("digits", () => {
  it("rejects a digit outside a placeholder", () => {
    const { ledger, draft } = base();
    const r = verify({ ...draft, summary: "The loss is about 142,000 dollars." }, ledger);
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === "digits")?.violations[0]).toContain("142,000");
  });

  it("accepts digits that sit inside a placeholder", () => {
    const { ledger, draft } = base();
    expect(verify(draft, ledger).passed).toBe(true);
  });

  it.each([...NUMERIC_ALLOWLIST])("accepts the allowlisted name %s", (name) => {
    expect(digitViolations(`Markets watched ${name} closely.`)).toEqual([]);
  });

  it("still rejects a digit next to an allowlisted name", () => {
    expect(digitViolations("The S&P 500 fell 3%.")).toEqual(["3%."]);
  });
});

describe("placeholders", () => {
  it("rejects an unknown key", () => {
    const { ledger, draft } = base();
    const r = verify({ ...draft, headline: "Oil moves {{E99}}." }, ledger);
    expect(r.passed).toBe(false);
    expect(r.checks.find((c) => c.name === "placeholders")?.violations).toContain("unknown evidence key E99");
  });

  it("rejects a malformed placeholder and a bullet that cites an unknown key", () => {
    const { ledger, draft } = base();
    const r = verify({ ...draft, summary: "Loss {{ E1 }}.", bullets: [{ text: "x", evidenceKeys: ["E42"] }] }, ledger);
    const violations = r.checks.find((c) => c.name === "placeholders")?.violations ?? [];
    expect(violations.some((v) => v.includes("malformed"))).toBe(true);
    expect(violations).toContain("bullet cites unknown key E42");
  });
});

describe("universe", () => {
  it("flags a ticker outside the universe and accepts universe symbols and acronyms", () => {
    expect(unknownSymbols("Buy TSLA and hold AAPL while the VIX and OPEC calm down.")).toEqual(["TSLA"]);
  });

  it("fails the check", () => {
    const { ledger, draft } = base();
    expect(verify({ ...draft, summary: "Consider TSLA." }, ledger).passed).toBe(false);
  });
});

describe("caveats", () => {
  it("appends a caveat for an unavailable input the answer does not mention", () => {
    const { ledger, draft } = base();
    const r = verify(draft, ledger, { needs: inputs({ unavailable: true }) });
    expect(r.passed).toBe(true);
    expect(r.appendedCaveats).toEqual(["Sentiment data was unavailable, so this answer does not use it."]);
    expect(r.caveats).toContain(r.appendedCaveats[0]);
    expect(r.checks.find((c) => c.name === "caveats")?.passed).toBe(false);
  });

  it("does not append when the answer already mentions the input", () => {
    const { ledger, draft } = base();
    const r = verify({ ...draft, caveats: ["News sentiment could not be read."] }, ledger, { needs: inputs({ unavailable: true }) });
    expect(r.appendedCaveats).toEqual([]);
  });

  it("appends a stale caveat and never puts digits in an appended caveat", () => {
    const { ledger, draft } = base();
    const r = verify(draft, ledger, { needs: inputs({ stale: true }) });
    expect(r.appendedCaveats).toHaveLength(1);
    expect(digitViolations(r.appendedCaveats[0] as string)).toEqual([]);
  });
});

describe("hedge limits", () => {
  const plan = (over: Partial<HedgePlan["actions"][number]> = {}, violations: HedgePlan["violations"] = []): HedgePlan => {
    const { ledger } = base();
    return {
      source: "model",
      summary: ledger.text("Net effect {{E1}}."),
      grossNotional: 0,
      before: { var1d: { var95: 1, cvar95: 1 }, var5d: { var95: 1, cvar95: 1 }, sleeveBeta: 1, scenarioPnl: 0 },
      after: { var1d: { var95: 1, cvar95: 1 }, var5d: { var95: 1, cvar95: 1 }, sleeveBeta: 1, scenarioPnl: 0 },
      violations,
      actions: [
        {
          type: "hedge", symbol: "SPY", side: "sell", quantity: 100, notional: 50_000, timing: "now", orderType: "market",
          exitTrigger: ledger.text("Cover when calm."), rationale: ledger.text("Market forecast {{E2}}."), evidenceKeys: ["E2"], ...over,
        },
      ],
    };
  };

  it("passes a plan inside the limits", () => {
    const { ledger, draft } = base();
    expect(verify(draft, ledger, { hedgePlan: plan() }).passed).toBe(true);
  });

  it.each([
    ["a single action above 10% of NAV", { notional: HEDGE_LIMITS.singleActionMaxPctNav * 10_000_000 + 1 }],
    ["a hedge outside the menu", { symbol: "AAPL" }],
    ["a symbol outside the universe", { symbol: "TSLA" }],
    ["a fractional quantity", { quantity: 1.5 }],
    ["an action with no evidence", { evidenceKeys: [] }],
  ])("rejects %s", (_name, over) => {
    const { ledger, draft } = base();
    expect(verify(draft, ledger, { hedgePlan: plan(over) }).passed).toBe(false);
  });

  it("rejects gross notional above 30% of NAV and reports recorded violations", () => {
    const { ledger, draft } = base();
    const big = plan();
    big.actions = Array.from({ length: 4 }, () => ({ ...(big.actions[0] as HedgePlan["actions"][number]), notional: 900_000 }));
    expect(verify(draft, ledger, { hedgePlan: big }).passed).toBe(false);
    const recorded = plan({}, [{ rule: "adv", symbol: "SPY", message: "above ADV limit" }]);
    expect(verify(draft, ledger, { hedgePlan: recorded }).violations).toContain("above ADV limit");
  });

  it("rejects digits in the rationale of a hedge action", () => {
    const { ledger, draft } = base();
    const p = plan();
    p.actions[0] = { ...(p.actions[0] as HedgePlan["actions"][number]), rationale: ledger.text("Sell 5% now.") };
    expect(verify(draft, ledger, { hedgePlan: p }).passed).toBe(false);
  });
});

describe("fixture answers", () => {
  it.each([
    ["Ida", idaEvidence, idaNodeOutputs.synthesizer, idaNodeOutputs.hedging],
    ["Ukraine", ukraineEvidence, ukraineNodeOutputs.synthesizer, ukraineNodeOutputs.hedging],
  ])("the %s fixture answer passes every check", (_name, evidence, answer, hedging) => {
    const ledger = ledgerWith(evidence);
    const draft: AnswerDraft = {
      headline: answer.headline.template,
      summary: answer.summary.template,
      bullets: answer.bullets.map((b) => ({ text: b.text.template, evidenceKeys: b.evidenceKeys })),
      caveats: answer.caveats.map((c) => c.template),
    };
    const hedgePlan = hedging.status === "ok" ? hedging.plan : null;
    const r = verify(draft, ledger, { hedgePlan });
    expect(r.violations).toEqual([]);
    expect(r.passed).toBe(true);
    const rendered = renderAnswer(draft, r.caveats, ledger, { confidence: answer.confidence, badges: answer.badges, source: "model" });
    expect(rendered.headline.rendered).toBe(answer.headline.rendered);
    expect(rendered.bullets.map((b) => b.text.rendered)).toEqual(answer.bullets.map((b) => b.text.rendered));
  });
});
