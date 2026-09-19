/** Prominent "something is happening" indicator: spinning ring, sweeping bar, animated label. */
export function Working({ label, detail, tone = "ink", size = "md" }: { label: string; detail?: string; tone?: "ink" | "robinhood"; size?: "md" | "lg" }) {
  return (
    <div className={`rounded-2xl border ${tone === "robinhood" ? "border-robinhood/40 bg-robinhood-soft/50" : "border-ink/20 bg-surface-2"} ${size === "lg" ? "p-5 sm:p-6" : "p-4"}`} role="status" aria-live="polite">
      <div className="flex items-center gap-4">
        <span className={`ring ${size === "lg" ? "ring-lg" : ""}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={`${size === "lg" ? "text-lg" : "text-[0.95rem]"} font-semibold`}><span className="dots">{label}</span></p>
          {detail && <p className="mt-0.5 text-sm text-ink-2">{detail}</p>}
        </div>
      </div>
      <div className={`sweep mt-4 ${tone === "robinhood" ? "sweep-robinhood" : ""}`} aria-hidden />
    </div>
  );
}
