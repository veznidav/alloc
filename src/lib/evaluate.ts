import { parseUnits } from "viem";
import { CHAIN_IDS, CHAIN_LABELS, RH, USDC } from "./chains";
import { marketContext } from "./market";
import { relayCostSummary, relayQuote } from "./relay";
import { candidateData, tierOf } from "./robinhood";
import { memeData } from "./memes";
import { reasonDecision } from "./serv";
import type { Alternative, AllocEvent, Decision, MarketContext, Momentum, Position, Preferences, Score } from "./types";

export type Emit = (e: AllocEvent) => void;

const fmtUsd = (n: number | null | undefined) => (n == null ? "n/a" : `$${n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 0 })}`);
const fmtPct = (n: number | null | undefined, d = 2) => (n == null ? "n/a" : `${n >= 0 ? "+" : ""}${n.toFixed(d)}%`);

function riskGuidance(p: Preferences) {
  switch (p.risk) {
    case "conservative": return "Conservative: prefer capital preservation. Move to a stablecoin readily when the current asset shows weakness, thin liquidity or a sharp drawdown; require very strong, well-supported evidence and high confidence before moving into a Robinhood Chain asset; when in doubt, HOLD or de-risk.";
    case "aggressive": return "Aggressive: the user wants asymmetric upside, accepts drawdowns, and expects a move signal whenever any alternative has a positive edge. Prefer smaller, higher-volatility names with strong momentum over mega caps when the modelled edge is comparable; volatility is convexity here, not a flaw. Use stablecoins only when the current asset is collapsing and no growth alternative is live.";
    case "degen": return "Degen: the user explicitly allows meme tokens on Robinhood Chain and accepts that they can go to zero. Memes have no reference price and no fundamentals; judge them on depth, age, sustained volume, and momentum that is not a one-day spike. A daily move above +100% or a pool younger than two weeks is a red flag, not an opportunity. A seasoned meme (pool at least 30 days old, liquidity above $1M, no daily move above +100%) whose modelled net advantage beats the best stock by 5 points or more should be chosen over the stock: that is what this profile is for. Younger or thinner memes lose to a stock with a comparable edge. Confidence for a meme move can never be high.";
    default: return "Balanced: balance upside against drawdown risk. Move only when the improvement is clear after costs, and size positions cautiously.";
  }
}

/** Volatility penalty per profile. Aggressive treats volatility as convexity: a small bonus rather than a penalty. */
const LAMBDA: Record<Preferences["risk"], number> = { conservative: 0.4, balanced: 0.25, aggressive: -0.05, degen: -0.08 };
/** The convexity bonus is capped so a 2,000%-in-a-day pump cannot dominate the score. */
const MAX_BONUS_VOL = 60;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Alloc's scoring model. Deliberately simple and explainable:
 * expected 30d return blends 30d, 90d and 7d momentum; risk is monthly volatility scaled by the user's risk profile.
 * A stablecoin scores 0 on both. SERV receives these numbers and may adjust with judgement, but they anchor the decision.
 */
export function scoreAsset(mo: Momentum | null | undefined, risk: Preferences["risk"], opts: { stable?: boolean; h24?: number | null } = {}): Score {
  if (opts.stable) return { expectedReturn30dPct: 0, monthlyVolatilityPct: 0, riskAdjustedPct: 0, advantagePct: null };
  // Without history, stay neutral: only the last day is known.
  const c30 = mo?.change30dPct ?? 0;
  const c90 = mo?.change90dPct ?? 0;
  const c7 = mo?.change7dPct ?? (opts.h24 ?? 0);
  const mu = clamp(0.5 * c30 + 0.25 * (c90 / 3) + 0.25 * (c7 * 2), -30, 30);
  const vol = (mo?.volatility30dPct ?? 80) / Math.sqrt(12);
  const lambda = LAMBDA[risk];
  const volForScore = lambda < 0 ? Math.min(vol, MAX_BONUS_VOL) : vol;
  return { expectedReturn30dPct: mu, monthlyVolatilityPct: vol, riskAdjustedPct: mu - lambda * volForScore, advantagePct: null };
}

