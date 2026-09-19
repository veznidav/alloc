import { cached, fetchJson } from "./cache";
import { DEXSCREENER_CHAIN } from "./chains";
import type { MarketContext, MarketSnapshot, Momentum, SourceChain } from "./types";

interface DexPair {
  chainId: string; dexId: string; pairAddress: string; labels?: string[];
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  priceUsd?: string; priceNative?: string;
  txns?: { h24?: { buys: number; sells: number } };
  volume?: { h24?: number }; priceChange?: { h1?: number; h6?: number; h24?: number };
  liquidity?: { usd?: number }; fdv?: number; marketCap?: number;
  info?: { imageUrl?: string };
}

function toSnapshot(p: DexPair): MarketSnapshot {
  return {
    priceUsd: Number(p.priceUsd ?? 0),
    priceChange: { h1: p.priceChange?.h1 ?? null, h6: p.priceChange?.h6 ?? null, h24: p.priceChange?.h24 ?? null },
    volume24hUsd: p.volume?.h24 ?? null,
    liquidityUsd: p.liquidity?.usd ?? null,
    txns24h: p.txns?.h24 ?? null,
    marketCapUsd: p.marketCap ?? null,
    fdvUsd: p.fdv ?? null,
    dex: p.dexId ?? null,
    pairAddress: p.pairAddress ?? null,
    source: "dexscreener",
  };
}

/** Best (deepest) DexScreener pair for a token on a chain, plus the aggregate across all its pools. */
export async function dexMarket(chain: SourceChain | "robinhood", address: string): Promise<{ snapshot: MarketSnapshot; logo: string | null; symbol: string; name: string } | null> {
  const key = `dex:${chain}:${address.toLowerCase()}`;
  return cached(key, 60_000, async () => {
    const pairs = await fetchJson<DexPair[]>(`https://api.dexscreener.com/token-pairs/v1/${DEXSCREENER_CHAIN[chain]}/${address}`).catch(() => [] as DexPair[]);
    const mine = pairs.filter((p) => p.baseToken.address.toLowerCase() === address.toLowerCase() && Number(p.priceUsd));
    if (!mine.length) return null;
    mine.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const best = mine[0];
    const snap = toSnapshot(best);
    // Aggregate liquidity/volume across pools for a fairer picture of movability.
    snap.liquidityUsd = mine.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0) || snap.liquidityUsd;
    snap.volume24hUsd = mine.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0) || snap.volume24hUsd;
    return { snapshot: snap, logo: best.info?.imageUrl ?? null, symbol: best.baseToken.symbol, name: best.baseToken.name };
  });
}

interface CgSimple { [id: string]: { usd: number; usd_24h_change?: number } }

export async function nativeEthMarket(): Promise<MarketSnapshot> {
  return cached("cg:eth", 60_000, async () => {
    const d = await fetchJson<CgSimple>("https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true", { timeoutMs: 6000 }).catch(() => null);
    if (!d) return ethFromDex();
    const e = d.ethereum as { usd: number; usd_24h_change?: number; usd_24h_vol?: number; usd_market_cap?: number };
    return {
      priceUsd: e.usd,
      priceChange: { h1: null, h6: null, h24: e.usd_24h_change ?? null },
      volume24hUsd: e.usd_24h_vol ?? null,
      liquidityUsd: null,
      txns24h: null,
      marketCapUsd: e.usd_market_cap ?? null,
      fdvUsd: null,
      dex: null,
      pairAddress: null,
      source: "coingecko",
    };
  });
}

/** ETH price from the deepest WETH pool on Base when CoinGecko is unavailable. */
async function ethFromDex(): Promise<MarketSnapshot> {
  const dm = await dexMarket("base", "0x4200000000000000000000000000000000000006");
  if (!dm) throw new Error("ETH price unavailable right now.");
  return { ...dm.snapshot, liquidityUsd: null, marketCapUsd: null, fdvUsd: null, txns24h: null };
}

export async function marketContext(): Promise<MarketContext> {
  return cached("cg:context", 300_000, async () => {
    const [simple, global] = await Promise.all([
      fetchJson<CgSimple>("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin&vs_currencies=usd&include_24hr_change=true", { timeoutMs: 6000 }).catch(() => ({} as CgSimple)),
      fetchJson<{ data?: { market_cap_change_percentage_24h_usd?: number } }>("https://api.coingecko.com/api/v3/global", { timeoutMs: 6000 }).catch(() => ({ data: undefined })),
    ]);
    if (!simple.ethereum) {
      // Fall back to on-chain prices so the context is never empty.
      const [eth, btc] = await Promise.all([dexMarket("base", "0x4200000000000000000000000000000000000006").catch(() => null), dexMarket("base", "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf").catch(() => null)]);
      simple.ethereum = eth ? { usd: eth.snapshot.priceUsd, usd_24h_change: eth.snapshot.priceChange.h24 ?? undefined } : undefined as unknown as CgSimple[string];
      simple.bitcoin = btc ? { usd: btc.snapshot.priceUsd, usd_24h_change: btc.snapshot.priceChange.h24 ?? undefined } : undefined as unknown as CgSimple[string];
    }
    return {
      ethUsd: simple.ethereum?.usd ?? null,
      ethChange24hPct: simple.ethereum?.usd_24h_change ?? null,
      btcUsd: simple.bitcoin?.usd ?? null,
      btcChange24hPct: simple.bitcoin?.usd_24h_change ?? null,
      totalMarketCapChange24hPct: global.data?.market_cap_change_percentage_24h_usd ?? null,
      fetchedAt: new Date().toISOString(),
    };
  });
}

