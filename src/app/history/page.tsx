"use client";
import Link from "next/link";
import { ACTION_LABEL, ACTION_PILL } from "@/components/DecisionView";
import { explorerTx } from "@/lib/chains";
import { usd, when } from "@/lib/format";
import { useAlloc } from "@/store/useAlloc";
import { useHydrated } from "@/components/useHydrated";

export default function HistoryPage() {
  const { history, clearHistory } = useAlloc();
  const ready = useHydrated();
  if (!ready) return null;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-3">Decision history</p>
          <h1 className="mt-1 text-2xl font-bold">What Alloc considered, and why it acted or didn&apos;t</h1>
        </div>
        {history.length > 0 && <button className="btn btn-secondary btn-sm" onClick={clearHistory}>Clear</button>}
      </div>
      {history.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-ink-2">No decisions yet.</p>
          <Link href="/playground" className="btn btn-primary mt-4">Evaluate a position</Link>
        </div>
      ) : (
        <ol className="space-y-3">
          {history.map((d) => (
            <li key={d.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-ink-3 tnum">{when(d.createdAt)} · {d.mode === "real" ? "Real" : "Playground"}</span>
                <span className="text-sm capitalize text-ink-3">{d.status}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className={`pill ${ACTION_PILL[d.action]}`}>{ACTION_LABEL[d.action]}</span>
                <span className="font-semibold">{d.action === "HOLD" ? `${d.position.symbol}` : `${d.position.symbol} → ${d.targetSymbol}`}</span>
                {d.action !== "HOLD" && <span className="text-ink-2 tnum">{usd(d.amountUsd)}</span>}
              </div>
              <p className="mt-2 text-[0.95rem] text-ink-2">{d.summary}</p>
              <p className="mt-2 text-sm text-ink-3">Evaluated {d.evaluated.join(", ")}.</p>
              {d.executionTxs?.length ? (
                <ul className="mt-2 flex flex-wrap gap-3 text-sm">
                  {d.executionTxs.map((t) => (
                    <li key={t.hash}><a className="underline" href={explorerTx(t.chainId, t.hash)} target="_blank" rel="noreferrer">{t.label}</a></li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
