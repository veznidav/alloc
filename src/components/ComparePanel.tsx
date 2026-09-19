"use client";
import { useEffect, useState } from "react";
import { pct, usd } from "@/lib/format";
import { RISK_PROFILES, type Decision, type PositionInput, type Preferences, type RiskTolerance } from "@/lib/types";
import { ACTION_LABEL, ACTION_PILL } from "./DecisionView";
import { post } from "./useEvaluate";

type Row = { risk: RiskTolerance; decision?: Decision; error?: string };

/** The same position through all three profiles, side by side. */
export function ComparePanel({ position, preferences, onPick }: { position: PositionInput; preferences: Preferences; onPick: (d: Decision) => void }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    post<{ decisions: Row[] }>("/api/compare", { position, preferences }).then((r) => live && setRows(r.decisions)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [position, preferences]);

  return (
    <section className="card p-6 sm:p-8">
      <p className="text-sm text-ink-3">Same position, four temperaments</p>
      <h2 className="mt-1 text-2xl font-bold">How each profile would decide right now</h2>
      {error && <p className="mt-4 text-danger">{error}</p>}
      {!rows && !error && <p className="thinking mt-4 text-ink-2">Running four SERV decisions in parallel…</p>}
      {rows && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rows.map((r) => {
            const prof = RISK_PROFILES[r.risk];
            const d = r.decision;
            return (
              <div key={r.risk} className={`flex flex-col rounded-xl border p-4 ${r.risk === preferences.risk ? "border-ink" : "border-line"}`}>
                <p className="font-semibold">{prof.label}</p>
                <p className="text-xs text-ink-3">{prof.tagline}</p>
                {d ? (
                  <>
                    <span className={`pill ${ACTION_PILL[d.action]} mt-3 self-start`}>{ACTION_LABEL[d.action]}</span>
                    <p className="mt-2 text-lg font-bold">{d.action === "HOLD" ? d.position.symbol : `→ ${d.targetSymbol}`}</p>
                    {d.action !== "HOLD" && <p className="text-sm text-ink-2 tnum">{usd(d.amountUsd)} · edge {pct(d.expectedOpportunityPct, 1)} · cost {pct(d.estimatedCostPct, 2, false)}</p>}
                    <p className="mt-2 flex-1 text-[0.85rem] leading-snug text-ink-2">{d.summary}</p>
                    <button className="btn btn-secondary btn-sm mt-3 self-start" onClick={() => onPick(d)}>Open this decision</button>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-danger">{r.error}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