function stats(closes: number[]): Pick<Momentum, "change7dPct" | "change30dPct" | "change90dPct" | "volatility30dPct"> {
  const c = closes.filter((x) => Number.isFinite(x) && x > 0);
  const last = c.at(-1);
  const chg = (n: number) => (last && c.length > n ? ((last - c[c.length - 1 - n]) / c[c.length - 1 - n]) * 100 : null);
  const rets: number[] = [];
  for (let i = Math.max(1, c.length - 30); i < c.length; i++) rets.push(Math.log(c[i] / c[i - 1]));
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  return { change7dPct: chg(5), change30dPct: chg(21), change90dPct: chg(63), volatility30dPct: rets.length > 5 ? sd * Math.sqrt(365) * 100 : null };
}

const GT_NETWORK: Record<SourceChain, string> = { ethereum: "eth", base: "base" };

/** Daily closes for a pool from GeckoTerminal (free, fast, no key). */
async function geckoPoolCloses(network: string, pool: string): Promise<number[] | null> {
  try {
    const j = await fetchJson<{ data: { attributes: { ohlcv_list: [number, number, number, number, number, number][] } } }>(
      `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${pool}/ohlcv/day?aggregate=1&limit=100&currency=usd`, { timeoutMs: 8000 });
    const closes = j.data.attributes.ohlcv_list.map((c) => c[4]).reverse();
    return closes.length >= 8 ? closes : null;
  } catch { return null; }
}

function fromCloses(closes: number[], source: Momentum["source"]): Momentum {
  const high = Math.max(...closes);
  return { ...stats(closes), fromHigh52wPct: high ? ((closes.at(-1)! - high) / high) * 100 : null, source };
}

/** Weekly/monthly momentum and volatility for an ERC-20: GeckoTerminal pool history first, CoinGecko as fallback. */
export async function tokenMomentum(chain: SourceChain, address: string, pairAddress?: string | null): Promise<Momentum | null> {
  return cached(`mom:${chain}:${address.toLowerCase()}`, 15 * 60_000, async () => {
    if (pairAddress) {
      const closes = await geckoPoolCloses(GT_NETWORK[chain], pairAddress);
      if (closes) return fromCloses(closes, "geckoterminal");
    }
    try {
      const platform = chain === "base" ? "base" : "ethereum";
      const j = await fetchJson<{ prices: [number, number][] }>(`https://api.coingecko.com/api/v3/coins/${platform}/contract/${address}/market_chart?vs_currency=usd&days=90&interval=daily`, { timeoutMs: 6000 });
      return fromCloses(j.prices.map((p) => p[1]), "coingecko");
    } catch { return null; }
  });
}

export async function ethMomentum(): Promise<Momentum | null> {
  return cached("mom:eth", 15 * 60_000, async () => {
    try {
      const j = await fetchJson<{ prices: [number, number][] }>("https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=usd&days=90&interval=daily", { timeoutMs: 6000 });
      return fromCloses(j.prices.map((p) => p[1]), "coingecko");
    } catch {
      const dm = await dexMarket("base", "0x4200000000000000000000000000000000000006").catch(() => null);
      const closes = dm?.snapshot.pairAddress ? await geckoPoolCloses("base", dm.snapshot.pairAddress) : null;
      return closes ? fromCloses(closes, "geckoterminal") : null;
    }
  });
}

/** Momentum for the underlying listed stock, from Yahoo Finance's public chart endpoint (best effort). */
export async function stockMomentum(ticker: string): Promise<Momentum | null> {
  return cached(`yf:${ticker}`, 15 * 60_000, async () => {
    try {
      const j = await fetchJson<{ chart: { result: { meta: { fiftyTwoWeekHigh?: number; regularMarketPrice?: number }; indicators: { quote: { close: (number | null)[] }[] } }[] } }>(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=6mo&interval=1d`,
        { timeoutMs: 8000, headers: { "user-agent": "Mozilla/5.0" } },
      );
      const r = j.chart.result[0];
      const closes = r.indicators.quote[0].close.filter((x): x is number => x != null);
      const high = r.meta.fiftyTwoWeekHigh ?? Math.max(...closes);
      const last = r.meta.regularMarketPrice ?? closes.at(-1)!;
      return { ...stats(closes), fromHigh52wPct: high ? ((last - high) / high) * 100 : null, source: "yahoo" as const };
    } catch { return null; }
  });
}
