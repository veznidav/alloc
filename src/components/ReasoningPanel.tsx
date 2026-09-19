import { pct, usd } from "@/lib/format";
import type { Decision } from "@/lib/types";

export function ReasoningPanel({ decision: d }: { decision: Decision }) {
  const stock = d.alternatives.filter((a) => a.kind === "robinhood" || a.kind === "meme");
  const stable = d.alternatives.find((a) => a.kind === "stablecoin");
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-bold">Why Alloc {d.action === "HOLD" ? "is holding" : "recommends this"}</h3>
        <ol className="mt-3 space-y-2.5">
          {d.reasoning.map((r, i) => (
            <li key={i} className="flex gap-3 text-[0.95rem] leading-relaxed text-ink-2">
              <span className="mt-[3px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ink" aria-hidden />
              <span>{r}</span>
            </li>
          ))}
        </ol>
      </div>

      {d.whyNot.length > 0 && (
        <div>
          <h3 className="text-lg font-bold">Why not the others</h3>
          <dl className="mt-3 divide-y divide-line">
            {d.whyNot.map((w, i) => (
              <div key={i} className="grid gap-1 py-3 sm:grid-cols-[10rem_1fr]">
                <dt className="break-words font-semibold">{w.option}</dt>
                <dd className="text-[0.95rem] leading-relaxed text-ink-2">{w.reason}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div>
        <h3 className="text-lg font-bold">What was considered</h3>
        <p className="mt-1 text-sm text-ink-3">Live data at {new Date(d.createdAt).toLocaleTimeString()} · costs quoted for {usd(d.position.valueUsd * (d.preferences.maxAllocationPct / 100))}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[0.875rem]">
            <thead className="text-left text-ink-3">
              <tr><th className="py-1.5 font-medium">Asset</th><th className="py-1.5 font-medium">Price</th><th className="py-1.5 font-medium">24h</th><th className="py-1.5 font-medium">30d</th><th className="py-1.5 font-medium">vs reference</th><th className="py-1.5 font-medium">Liquidity</th><th className="py-1.5 font-medium">Move cost</th><th className="py-1.5 text-right font-medium">Net edge</th></tr>
            </thead>
            <tbody className="tnum">
              {stable && (
                <tr className="border-t border-line"><td className="py-2 font-semibold">USDC</td><td>$1.00</td><td>—</td><td>—</td><td>—</td><td>—</td><td>{stable.routeCostPct == null ? "no route" : pct(stable.routeCostPct, 2, false)}</td><td className={`text-right ${(stable.score?.advantagePct ?? 0) > 0 ? "text-robinhood" : ""}`}>{pct(stable.score?.advantagePct, 1)}</td></tr>
              )}
              {stock.map((a) => (
                <tr key={a.symbol} className="border-t border-line">
                  <td className="py-2 font-semibold">{a.symbol}{a.kind === "meme" && <span className="ml-1 text-xs font-normal text-danger">meme · {a.ageDays?.toFixed(0)}d</span>}</td>
                  <td>{usd(a.priceUsd, { decimals: 2 })}</td>
                  <td className={(a.market?.priceChange.h24 ?? 0) >= 0 ? "text-robinhood" : "text-danger"}>{pct(a.market?.priceChange.h24)}</td>
                  <td className={(a.market?.momentum?.change30dPct ?? 0) >= 0 ? "text-robinhood" : "text-danger"}>{pct(a.market?.momentum?.change30dPct)}</td>
                  <td>{pct(a.premiumPct, 2)}</td>
                  <td>{usd(a.market?.liquidityUsd, { compact: true })}</td>
                  <td>{a.routeCostPct == null ? "no route" : pct(a.routeCostPct, 2, false)}</td>
                  <td className={`text-right ${(a.score?.advantagePct ?? 0) > 0 ? "text-robinhood" : ""}`}>{pct(a.score?.advantagePct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-ink-3">
          Net edge is Alloc&apos;s model: momentum-based expected 30-day return, minus a volatility penalty set by your risk profile, minus the cost of moving, relative to {d.position.symbol}{d.position.score ? ` (risk-adjusted ${pct(d.position.score.riskAdjustedPct, 1)})` : ""}.
        </p>
        <p className="mt-2 text-sm text-ink-3">
          Market: ETH {usd(d.context.ethUsd)} ({pct(d.context.ethChange24hPct)}), BTC {usd(d.context.btcUsd)} ({pct(d.context.btcChange24hPct)}), total crypto {pct(d.context.totalMarketCapChange24hPct)} over 24h. Reasoned with SERV ({d.model}).
        </p>
      </div>
    </div>
  );
}
