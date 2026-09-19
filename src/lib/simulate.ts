import { formatUnits, parseUnits } from "viem";
import { CHAIN_IDS, CHAIN_LABELS, RH, USDC } from "./chains";
import { relayCostSummary, relayQuote, type RelayQuote } from "./relay";
import { chainlinkPrice, findRobinhoodAsset, quoteV4 } from "./robinhood";
import { dexMarket } from "./market";
import type { Decision, Simulation } from "./types";
import { discoverMemes } from "./memes";

async function memeAsset(address: string) {
  const m = (await discoverMemes()).find((x) => x.address.toLowerCase() === address.toLowerCase());
  return m ? { symbol: m.symbol, name: m.name, address: m.address, decimals: m.decimals, chainlinkFeed: null as `0x${string}` | null } : null;
}

export interface RoutePlan {
  simulation: Simulation;
  relay: RelayQuote | null;
  leg2: null | { tokenOut: `0x${string}`; symbol: string; decimals: number; usdgIn: string; expectedOut: string; protocol: "v4" | "v3"; fee: number; tickSpacing: number };
}

/** Build the real route for a decision at the decided size. With `user`, Relay returns signable transactions. */
export async function planRoute(decision: Decision, user?: `0x${string}`): Promise<RoutePlan> {
  const p = decision.position;
  if (decision.action === "HOLD" || !decision.targetSymbol) {
    return {
      simulation: { startingValueUsd: p.valueUsd, amountUsd: 0, amountTokens: 0, receivedTokens: null, receivedSymbol: null, receivedValueUsd: null, costUsd: 0, costPct: 0, resulting: [{ symbol: p.symbol, valueUsd: p.valueUsd, chain: CHAIN_LABELS[p.chain] }], route: ["No action"], timeSeconds: null },
      relay: null, leg2: null,
    };
  }
  const amountTokens = Number(p.amount) * (decision.allocationPct / 100);
  const raw = parseUnits(amountTokens.toFixed(Math.min(p.decimals, 8)), p.decimals);
  const originChainId = CHAIN_IDS[p.chain];

  if (decision.action === "MOVE_TO_STABLECOIN") {
    const q = await relayQuote({ user, originChainId, destinationChainId: originChainId, originCurrency: p.token, destinationCurrency: USDC[p.chain], amount: raw.toString() });
    const c = relayCostSummary(q);
    const received = Number(q.details.currencyOut.amountFormatted);
    return {
      simulation: {
        startingValueUsd: p.valueUsd, amountUsd: c.inUsd, amountTokens,
        receivedTokens: received, receivedSymbol: "USDC", receivedValueUsd: c.outUsd,
        costUsd: c.costUsd, costPct: c.costPct,
        resulting: [{ symbol: p.symbol, valueUsd: p.valueUsd - c.inUsd, chain: CHAIN_LABELS[p.chain] }, { symbol: "USDC", valueUsd: c.outUsd, chain: CHAIN_LABELS[p.chain] }],
        route: [`${p.symbol} → USDC on ${CHAIN_LABELS[p.chain]}`], timeSeconds: c.seconds,
      },
      relay: q, leg2: null,
    };
  }

  // Meme with a direct Relay route: one leg straight into the token.
  if (decision.targetKind === "meme" && decision.targetDirect && decision.targetAddress) {
    const q = await relayQuote({ user, originChainId, destinationChainId: 4663, originCurrency: p.token, destinationCurrency: decision.targetAddress, amount: raw.toString() });
    const c = relayCostSummary(q);
    const received = Number(q.details.currencyOut.amountFormatted);
    return {
      simulation: {
        startingValueUsd: p.valueUsd, amountUsd: c.inUsd, amountTokens,
        receivedTokens: received, receivedSymbol: decision.targetSymbol, receivedValueUsd: c.outUsd,
        costUsd: c.costUsd, costPct: c.costPct,
        resulting: [{ symbol: p.symbol, valueUsd: p.valueUsd - c.inUsd, chain: CHAIN_LABELS[p.chain] }, { symbol: decision.targetSymbol, valueUsd: c.outUsd, chain: "Robinhood Chain" }],
        route: [`${p.symbol} → ${decision.targetSymbol} on Robinhood Chain (direct)`], timeSeconds: c.seconds,
      },
      relay: q, leg2: null,
    };
  }

  // MOVE_TO_ROBINHOOD: leg 1 to USDG on Robinhood Chain, leg 2 USDG → token on-chain.
  const asset = decision.targetKind === "meme"
    ? await memeAsset(decision.targetAddress!)
    : await findRobinhoodAsset(decision.targetSymbol);
  if (!asset) throw new Error(`Unknown Robinhood Chain asset ${decision.targetSymbol}`);
  const q = await relayQuote({ user, originChainId, destinationChainId: 4663, originCurrency: p.token, destinationCurrency: RH.USDG, amount: raw.toString() });
  const c = relayCostSummary(q);
  const usdgOut = BigInt(q.details.currencyOut.amount);
  const [hop, ref, dm] = await Promise.all([quoteV4(RH.USDG, asset.address, usdgOut), asset.chainlinkFeed ? chainlinkPrice(asset.chainlinkFeed) : null, dexMarket("robinhood", asset.address)]);
  if (!hop) throw new Error(`No on-chain market with enough depth for USDG → ${asset.symbol} right now.`);
  const outTokens = Number(formatUnits(hop.amountOut, asset.decimals));
  const price = ref ?? dm?.snapshot.priceUsd ?? 0;
  const outUsd = outTokens * price;
  const costUsd = Math.max(0, c.inUsd - outUsd) + c.gasUsd;
  return {
    simulation: {
      startingValueUsd: p.valueUsd, amountUsd: c.inUsd, amountTokens,
      receivedTokens: outTokens, receivedSymbol: asset.symbol, receivedValueUsd: outUsd,
      costUsd, costPct: c.inUsd ? (costUsd / c.inUsd) * 100 : 0,
      resulting: [{ symbol: p.symbol, valueUsd: p.valueUsd - c.inUsd, chain: CHAIN_LABELS[p.chain] }, { symbol: asset.symbol, valueUsd: outUsd, chain: "Robinhood Chain" }],
      route: [`${p.symbol} → USDG on Robinhood Chain`, `USDG → ${asset.symbol}`], timeSeconds: c.seconds,
    },
    relay: q,
    leg2: { tokenOut: asset.address, symbol: asset.symbol, decimals: asset.decimals, usdgIn: q.details.currencyOut.amountFormatted, expectedOut: outTokens.toString(), protocol: hop.protocol, fee: hop.fee, tickSpacing: hop.tickSpacing },
  };
}
