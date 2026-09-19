"use client";
import { PreferencesBlock } from "./PreferencesBlock";

/** Change the rules and ask again, right under the decision. */
export function ReevaluateBlock({ onReevaluate, busy }: { onReevaluate: () => void; busy?: boolean }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Not the answer you expected?</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-ink-2">Change the profile, the minimum edge or the allocation cap and ask again. Aggressive and Degen look for a move whenever any alternative has a positive edge.</p>
        </div>
        <button className="btn btn-primary" onClick={onReevaluate} disabled={busy}>{busy ? "Working…" : "Re-evaluate with these rules"}</button>
      </div>
      <div className="mt-4"><PreferencesBlock title="Rules for the next evaluation" /></div>
    </section>
  );
}
