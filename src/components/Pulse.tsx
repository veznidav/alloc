"use client";
import { useQuery } from "@tanstack/react-query";
import { pct, usd } from "@/lib/format";

interface PulseData { context: { ethUsd: number | null; ethChange24hPct: number | null; btcUsd: number | null; btcChange24hPct: number | null }; top: { symbol: string; change24hPct: number; kind: "stock" | "meme" }[]; bottom: { symbol: string; change24hPct: number; kind: "stock" | "meme" }[]; stocks: number; memes: number }

/** Live strip on the landing page: the market right now, and what is moving on Robinhood Chain. */
export function Pulse() {
  const { data } = useQuery({ queryKey: ["pulse"], queryFn: async () => (await fetch("/api/pulse")).json() as Promise<PulseData>, staleTime: 120_000 });
  const tone = (n: number | null | undefined) => ((n ?? 0) >= 0 ? "text-robinhood" : "text-danger");
  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm">
      <span className="flex items-center gap-2 font-semibold"><span aria-hidden className="thinking inline-block h-2 w-2 rounded-full bg-robinhood" />Live</span>
      {!data ? (
        <span className="text-ink-3">Reading the market…</span>
      ) : (
        <>
          <span className="tnum">ETH {usd(data.context.ethUsd)} <span className={tone(data.context.ethChange24hPct)}>{pct(data.context.ethChange24hPct)}</span></span>
          <span className="tnum">BTC {usd(data.context.btcUsd)} <span className={tone(data.context.btcChange24hPct)}>{pct(data.context.btcChange24hPct)}</span></span>
          <span className="text-ink-3">Robinhood Chain:</span>
          {data.top.map((t) => (
            <span key={t.symbol} className="tnum">{t.symbol}{t.kind === "meme" && <span className="ml-1 text-xs text-danger">meme</span>} <span className={tone(t.change24hPct)}>{pct(t.change24hPct)}</span></span>
          ))}
          <span className="ml-auto text-ink-3">{data.stocks} stocks · {data.memes} memes routable</span>
        </>
      )}
    </div>
  );
}
