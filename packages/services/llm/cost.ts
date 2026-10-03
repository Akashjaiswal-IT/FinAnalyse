import { MODEL_PRICES, type Usage } from "@repo/contracts";

/** USD for one call. Dated ids such as `claude-haiku-4-5-20251001` match their family by prefix. */
export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const price = MODEL_PRICES[model] ?? Object.entries(MODEL_PRICES).find(([id]) => model.startsWith(id))?.[1];
  if (!price) return 0;
  return (tokensIn * price.in + tokensOut * price.out) / 1_000_000;
}

export function makeUsage(model: string, tokensIn: number, tokensOut: number): Usage {
  return { model, tokensIn, tokensOut, costUsd: costUsd(model, tokensIn, tokensOut) };
}

/** Adds usages of the same call chain (a retry, or the iterations of a tool loop). */
export function addUsage(a: Usage | null, b: Usage): Usage {
  if (!a) return b;
  return {
    model: b.model,
    tokensIn: a.tokensIn + b.tokensIn,
    tokensOut: a.tokensOut + b.tokensOut,
    costUsd: a.costUsd + b.costUsd,
  };
}

export function sumUsage(usages: readonly Usage[]): { tokensIn: number; tokensOut: number; costUsd: number } {
  return usages.reduce(
    (t, u) => ({
      tokensIn: t.tokensIn + u.tokensIn,
      tokensOut: t.tokensOut + u.tokensOut,
      costUsd: t.costUsd + u.costUsd,
    }),
    { tokensIn: 0, tokensOut: 0, costUsd: 0 },
  );
}
