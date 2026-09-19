"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { num, shortAddr } from "@/lib/format";
import type { PositionInput, SourceChain } from "@/lib/types";

export interface Holding { token: string; symbol: string; name: string; decimals: number; balance: string; logo?: string | null }

export function WalletPanel({ onSelect, busy }: { onSelect: (p: PositionInput) => void; busy?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending, reset } = useConnect();
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const { disconnect } = useDisconnect();
  const [chain, setChain] = useState<SourceChain>("base");
  const [manual, setManual] = useState("");
  const [picked, setPicked] = useState<Holding | null>(null);
  const [amount, setAmount] = useState("");
  const { data: holdings, isFetching: loading } = useQuery({
    queryKey: ["holdings", chain, address],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const j = await fetch(`/api/wallet?chain=${chain}&owner=${address}`).then((r) => r.json());
      return (j.holdings ?? []) as Holding[];
    },
  });

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <div className="card p-6 sm:p-8">
        <h2 className="text-xl font-bold">Connect a wallet</h2>
        <p className="mt-2 max-w-[56ch] text-ink-2">Alloc reads your position on Base or Ethereum, evaluates it exactly like the Playground, and prepares transactions for you to approve. Nothing moves without your signature.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" disabled={!injected || isPending} onClick={async () => {
            if (!injected) return;
            setConnectMsg(null);
            try { await connectAsync({ connector: injected }); }
            catch (e) {
              const err = e as { code?: number; message?: string; cause?: { code?: number } };
              const code = err.code ?? err.cause?.code;
              const msg = err.message ?? "";
              if (code === -32002 || /already pending/i.test(msg)) setConnectMsg("Your wallet already has a connection request waiting. Open the wallet extension, unlock it, then approve or reject that request and try again.");
              else if (code === 4001 || /rejected|denied/i.test(msg)) setConnectMsg("Connection cancelled in the wallet. Try again whenever you are ready.");
              else setConnectMsg(msg.split("\n")[0] || "The wallet did not connect.");
              reset();
            }
          }}>{isPending ? "Waiting for wallet…" : connectMsg ? "Try again" : "Connect browser wallet"}</button>
          <span className="text-sm text-ink-3">{injected ? "MetaMask, Rabby, Coinbase Wallet or any injected wallet." : "No browser wallet found. Install MetaMask or open this page in a wallet browser."}</span>
        </div>
        {connectMsg && <p className="mt-3 max-w-[60ch] text-sm text-danger">{connectMsg}</p>}
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-3">Connected</p>
          <p className="font-semibold tnum">{shortAddr(address!)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="seg" role="group" aria-label="Chain">
            {(["base", "ethereum"] as SourceChain[]).map((c) => (
              <button key={c} type="button" aria-pressed={chain === c} onClick={() => { setChain(c); setPicked(null); }}>{c === "base" ? "Base" : "Ethereum"}</button>
            ))}
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => disconnect()}>Disconnect</button>
        </div>
      </div>

      <div className="mt-6">
        <p className="font-semibold">Choose the position to watch</p>
        {loading && <p className="thinking mt-2 text-sm text-ink-2">Reading balances…</p>}
        {holdings && holdings.length === 0 && <p className="mt-2 text-sm text-ink-2">No balances found on this chain. Enter a token address below.</p>}
        {holdings && holdings.length > 0 && (
          <ul className="mt-3 divide-y divide-line">
            {holdings.map((h) => (
              <li key={h.token}>
                <button type="button" className={`flex w-full items-center justify-between py-2.5 text-left ${picked?.token === h.token ? "font-semibold" : ""}`} onClick={() => { setPicked(h); setAmount(h.balance); }} aria-pressed={picked?.token === h.token}>
                  <span>{h.symbol} <span className="ml-1 text-sm font-normal text-ink-3">{h.name}</span></span>
                  <span className="tnum">{num(h.balance)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <input className="field font-mono text-[0.9rem]" placeholder="Or paste a token contract address" value={manual} onChange={(e) => setManual(e.target.value)} spellCheck={false} />
          <button className="btn btn-secondary" type="button" onClick={() => { if (manual.trim()) { setPicked({ token: manual.trim(), symbol: "Token", name: "", decimals: 18, balance: "" }); setAmount(""); } }}>Use</button>
        </div>
      </div>

      {picked && (
        <div className="mt-6 border-t border-line pt-5">
          <label className="lbl" htmlFor="realamount">Amount of {picked.symbol} to watch</label>
          <div className="flex flex-wrap gap-2">
            <input id="realamount" className="field max-w-[260px] tnum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={picked.balance || "Amount"} />
            <button className="btn btn-primary" disabled={busy || !amount} onClick={() => onSelect({ chain, token: picked.token, amount: amount.replace(/,/g, "") })}>{busy ? "Working…" : "Ask Alloc"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
