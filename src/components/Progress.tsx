"use client";
import type { Stage } from "./useEvaluate";

const steps: { key: Stage; label: string }[] = [
  { key: "position", label: "Reading the position" },
  { key: "market", label: "Pricing alternatives and routes" },
  { key: "reasoning", label: "Reasoning with SERV" },
];

export function Progress({ stage }: { stage: Stage }) {
  const idx = steps.findIndex((s) => s.key === stage);
  if (idx < 0) return null;
  return (
    <div className="card p-5">
      <ul className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-3 text-[0.95rem] ${i < idx ? "text-ink-3" : i === idx ? "text-ink" : "text-ink-3"}`}>
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${i < idx ? "bg-line-strong" : i === idx ? "thinking bg-ink" : "bg-line"}`} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
