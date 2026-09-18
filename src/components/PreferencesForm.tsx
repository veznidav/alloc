"use client";
import { useAlloc } from "@/store/useAlloc";
import type { ApprovalMode, RiskTolerance } from "@/lib/types";

export function PreferencesForm() {
  const { preferences: p, setPreferences } = useAlloc();
  return (
    <div className="space-y-8">
      <Field label="Risk tolerance" hint="How much volatility you accept in pursuit of a better opportunity.">
        <div className="seg" role="group">
          {(["conservative", "moderate", "aggressive"] as RiskTolerance[]).map((r) => (
            <button key={r} type="button" aria-pressed={p.risk === r} onClick={() => setPreferences({ risk: r })} className="capitalize">{r}</button>
          ))}
        </div>
      </Field>
      <Field label="Minimum opportunity" hint="Only move capital when the expected advantage after costs is greater than this.">
        <Slider value={p.minOpportunityPct} min={0} max={30} step={1} suffix="%" onChange={(v) => setPreferences({ minOpportunityPct: v })} />
      </Field>
      <Field label="Maximum allocation per decision" hint="Never move more than this share of the position in one decision.">
        <Slider value={p.maxAllocationPct} min={5} max={100} step={5} suffix="%" onChange={(v) => setPreferences({ maxAllocationPct: v })} />
      </Field>
      <Field label="Approval" hint="Recommend: Alloc prepares the action and waits for you. Autonomous: in real mode, Alloc may execute actions that satisfy your rules once you have connected a wallet and enabled it for a position.">
        <div className="seg" role="group">
          {(["recommend", "autonomous"] as ApprovalMode[]).map((m) => (
            <button key={m} type="button" aria-pressed={p.approvalMode === m} onClick={() => setPreferences({ approvalMode: m })} className="capitalize">{m}</button>
          ))}
        </div>
      </Field>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <p className="mt-0.5 max-w-[60ch] text-sm text-ink-3">{hint}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Slider({ value, min, max, step, suffix, onChange }: { value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-4">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full max-w-[320px] accent-ink" aria-label="value" />
      <span className="w-14 font-semibold tnum">{value}{suffix}</span>
    </div>
  );
}
