import { formatUnits, getAddress, parseUnits } from "viem";
import { aggregatorV3Abi, quoterAbi } from "./abis";
import { cached, fetchJson, mapLimit, retry } from "./cache";
import { publicClient, RH, ZERO_ADDRESS } from "./chains";
import { dexMarket, stockMomentum } from "./market";
import type { MarketSnapshot, RobinhoodAsset } from "./types";

/** Curated shortlist of Robinhood Chain stock tokens Alloc considers as destinations. */
export const CANDIDATE_SYMBOLS = ["NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "GOOGL", "META", "SPY", "QQQ"];

interface RhjAsset {
  tokenSymbol: string; tokenName: string; tokenDecimals: number; logoUrl?: string; currentMultiplier: string; status: string;
  deployments: { contractAddress: string; chainId: number }[];
}
interface ClFeed { name: string; proxyAddress: string; decimals: number; feedCategory?: string }

/** Robinhood's public asset registry, joined with the Chainlink feed directory for Robinhood Chain. */
export async function robinhoodUniverse(): Promise<RobinhoodAsset[]> {
  return cached("rh:universe", 10 * 60_000, async () => {
    const [reg, feeds] = await Promise.all([
      fetchJson<{ assets: RhjAsset[] }>("https://api.robinhood.com/rhj/assets", { headers: { "user-agent": "alloc/0.1" } }),
      fetchJson<ClFeed[]>("https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json").catch(() => [] as ClFeed[]),
    ]);
    const feedBySymbol = new Map<string, `0x${string}`>();
    for (const f of feeds) {
      const m = /^Robinhood ([A-Z.]+)\s*[-/]\s*USD$/.exec(f.name);
      if (m) feedBySymbol.set(m[1], getAddress(f.proxyAddress.toLowerCase()));
    }
    return reg.assets
      .filter((a) => a.status === "ASSET_STATUS_ACTIVE")
      .map((a) => {
        const dep = a.deployments.find((d) => d.chainId === 4663);
        if (!dep) return null;
        return {
          symbol: a.tokenSymbol,
          name: a.tokenName.replace(" • Robinhood Token", ""),
          address: getAddress(dep.contractAddress.toLowerCase()),
          decimals: a.tokenDecimals,
          logoUrl: a.logoUrl ?? null,
          multiplier: Number(a.currentMultiplier || 1),
          chainlinkFeed: feedBySymbol.get(a.tokenSymbol) ?? null,
        } satisfies RobinhoodAsset;
      })
      .filter((x): x is RobinhoodAsset => !!x);
  });
}

export async function findRobinhoodAsset(symbolOrAddress: string) {
  const u = await robinhoodUniverse();
  const s = symbolOrAddress.toLowerCase();
  return u.find((a) => a.symbol.toLowerCase() === s || a.address.toLowerCase() === s) ?? null;
}

export async function chainlinkPrice(feed: `0x${string}`): Promise<number | null> {
  return cached(`cl:${feed}`, 60_000, async () => {
    const client = publicClient("robinhood");
    try {
      const round = await retry(() => client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: "latestRoundData" }));
      const dec = await retry(() => client.readContract({ address: feed, abi: aggregatorV3Abi, functionName: "decimals" }));
      return Number(formatUnits(round[1], Number(dec)));
    } catch { return null; }
  });
}

const FEE_TIERS: [number, number][] = [[3000, 60], [500, 10], [100, 1]];

/** Best exact-input single-hop quote via the Uniswap v4 Quoter on Robinhood Chain across common fee tiers. */
export async function quoteV4(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint) {
  const client = publicClient("robinhood");
  const [c0, c1] = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn];
  const zeroForOne = c0.toLowerCase() === tokenIn.toLowerCase();
  const results = await mapLimit(FEE_TIERS, 2, async ([fee, tickSpacing]) => {
    try {
      const { result } = await retry(() => client.simulateContract({
        address: RH.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ poolKey: { currency0: c0, currency1: c1, fee, tickSpacing, hooks: ZERO_ADDRESS }, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
      }), 2, 150).catch((e: Error) => {
        // A revert means no pool / no depth for this tier; anything else (rate limit) is retried above.
        if (/revert|0x6190b2b0|execution/i.test(String(e.message))) return { result: [0n] as const };
        throw e;
      });
      return { fee, tickSpacing, amountOut: result[0] as bigint, zeroForOne, currency0: c0, currency1: c1 };
    } catch { return null; }
  });
  const ok = results.filter((r): r is NonNullable<typeof r> => !!r && r.amountOut > 0n);
  if (!ok.length) return null;
  ok.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  return ok[0];
}

export interface CandidateData {
  asset: RobinhoodAsset;
  priceUsd: number | null;
  referencePriceUsd: number | null;
  premiumPct: number | null;
  market: MarketSnapshot | null;
  /** Cost of the USDG → stock hop for `usdgAmount`, as % of value, from the on-chain quoter. */
  hopCostPct: number | null;
  hopQuote: { fee: number; tickSpacing: number; amountOut: string } | null;
}

/** Live data for the candidate shortlist: DEX price, Chainlink reference, premium, and the on-chain hop cost for a given USDG size. */
export async function candidateData(usdgAmount: number): Promise<CandidateData[]> {
  // Bucket by size so repeated evaluations/simulations reuse the scan for a minute.
  const bucket = Math.round(Math.log10(Math.max(1, usdgAmount)) * 4) / 4;
  return cached(`rh:candidates:${bucket}`, 60_000, () => scanCandidates(usdgAmount));
}

async function scanCandidates(usdgAmount: number): Promise<CandidateData[]> {
  const universe = await robinhoodUniverse();
  const assets = CANDIDATE_SYMBOLS.map((s) => universe.find((a) => a.symbol === s)).filter((a): a is RobinhoodAsset => !!a);
  const size = parseUnits(Math.max(1, Math.min(usdgAmount, 5_000_000)).toFixed(6), 6);
  return mapLimit(assets, 3, async (asset) => {
    const [dm, mom] = await Promise.all([dexMarket("robinhood", asset.address), stockMomentum(asset.symbol)]);
    const ref = asset.chainlinkFeed ? await chainlinkPrice(asset.chainlinkFeed) : null;
    const q = await quoteV4(RH.USDG, asset.address, size);
    const priceUsd = dm?.snapshot.priceUsd ?? null;
    const premiumPct = priceUsd && ref ? ((priceUsd - ref) / ref) * 100 : null;
    let hopCostPct: number | null = null;
    let hopQuote: CandidateData["hopQuote"] = null;
    if (q && (ref || priceUsd)) {
      const out = Number(formatUnits(q.amountOut, asset.decimals));
      const fair = (ref ?? priceUsd) as number;
      hopCostPct = Math.max(0, (1 - (out * fair) / Number(formatUnits(size, 6))) * 100);
      hopQuote = { fee: q.fee, tickSpacing: q.tickSpacing, amountOut: out.toString() };
    }
    return { asset, priceUsd, referencePriceUsd: ref, premiumPct, market: dm ? { ...dm.snapshot, momentum: mom } : null, hopCostPct, hopQuote };
  });
}
