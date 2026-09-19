"use client";
import { useEffect, useRef } from "react";
import { pct } from "@/lib/format";
import type { AllocEvent } from "@/lib/types";
import type { Stage } from "./useEvaluate";
import { Working } from "./Working";

const steps: { key: Stage; label: string }[] = [
  { key: "position", label: "Reading the position" },
  { key: "market", label: "Pricing alternatives and live routes" },
  { key: "reasoning", label: "Reasoning with SERV" },
];

/** Live view of the agent at work: stages plus the evidence as it arrives. */
export function Progress({ stage, feed }: { stage: Stage; feed: AllocEvent[] }) {
  const idx = steps.findIndex((s) => s.key === stage || (stage === "routes" && s.key === "market"));
  if (idx < 0) return null;
  const routes = feed.filter((e): e is Extract<AllocEvent, { type: "route" }> => e.type === "route");
  const cands = feed.filter((e): e is Extract<AllocEvent, { type: "candidate" }> => e.type === "candidate");
  const ctx = feed.find((e): e is Extract<AllocEvent, { type: "context" }> => e.type === "context");
  const reasoning = stage === "reasoning";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, []);
  return (
    <div ref={ref} className="card p-5 sm:p-6">
      {reasoning ? (
        <Working size="lg" label="SERV is reasoning" detail={`Weighing ${cands.length} destinations and ${routes.length} routes against your preferences, then writing the explanation. Usually 10 to 20 seconds.`} />
      ) : (
        <Working label={stage === "position" ? "Reading the position" : "Pricing alternatives and live routes"} detail={stage === "position" ? "Token, price, momentum and liquidity" : "Relay quotes, on-chain pools, Chainlink references"} />
      )}
      <ul className="mt-5 space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-3 text-[0.95rem] ${i === idx ? "text-ink" : "text-ink-3"}`}>
            <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${i < idx ? "bg-line-strong" : i === idx ? "thinking bg-ink" : "bg-line"}`} />
            {s.label}
            {i === idx && s.key === "reasoning" && <span className="text-sm text-ink-3">· weighing {cands.length + routes.length} options</span>}
          </li>
        ))}
      </ul>
      {(ctx || routes.length > 0 || cands.length > 0) && (
        <div className="mt-4 border-t border-line pt-4 text-sm">
          {ctx && (
            <p className="text-ink-2">Market: ETH {pct(ctx.context.ethChange24hPct)} · BTC {pct(ctx.context.btcChange24hPct)} · total crypto {pct(ctx.context.totalMarketCapChange24hPct)} over 24h</p>
          )}
          {routes.length > 0 && (
            <ul className="mt-2 space-y-1">
              {routes.map((r) => (
                <li key={r.label} className="flex justify-between gap-4 text-ink-2 reveal">
                  <span>{r.label}</span>
                  <span className="tnum">{r.ok ? `${pct(r.costPct, 2, false)} · ${r.seconds ?? "~"}s` : "no route"}</span>
                </li>
              ))}
            </ul>
          )}
          {cands.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {cands.map((c) => (
                <li key={c.symbol} className="flex justify-between gap-2 reveal">
                  <span className={c.routable ? "font-semibold" : "text-ink-3"}>{c.symbol}{c.kind === "meme" && <span className="ml-1 text-xs font-normal text-danger">meme</span>}</span>
                  <span className={`tnum ${c.routable ? "text-ink-2" : "text-ink-3"}`}>{c.routable ? `${pct(c.change24hPct)} · ${pct(c.hopCostPct, 2, false)}` : "no depth"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
