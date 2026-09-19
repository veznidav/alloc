"use client";
import { useAlloc } from "@/store/useAlloc";
import { RISK_PROFILES, type ApprovalMode, type RiskTolerance } from "@/lib/types";

export function PreferencesForm({ compact }: { compact?: boolean } = {}) {
  const { preferences: p, setPreferences } = useAlloc();
  return (
    <div className={compact ? "space-y-6" : "space-y-8"}>
      <Field label="Risk profile" hint="Sets which Robinhood Chain assets Alloc may consider and how it weighs volatility.">
        <div className="grid gap-2 sm:grid-cols-3" role="group">
          {(Object.keys(RISK_PROFILES) as RiskTolerance[]).map((r) => {
            const prof = RISK_PROFILES[r];
            const on = p.risk === r;
            return (
              <button key={r} type="button" aria-pressed={on} onClick={() => setPreferences({ risk: r })}
                className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${on ? "border-ink bg-ink text-white" : "border-line hover:border-line-strong"}`}>
                <span className="block font-semibold">{prof.label}</span>
                <span className={`block text-xs ${on ? "text-white/70" : "text-ink-3"}`}>{prof.tagline}</span>
                <span className={`mt-2 block text-[0.8rem] leading-snug ${on ? "text-white/85" : "text-ink-2"}`}>{prof.description}</span>
              </button>
            );
          })}
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