function proposedAmountUsd(position: Position, prefs: Preferences) {
  return position.valueUsd * (prefs.maxAllocationPct / 100);
}

/** Gather every alternative with live route costs for the proposed size. */
export async function gatherAlternatives(position: Position, prefs: Preferences, emit: Emit = () => {}): Promise<{ alternatives: Alternative[]; context: MarketContext }> {
  const amountUsd = proposedAmountUsd(position, prefs);
  const amountTokens = Number(position.amount) * (prefs.maxAllocationPct / 100);
  const rawAmount = parseUnits(amountTokens.toFixed(Math.min(position.decimals, 8)), position.decimals);
  const originChainId = CHAIN_IDS[position.chain];

  emit({ type: "stage", stage: "market" });
  const [context, stableQuote, usdgQuote, candidates, memes] = await Promise.all([
    marketContext().then((c) => { emit({ type: "context", context: c }); return c; }),
    position.isStablecoin ? Promise.resolve(null) : relayQuote({ originChainId, destinationChainId: originChainId, originCurrency: position.token, destinationCurrency: USDC[position.chain], amount: rawAmount.toString() })
      .then((q) => { const c = relayCostSummary(q); emit({ type: "route", label: `${position.symbol} → USDC on ${CHAIN_LABELS[position.chain]}`, costPct: c.costPct, seconds: c.seconds, ok: true }); return q; })
      .catch((e: Error) => { emit({ type: "route", label: `${position.symbol} → USDC on ${CHAIN_LABELS[position.chain]}`, costPct: null, seconds: null, ok: false }); return { error: e.message }; }),
    relayQuote({ originChainId, destinationChainId: 4663, originCurrency: position.token, destinationCurrency: RH.USDG, amount: rawAmount.toString() })
      .then((q) => { const c = relayCostSummary(q); emit({ type: "route", label: `${position.symbol} → USDG on Robinhood Chain`, costPct: c.costPct, seconds: c.seconds, ok: true }); return q; })
      .catch((e: Error) => { emit({ type: "route", label: `${position.symbol} → USDG on Robinhood Chain`, costPct: null, seconds: null, ok: false }); return { error: e.message }; }),
    candidateData(amountUsd, prefs.risk, (c) => emit({ type: "candidate", symbol: c.asset.symbol, name: c.asset.name, priceUsd: c.priceUsd, premiumPct: c.premiumPct, change24hPct: c.market?.priceChange.h24 ?? null, hopCostPct: c.hopCostPct, routable: c.hopCostPct != null && c.hopCostPct <= 10, kind: "robinhood" })),
    prefs.risk === "degen" ? memeRoutes(position, rawAmount, originChainId, emit) : Promise.resolve([] as MemeRoute[]),
  ]);

  const alternatives: Alternative[] = [];
  const current = scoreAsset(position.market.momentum, prefs.risk, { stable: position.isStablecoin, h24: position.market.priceChange.h24 });
  position.score = current;
  const withAdvantage = (score: Score, routeCostPct: number | null): Score => ({ ...score, advantagePct: routeCostPct == null ? null : score.riskAdjustedPct - current.riskAdjustedPct - routeCostPct });

  // Stablecoin: USDC on the same chain.
  if (!position.isStablecoin) {
    const ok = stableQuote && !("error" in stableQuote) ? relayCostSummary(stableQuote) : null;
    alternatives.push({
      kind: "stablecoin", symbol: "USDC", name: "USD Coin", address: USDC[position.chain], chain: position.chain,
      priceUsd: 1, referencePriceUsd: 1, premiumPct: null, market: null,
      score: withAdvantage(scoreAsset(null, prefs.risk, { stable: true }), ok ? ok.costPct : null),
      routeCostPct: ok ? ok.costPct : null,
      routeDescription: ok ? `Swap ${position.symbol} → USDC on ${CHAIN_LABELS[position.chain]} (${ok.seconds ?? "~"}s)` : `No live route quote available: ${stableQuote && "error" in stableQuote ? stableQuote.error : "unknown"}`,
      routeSeconds: ok?.seconds ?? null,
    });
  }

  // Robinhood Chain: bridge/swap into USDG, then USDG → stock token on-chain.
  const bridge = usdgQuote && !("error" in usdgQuote) ? relayCostSummary(usdgQuote) : null;
  for (const c of candidates) {
    if (!c.priceUsd && !c.referencePriceUsd) continue;
    // A hop cost above 10% means the on-chain pool cannot absorb this size; treat as no route.
    const deep = c.hopCostPct != null && c.hopCostPct <= 10;
    const total = bridge && deep ? bridge.costPct + (c.hopCostPct as number) : null;
    const direct = position.isStablecoin;
    alternatives.push({
      kind: "robinhood", symbol: c.asset.symbol, name: c.asset.name, address: c.asset.address, chain: "robinhood",
      priceUsd: c.priceUsd, referencePriceUsd: c.referencePriceUsd, premiumPct: c.premiumPct, market: c.market,
      score: withAdvantage(scoreAsset(c.market?.momentum, prefs.risk, { h24: c.market?.priceChange.h24 }), total),
      routeCostPct: total,
      routeDescription: total != null
        ? `${direct ? "Move" : "Swap"} ${position.symbol} → USDG on Robinhood Chain (${bridge!.seconds ?? "~"}s), then USDG → ${c.asset.symbol} on-chain`
        : `Route unavailable${bridge ? "" : `: ${usdgQuote && "error" in usdgQuote ? usdgQuote.error : "no bridge quote"}`}${!deep ? " (not enough on-chain depth for this amount)" : ""}`,
      routeSeconds: bridge?.seconds ?? null,
    });
  }
  for (const m of memes) {
    alternatives.push({
      kind: "meme", symbol: m.data.meme.symbol, name: m.data.meme.name, address: m.data.meme.address, chain: "robinhood",
      priceUsd: m.data.market?.priceUsd ?? null, referencePriceUsd: null, premiumPct: null, market: m.data.market, ageDays: m.data.meme.ageDays, direct: m.direct,
      score: withAdvantage(scoreAsset(m.data.market?.momentum, prefs.risk, { h24: m.data.market?.priceChange.h24 }), m.costPct),
      routeCostPct: m.costPct,
      routeDescription: m.costPct == null ? "Route unavailable (no direct route and no USDG pool with enough depth)" : m.direct ? `Direct: ${position.symbol} → ${m.data.meme.symbol} on Robinhood Chain in one step` : `${position.symbol} → USDG on Robinhood Chain, then USDG → ${m.data.meme.symbol}`,
      routeSeconds: m.seconds,
    });
  }
  return { alternatives, context };
}

