import { usd } from "@/lib/format";

/** Before/after split of the position, the one picture that says what changes. */
export function AllocationBar({ parts, label }: { parts: { symbol: string; valueUsd: number; tone: "current" | "stable" | "robinhood" }[]; label?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.valueUsd), 0) || 1;
  const color = { current: "bg-ink", stable: "bg-stable", robinhood: "bg-robinhood" };
  return (
    <div>
      {label && <p className="mb-1.5 text-sm text-ink-3">{label}</p>}
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {parts.map((p) => (
          <div key={p.symbol} className={`${color[p.tone]} transition-[width] duration-700`} style={{ width: `${(Math.max(0, p.valueUsd) / total) * 100}%` }} title={`${p.symbol} ${usd(p.valueUsd)}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.symbol} className="flex items-center gap-1.5 text-ink-2">
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${color[p.tone]}`} />
            <span className="font-semibold text-ink">{p.symbol}</span>
            <span className="tnum">{usd(p.valueUsd)}</span>
            <span className="tnum text-ink-3">{((Math.max(0, p.valueUsd) / total) * 100).toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
