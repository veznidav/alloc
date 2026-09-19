import { formatUnits, getAddress, isAddress } from "viem";
import { erc20Abi } from "./abis";
import { NATIVE, STABLE_SYMBOLS, publicClient, USDC } from "./chains";
import { dexMarket, ethMomentum, nativeEthMarket, tokenMomentum } from "./market";
import { cached, mapLimit } from "./cache";
import type { Position, PositionInput, SourceChain } from "./types";

export interface TokenMeta { symbol: string; name: string; decimals: number; address: string }

export async function tokenMeta(chain: SourceChain, token: string): Promise<TokenMeta> {
  if (token === NATIVE || token.toLowerCase() === "eth") return { symbol: "ETH", name: "Ether", decimals: 18, address: NATIVE };
  if (!isAddress(token, { strict: false })) throw new Error("Enter a valid token contract address (0x followed by 40 hex characters) or ETH.");
  const address = getAddress(token.toLowerCase());
  return cached(`meta:${chain}:${address}`, 24 * 3600_000, async () => {
    const client = publicClient(chain);
    const code = await client.getCode({ address }).catch(() => undefined);
    if (!code || code === "0x") throw new Error(`No contract found at ${address} on ${chain === "base" ? "Base" : "Ethereum"}. Check the address and the selected chain.`);
    const [symbol, name, decimals] = await Promise.all([
      client.readContract({ address, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
      client.readContract({ address, abi: erc20Abi, functionName: "name" }).catch(() => null),
      client.readContract({ address, abi: erc20Abi, functionName: "decimals" }).catch(() => null),
    ]);
    if (symbol === null || decimals === null) throw new Error("That address is not an ERC-20 token on this chain.");
    return { symbol: String(symbol), name: String(name ?? symbol), decimals: Number(decimals), address };
  });
}

export async function resolvePosition(input: PositionInput): Promise<Position> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a token amount greater than zero.");
  const meta = await tokenMeta(input.chain, input.token);
  const isNative = meta.address === NATIVE;
  let market, logo: string | null = null;
  if (isNative) {
    const [m, mom] = await Promise.all([nativeEthMarket(), ethMomentum()]);
    market = { ...m, momentum: mom };
  } else {
    const dm = await dexMarket(input.chain, meta.address);
    if (!dm) throw new Error(`No market data found for ${meta.symbol} on this chain. Alloc needs a token with an active on-chain market.`);
    const mom = await tokenMomentum(input.chain, meta.address, dm.snapshot.pairAddress);
    market = { ...dm.snapshot, momentum: mom };
    logo = dm.logo;
  }
  const priceUsd = market.priceUsd;
  return {
    chain: input.chain,
    token: meta.address,
    amount: String(amount),
    symbol: meta.symbol,
    name: meta.name,
    decimals: meta.decimals,
    isStablecoin: STABLE_SYMBOLS.has(meta.symbol.toUpperCase()),
    priceUsd,
    valueUsd: amount * priceUsd,
    market,
    logoUrl: logo,
  };
}

/** Canonical stablecoins per chain. Only these are priced at $1 by address; a token merely named "USDC" is not trusted. */
const CANONICAL_STABLES: Record<SourceChain, Record<string, string>> = {
  ethereum: {
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC",
    "0xdac17f958d2ee523a2206206994597c13d831ec7": "USDT",
    "0x6b175474e89094c44da98b954eedeac495271d0f": "DAI",
  },
  base: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": "USDT",
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "DAI",
    "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "USDbC",
  },
};
const MIN_HOLDING_USD = 1;
const MIN_DEX_LIQUIDITY_USD = 20_000;

/** Discover a wallet's holdings on a source chain: native ETH, USDC, and tokens indexed by Blockscout (when reachable). */
export async function walletHoldings(chain: SourceChain, owner: `0x${string}`) {
  const client = publicClient(chain);
  const out: { token: string; symbol: string; name: string; decimals: number; balance: string; logo?: string | null; explorerRate?: number | null }[] = [];
  const nativeBal = await client.getBalance({ address: owner }).catch(() => 0n);
  if (nativeBal > 0n) out.push({ token: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, balance: formatUnits(nativeBal, 18) });

  const host = chain === "ethereum" ? "https://eth.blockscout.com" : "https://base.blockscout.com";
  type Item = { token: { address_hash?: string; address?: string; symbol: string | null; name: string | null; decimals: string | null; icon_url?: string | null; type: string; exchange_rate?: string | null; reputation?: string | null }; value: string };
  const items = await (async () => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`${host}/api/v2/addresses/${owner}/tokens?type=ERC-20`, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (!res.ok) return [] as Item[];
      const j = (await res.json()) as { items?: Item[] };
      return j.items ?? [];
    } catch { return [] as Item[]; } finally { clearTimeout(t); }
  })();
  const seen = new Set<string>();
  for (const it of items) {
    const addr = (it.token.address_hash ?? it.token.address ?? "").toLowerCase();
    if (!addr || !it.token.symbol || it.token.decimals == null) continue;
    if (it.token.reputation && it.token.reputation !== "ok") continue;
    const dec = Number(it.token.decimals);
    const bal = Number(formatUnits(BigInt(it.value), dec));
    if (bal <= 0 || !Number.isFinite(bal)) continue;
    seen.add(addr);
    out.push({ token: getAddress(addr), symbol: it.token.symbol, name: it.token.name ?? it.token.symbol, decimals: dec, balance: String(bal), logo: it.token.icon_url ?? null, explorerRate: it.token.exchange_rate ? Number(it.token.exchange_rate) : null });
  }
  if (!seen.has(USDC[chain].toLowerCase())) {
    const bal = await client.readContract({ address: USDC[chain], abi: erc20Abi, functionName: "balanceOf", args: [owner] }).catch(() => 0n);
    if (bal > 0n) out.push({ token: USDC[chain], symbol: "USDC", name: "USD Coin", decimals: 6, balance: formatUnits(bal, 6) });
  }
  // Price what we found so the user sees dollar values, not raw balances. Anything without a real market is dropped:
  // wallets collect airdropped scam tokens that borrow names like "USDC", and those must never show a value.
  const priced = await mapLimit(out.slice(0, 40), 4, async (h) => {
    let priceUsd: number | null = null;
    try {
      if (h.token === NATIVE) priceUsd = (await nativeEthMarket()).priceUsd;
      else if (CANONICAL_STABLES[chain][h.token.toLowerCase()]) priceUsd = 1;
      else if (h.explorerRate && h.explorerRate > 0) priceUsd = h.explorerRate;
      else {
        const dm = await dexMarket(chain, h.token);
        priceUsd = dm && (dm.snapshot.liquidityUsd ?? 0) >= MIN_DEX_LIQUIDITY_USD ? dm.snapshot.priceUsd : null;
      }
    } catch { priceUsd = null; }
    const { explorerRate: _rate, ...rest } = h;
    void _rate;
    return { ...rest, priceUsd, valueUsd: priceUsd != null ? priceUsd * Number(h.balance) : null };
  });
  return priced
    .filter((h) => h.valueUsd != null && Number.isFinite(h.valueUsd) && h.valueUsd >= MIN_HOLDING_USD)
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}