interface MemeRoute { data: Awaited<ReturnType<typeof memeData>>[number]; costPct: number | null; direct: boolean; seconds: number | null }

/** Memes: try Relay's direct route first (one signature), fall back to the USDG hop. */
async function memeRoutes(position: Position, rawAmount: bigint, originChainId: number, emit: Emit): Promise<MemeRoute[]> {
  const { mapLimit } = await import("./cache");
  const { quoteV4 } = await import("./robinhood");
  const { formatUnits } = await import("viem");
  const list = await memeData();
  return mapLimit(list, 3, async (data) => {
    let costPct: number | null = null, direct = false, seconds: number | null = null;
    try {
      const q = await relayQuote({ originChainId, destinationChainId: 4663, originCurrency: position.token, destinationCurrency: data.meme.address, amount: rawAmount.toString() });
      const c = relayCostSummary(q);
      if (c.costPct <= 10) { costPct = c.costPct; direct = true; seconds = c.seconds; }
    } catch { /* no direct route */ }
    if (costPct == null && data.market?.priceUsd) {
      try {
        const usdgIn = BigInt(Math.round(Number(formatUnits(rawAmount, position.decimals)) * position.priceUsd * 1e6));
        const q = await quoteV4(RH.USDG, data.meme.address, usdgIn > 0n ? usdgIn : 1_000_000n);
        if (q) {
          const out = Number(formatUnits(q.amountOut, data.meme.decimals));
          const hop = Math.max(0, (1 - (out * data.market.priceUsd) / Number(formatUnits(usdgIn, 6))) * 100);
          if (hop <= 10) { costPct = hop + 0.6; seconds = 60; } // + typical bridge leg cost
        }
      } catch { /* no pool */ }
    }
    emit({ type: "candidate", symbol: data.meme.symbol, name: data.meme.name, priceUsd: data.market?.priceUsd ?? null, premiumPct: null, change24hPct: data.market?.priceChange.h24 ?? null, hopCostPct: costPct, routable: costPct != null, kind: "meme" });
    return { data, costPct, direct, seconds };
  });
}

