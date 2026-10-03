import { ENERGY_SECTORS, UNIVERSE, type MacroOutput } from "@repo/contracts";
import type { NodeImpl } from "../context";
import { loadPortfolio } from "../data";
import { finding, writeFindings } from "../notes";
import { TAG } from "../tags";

const hasEnergy = (symbols: readonly string[]) =>
  symbols.some((s) => ENERGY_SECTORS.includes(UNIVERSE.find((u) => u.symbol === s)?.sector as never));

/** FRED snapshot at as-of (SPEC 5.5, `macro`): VIX level and z-score, 10-year yield, dollar index, fed funds, and
 * inventories when the portfolio holds energy. */
export const macroNode: NodeImpl = async (state, env) => {
  if (!state.plan?.specialists.macro) {
    const output: MacroOutput = { status: "skipped" };
    return { update: { macroOut: output }, status: "skipped", summary: "Macro not needed.", output };
  }
  const { ctx } = env;
  const portfolio = await loadPortfolio(ctx).catch(() => null);
  const energy = portfolio ? hasEnergy(portfolio.positions.map((p) => p.symbol)) : true;
  const snapshot = await ctx.deps.macro.snapshot(new Date(ctx.asOf), energy);

  const keys: string[] = [];
  const common = { kind: "macro" as const, source: "fred", asOf: ctx.asOf };
  const add = (label: string, value: number, unit: "ratio" | "z" | "pct_signed" | "text", extra: { textValue?: string; sourceRef: string; basis?: "observed" | "computed"; tag?: string }) => {
    const key = env.evidence({ ...common, label, value, unit, basis: extra.basis ?? "observed", sourceRef: extra.sourceRef, textValue: extra.textValue, tag: extra.tag });
    keys.push(key);
    return key;
  };
  const vix = add("VIX level", snapshot.vix.value, "ratio", { sourceRef: "VIXCLS", tag: TAG.macroVix });
  const vixFlag = env.evidence({ ...common, label: "Volatility regime", value: null, textValue: snapshot.vix.flag, unit: "text", basis: "computed", sourceRef: "VIX_ELEVATED, VIX_STRESSED" });
  keys.push(vixFlag);
  const vixZ = snapshot.vix.z !== null ? add("VIX z-score", snapshot.vix.z, "z", { sourceRef: "VIXCLS, 252-day window", basis: "computed" }) : null;
  const yieldChange = add("10-year yield change over 20 days", snapshot.yield10y.change20d, "ratio", { sourceRef: "DGS10", basis: "computed" });
  const dollar = add("Dollar index change over 20 days", snapshot.dollarIndex.change20d, "ratio", { sourceRef: "DTWEXBGS", basis: "computed" });
  const gasoline = snapshot.gasolineStocks
    ? add("Gasoline stocks against the 5-year same-week average", snapshot.gasolineStocks.deviation, "pct_signed", { sourceRef: "WGTSTUS1", basis: "computed" })
    : null;
  const crude = snapshot.crudeStocks
    ? add("Crude stocks against the 5-year same-week average", snapshot.crudeStocks.deviation, "pct_signed", { sourceRef: "WCESTUS1", basis: "computed" })
    : null;

  const fallback = [
    finding(env, `Volatility is {{${vixFlag}}}: the VIX is {{${vix}}}${vixZ ? `, a z-score of {{${vixZ}}}` : ""}.`, [vixFlag, vix, ...(vixZ ? [vixZ] : [])]),
    ...(gasoline ? [finding(env, `Gasoline inventories stand {{${gasoline}}} against their five-year same-week average.`, [gasoline])] : []),
  ];
  const findings = await writeFindings(env, "notes:macro", "Macro regime: volatility, rates, dollar and fuel inventories", { vix: snapshot.vix.flag, vixKey: vix, yieldChangeKey: yieldChange, dollarKey: dollar, gasolineFlag: snapshot.gasolineStocks?.flag ?? null, crudeFlag: snapshot.crudeStocks?.flag ?? null, crudeKey: crude }, keys, fallback);
  const output: MacroOutput = { status: "ok", snapshot, findings };
  return { update: { macroOut: output }, status: "done", summary: `VIX ${snapshot.vix.flag}${snapshot.gasolineStocks ? `, gasoline stocks ${snapshot.gasolineStocks.flag}` : ""}`, output };
};
