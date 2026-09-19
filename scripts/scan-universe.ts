/**
 * Scans Robinhood's public asset registry and records every stock token that has
 * a routable Uniswap v4 pool against USDG on Robinhood Chain, with its fee tier,
 * DexScreener liquidity and Chainlink feed. Output: src/data/robinhood-universe.json
 * Run: npx tsx --tsconfig tsconfig.json scripts/scan-universe.ts
 */
import { writeFileSync } from "node:fs";
import { formatUnits, parseUnits } from "viem";
import { robinhoodUniverse, quoteV4 } from "../src/lib/robinhood";
import { RH } from "../src/lib/chains";
import { mapLimit, fetchJson } from "../src/lib/cache";

interface DexPair { baseToken: { address: string; symbol: string }; quoteToken: { symbol: string }; priceUsd?: string; liquidity?: { usd?: number }; volume?: { h24?: number } }

async function main() {
  const all = await robinhoodUniverse();
  console.log("registry assets:", all.length);
  // DexScreener liquidity in batches of 30
  const liq = new Map<string, { liquidityUsd: number; volume24h: number; priceUsd: number }>();
  for (let i = 0; i < all.length; i += 30) {
    const batch = all.slice(i, i + 30);
    const pairs = await fetchJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/robinhood/${batch.map((a) => a.address).join(",")}`).catch(() => [] as DexPair[]);
    for (const p of pairs) {
      const k = p.baseToken.address.toLowerCase();
      const cur = liq.get(k) ?? { liquidityUsd: 0, volume24h: 0, priceUsd: Number(p.priceUsd ?? 0) };
      cur.liquidityUsd += p.liquidity?.usd ?? 0; cur.volume24h += p.volume?.h24 ?? 0;
      liq.set(k, cur);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  console.log("with dex data:", liq.size);
  const size = parseUnits("1000", 6);
  const out: { symbol: string; name: string; address: string; decimals: number; protocol: "v4" | "v3"; fee: number; tickSpacing: number; liquidityUsd: number; volume24h: number; hopCostPct1k: number; chainlinkFeed: string | null; logoUrl: string | null }[] = [];
  let done = 0;
  await mapLimit(all, 3, async (a) => {
    const q = await quoteV4(RH.USDG, a.address, size);
    done++;
    if (done % 20 === 0) console.log("scanned", done);
    if (!q) return;
    const l = liq.get(a.address.toLowerCase());
    const price = l?.priceUsd ?? 0;
    const outTokens = Number(formatUnits(q.amountOut, a.decimals));
    const hop = price ? Math.max(0, (1 - (outTokens * price) / 1000) * 100) : 99;
    out.push({ symbol: a.symbol, name: a.name, address: a.address, decimals: a.decimals, protocol: q.protocol, fee: q.fee, tickSpacing: q.tickSpacing, liquidityUsd: l?.liquidityUsd ?? 0, volume24h: l?.volume24h ?? 0, hopCostPct1k: hop, chainlinkFeed: a.chainlinkFeed, logoUrl: a.logoUrl });
  });
  out.sort((x, y) => y.liquidityUsd - x.liquidityUsd);
  writeFileSync("src/data/robinhood-universe.json", JSON.stringify({ scannedAt: new Date().toISOString(), assets: out }, null, 2));
  console.log("routable:", out.length);
  for (const o of out) console.log(o.symbol.padEnd(6), o.name.slice(0, 28).padEnd(29), o.protocol, "fee", o.fee, "liq", Math.round(o.liquidityUsd).toLocaleString(), "vol", Math.round(o.volume24h).toLocaleString(), "hop1k", o.hopCostPct1k.toFixed(2), o.chainlinkFeed ? "CL" : "--");
}
main().catch((e) => { console.error(e); process.exit(1); });
