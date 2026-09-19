"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { pct, usd } from "@/lib/format";
import { Working } from "@/components/Working";

interface Row { symbol: string; name: string; tier: "core" | "large" | "growth" | "meme"; ageDays?: number; fdvUsd?: number | null; priceUsd: number | null; referencePriceUsd: number | null; premiumPct: number | null; change24hPct: number | null; change30dPct: number | null; volatility30dPct: number | null; liquidityUsd: number | null; volume24hUsd: number | null; hopCostPct: number | null; protocol: string | null; logoUrl: string | null }

const TIER_LABEL = { core: "Index & mega cap", large: "Large cap", growth: "Small & mid cap", meme: "Meme" };

export default function MarketPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ["universe"], queryFn: async () => (await fetch("/api/universe")).json() as Promise<{ scannedAt: string; total: number; assets: Row[]; memes: Row[] }>, staleTime: 60_000 });
  const [tier, setTier] = useState<"all" | "core" | "large" | "growth" | "meme">("all");
  const [sort, setSort] = useState<"liquidity" | "change24h" | "change30d" | "premium">("liquidity");
  const rows = [...(data?.assets ?? []), ...(data?.memes ?? [])].filter((r) => tier === "all" || r.tier === tier).sort((a, b) => {
    const k = sort === "liquidity" ? "liquidityUsd" : sort === "change24h" ? "change24hPct" : sort === "change30d" ? "change30dPct" : "premiumPct";
    return (b[k] ?? -1e9) - (a[k] ?? -1e9);
  });
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-3">Robinhood Chain · live from chain</p>
        <h1 className="mt-1 text-2xl font-bold">Where Alloc can move capital</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">Every tokenized stock with a real on-chain market, priced live against its Chainlink reference, plus the meme tokens Alloc discovers live. Conservative sees the first group, Balanced adds the second, Aggressive adds small and mid caps, Degen adds memes.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Group">
          {(["all", "core", "large", "growth", "meme"] as const).map((t) => <button key={t} type="button" aria-pressed={tier === t} onClick={() => setTier(t)}>{t === "all" ? "All" : TIER_LABEL[t]}</button>)}
        </div>
        <select className="field h-9 w-auto text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="liquidity">Most liquid</option><option value="change24h">Top 24h</option><option value="change30d">Top 30d</option><option value="premium">Highest premium</option>
        </select>
      </div>
      {isLoading && <Working size="lg" label="Reading the market" detail="Prices, Chainlink references and pool depth for every routable asset. First load takes a little longer." />}
      {error && <p className="text-danger">{(error as Error).message}</p>}
      {data && (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[860px] text-[0.9rem]">
            <thead className="text-left text-ink-3"><tr>
              <th className="px-4 py-3 font-medium">Asset</th><th className="py-3 pr-3 font-medium">Price</th><th className="py-3 pr-3 font-medium">Premium</th><th className="py-3 pr-3 font-medium">24h</th><th className="py-3 pr-3 font-medium">30d</th><th className="py-3 pr-3 font-medium">Vol.</th><th className="py-3 pr-3 font-medium">Liquidity</th><th className="py-3 pr-4 text-right font-medium">Cost / $1K</th>
            </tr></thead>
            <tbody className="tnum">
              {rows.map((r) => (
                <tr key={r.symbol} className="border-t border-line">
                  <td className="max-w-[260px] px-4 py-2.5"><span className="font-semibold">{r.symbol}</span> <span className="ml-1 truncate text-sm text-ink-3">{r.name.length > 22 ? r.name.slice(0, 22) + "…" : r.name}</span><span className={`ml-2 whitespace-nowrap text-xs ${r.tier === "meme" ? "text-danger" : "text-ink-3"}`}>{TIER_LABEL[r.tier]}{r.tier === "meme" && r.ageDays != null ? ` · ${r.ageDays.toFixed(0)}d` : ""}</span></td>
                  <td className="whitespace-nowrap pr-3">{usd(r.priceUsd, { decimals: 2 })}</td>
                  <td className={`whitespace-nowrap pr-3 ${Math.abs(r.premiumPct ?? 0) > 1 ? "text-warn" : ""}`}>{pct(r.premiumPct, 2)}</td>
                  <td className={`whitespace-nowrap pr-3 ${(r.change24hPct ?? 0) >= 0 ? "text-robinhood" : "text-danger"}`}>{pct(r.change24hPct)}</td>
                  <td className={`whitespace-nowrap pr-3 ${(r.change30dPct ?? 0) >= 0 ? "text-robinhood" : "text-danger"}`}>{pct(r.change30dPct)}</td>
                  <td className="whitespace-nowrap pr-3">{r.volatility30dPct != null ? `${r.volatility30dPct.toFixed(0)}%` : "—"}</td>
                  <td className="whitespace-nowrap pr-3">{usd(r.liquidityUsd, { compact: true })}</td>
                  <td className="pr-4 text-right">{r.hopCostPct == null ? (r.tier === "meme" ? "via Relay" : "—") : pct(r.hopCostPct, 2, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <p className="text-sm text-ink-3">Showing the {data.assets.length} deepest of {data.total} routable assets. Pool map scanned {new Date(data.scannedAt).toLocaleDateString()}; prices, premiums and costs are live.</p>}
    </div>
  );
}
