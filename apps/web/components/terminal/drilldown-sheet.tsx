"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { ExposureDetail, HedgeDetail } from "./drilldown-detail";
import { EvidenceTab } from "./drilldown-evidence";
import { StepsTab } from "./drilldown-steps";
import { VerificationTab } from "./drilldown-verification";
import { useRun, type DrilldownTarget } from "./run-context";

type Tab = "steps" | "evidence" | "verification" | "detail";

function initialTab(target: DrilldownTarget): Tab {
  switch (target.kind) {
    case "run":
    case "node":
      return "steps";
    case "evidence":
      return "evidence";
    case "verification":
      return "verification";
    case "hedge":
    case "exposure":
      return "detail";
  }
}

function titleOf(target: DrilldownTarget): { title: string; description: string } {
  switch (target.kind) {
    case "run":
      return { title: "Run audit", description: "Every step, the evidence it produced, and the verifier's report." };
    case "node":
      return { title: `Step: ${target.node}`, description: "What this step did, its model, tokens, cost and output." };
    case "evidence":
      return { title: `Evidence ${target.key}`, description: "Where this number came from and how it was produced." };
    case "hedge":
      return { title: "Hedge action", description: "The action, the evidence it cites, and the plan's risk before and after." };
    case "exposure":
      return { title: `${target.symbol} exposure`, description: "Why this holding is connected to the event." };
    case "verification":
      return { title: "Verification", description: "The grounding checks run on every authored number." };
  }
}

function DrilldownBody({ target }: { target: DrilldownTarget }) {
  const { view } = useRun();
  const [tab, setTab] = useState<Tab>(() => initialTab(target));
  const { title, description } = titleOf(target);
  const hasDetail = target.kind === "hedge" || target.kind === "exposure";

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="mx-4 mt-3 self-start">
          {hasDetail && <TabsTrigger value="detail">Detail</TabsTrigger>}
          <TabsTrigger value="steps">Steps</TabsTrigger>
          <TabsTrigger value="evidence">Evidence ({view.evidence.length})</TabsTrigger>
          <TabsTrigger value="verification">Verification</TabsTrigger>
        </TabsList>
        {hasDetail && (
          <TabsContent value="detail" className="min-h-0 overflow-y-auto">
            {target.kind === "hedge" && <HedgeDetail index={target.index} />}
            {target.kind === "exposure" && <ExposureDetail symbol={target.symbol} />}
          </TabsContent>
        )}
        <TabsContent value="steps" className="min-h-0 overflow-y-auto">
          <StepsTab focusNode={target.kind === "node" ? target.node : null} />
        </TabsContent>
        <TabsContent value="evidence" className="min-h-0 overflow-y-auto">
          <EvidenceTab focusKey={target.kind === "evidence" ? target.key : null} />
        </TabsContent>
        <TabsContent value="verification" className="min-h-0 overflow-y-auto">
          <VerificationTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

/**
 * The audit view, opened from an evidence chip, a graph node, a hedge row or an exposure badge. The `key`
 * remounts the body when something behind it asks for a different target, so it always opens on that target.
 */
export function DrilldownSheet({
  target,
  open,
  onOpenChange,
}: {
  target: DrilldownTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
        {target && <DrilldownBody key={JSON.stringify(target)} target={target} />}
      </SheetContent>
    </Sheet>
  );
}
