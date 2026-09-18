"use client";
import { useState } from "react";
import Link from "next/link";
import { DecisionView } from "@/components/DecisionView";
import { PositionForm } from "@/components/PositionForm";
import { Progress } from "@/components/Progress";
import { WatchToggle } from "@/components/WatchToggle";
import { SimulationPanel } from "@/components/SimulationPanel";
import { PositionSummary } from "@/components/PositionCard";
import { useEvaluate } from "@/components/useEvaluate";
import { useAlloc } from "@/store/useAlloc";
import { useHydrated } from "@/components/useHydrated";
import type { PositionInput } from "@/lib/types";

export default function PlaygroundPage() {
  const { preferences, playgroundPosition, setPlaygroundPosition, playgroundDecision, setPlaygroundDecision, addDecision, updateDecision } = useAlloc();
  const { stage, error, resolve, evaluate, reset } = useEvaluate("playground");
  const [view, setView] = useState<"form" | "decision" | "simulate">(() => (typeof window !== "undefined" && useAlloc.getState().playgroundDecision ? "decision" : "form"));
  const hydrated = useHydrated();

  const busy = stage === "position" || stage === "market" || stage === "reasoning";

  async function run(input: PositionInput) {
    setPlaygroundDecision(null);
    const position = await resolve(input);
    if (!position) return;
    setPlaygroundPosition(position);
    const decision = await evaluate(input, preferences);
    if (!decision) return;
    setPlaygroundDecision(decision);
    addDecision(decision);
    setView("decision");
  }

  function reevaluate() {
    if (!playgroundPosition) return;
    run({ chain: playgroundPosition.chain, token: playgroundPosition.token, amount: playgroundPosition.amount });
  }

  if (!hydrated) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">Playground · simulation only</p>
          <h1 className="mt-1 text-2xl font-bold">{view === "form" ? "Create a hypothetical position" : "Your hypothetical position"}</h1>
        </div>
        {view !== "form" && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setView("form"); reset(); }}>New position</button>
        )}
      </div>

      {view === "form" && (
        <div className="card p-6 sm:p-8">
          <PositionForm onSubmit={run} busy={busy} initial={playgroundPosition ? { chain: playgroundPosition.chain, token: playgroundPosition.token, amount: playgroundPosition.amount } : null} />
          <p className="mt-5 text-sm text-ink-3">
            Alloc uses your <Link className="underline" href="/settings">preferences</Link>: {preferences.risk} risk, move only above {preferences.minOpportunityPct}% advantage, never more than {preferences.maxAllocationPct}% per decision.
          </p>
        </div>
      )}

      {busy && playgroundPosition && view === "form" && (
        <div className="card p-6"><PositionSummary position={playgroundPosition} /></div>
      )}
      {busy && <Progress stage={stage} />}
      {error && <div className="card border-danger/30 bg-danger-soft p-5 text-[0.95rem] text-danger">{error}</div>}

      {view === "decision" && playgroundDecision && !busy && (
        <DecisionView
          decision={playgroundDecision}
          actions={
            <>
              {playgroundDecision.action !== "HOLD" && <button className={`btn ${playgroundDecision.action === "MOVE_TO_ROBINHOOD" ? "btn-robinhood" : "btn-stable"}`} onClick={() => { setView("simulate"); updateDecision(playgroundDecision.id, { status: "simulated" }); }}>Simulate</button>}
              <button className="btn btn-secondary" onClick={reevaluate}>Re-evaluate</button>
            </>
          }
        />
      )}

      {view === "decision" && playgroundDecision && !busy && (
        <div className="px-1"><WatchToggle onTick={reevaluate} /></div>
      )}

      {view === "simulate" && playgroundDecision && (
        <SimulationPanel decision={playgroundDecision} onBack={() => setView("decision")} onAnother={() => { setView("form"); reset(); }} />
      )}
    </div>
  );
}
