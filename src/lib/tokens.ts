import { formatUnits, getAddress, isAddress } from "viem";
import { erc20Abi } from "./abis";
import { NATIVE, STABLE_SYMBOLS, publicClient, USDC } from "./chains";
import { dexMarket, ethMomentum, nativeEthMarket, tokenMomentum } from "./market";
import { cached } from "./cache";
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
    const [dm, mom] = await Promise.all([dexMarket(input.chain, meta.address), tokenMomentum(input.chain, meta.address)]);
    if (!dm) throw new Error(`No market data found for ${meta.symbol} on this chain. Alloc needs a token with an active on-chain market.`);
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

/** Discover a wallet's holdings on a source chain: native ETH, USDC, and tokens indexed by Blockscout (when reachable). */
export async function walletHoldings(chain: SourceChain, owner: `0x${string}`) {
  const client = publicClient(chain);
  const out: { token: string; symbol: string; name: string; decimals: number; balance: string; logo?: string | null }[] = [];
  const nativeBal = await client.getBalance({ address: owner }).catch(() => 0n);
  if (nativeBal > 0n) out.push({ token: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, balance: formatUnits(nativeBal, 18) });

  const host = chain === "ethereum" ? "https://eth.blockscout.com" : "https://base.blockscout.com";
  type Item = { token: { address_hash?: string; address?: string; symbol: string | null; name: string | null; decimals: string | null; icon_url?: string | null; type: string }; value: string };
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
    const dec = Number(it.token.decimals);
    const bal = Number(formatUnits(BigInt(it.value), dec));
    if (bal <= 0) continue;
    seen.add(addr);
    out.push({ token: getAddress(addr), symbol: it.token.symbol, name: it.token.name ?? it.token.symbol, decimals: dec, balance: String(bal), logo: it.token.icon_url ?? null });
  }
  if (!seen.has(USDC[chain].toLowerCase())) {
    const bal = await client.readContract({ address: USDC[chain], abi: erc20Abi, functionName: "balanceOf", args: [owner] }).catch(() => 0n);
    if (bal > 0n) out.push({ token: USDC[chain], symbol: "USDC", name: "USD Coin", decimals: 6, balance: formatUnits(bal, 6) });
  }
  return out;
}
