"use client";
import { useState } from "react";
import { DecisionView } from "@/components/DecisionView";
import { PositionForm } from "@/components/PositionForm";
import { Progress } from "@/components/Progress";
import { WatchToggle } from "@/components/WatchToggle";
import { ReevaluateBlock } from "@/components/ReevaluateBlock";
import { SimulationPanel } from "@/components/SimulationPanel";
import { ComparePanel } from "@/components/ComparePanel";
import { PositionSummary } from "@/components/PositionCard";
import { useEvaluate } from "@/components/useEvaluate";
import { useAlloc } from "@/store/useAlloc";
import { useHydrated } from "@/components/useHydrated";
import type { PositionInput } from "@/lib/types";

export default function PlaygroundPage() {
  const { preferences, playgroundPosition, setPlaygroundPosition, playgroundDecision, setPlaygroundDecision, addDecision, updateDecision } = useAlloc();
  const { stage, error, feed, livePosition, evaluate, reset } = useEvaluate("playground");
  const [view, setView] = useState<"form" | "decision" | "simulate" | "compare">(() => (typeof window !== "undefined" && useAlloc.getState().playgroundDecision ? "decision" : "form"));
  const hydrated = useHydrated();

  const busy = stage === "position" || stage === "market" || stage === "routes" || stage === "reasoning";

  async function run(input: PositionInput) {
    setPlaygroundDecision(null);
    const result = await evaluate(input, preferences);
    if (!result) return;
    setPlaygroundPosition(result.position);
    setPlaygroundDecision(result.decision);
    addDecision(result.decision);
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
        </div>
      )}

      {busy && livePosition && (
        <div className="card p-6 reveal"><PositionSummary position={livePosition} /></div>
      )}
      {busy && <Progress stage={stage} feed={feed} />}
      {error && (
        <div className="card border-danger/30 bg-danger-soft p-5 text-[0.95rem] text-danger">
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => reset()}>Try again</button>
        </div>
      )}

      {view === "decision" && playgroundDecision && !busy && (
        <DecisionView
          decision={playgroundDecision}
          actions={
            <>
              {playgroundDecision.action !== "HOLD" && <button className={`btn ${playgroundDecision.action === "MOVE_TO_ROBINHOOD" ? "btn-robinhood" : "btn-stable"}`} onClick={() => { setView("simulate"); updateDecision(playgroundDecision.id, { status: "simulated" }); }}>Simulate</button>}
              <button className="btn btn-secondary" onClick={() => setView("compare")}>Compare profiles</button>
            </>
          }
        />
      )}

      {view === "compare" && playgroundDecision && (
        <>
          <ComparePanel
            position={{ chain: playgroundDecision.position.chain, token: playgroundDecision.position.token, amount: playgroundDecision.position.amount }}
            preferences={preferences}
            onPick={(d) => { setPlaygroundDecision(d); addDecision(d); setView("decision"); }}
          />
          <button className="btn btn-secondary" onClick={() => setView("decision")}>Back to decision</button>
        </>
      )}

      {view === "decision" && playgroundDecision && !busy && (
        <>
          <ReevaluateBlock onReevaluate={reevaluate} busy={busy} />
          <div className="px-1"><WatchToggle onTick={reevaluate} /></div>
        </>
      )}

      {view === "simulate" && playgroundDecision && (
        <SimulationPanel decision={playgroundDecision} onBack={() => setView("decision")} onAnother={() => { setView("form"); reset(); }} />
      )}
    </div>
  );
}
