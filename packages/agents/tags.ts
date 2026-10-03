/** In-process handles for evidence rows (see `Ledger.add`). Nodes tag the rows the template answer needs, so
 * it can cite them without parsing labels. Missing tags simply drop that sentence from the template. */
export const TAG = {
  eventTitle: "event.title",
  eventVolZ: "event.volZ",
  eventToneZ: "event.toneZ",
  eventArticles: "event.articles",
  riskNav: "risk.nav",
  riskVar1d: "risk.var1d",
  riskScenarioPnl: "risk.scenarioPnl",
  riskAnalogPnl: "risk.analogPnl",
  exposedDirect: "risk.exposed.direct",
  exposedPeer: "risk.exposed.peer",
  exposedFactor: "risk.exposed.factor",
  analogsEffectiveN: "analogs.effectiveN",
  analogsTypeEvents: "analogs.typeEvents",
  hedgeAfterPnl: "hedge.afterPnl",
  hedgeGross: "hedge.gross",
  macroVix: "macro.vix",
} as const;

export const forecastTag = (target: string) => `forecast.${target}`;
