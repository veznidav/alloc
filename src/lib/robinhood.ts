import { formatUnits, getAddress, parseUnits } from "viem";
import { aggregatorV3Abi, quoterAbi, quoterV2Abi } from "./abis";
import { cached, fetchJson, mapLimit, peek, retry } from "./cache";
import { publicClient, RH, ZERO_ADDRESS } from "./chains";
import { dexMarket, stockMomentum } from "./market";
import type { MarketSnapshot, RiskTolerance, RobinhoodAsset } from "./types";
import universeFile from "@/data/robinhood-universe.json";

export interface RoutableAsset {
  symbol: string; name: string; address: string; decimals: number; protocol: "v4" | "v3"; fee: number; tickSpacing: number;
  liquidityUsd: number; volume24h: number; hopCostPct1k: number; chainlinkFeed: string | null; logoUrl: string | null;
}

/** Every Robinhood Chain stock token with a routable USDG pool, from scripts/scan-universe.ts. */
export const ROUTABLE: RoutableAsset[] = (universeFile as unknown as { assets: RoutableAsset[] }).assets;
export const UNIVERSE_SCANNED_AT: string = (universeFile as { scannedAt: string }).scannedAt;

/** Index ETFs and mega caps: the names a conservative allocator may hold. */
const CORE = new Set(["SPY", "QQQ", "GLD", "IAU", "SGOV", "VOO", "IVV", "VTI", "USO", "SLV", "INDA", "NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "AVGO", "BRK.B", "JPM", "V", "MA", "UNH", "LLY", "XOM", "WMT", "COST", "PG", "JNJ", "HD", "IBM", "PFE", "KO", "PEP"]);
/** Established growth and large caps for the balanced profile. */
const LARGE = new Set(["TSLA", "SPCX", "TSM", "ASML", "ORCL", "NFLX", "AMD", "PLTR", "INTC", "DELL", "MU", "CRM", "ADBE", "CSCO", "COIN", "HOOD", "MSTR", "SNOW", "UBER", "DIS", "BABA", "CRWD", "PANW", "NOW", "GE", "CAT", "BA", "UPS", "TTWO", "NU", "LMT", "F", "CRCL", "SKHY", "DDOG", "NET", "LULU", "MRNA", "RIVN"]);

export type Tier = "core" | "large" | "growth";
export function tierOf(symbol: string): Tier {
  if (CORE.has(symbol)) return "core";
  if (LARGE.has(symbol)) return "large";
  return "growth";
}

/** The candidate set each profile may consider. Bounded so a decision stays fast on public RPCs. */
export function universeFor(risk: RiskTolerance): RoutableAsset[] {
  const usable = ROUTABLE.filter((a) => a.hopCostPct1k <= 5);
  const byActivity = (a: RoutableAsset, b: RoutableAsset) => (b.liquidityUsd + b.volume24h) - (a.liquidityUsd + a.volume24h);
  if (risk === "conservative") return usable.filter((a) => tierOf(a.symbol) === "core" && a.liquidityUsd >= 100_000).sort(byActivity).slice(0, 10);
  if (risk === "balanced") return usable.filter((a) => tierOf(a.symbol) !== "growth" && a.liquidityUsd >= 100_000).sort(byActivity).slice(0, 14);
  // Aggressive: favour the most active small and mid caps, keep a few large names as a reference.
  const core = usable.filter((a) => tierOf(a.symbol) === "core" && a.liquidityUsd >= 250_000).sort(byActivity).slice(0, 3);
  const large = usable.filter((a) => tierOf(a.symbol) === "large" && a.liquidityUsd >= 100_000).sort(byActivity).slice(0, 4);
  const growth = usable.filter((a) => tierOf(a.symbol) === "growth" && a.liquidityUsd >= 25_000).sort(byActivity).slice(0, 9);
  return [...core, ...large, ...growth];
}

/** Kept for the market board and API. */
export const CANDIDATE_SYMBOLS = ROUTABLE.map((a) => a.symbol);

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

const V4_TIERS: [number, number][] = [[3000, 60], [500, 10], [10000, 200], [100, 1]];
const V3_FEES = [3000, 500, 10000, 100];

export type PoolQuote = { protocol: "v4" | "v3"; fee: number; tickSpacing: number; amountOut: bigint; zeroForOne: boolean; currency0: `0x${string}`; currency1: `0x${string}` };

const isRevert = (e: Error) => /revert|0x6190b2b0|execution|Unexpected error|returned no data/i.test(String(e.message));

/** Best exact-input single-hop quote for USDG → token across Uniswap v4 and v3 pools on Robinhood Chain. Remembers the winning pool for an hour. */
export async function quoteV4(tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint): Promise<PoolQuote | null> {
  const client = publicClient("robinhood");
  const [c0, c1] = tokenIn.toLowerCase() < tokenOut.toLowerCase() ? [tokenIn, tokenOut] : [tokenOut, tokenIn];
  const zeroForOne = c0.toLowerCase() === tokenIn.toLowerCase();
  const poolKey = `rh:pool:${tokenIn}:${tokenOut}`.toLowerCase();
  const known = peek<{ protocol: "v4" | "v3"; fee: number; tickSpacing: number }>(poolKey);

  const tryV4 = async (fee: number, tickSpacing: number): Promise<PoolQuote | null> => {
    try {
      const { result } = await retry(() => client.simulateContract({
        address: RH.quoter, abi: quoterAbi, functionName: "quoteExactInputSingle",
        args: [{ poolKey: { currency0: c0, currency1: c1, fee, tickSpacing, hooks: ZERO_ADDRESS }, zeroForOne, exactAmount: amountIn, hookData: "0x" }],
      }), 2, 150).catch((e: Error) => { if (isRevert(e)) return { result: [0n] as const }; throw e; });
      return result[0] > 0n ? { protocol: "v4", fee, tickSpacing, amountOut: result[0] as bigint, zeroForOne, currency0: c0, currency1: c1 } : null;
    } catch { return null; }
  };
  const tryV3 = async (fee: number): Promise<PoolQuote | null> => {
    try {
      const { result } = await retry(() => client.simulateContract({
        address: RH.v3QuoterV2, abi: quoterV2Abi, functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      }), 2, 150).catch((e: Error) => { if (isRevert(e)) return { result: [0n] as const }; throw e; });
      return result[0] > 0n ? { protocol: "v3", fee, tickSpacing: 0, amountOut: result[0] as bigint, zeroForOne, currency0: c0, currency1: c1 } : null;
    } catch { return null; }
  };

  if (known) {
    const q = known.protocol === "v4" ? await tryV4(known.fee, known.tickSpacing) : await tryV3(known.fee);
    if (q) return q;
  }
  const attempts: (() => Promise<PoolQuote | null>)[] = [...V4_TIERS.map(([f, t]) => () => tryV4(f, t)), ...V3_FEES.map((f) => () => tryV3(f))];
  const results = await mapLimit(attempts, 2, (fn) => fn());
  const ok = results.filter((r): r is PoolQuote => !!r);
  if (!ok.length) return null;
  ok.sort((a, b) => (b.amountOut > a.amountOut ? 1 : -1));
  const best = ok[0];
  await cached(poolKey, 3600_000, async () => ({ protocol: best.protocol, fee: best.fee, tickSpacing: best.tickSpacing }));
  return best;
}

export interface CandidateData {
  asset: RobinhoodAsset;
  priceUsd: number | null;
  referencePriceUsd: number | null;
  premiumPct: number | null;
  market: MarketSnapshot | null;
  /** Cost of the USDG → stock hop for `usdgAmount`, as % of value, from the on-chain quoter. */
  hopCostPct: number | null;
  hopQuote: { protocol: "v4" | "v3"; fee: number; tickSpacing: number; amountOut: string } | null;
}

/** Live data for the candidate shortlist: DEX price, Chainlink reference, premium, and the on-chain hop cost for a given USDG size. */
export async function candidateData(usdgAmount: number, risk: RiskTolerance = "balanced", onCandidate?: (c: CandidateData) => void): Promise<CandidateData[]> {
  // Bucket by size so repeated evaluations/simulations reuse the scan for a minute.
  const bucket = Math.round(Math.log10(Math.max(1, usdgAmount)) * 4) / 4;
  const key = `rh:candidates:${risk}:${bucket}`;
  const hit = peek<CandidateData[]>(key);
  if (hit) { hit.forEach((c) => onCandidate?.(c)); return hit; }
  return cached(key, 60_000, () => scanCandidates(usdgAmount, universeFor(risk), onCandidate));
}

/** Seed the pool cache from the scan so the first quote for a token needs one call, not eight. */
function seedPools() {
  for (const a of ROUTABLE) {
    const k = `rh:pool:${RH.USDG}:${a.address}`.toLowerCase();
    if (!peek(k)) void cached(k, 3600_000, async () => ({ protocol: a.protocol, fee: a.fee, tickSpacing: a.tickSpacing }));
  }
}

export async function scanCandidates(usdgAmount: number, list: RoutableAsset[], onCandidate?: (c: CandidateData) => void): Promise<CandidateData[]> {
  seedPools();
  const universe = await robinhoodUniverse();
  const assets = list.map((r) => universe.find((a) => a.address.toLowerCase() === r.address.toLowerCase())).filter((a): a is RobinhoodAsset => !!a);
  const size = parseUnits(Math.max(1, Math.min(usdgAmount, 5_000_000)).toFixed(6), 6);
  return mapLimit(assets, 4, async (asset) => {
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
      hopQuote = { protocol: q.protocol, fee: q.fee, tickSpacing: q.tickSpacing, amountOut: out.toString() };
    }
    const c: CandidateData = { asset, priceUsd, referencePriceUsd: ref, premiumPct, market: dm ? { ...dm.snapshot, momentum: mom } : null, hopCostPct, hopQuote };
    onCandidate?.(c);
    return c;
  });
}
