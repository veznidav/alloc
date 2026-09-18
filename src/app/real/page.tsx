"use client";
import { useState } from "react";
import Link from "next/link";
import { DecisionView } from "@/components/DecisionView";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { Progress } from "@/components/Progress";
import { WatchToggle } from "@/components/WatchToggle";
import { WalletPanel } from "@/components/WalletPanel";
import { PositionSummary } from "@/components/PositionCard";
import { useEvaluate } from "@/components/useEvaluate";
import { useAlloc } from "@/store/useAlloc";
import { useHydrated } from "@/components/useHydrated";
import type { PositionInput } from "@/lib/types";

export default function RealPage() {
  const { preferences, realPosition, setRealPosition, realDecision, setRealDecision, addDecision, updateDecision } = useAlloc();
  const { stage, error, resolve, evaluate, reset } = useEvaluate("real");
  const [view, setView] = useState<"pick" | "decision" | "execute">("pick");
  const ready = useHydrated();
  const busy = stage === "position" || stage === "market" || stage === "reasoning";

  async function run(input: PositionInput) {
    setRealDecision(null);
    const position = await resolve(input);
    if (!position) return;
    setRealPosition(position);
    const decision = await evaluate(input, preferences);
    if (!decision) return;
    setRealDecision(decision);
    addDecision(decision);
    setView(decision.action !== "HOLD" && preferences.approvalMode === "autonomous" ? "execute" : "decision");
  }

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">Real mode · real assets, real transactions</p>
          <h1 className="mt-1 text-2xl font-bold">{view === "pick" ? "Your position" : realPosition ? `${realPosition.symbol} on ${realPosition.chain === "base" ? "Base" : "Ethereum"}` : "Your position"}</h1>
        </div>
        {view !== "pick" && <button className="btn btn-secondary btn-sm" onClick={() => { setView("pick"); reset(); }}>Change position</button>}
      </div>

      {view === "pick" && <WalletPanel onSelect={run} busy={busy} />}
      {busy && realPosition && view === "pick" && <div className="card p-6"><PositionSummary position={realPosition} /></div>}
      {busy && <Progress stage={stage} />}
      {error && <div className="card border-danger/30 bg-danger-soft p-5 text-[0.95rem] text-danger">{error}</div>}

      {view === "decision" && realDecision && !busy && (
        <DecisionView
          decision={realDecision}
          actions={
            <>
              {realDecision.action !== "HOLD" && (
                <>
                  <button className="btn btn-danger" onClick={() => { updateDecision(realDecision.id, { status: "rejected" }); setView("pick"); }}>Reject</button>
                  <button className={`btn ${realDecision.action === "MOVE_TO_ROBINHOOD" ? "btn-robinhood" : "btn-stable"}`} onClick={() => setView("execute")}>Review and approve</button>
                </>
              )}
              <button className="btn btn-secondary" onClick={() => realPosition && run({ chain: realPosition.chain, token: realPosition.token, amount: realPosition.amount })}>Re-evaluate</button>
            </>
          }
        />
      )}

      {view === "decision" && realDecision && !busy && (
        <div className="px-1"><WatchToggle onTick={() => realPosition && run({ chain: realPosition.chain, token: realPosition.token, amount: realPosition.amount })} /></div>
      )}

      {view === "execute" && realDecision && (
        <ExecutionPanel
          decision={realDecision}
          onReject={() => { updateDecision(realDecision.id, { status: "rejected" }); setView("decision"); }}
          onDone={(txs) => updateDecision(realDecision.id, { status: "executed", executionTxs: txs })}
        />
      )}

      <p className="text-sm text-ink-3">Approval mode is <span className="font-semibold text-ink-2">{preferences.approvalMode}</span>. Change it in <Link className="underline" href="/settings">preferences</Link>.</p>
    </div>
  );
}