function describePosition(p: Position) {
  const m = p.market;
  return [
    `Asset: ${p.symbol} (${p.name}) on ${CHAIN_LABELS[p.chain]}${p.isStablecoin ? " — a stablecoin" : ""}`,
    `Holding: ${Number(p.amount).toLocaleString("en-US")} ${p.symbol} worth ${fmtUsd(p.valueUsd)} at ${fmtUsd(p.priceUsd)} per token`,
    `Price change: 1h ${fmtPct(m.priceChange.h1)}, 6h ${fmtPct(m.priceChange.h6)}, 24h ${fmtPct(m.priceChange.h24)}`,
    `24h volume: ${fmtUsd(m.volume24hUsd)}; on-chain liquidity: ${fmtUsd(m.liquidityUsd)}${m.liquidityUsd ? ` (position is ${((p.valueUsd / m.liquidityUsd) * 100).toFixed(1)}% of pooled liquidity)` : ""}`,
    `24h trades: ${m.txns24h ? `${m.txns24h.buys} buys / ${m.txns24h.sells} sells` : "n/a"}; market cap ${fmtUsd(m.marketCapUsd)}; FDV ${fmtUsd(m.fdvUsd)}`,
    describeMomentum(m.momentum),
    p.score ? `Alloc model: expected 30d return ${fmtPct(p.score.expectedReturn30dPct, 1)}, monthly volatility ${p.score.monthlyVolatilityPct.toFixed(1)}%, risk-adjusted score ${fmtPct(p.score.riskAdjustedPct, 1)}` : "",
  ].filter(Boolean).join("\n");
}

function describeMomentum(mo: Momentum | null | undefined) {
  if (!mo) return "Longer-term performance: not available";
  return `Longer-term performance: 7d ${fmtPct(mo.change7dPct)}, 30d ${fmtPct(mo.change30dPct)}, 90d ${fmtPct(mo.change90dPct)}; 30d annualised volatility ${fmtPct(mo.volatility30dPct, 0).replace("+", "")}; ${fmtPct(mo.fromHigh52wPct)} from recent high`;
}

