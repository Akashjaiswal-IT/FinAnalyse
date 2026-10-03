"use client";

import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

const SEEN_KEY = "tempest:tour-seen";

const COMMON: DriveStep[] = [
  { element: '[data-tour="nav"]', popover: { title: "Five places", description: "Dashboard for the portfolio now, Analyze for any question, Alerts that arrive without one, Ideas to buy or sell, and Reliability for how well it works." } },
];

const STEPS: Record<string, DriveStep[]> = {
  "/": [
    ...COMMON,
    { element: '[data-tour="kpis"]', popover: { title: "The portfolio at a glance", description: "Value, cash and the market regime, from the latest prices." } },
    { element: '[data-tour="heatmap"]', popover: { title: "Heatmap", description: "Box size is the position's weight; colour is today's move. Click a box to open the stock." } },
    { element: '[data-tour="holdings"]', popover: { title: "Holdings", description: "Each holding shows whether it is a short- or long-term position, its recent price and its news." } },
    { element: '[data-tour="alerts"]', popover: { title: "Alerts", description: "When news about an event reaches a holding, an alert arrives here without anyone asking." } },
    { element: '[data-tour="theme"]', popover: { title: "Light or dark", description: "Light mode reads better on a projector." } },
  ],
  "/analyze": [
    ...COMMON,
    { element: '[data-tour="mode"]', popover: { title: "Live or replay", description: "Replay sets the clock to a past moment, such as the morning Russia invaded Ukraine. Nothing published later can be read." } },
    { element: '[data-tour="ask"]', popover: { title: "Ask", description: "Ask about anything that moves markets, or pick an example." } },
    { element: '[data-tour="graph"]', popover: { title: "Ten agents, live", description: "Each agent lights up as it works. Click one to see its inputs, outputs, model and cost." } },
    { element: '[data-tour="impact"]', popover: { title: "The numbers that matter", description: "Scenario result, risk, exposure and confidence, all computed in code." } },
    { element: '[data-tour="answer"]', popover: { title: "Every number has a source", description: "Hover a number for its source and time; click it for the full evidence. The model never writes a digit." } },
    { element: '[data-tour="side"]', popover: { title: "Behind the answer", description: "The step-by-step log, detected events, incoming news and the health of every data source." } },
  ],
};

/** Runs the tour for the page; steps whose element is not on screen are skipped. */
export function startTour(pathname: string): void {
  const steps = (STEPS[pathname] ?? COMMON).filter((s) => typeof s.element !== "string" || document.querySelector(s.element));
  if (steps.length === 0) return;
  localStorage.setItem(SEEN_KEY, "1");
  driver({ showProgress: true, animate: true, overlayOpacity: 0.55, stagePadding: 6, stageRadius: 10, steps }).drive();
}

export function tourSeen(): boolean {
  return typeof window !== "undefined" && localStorage.getItem(SEEN_KEY) === "1";
}
