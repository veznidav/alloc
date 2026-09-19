"use client";
import { useState } from "react";
import type { PositionInput, SourceChain } from "@/lib/types";
import { PreferencesBlock } from "./PreferencesBlock";

const EXAMPLES: { label: string; chain: SourceChain; token: string; amount: string }[] = [
  { label: "1,000,000 AERO on Base", chain: "base", token: "0x940181a94A35A4569E4529A3CDfB74e38FD98631", amount: "1000000" },
  { label: "25 ETH on Base", chain: "base", token: "ETH", amount: "25" },
  { label: "50,000 USDC on Base", chain: "base", token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", amount: "50000" },
  { label: "3,000,000 WELL on Base", chain: "base", token: "0xA88594D404727625A9437C3f886C7643872296AE", amount: "3000000" },
  { label: "2,000,000 SERV on Ethereum", chain: "ethereum", token: "0x40e3d1a4b2c47d9aa61261f5606136ef73e28042", amount: "2000000" },
  { label: "3,000 UNI on Ethereum", chain: "ethereum", token: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", amount: "3000" },
];

export function PositionForm({ onSubmit, busy, initial }: { onSubmit: (p: PositionInput) => void; busy?: boolean; initial?: PositionInput | null }) {
  const [chain, setChain] = useState<SourceChain>(initial?.chain ?? "base");
  const [token, setToken] = useState(initial?.token ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "");

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ chain, token: token.trim(), amount: amount.replace(/,/g, "").trim() });
      }}
    >
      <div>
        <label className="lbl" htmlFor="chain">Chain</label>
        <div className="seg" role="group" aria-label="Chain">
          {(["base", "ethereum"] as SourceChain[]).map((c) => (
            <button key={c} type="button" aria-pressed={chain === c} onClick={() => setChain(c)}>{c === "base" ? "Base" : "Ethereum"}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="lbl" htmlFor="token">Token</label>
        <input id="token" className="field font-mono text-[0.95rem]" placeholder="Contract address, or ETH" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} required />
      </div>
      <div>
        <label className="lbl" htmlFor="amount">Amount</label>
        <input id="amount" className="field tnum" placeholder="1,000,000" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <PreferencesBlock />
      <div className="flex flex-wrap items-center gap-4 pt-2">
        <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>{busy ? "Working…" : "Ask Alloc"}</button>
        <span className="max-w-[32ch] text-sm leading-snug text-ink-3">Alloc reads the market, prices every route, and decides. Real data, nothing is traded.</span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" className="rounded-full border border-line px-3 py-1 text-[0.8rem] text-ink-2 hover:border-line-strong hover:text-ink" onClick={() => { setChain(ex.chain); setToken(ex.token); setAmount(ex.amount); }}>
            {ex.label}
          </button>
        ))}
      </div>
    </form>
  );
}
