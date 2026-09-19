import { getAddress } from "viem";
import { cached, fetchJson, mapLimit } from "./cache";
import { dexMarket } from "./market";
import { robinhoodUniverse } from "./robinhood";
import type { MarketSnapshot, Momentum } from "./types";

/**
 * Meme tokens on Robinhood Chain, discovered live from the most active pools.
 * Safety floors keep day-old launches and thin pools out: this is a degen option, not a rug lottery.
 */
export interface MemeToken {
  symbol: string; name: string; address: `0x${string}`; decimals: number;
  liquidityUsd: number; volume24hUsd: number; fdvUsd: number | null; ageDays: number; bestPool: string; bestPoolIsV4: boolean;
}

const MAJORS = new Set(["usdg", "weth", "eth", "usdc", "usde", "usdt", "wbtc", "cbbtc", "lbtc", "weeth", "wsteth", "susde", "syrupusdg", "syrupusdc", "sgov", "usds", "eurc", "link", "ena", "usdb", "atc"]);
const MIN_LIQUIDITY_USD = 200_000;
const MIN_AGE_DAYS = 3;
const MAX_MEMES = 8;

interface GtPool { id: string; attributes: { name: string; address: string; reserve_in_usd: string; volume_usd: { h24: string }; fdv_usd: string | null; pool_created_at: string }; relationships: { base_token: { data: { id: string } }; quote_token: { data: { id: string } }; dex: { data: { id: string } } } }
interface GtToken { id: string; attributes: { address: string; symbol: string; name: string; decimals: number } }

export async function discoverMemes(): Promise<MemeToken[]> {
  return cached("rh:memes", 10 * 60_000, async () => {
    const [universe, ...pages] = await Promise.all([
      robinhoodUniverse(),
      ...[1, 2, 3].map((pg) => fetchJson<{ data: GtPool[]; included?: GtToken[] }>(`https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=${pg}&sort=h24_volume_usd_desc&include=base_token,quote_token`, { timeoutMs: 8000 }).catch(() => ({ data: [] as GtPool[], included: [] as GtToken[] }))),
    ]);
    const stock = new Set(universe.map((a) => a.address.toLowerCase()));
    const byToken = new Map<string, MemeToken>();
    const now = Date.now();
    for (const page of pages) {
      const tokens = new Map((page.included ?? []).map((t) => [t.id, t.attributes]));
      for (const p of page.data) {
        const base = tokens.get(p.relationships.base_token.data.id);
        if (!base?.address) continue;
        const addr = base.address.toLowerCase();
        if (stock.has(addr) || MAJORS.has(base.symbol.toLowerCase())) continue;
        const liq = Number(p.attributes.reserve_in_usd) || 0;
        const vol = Number(p.attributes.volume_usd?.h24) || 0;
        const ageDays = p.attributes.pool_created_at ? (now - Date.parse(p.attributes.pool_created_at)) / 86_400_000 : 0;
        const cur = byToken.get(addr);
        if (!cur) {
          byToken.set(addr, { symbol: base.symbol, name: base.name, address: getAddress(addr), decimals: base.decimals ?? 18, liquidityUsd: liq, volume24hUsd: vol, fdvUsd: p.attributes.fdv_usd ? Number(p.attributes.fdv_usd) : null, ageDays, bestPool: p.attributes.address, bestPoolIsV4: p.attributes.address.length > 42 });
        } else {
          cur.volume24hUsd += vol;
          cur.ageDays = Math.max(cur.ageDays, ageDays);
          if (liq > cur.liquidityUsd) { cur.liquidityUsd = liq; cur.bestPool = p.attributes.address; cur.bestPoolIsV4 = p.attributes.address.length > 42; }
        }
      }
    }
    return [...byToken.values()]
      .filter((m) => m.liquidityUsd >= MIN_LIQUIDITY_USD && m.ageDays >= MIN_AGE_DAYS && /^[A-Za-z0-9_.]{2,12}$/.test(m.symbol))
      .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
      .slice(0, MAX_MEMES);
  });
}

/** Daily-close momentum for a meme from its deepest v2/v3 pool (v4 pool ids are not served by GeckoTerminal's OHLCV). */
export async function memeMomentum(m: MemeToken): Promise<Momentum | null> {
  return cached(`mom:rh:${m.address.toLowerCase()}`, 15 * 60_000, async () => {
    try {
      const dm = await dexMarket("robinhood", m.address);
      const pools = [m.bestPool, dm?.snapshot.pairAddress].filter((x): x is string => !!x && x.length === 42);
      for (const pool of pools) {
        const j = await fetchJson<{ data: { attributes: { ohlcv_list: number[][] } } }>(`https://api.geckoterminal.com/api/v2/networks/robinhood/pools/${pool}/ohlcv/day?aggregate=1&limit=100&currency=usd`, { timeoutMs: 8000 }).catch(() => null);
        const closes = j?.data.attributes.ohlcv_list.map((c) => c[4]).reverse().filter((x) => x > 0) ?? [];
        if (closes.length >= 4) {
          const last = closes.at(-1)!;
          const chg = (n: number) => (closes.length > n ? ((last - closes[closes.length - 1 - n]) / closes[closes.length - 1 - n]) * 100 : null);
          const rets: number[] = [];
          for (let i = Math.max(1, closes.length - 30); i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
          const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
          const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
          const high = Math.max(...closes);
          return { change7dPct: chg(5), change30dPct: chg(21), change90dPct: chg(63), volatility30dPct: rets.length > 3 ? sd * Math.sqrt(365) * 100 : null, fromHigh52wPct: high ? ((last - high) / high) * 100 : null, source: "geckoterminal" as const };
        }
      }
      return null;
    } catch { return null; }
  });
}

export interface MemeData { meme: MemeToken; market: MarketSnapshot | null }

export async function memeData(onOne?: (d: MemeData) => void): Promise<MemeData[]> {
  const memes = await discoverMemes();
  return mapLimit(memes, 3, async (meme) => {
    const [dm, mom] = await Promise.all([dexMarket("robinhood", meme.address), memeMomentum(meme)]);
    const d: MemeData = { meme, market: dm ? { ...dm.snapshot, momentum: mom } : null };
    onOne?.(d);
    return d;
  });
}
