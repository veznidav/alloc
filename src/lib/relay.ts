import { fetchJson } from "./cache";
import { ZERO_ADDRESS } from "./chains";

export const RELAY_DEAD_USER = "0x000000000000000000000000000000000000dEaD";

export interface RelayCurrencyAmount {
  currency: { chainId: number; address: string; symbol: string; name: string; decimals: number };
  amount: string; amountFormatted: string; amountUsd: string; minimumAmount: string;
}
export interface RelayStepItem {
  status: string;
  data: { from: string; to: string; data: `0x${string}`; value: string; chainId: number; gas?: string; maxFeePerGas?: string; maxPriorityFeePerGas?: string };
  check?: { endpoint: string; method: string };
}
export interface RelayStep { id: string; action: string; description: string; kind: string; requestId?: string; items: RelayStepItem[] }
export interface RelayQuote {
  steps: RelayStep[];
  fees: { gas?: RelayCurrencyAmount; relayer?: RelayCurrencyAmount; relayerGas?: RelayCurrencyAmount; relayerService?: RelayCurrencyAmount; app?: RelayCurrencyAmount };
  details: {
    operation: string; timeEstimate?: number;
    currencyIn: RelayCurrencyAmount; currencyOut: RelayCurrencyAmount;
    totalImpact?: { usd: string; percent: string }; swapImpact?: { usd: string; percent: string };
  };
}

export interface RelayQuoteInput {
  user?: string;
  originChainId: number;
  destinationChainId: number;
  originCurrency: string; // token address, or zero address for native
  destinationCurrency: string;
  amount: string; // raw units
  recipient?: string;
}

export function relayCurrency(token: string) {
  return token === "native" ? ZERO_ADDRESS : token;
}

/** Quote a same-chain swap or cross-chain move through Relay. Free, no key. */
export async function relayQuote(input: RelayQuoteInput): Promise<RelayQuote> {
  const user = input.user ?? RELAY_DEAD_USER;
  const body = {
    user,
    recipient: input.recipient ?? user,
    originChainId: input.originChainId,
    destinationChainId: input.destinationChainId,
    originCurrency: relayCurrency(input.originCurrency),
    destinationCurrency: relayCurrency(input.destinationCurrency),
    amount: input.amount,
    tradeType: "EXACT_INPUT",
  };
  const res = await fetch("https://api.relay.link/quote", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = (await res.json()) as RelayQuote & { message?: string; errorCode?: string };
  if (!res.ok || json.message) throw new Error(json.message || `Relay quote failed (${res.status})`);
  return json;
}

export function relayCostSummary(q: RelayQuote) {
  const inUsd = Number(q.details.currencyIn.amountUsd);
  const outUsd = Number(q.details.currencyOut.amountUsd);
  const gasUsd = Number(q.fees.gas?.amountUsd ?? 0);
  const costUsd = Math.max(0, inUsd - outUsd) + gasUsd;
  const costPct = inUsd > 0 ? (costUsd / inUsd) * 100 : 0;
  return { inUsd, outUsd, gasUsd, costUsd, costPct, seconds: q.details.timeEstimate ?? null };
}

export async function relayStatus(requestId: string) {
  return fetchJson<{ status: string; txHashes?: string[]; inTxHashes?: string[]; details?: string }>(`https://api.relay.link/intents/status/v2?requestId=${requestId}`);
}
