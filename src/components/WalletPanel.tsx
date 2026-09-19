"use client";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { num, shortAddr, usd } from "@/lib/format";
import { CHAIN_LABELS } from "@/lib/chains";
import type { PositionInput, SourceChain } from "@/lib/types";
import { PreferencesBlock } from "./PreferencesBlock";

export interface Holding { chain: SourceChain; token: string; symbol: string; name: string; decimals: number; balance: string; priceUsd?: number | null; valueUsd?: number | null; logo?: string | null }

async function loadHoldings(chain: SourceChain, owner: string): Promise<Holding[]> {
  const j = await fetch(`/api/wallet?chain=${chain}&owner=${owner}`).then((r) => r.json());
  return ((j.holdings ?? []) as Omit<Holding, "chain">[]).map((h) => ({ ...h, chain }));
}

export function WalletPanel({ onSelect, busy }: { onSelect: (p: PositionInput) => void; busy?: boolean }) {
  const { address, isConnected } = useAccount();
  const { connectAsync, connectors, isPending, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [connectMsg, setConnectMsg] = useState<string | null>(null);
  const [pickedState, setPicked] = useState<Holding | null>(null);
  const [amount, setAmount] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualChain, setManualChain] = useState<SourceChain>("base");
  const [manual, setManual] = useState("");

  const { data: holdings, isFetching, isError } = useQuery({
    queryKey: ["holdings", address],
    enabled: !!address,
    staleTime: 60_000,
    queryFn: async () => {
      const [base, eth] = await Promise.all([loadHoldings("base", address!).catch(() => []), loadHoldings("ethereum", address!).catch(() => [])]);
      return [...base, ...eth].sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
    },
  });

  const totals = useMemo(() => {
    const t: Record<SourceChain, number> = { base: 0, ethereum: 0 };
    for (const h of holdings ?? []) t[h.chain] += h.valueUsd ?? 0;
    return t;
  }, [holdings]);

  // A disconnected wallet has no selection, whatever was picked before.
  const picked = isConnected ? pickedState : null;

  const injected = connectors[0];
  const step = !isConnected ? 1 : !picked ? 2 : 3;

  return (
    <div className="space-y-4">
      <Step n={1} title="Connect your wallet" state={step > 1 ? "done" : "active"} summary={isConnected ? `${shortAddr(address!)} · ${usd(totals.base + totals.ethereum)} found on Base and Ethereum` : undefined}
        action={isConnected ? <button className="btn btn-secondary btn-sm" onClick={() => disconnect()}>Disconnect</button> : undefined}>
        {!isConnected && (
          <>
            <p className="max-w-[60ch] text-ink-2">Alloc reads your balances on Base and Ethereum, evaluates a position exactly like the Playground, and prepares transactions for you to approve. Nothing moves without your signature.</p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
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
          </>
        )}
      </Step>

      {!isConnected && (
        <>
          <Step n={2} title="Choose what Alloc should watch" state="todo" summary="Your assets on Base and Ethereum appear here with their value." />
          <Step n={3} title="Set the amount and the rules" state="todo" summary="Pick how much Alloc may allocate and which risk profile applies." />
        </>
      )}

      {isConnected && (
        <Step n={2} title="Choose what Alloc should watch" state={step > 2 ? "done" : "active"} summary={picked && step > 2 ? `${picked.symbol} on ${CHAIN_LABELS[picked.chain]} · ${num(picked.balance)} (${usd(picked.valueUsd)})` : undefined}
          action={picked && step > 2 ? <button className="btn btn-secondary btn-sm" onClick={() => setPicked(null)}>Change</button> : undefined}>
          {step === 2 && (
            <>
              {isFetching && !holdings && <p className="thinking text-ink-2">Reading your balances on Base and Ethereum…</p>}
              {isError && <p className="text-danger">Could not read balances. Try again in a moment.</p>}
              {holdings && holdings.length > 0 && (
                <>
                  <p className="text-ink-2">We found {holdings.length} asset{holdings.length > 1 ? "s" : ""}. Pick the one Alloc should keep an eye on.</p>
                  <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {holdings.map((h) => (
                      <li key={h.chain + h.token}>
                        <button type="button" onClick={() => { setPicked(h); setAmount(trim(h.balance)); }}
                          className="group flex w-full flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-ink focus-visible:border-ink">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-lg font-bold">{h.symbol}</span>
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-2">{CHAIN_LABELS[h.chain]}</span>
                          </span>
                          <span className="text-sm text-ink-3">{h.name}</span>
                          <span className="mt-3 text-[1.35rem] font-bold tnum">{usd(h.valueUsd)}</span>
                          <span className="text-sm text-ink-2 tnum">{num(h.balance, 6)} {h.symbol}{h.priceUsd ? ` · ${usd(h.priceUsd)} each` : ""}</span>
                          <span className="mt-3 inline-flex h-8 items-center justify-center self-start rounded-full bg-ink px-3 text-sm font-semibold text-white opacity-90 group-hover:opacity-100">Watch this position</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {holdings && holdings.length === 0 && <p className="text-ink-2">No balances found on Base or Ethereum for this wallet. You can still add a token by its contract address below.</p>}

              <div className="mt-6 border-t border-line pt-4">
                <button type="button" className="text-sm font-semibold underline" onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
                  {manualOpen ? "Hide manual entry" : "Don't see your token? Add it by contract address"}
                </button>
                {manualOpen && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="seg" role="group" aria-label="Chain">
                      {(["base", "ethereum"] as SourceChain[]).map((c) => <button key={c} type="button" aria-pressed={manualChain === c} onClick={() => setManualChain(c)}>{CHAIN_LABELS[c]}</button>)}
                    </div>
                    <input className="field max-w-[440px] font-mono text-[0.9rem]" placeholder="0x… token contract address" value={manual} onChange={(e) => setManual(e.target.value)} spellCheck={false} />
                    <button className="btn btn-secondary" type="button" disabled={!/^0x[0-9a-fA-F]{40}$/.test(manual.trim())} onClick={() => { setPicked({ chain: manualChain, token: manual.trim(), symbol: "Token", name: "Entered by address", decimals: 18, balance: "" }); setAmount(""); }}>Use this token</button>
                    <p className="w-full text-sm text-ink-3">Alloc will read the balance and market data for this token on the chain you picked.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </Step>
      )}

      {isConnected && picked && (
        <Step n={3} title="Set the amount and the rules" state="active">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
            <div>
              <label className="lbl" htmlFor="realamount">Amount of {picked.symbol} Alloc may allocate</label>
              <input id="realamount" className="field tnum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={picked.balance || "Amount"} />
              {picked.balance && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[25, 50, 100].map((p) => (
                    <button key={p} type="button" className="rounded-full border border-line px-3 py-1 text-[0.8rem] text-ink-2 hover:border-line-strong hover:text-ink" onClick={() => setAmount(trim(String(Number(picked.balance) * (p / 100))))}>{p === 100 ? "All" : `${p}%`}</button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-sm text-ink-3">Your preferences cap how much of this amount can move in one decision.</p>
            </div>
            <PreferencesBlock />
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button className="btn btn-primary btn-lg" disabled={busy || !amount || Number(amount.replace(/,/g, "")) <= 0} onClick={() => onSelect({ chain: picked.chain, token: picked.token, amount: amount.replace(/,/g, "") })}>{busy ? "Working…" : "Ask Alloc"}</button>
            <span className="max-w-[36ch] text-sm leading-snug text-ink-3">Alloc will evaluate, explain, and wait for your approval before anything moves.</span>
          </div>
        </Step>
      )}
    </div>
  );
}

function trim(n: string) {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  return v >= 1000 ? v.toFixed(2) : v.toPrecision(6).replace(/\.?0+$/, "");
}

function Step({ n, title, state, summary, action, children }: { n: number; title: string; state: "active" | "done" | "todo"; summary?: string; action?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <section className={`card p-5 sm:p-6 ${state === "done" ? "bg-surface-2/60" : state === "todo" ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${state === "done" ? "bg-robinhood text-white" : state === "todo" ? "border border-line-strong text-ink-2" : "bg-ink text-white"}`}>{state === "done" ? "✓" : n}</span>
          <div>
            <h2 className="text-lg font-bold">{title}</h2>
            {summary && <p className="text-sm text-ink-2">{summary}</p>}
          </div>
        </div>
        {action}
      </div>
      {state === "active" && children && <div className="mt-4">{children}</div>}
    </section>
  );
}
