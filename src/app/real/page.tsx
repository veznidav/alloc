"use client";
import { useState } from "react";
import Link from "next/link";
import { DecisionView } from "@/components/DecisionView";
import { ExecutionPanel } from "@/components/ExecutionPanel";
import { Progress } from "@/components/Progress";
import { WatchToggle } from "@/components/WatchToggle";
import { ReevaluateBlock } from "@/components/ReevaluateBlock";
import { WalletPanel } from "@/components/WalletPanel";
import { PositionSummary } from "@/components/PositionCard";
import { useEvaluate } from "@/components/useEvaluate";
import { useAlloc } from "@/store/useAlloc";
import { useHydrated } from "@/components/useHydrated";
import type { PositionInput } from "@/lib/types";

export default function RealPage() {
  const { preferences, realPosition, setRealPosition, realDecision, setRealDecision, addDecision, updateDecision } = useAlloc();
  const { stage, error, feed, livePosition, evaluate, reset } = useEvaluate("real");
  const [view, setView] = useState<"pick" | "decision" | "execute">("pick");
  const ready = useHydrated();
  const busy = stage === "position" || stage === "market" || stage === "routes" || stage === "reasoning";

  async function run(input: PositionInput) {
    setRealDecision(null);
    const result = await evaluate(input, preferences);
    if (!result) return;
    setRealPosition(result.position);
    setRealDecision(result.decision);
    addDecision(result.decision);
    setView(result.decision.action !== "HOLD" && preferences.approvalMode === "autonomous" ? "execute" : "decision");
  }

  if (!ready) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">My wallet · real assets, real transactions</p>
          <h1 className="mt-1 text-2xl font-bold">{view === "pick" ? "Let Alloc watch a real position" : realPosition ? `${realPosition.symbol} on ${realPosition.chain === "base" ? "Base" : "Ethereum"}` : "Your position"}</h1>
        </div>
        {view !== "pick" && <button className="btn btn-secondary btn-sm" onClick={() => { setView("pick"); reset(); }}>Change position</button>}
      </div>

      {view === "pick" && <WalletPanel onSelect={run} busy={busy} />}
      {busy && livePosition && <div className="card p-6 reveal"><PositionSummary position={livePosition} /></div>}
      {busy && <Progress stage={stage} feed={feed} />}
      {error && (
        <div className="card border-danger/30 bg-danger-soft p-5 text-[0.95rem] text-danger">
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm mt-3" onClick={() => reset()}>Try again</button>
        </div>
      )}

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

            </>
          }
        />
      )}

      {view === "decision" && realDecision && !busy && (
        <>
          <ReevaluateBlock onReevaluate={() => realPosition && run({ chain: realPosition.chain, token: realPosition.token, amount: realPosition.amount })} busy={busy} />
          <div className="px-1"><WatchToggle onTick={() => realPosition && run({ chain: realPosition.chain, token: realPosition.token, amount: realPosition.amount })} /></div>
        </>
      )}

      {view === "execute" && realDecision && (
        <ExecutionPanel
          decision={realDecision}
          onReject={() => { updateDecision(realDecision.id, { status: "rejected" }); setView("decision"); }}
          onDone={(txs) => updateDecision(realDecision.id, { status: "executed", executionTxs: txs })}
        />
      )}

      {view !== "pick" && <p className="text-sm text-ink-3">Approval mode is <span className="font-semibold text-ink-2">{preferences.approvalMode}</span>. Change it in <Link className="underline" href="/settings">preferences</Link>.</p>}
    </div>
  );
}