function describeAlternative(a: Alternative) {
  if (a.kind === "meme") {
    const m = a.market;
    return `- ${a.symbol} (${a.name}, MEME TOKEN on Robinhood Chain, no reference price). Price ${fmtUsd(a.priceUsd)}; FDV ${fmtUsd(m?.fdvUsd)}; pool age ${a.ageDays?.toFixed(0) ?? "?"} days; liquidity ${fmtUsd(m?.liquidityUsd)}; 24h volume ${fmtUsd(m?.volume24hUsd)}; 24h trades ${m?.txns24h ? `${m.txns24h.buys} buys / ${m.txns24h.sells} sells` : "n/a"}. Price change 1h ${fmtPct(m?.priceChange.h1)}, 6h ${fmtPct(m?.priceChange.h6)}, 24h ${fmtPct(m?.priceChange.h24)}; ${describeMomentum(m?.momentum).replace("Longer-term performance", "longer-term")}. Route: ${a.routeDescription}. All-in move cost: ${a.routeCostPct == null ? "no live route (do not choose)" : fmtPct(a.routeCostPct, 2).replace("+", "")}. Alloc model: expected 30d return ${fmtPct(a.score?.expectedReturn30dPct, 1)}, risk-adjusted ${fmtPct(a.score?.riskAdjustedPct, 1)}, modelled net advantage over current asset after costs ${a.score?.advantagePct == null ? "n/a" : fmtPct(a.score.advantagePct, 1)}.`;
  }
  if (a.kind === "stablecoin") {
    return `- USDC (stablecoin, same chain). Risk-adjusted score 0.0%. Modelled net advantage over current asset after costs: ${a.score?.advantagePct == null ? "n/a" : fmtPct(a.score.advantagePct, 1)}. Move cost for the proposed amount: ${a.routeCostPct == null ? "no live route" : fmtPct(a.routeCostPct, 2).replace("+", "")}.`;
  }
  const m = a.market;
  const tier = tierOf(a.symbol) === "core" ? "index ETF / mega cap" : tierOf(a.symbol) === "large" ? "large cap" : "small/mid cap";
  return `- ${a.symbol} (${a.name}, ${tier}, tokenized on Robinhood Chain). On-chain price ${fmtUsd(a.priceUsd)}; Chainlink reference ${fmtUsd(a.referencePriceUsd)}; on-chain premium vs reference ${fmtPct(a.premiumPct)}. Price change 1h ${fmtPct(m?.priceChange.h1)}, 6h ${fmtPct(m?.priceChange.h6)}, 24h ${fmtPct(m?.priceChange.h24)}. Underlying stock: ${describeMomentum(m?.momentum).replace("Longer-term performance: ", "")}. 24h volume ${fmtUsd(m?.volume24hUsd)}; liquidity ${fmtUsd(m?.liquidityUsd)}; 24h trades ${m?.txns24h ? `${m.txns24h.buys}/${m.txns24h.sells}` : "n/a"}. All-in move cost for the proposed amount: ${a.routeCostPct == null ? "no live route (do not choose)" : fmtPct(a.routeCostPct, 2).replace("+", "")}. Alloc model: expected 30d return ${fmtPct(a.score?.expectedReturn30dPct, 1)}, risk-adjusted ${fmtPct(a.score?.riskAdjustedPct, 1)}, modelled net advantage over current asset after costs ${a.score?.advantagePct == null ? "n/a" : fmtPct(a.score.advantagePct, 1)}.`;
}

