"use client";
import { useState } from "react";
import { RISK_PROFILES } from "@/lib/types";
import { useAlloc } from "@/store/useAlloc";
import { PreferencesForm } from "./PreferencesForm";

/** The rules Alloc will apply to this position, with the full form one click away. */
export function PreferencesBlock({ title = "How Alloc should behave for this position" }: { title?: string }) {
  const [open, setOpen] = useState(false);
  const prefs = useAlloc((s) => s.preferences);
  const degen = prefs.risk === "degen";
  return (
    <div className={`rounded-2xl border-2 ${degen ? "border-danger/60 bg-danger-soft/40" : "border-ink/80 bg-surface-2"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm text-ink-3">{title}</p>
          <p className="mt-0.5 text-[1.05rem]">
            <span className={`font-bold ${degen ? "text-danger" : ""}`}>{RISK_PROFILES[prefs.risk].label}</span>
            <span className="text-ink-2"> · {RISK_PROFILES[prefs.risk].tagline.toLowerCase()} · move above {prefs.minOpportunityPct}% edge · at most {prefs.maxAllocationPct}% per decision · {prefs.approvalMode}</span>
          </p>
        </div>
        <button type="button" className={`btn btn-sm ${open ? "btn-secondary" : "btn-primary"}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Done" : "Adjust"}</button>
      </div>
      {open && <div className="border-t border-line-strong/60 px-5 py-6"><PreferencesForm compact /></div>}
    </div>
  );
}
