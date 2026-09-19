"use client";
import { useState } from "react";
import { pct, usd } from "@/lib/format";
import { RISK_PROFILES, type Decision } from "@/lib/types";
import { PositionSummary } from "./PositionCard";
import { ReasoningPanel } from "./ReasoningPanel";
import { AllocationBar } from "./AllocationBar";

export const ACTION_LABEL: Record<Decision["action"], string> = { HOLD: "Hold", MOVE_TO_STABLECOIN: "Move to USDC", MOVE_TO_ROBINHOOD: "Move to Robinhood Chain" };
export const ACTION_PILL: Record<Decision["action"], string> = { HOLD: "pill-hold", MOVE_TO_STABLECOIN: "pill-stable", MOVE_TO_ROBINHOOD: "pill-robinhood" };
const DOT: Record<Decision["action"], string> = { HOLD: "active", MOVE_TO_STABLECOIN: "stable", MOVE_TO_ROBINHOOD: "robinhood" };

export function DecisionView({ decision, actions }: { decision: Decision; actions?: React.ReactNode }) {
  const [showWhy, setShowWhy] = useState(false);
  const [copied, setCopied] = useState(false);
  const d = decision;
  const moving = d.action !== "HOLD";
  const confidenceTone = d.confidence === "high" ? "text-robinhood" : d.confidence === "medium" ? "text-ink" : "text-warn";

  return (
    <section className="card spine p-6 sm:p-8">
      <div className="spine-line" aria-hidden />

      <div className="spine-step reveal">
        <span className="spine-dot" aria-hidden />
        <p className="text-sm text-ink-3">What you have</p>
        <div className="mt-1"><PositionSummary position={d.position} compact /></div>
      </div>

      <div className="spine-step reveal reveal-2 mt-8">
        <span className={`spine-dot ${DOT[d.action]}`} aria-hidden />
        <p className="text-sm text-ink-3">What Alloc thinks</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h2 className="display text-[2rem] font-bold sm:text-[2.4rem]">{ACTION_LABEL[d.action]}</h2>
          <span className={`pill ${ACTION_PILL[d.action]}`}>{d.action === "HOLD" ? "No action" : d.targetSymbol}</span>
          {d.targetKind === "meme" && <span className="pill bg-danger-soft text-danger">Meme token · speculative</span>}
        </div>
        <p className="mt-2 max-w-[60ch] text-[1rem] leading-relaxed text-ink-2">{d.summary}</p>
        <p className="mt-2 text-sm text-ink-3">
          Confidence <span className={`font-semibold ${confidenceTone}`}>{d.confidence}</span>
          <span className="mx-2">·</span>
          Evaluated {d.evaluated.length} alternatives
          <span className="mx-2">·</span>
          {RISK_PROFILES[d.preferences.risk]?.label ?? d.preferences.risk} profile, move above {d.preferences.minOpportunityPct}%, at most {d.preferences.maxAllocationPct}%
        </p>
      </div>

      <div className="spine-step reveal reveal-3 mt-8">
        <span className={`spine-dot ${moving ? DOT[d.action] : ""}`} aria-hidden />
        <p className="text-sm text-ink-3">{moving ? "What it wants to do" : "What happens next"}</p>
        {moving ? (
          <div className="mt-2 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div className="sm:col-span-2 text-[1.15rem] font-semibold">
              {d.position.symbol} <span className="text-ink-3">→</span> {d.targetSymbol}
              <span className="ml-2 text-[0.9rem] font-normal text-ink-3">{d.targetChain === "robinhood" ? (d.targetDirect ? "on Robinhood Chain, one step" : "on Robinhood Chain") : "same chain"}</span>
            </div>
            <Row label="Amount" value={`${usd(d.amountUsd)} (${d.allocationPct}% of position)`} />
            <Row label="Estimated cost" value={`${usd(d.estimatedCostUsd)} · ${pct(d.estimatedCostPct, 2, false)}`} />
            <Row label="Expected opportunity" value={pct(d.expectedOpportunityPct, 1)} tone={d.expectedOpportunityPct ?? 0} />
            <Row label="Net after costs" value={pct((d.expectedOpportunityPct ?? 0) - (d.estimatedCostPct ?? 0), 1)} tone={(d.expectedOpportunityPct ?? 0) - (d.estimatedCostPct ?? 0)} />
            <div className="sm:col-span-2 pt-2">
              <AllocationBar label="After approval" parts={[
                { symbol: d.position.symbol, valueUsd: d.position.valueUsd - d.amountUsd, tone: "current" },
                { symbol: d.targetSymbol ?? "", valueUsd: d.amountUsd - (d.estimatedCostUsd ?? 0), tone: d.action === "MOVE_TO_STABLECOIN" ? "stable" : "robinhood" },
              ]} />
            </div>
          </div>
        ) : (
          <p className="mt-2 max-w-[60ch] text-[1rem] text-ink-2">Nothing. Alloc keeps watching and will tell you when that changes.</p>
        )}
        {d.warnings.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {d.warnings.map((w, i) => (
              <li key={i} className="flex gap-2 text-[0.9rem] text-warn"><span aria-hidden>!</span><span>{w}</span></li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="btn btn-secondary" onClick={() => setShowWhy((v) => !v)} aria-expanded={showWhy}>{showWhy ? "Hide reasoning" : "View reasoning"}</button>
          {actions}
          <button className="btn btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(summaryText(d)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ } }}>{copied ? "Copied" : "Copy summary"}</button>
        </div>
      </div>

      {showWhy && <div className="mt-8 border-t border-line pt-6"><ReasoningPanel decision={d} /></div>}
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone == null ? "" : tone > 0 ? "text-robinhood" : tone < 0 ? "text-danger" : "";
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 sm:block sm:border-0 sm:py-0">
      <span className="text-sm text-ink-3">{label}</span>
      <span className={`block font-semibold tnum ${color}`}>{value}</span>
    </div>
  );
}

/** Plain-text version of a decision, for pasting into a chat or a note. */
function summaryText(d: Decision) {
  const lines = [
    `Alloc · ${new Date(d.createdAt).toLocaleString()} · ${d.mode === "real" ? "Real" : "Playground"}`,
    `Position: ${Number(d.position.amount).toLocaleString()} ${d.position.symbol} on ${d.position.chain === "base" ? "Base" : "Ethereum"} (${usd(d.position.valueUsd)})`,
    `Decision: ${d.headline}${d.action !== "HOLD" ? ` — ${usd(d.amountUsd)} (${d.allocationPct}%) → ${d.targetSymbol}, cost ${pct(d.estimatedCostPct, 2, false)}, expected ${pct(d.expectedOpportunityPct, 1)}` : ""}`,
    `Confidence: ${d.confidence} · ${RISK_PROFILES[d.preferences.risk]?.label ?? d.preferences.risk} profile`,
    "",
    d.summary,
    "",
    ...d.reasoning.map((r) => `• ${r}`),
    ...(d.warnings.length ? ["", ...d.warnings.map((w) => `! ${w}`)] : []),
    "",
    "Reasoned with SERV · alloc-two.vercel.app",
  ];
  return lines.join("\n");
}
