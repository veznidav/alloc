"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { explorerTx } from "@/lib/chains";
import { num, pct, usd } from "@/lib/format";
import { wagmiConfig } from "@/lib/wagmi";
import type { Decision, Simulation } from "@/lib/types";
import { post } from "./useEvaluate";

interface StepItem { status: string; data: { from: string; to: string; data: `0x${string}`; value: string; chainId: number; gas?: string } }
interface Step { id: string; kind: string; description: string; requestId?: string; items: StepItem[] }
interface Plan { simulation: Simulation; steps: Step[]; leg2: null | { tokenOut: `0x${string}`; symbol: string; decimals: number; usdgIn: string; expectedOut: string } }
interface Leg2 { txs: { label: string; chainId: number; to: `0x${string}`; data: `0x${string}`; value: string }[]; expectedOut: string; minOut: string }

type Phase = "preview" | "signing" | "bridging" | "leg2" | "done" | "failed";

export function ExecutionPanel({ decision, onDone, onReject }: { decision: Decision; onDone: (txs: { chainId: number; hash: string; label: string }[]) => void; onReject: () => void }) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("preview");
  const [log, setLog] = useState<string[]>([]);
  const [txs, setTxs] = useState<{ chainId: number; hash: string; label: string }[]>([]);
  const auto = decision.preferences.approvalMode === "autonomous";
  const started = useRef(false);

  useEffect(() => {
    if (!address) return;
    let live = true;
    post<Plan>("/api/execute/plan", { decision, user: address }).then((p) => live && setPlan(p)).catch((e) => live && setError((e as Error).message));
    return () => { live = false; };
  }, [decision, address]);

  const say = (m: string) => setLog((l) => [...l, m]);

  const ensureChain = useCallback(async (id: number) => {
    if (chainId !== id) { say(`Switching wallet to chain ${id}…`); await switchChainAsync({ chainId: id }); }
  }, [chainId, switchChainAsync]);

  const execute = useCallback(async () => {
    if (!plan || !address) return;
    setPhase("signing"); setError(null);
    const done: { chainId: number; hash: string; label: string }[] = [];
    try {
      let requestId: string | undefined;
      for (const step of plan.steps) {
        for (const item of step.items) {
          if (item.status === "complete") continue;
          await ensureChain(item.data.chainId);
          say(`${step.description || step.id}: waiting for your signature`);
          const hash = await sendTransactionAsync({ to: item.data.to as `0x${string}`, data: item.data.data, value: BigInt(item.data.value || "0"), chainId: item.data.chainId as 1 | 8453 | 4663, gas: item.data.gas ? BigInt(item.data.gas) : undefined });
          done.push({ chainId: item.data.chainId, hash, label: step.id === "approve" ? "Approval" : decision.action === "MOVE_TO_STABLECOIN" ? "Swap to USDC" : "Move to Robinhood Chain" });
          setTxs([...done]);
          say(`Sent. Waiting for confirmation…`);
          await waitForTransactionReceipt(wagmiConfig, { hash, chainId: item.data.chainId as 1 | 8453 | 4663 });
        }
        if (step.requestId) requestId = step.requestId;
      }
      if (decision.action === "MOVE_TO_STABLECOIN" || !plan.leg2) { setPhase("done"); onDone(done); return; }

      // Cross-chain: wait for Relay to deliver USDG on Robinhood Chain.
      setPhase("bridging");
      if (requestId) {
        say("Funds are on their way to Robinhood Chain…");
        for (let i = 0; i < 120; i++) {
          const s = await fetch(`/api/execute/status?requestId=${requestId}`).then((r) => r.json());
          if (s.status === "success") break;
          if (s.status === "failure" || s.status === "refund") throw new Error(`The move did not complete (${s.status}). Any funds are refunded to your wallet.`);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      setPhase("leg2");
      say(`Buying ${plan.leg2.symbol} on Robinhood Chain…`);
      const leg2 = await post<Leg2>("/api/execute/leg2", { user: address, tokenOut: plan.leg2.tokenOut, usdgIn: plan.leg2.usdgIn });
      for (const tx of leg2.txs) {
        await ensureChain(tx.chainId);
        say(`${tx.label}: waiting for your signature`);
        const hash = await sendTransactionAsync({ to: tx.to, data: tx.data, value: BigInt(tx.value || "0"), chainId: tx.chainId as 1 | 8453 | 4663 });
        done.push({ chainId: tx.chainId, hash, label: tx.label });
        setTxs([...done]);
        await waitForTransactionReceipt(wagmiConfig, { hash, chainId: tx.chainId as 1 | 8453 | 4663 });
      }
      setPhase("done"); onDone(done);
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
      setPhase("failed");
    }
  }, [plan, address, ensureChain, sendTransactionAsync, decision.action, onDone]);

  useEffect(() => {
    if (auto && plan && phase === "preview" && !started.current) { started.current = true; execute(); }
  }, [auto, plan, phase, execute]);

  const sim = plan?.simulation;
  return (
    <section className="card p-6 sm:p-8">
      <p className="text-sm text-ink-3">Real mode · real assets, real transactions</p>
      <h2 className="mt-1 text-2xl font-bold">{phase === "done" ? "Done" : auto ? "Executing under your rules" : "Approve this move?"}</h2>

      {!plan && !error && <p className="thinking mt-4 text-ink-2">Preparing the exact transactions…</p>}
      {sim && (
        <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <Item label="Selling" value={`${num(sim.amountTokens)} ${decision.position.symbol}`} sub={usd(sim.amountUsd)} />
          <Item label="Receiving" value={`about ${num(sim.receivedTokens)} ${sim.receivedSymbol}`} sub={`${usd(sim.receivedValueUsd)} on ${decision.targetChain === "robinhood" ? "Robinhood Chain" : "the same chain"}`} />
          <Item label="Estimated execution cost" value={`${usd(sim.costUsd, { decimals: 2 })} · ${pct(sim.costPct, 2, false)}`} />
          <Item label="Expected result" value={sim.resulting.map((r) => `${r.symbol} ${usd(r.valueUsd)}`).join(" · ")} />
        </dl>
      )}
      {decision.warnings.length > 0 && (
        <ul className="mt-4 space-y-1.5">{decision.warnings.map((w, i) => <li key={i} className="text-[0.9rem] text-warn">! {w}</li>)}</ul>
      )}
      {sim && decision.targetChain === "robinhood" && (
        <p className="mt-4 text-sm text-ink-3">Two signatures on {decision.position.chain === "base" ? "Base" : "Ethereum"}, then one to three on Robinhood Chain once the funds arrive. Your wallet will be asked to switch networks.</p>
      )}

      {log.length > 0 && (
        <ol className="mt-5 space-y-1 text-sm text-ink-2">{log.map((l, i) => <li key={i} className={i === log.length - 1 && phase !== "done" && phase !== "failed" ? "thinking" : ""}>{l}</li>)}</ol>
      )}
      {txs.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-3 text-sm">{txs.map((t) => <li key={t.hash}><a className="underline" href={explorerTx(t.chainId, t.hash)} target="_blank" rel="noreferrer">{t.label}</a></li>)}</ul>
      )}
      {error && <p className="mt-4 text-[0.95rem] text-danger">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-3">
        {phase === "preview" && !auto && (
          <>
            <button className="btn btn-danger" onClick={onReject}>Reject</button>
            <button className={`btn ${decision.action === "MOVE_TO_ROBINHOOD" ? "btn-robinhood" : "btn-stable"}`} disabled={!plan} onClick={execute}>Approve</button>
          </>
        )}
        {phase === "failed" && <button className="btn btn-secondary" onClick={onReject}>Back</button>}
        {phase === "done" && <p className="text-ink-2">Alloc keeps watching the remaining position.</p>}
      </div>
    </section>
  );
}

function Item({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-sm text-ink-3">{label}</dt>
      <dd className="mt-0.5 font-semibold tnum">{value}</dd>
      {sub && <dd className="text-sm text-ink-3 tnum">{sub}</dd>}
    </div>
  );
}
