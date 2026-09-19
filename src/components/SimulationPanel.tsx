"use client";
import { useEffect, useState } from "react";
import { num, pct, usd } from "@/lib/format";
import type { Decision, Simulation } from "@/lib/types";
import { post } from "./useEvaluate";
import { Working } from "./Working";

export function SimulationPanel({ decision, onBack, onAnother }: { decision: Decision; onBack: () => void; onAnother: () => void }) {
  const [sim, setSim] = useState<Simulation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    post<{ simulation: Simulation }>("/api/simulate", { decision }).then((r) => live && setSim(r.simulation)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [decision]);

  return (
    <section className="card p-6 sm:p-8">
      <p className="text-sm text-ink-3">Simulation</p>
      <h2 className="mt-1 text-2xl font-bold">If you approved this now</h2>
      {error && <p className="mt-4 text-danger">{error}</p>}
      {!sim && !error && <div className="mt-6"><Working label="Getting a live quote for the exact amount" detail="Relay route and on-chain pool depth, priced right now" tone="robinhood" /></div>}
      {sim && (
        <div className="mt-6 space-y-6">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <Item label="Starting position" value={`${usd(sim.startingValueUsd)} ${decision.position.symbol}`} />
            <Item label="Proposed allocation" value={`${usd(sim.amountUsd)} → ${sim.receivedSymbol}`} sub={`${num(sim.amountTokens)} ${decision.position.symbol} for ${num(sim.receivedTokens)} ${sim.receivedSymbol}`} />
            <Item label="Estimated movement costs" value={`${usd(sim.costUsd, { decimals: 2 })} · ${pct(sim.costPct, 2, false)}`} />
            <Item label="Time to complete" value={sim.timeSeconds != null ? `about ${sim.timeSeconds < 60 ? `${sim.timeSeconds}s` : `${Math.round(sim.timeSeconds / 60)} min`}` : "—"} />
          </dl>
          <div>
            <p className="text-sm text-ink-3">Estimated resulting allocation</p>
            <ul className="mt-2 divide-y divide-line">
              {sim.resulting.map((r) => (
                <li key={r.symbol + r.chain} className="flex items-baseline justify-between py-2.5">
                  <span className="font-semibold">{r.symbol} <span className="ml-1 text-sm font-normal text-ink-3">{r.chain}</span></span>
                  <span className="font-semibold tnum">{usd(r.valueUsd)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-ink-3">Route: {sim.route.join(", then ")}. Quotes are live and move with the market.</p>
        </div>
      )}
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="btn btn-secondary" onClick={onBack}>Back</button>
        <button className="btn btn-primary" onClick={onAnother}>Try another scenario</button>
      </div>
    </section>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-semibold tnum">{value}</dd>
      {sub && <dd className="text-sm text-ink-3 tnum">{sub}</dd>}
    </div>
  );
}