export async function evaluatePosition(position: Position, prefs: Preferences, mode: "playground" | "real", emit: Emit = () => {}): Promise<Decision> {
  const { alternatives, context } = await gatherAlternatives(position, prefs, emit);
  emit({ type: "stage", stage: "reasoning" });
  const proposedUsd = proposedAmountUsd(position, prefs);

  const system = `You are Alloc, a capital allocation agent. You watch one crypto position on Ethereum or Base and decide where that capital should be right now: stay (HOLD), move partly into a stablecoin (MOVE_TO_STABLECOIN), or move partly into a tokenized stock on Robinhood Chain (MOVE_TO_ROBINHOOD).

You are not a trading bot. Doing nothing is a fully valid, often correct outcome. Never move capital just because you can. An alternative must be sufficiently better AFTER the cost and risk of moving.

Hard rules:
1. Respect the user's preferences exactly. allocation_pct must be 0 for HOLD and otherwise between 1 and the user's maximum allocation.
2. Alloc's model supplies a "modelled net advantage" for every alternative (risk-adjusted score of the alternative minus the current asset's, minus move cost). Treat it as the primary estimate: expected_opportunity_pct should equal the modelled net advantage plus move cost (i.e. the gross advantage), adjusted only modestly and for stated reasons (on-chain premium, thin liquidity, one-sided trade flow, very fresh reversal). The route must be live.
   - Conservative and Balanced: move only when the best modelled net advantage exceeds the user's minimum opportunity threshold; otherwise HOLD.
   - Aggressive and Degen: HOLD is not an allowed outcome while any live alternative exists. These users want a proposal every time. Pick the best live alternative by modelled net advantage (Degen: a seasoned meme when it qualifies, otherwise the best stock). Size it: full allocation when the edge clears the threshold; about half the maximum when the edge is positive but below the threshold; a quarter of the maximum (at least 5%) when every edge is negative, framed honestly as a speculative rotation the user asked for, with confidence low. Never pretend the edge is better than the model says.
3. Never choose an alternative whose route is unavailable.
4. If the current asset is a stablecoin, MOVE_TO_STABLECOIN is not meaningful; choose HOLD or MOVE_TO_ROBINHOOD.
5. A large on-chain premium versus the Chainlink reference (above ~1%) is a cost and a risk, not an opportunity. A discount can be an opportunity.
6. Thin liquidity relative to the amount being moved raises cost and risk.
7. Cite the supplied numbers in the reasoning. Do not invent data, news, or prices. Weakness in the current asset (falling over 30d/90d, far below its high, very high volatility) is a reason to move; strength is a reason to stay. Set confidence from how far the chosen option clears the threshold and how consistent the signals are.
8. Write for a consumer: plain language, no bridges/routes/pools jargon, no hedging boilerplate. Never use first person ("I"); write as Alloc in the third person or imperative, and address the user as "you" (never "the user"). Do not mention that you are an AI.
9. why_not must contain one entry for every alternative you did not choose (USDC, each Robinhood asset, each meme) and, when you move, the current asset. Use the asset symbol as the option name.
11. Meme tokens appear only when the user's profile allows them. When you choose a meme, warnings must state plainly that it has no reference price, can lose most or all of its value, and that the position is speculative; confidence must be low or medium.
10. headline is at most 6 words.`;

  const user = `Timestamp: ${new Date().toISOString()}
Mode: ${mode}

USER PREFERENCES
Risk tolerance: ${prefs.risk}. ${riskGuidance(prefs)}
Minimum opportunity to move: ${prefs.minOpportunityPct}% expected advantage after costs.
Maximum allocation per decision: ${prefs.maxAllocationPct}% of the position (${fmtUsd(proposedUsd)} at today's value). Route costs below are quoted for exactly this amount.
Approval mode: ${prefs.approvalMode}.

CURRENT POSITION
${describePosition(position)}

GENERAL MARKET CONDITIONS
ETH ${fmtUsd(context.ethUsd)} (${fmtPct(context.ethChange24hPct)} 24h); BTC ${fmtUsd(context.btcUsd)} (${fmtPct(context.btcChange24hPct)} 24h); total crypto market cap ${fmtPct(context.totalMarketCapChange24hPct)} 24h.

ALTERNATIVES (live data)
${alternatives.map(describeAlternative).join("\n")}

Decide where this capital should be, and explain it.`;

  let { decision: d, model } = await reasonDecision(system, user);

  // Aggressive and Degen must propose something whenever a route is live. If SERV still holds, ask once more with the constraint made explicit.
  const mustMove = (prefs.risk === "aggressive" || prefs.risk === "degen") && alternatives.some((a) => a.routeCostPct != null);
  if (mustMove && d.action === "HOLD") {
    const ranked = alternatives.filter((a) => a.routeCostPct != null && a.score?.advantagePct != null).sort((a, b) => (b.score!.advantagePct! - a.score!.advantagePct!));
    const retry = await reasonDecision(system, `${user}

IMPORTANT: HOLD is not permitted for the ${prefs.risk} profile while a live alternative exists. Choose the best live alternative and size it per the rules. Ranked by modelled net advantage: ${ranked.slice(0, 5).map((a) => `${a.symbol} ${fmtPct(a.score!.advantagePct, 1)}`).join(", ")}.`).catch(() => null);
    if (retry && retry.decision.action !== "HOLD") { d = retry.decision; model = retry.model; }
    else if (ranked[0]) {
      // Last resort: a deterministic proposal from the model, explained honestly.
      const best = ranked[0];
      const edge = best.score!.advantagePct!;
      const alloc = edge >= prefs.minOpportunityPct ? prefs.maxAllocationPct : edge > 0 ? Math.max(1, Math.round(prefs.maxAllocationPct / 2)) : Math.max(5, Math.round(prefs.maxAllocationPct / 4));
      d = {
        action: best.kind === "stablecoin" ? "MOVE_TO_STABLECOIN" : "MOVE_TO_ROBINHOOD",
        target_symbol: best.symbol,
        allocation_pct: alloc,
        expected_opportunity_pct: edge + (best.routeCostPct ?? 0),
        confidence: "low",
        headline: `Move ${alloc}% into ${best.symbol}`,
        summary: `Your ${prefs.risk} profile asks for a proposal every time. ${best.symbol} is the strongest live alternative by Alloc's model with a net edge of ${fmtPct(edge, 1)} after costs${edge <= 0 ? ", which is not positive, so this is a speculative rotation rather than a clear opportunity" : ""}. The move is sized accordingly.`,
        reasoning: [
          `${position.symbol} scores ${fmtPct(position.score?.riskAdjustedPct, 1)} risk-adjusted on Alloc's model.`,
          `${best.symbol} scores ${fmtPct(best.score?.riskAdjustedPct, 1)}; after a ${fmtPct(best.routeCostPct, 2).replace("+", "")} move cost the net edge is ${fmtPct(edge, 1)}.`,
          `Your profile does not allow holding while a live route exists, so the best available option is proposed at ${alloc}% of the position.`,
        ],
        why_not: ranked.slice(1, 6).map((a) => ({ option: a.symbol, reason: `Lower modelled net edge (${fmtPct(a.score!.advantagePct, 1)}) than ${best.symbol}.` })),
        warnings: [edge <= 0 ? "No alternative has a positive edge right now; this proposal exists because your profile always wants to be positioned." : "The edge is thin; sizing is reduced accordingly.", ...(best.kind === "meme" ? ["Meme token: no reference price, can lose most or all of its value."] : [])],
      };
      model = `${model} + alloc-model`;
    }
  }

  // Option names must be plain symbols, whatever SERV wrote ("MOVE_TO_ROBINHOOD AI" → "AI", "HOLD USDC" → "USDC").
  const known = new Set([position.symbol.toUpperCase(), ...alternatives.map((a) => a.symbol.toUpperCase())]);
  d.why_not = d.why_not.map((w) => {
    const cleaned = w.option.replace(/MOVE_TO_ROBINHOOD|MOVE_TO_STABLECOIN|HOLD|MOVE TO|ROBINHOOD CHAIN|STABLECOIN/gi, "").replace(/[_:()→-]+/g, " ").trim();
    const hit = cleaned.split(/\s+/).find((t) => known.has(t.toUpperCase()));
    return { option: hit ?? (cleaned || w.option), reason: w.reason };
  }).filter((w) => w.option.trim().length > 0);

  // Normalise against the rules so the UI never shows an impossible action.
  let action = d.action;
  let target = d.target_symbol ? alternatives.find((a) => a.symbol.toLowerCase() === d.target_symbol!.toLowerCase()) ?? null : null;
  if (action === "MOVE_TO_STABLECOIN") target = alternatives.find((a) => a.kind === "stablecoin") ?? null;
  if (action !== "HOLD" && (!target || target.routeCostPct == null)) { action = "HOLD"; target = null; }
  const allocationPct = action === "HOLD" ? 0 : Math.min(Math.max(1, Math.round(d.allocation_pct || prefs.maxAllocationPct)), prefs.maxAllocationPct);
  const amountUsd = position.valueUsd * (allocationPct / 100);
  const costPct = target?.routeCostPct ?? null;

  return {
    id: `dec_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    mode,
    position,
    preferences: prefs,
    action,
    targetSymbol: target?.symbol ?? null,
    targetAddress: target?.address ?? null,
    targetChain: target?.chain ?? null,
    targetKind: target?.kind ?? null,
    targetDirect: !!target?.direct,
    allocationPct,
    amountUsd,
    expectedOpportunityPct: action === "HOLD" ? null : d.expected_opportunity_pct,
    estimatedCostPct: costPct,
    estimatedCostUsd: costPct != null ? (amountUsd * costPct) / 100 : null,
    confidence: d.confidence,
    headline: d.headline,
    summary: d.summary,
    reasoning: d.reasoning,
    whyNot: d.why_not,
    evaluated: alternatives.map((a) => a.symbol),
    warnings: d.warnings,
    context,
    alternatives,
    model,
    status: action === "HOLD" ? "held" : "recommended",
  };
}
