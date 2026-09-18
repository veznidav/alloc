import { createPublicClient, fallback, getAddress, http, defineChain, type Chain } from "viem";
import { base, mainnet } from "viem/chains";
import type { SourceChain } from "./types";

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" } },
});

export const CHAINS: Record<SourceChain | "robinhood", Chain> = {
  ethereum: mainnet,
  base,
  robinhood: robinhoodChain,
};

export const CHAIN_IDS: Record<SourceChain | "robinhood", number> = { ethereum: 1, base: 8453, robinhood: 4663 };
export const CHAIN_LABELS: Record<SourceChain | "robinhood", string> = { ethereum: "Ethereum", base: "Base", robinhood: "Robinhood Chain" };

export const RPC_URLS: Record<SourceChain | "robinhood", string[]> = {
  ethereum: [process.env.ETH_RPC_URL || "https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  base: [process.env.BASE_RPC_URL || "https://mainnet.base.org", "https://base-rpc.publicnode.com"],
  robinhood: [process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com", "https://robinhood-rpc.publicnode.com", "https://robinhood.rpc.blxrbdn.com"],
};

export const DEXSCREENER_CHAIN: Record<SourceChain | "robinhood", string> = { ethereum: "ethereum", base: "base", robinhood: "robinhood" };

export const NATIVE = "native";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/** USDC per source chain — the stablecoin destination. */
export const USDC: Record<SourceChain, `0x${string}`> = {
  ethereum: getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
  base: getAddress("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"),
};

/** Robinhood Chain core contracts. */
const addr = (a: string) => getAddress(a.toLowerCase());
export const RH = {
  USDG: addr("0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"),
  WETH: addr("0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73"),
  poolManager: addr("0x8366a39CC670B4001A1121B8F6A443A643e40951"),
  quoter: addr("0x8dc178efb8111bb0973dd9d722ebeff267c98f94"),
  universalRouter: addr("0x8876789976DECBFcbBBe364623C63652dB8c0904"),
  permit2: addr("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
  usdgUsdFeed: addr("0x61B7e5650328764B076A108EFF5fa7282a1B9aD2"),
};

export const STABLE_SYMBOLS = new Set(["USDC", "USDT", "DAI", "USDG", "USDBC", "USDE", "USDS", "FRAX", "LUSD", "GHO", "PYUSD", "EURC", "TUSD", "USDP"]);

const clients = new Map<string, ReturnType<typeof createPublicClient>>();
export function publicClient(chain: SourceChain | "robinhood") {
  let c = clients.get(chain);
  if (!c) {
    c = createPublicClient({ chain: CHAINS[chain], transport: fallback(RPC_URLS[chain].map((u) => http(u, { batch: chain !== "robinhood", retryCount: 1, timeout: 12_000 })), { rank: false }) });
    clients.set(chain, c);
  }
  return c;
}

export function explorerTx(chainId: number, hash: string) {
  if (chainId === 1) return `https://etherscan.io/tx/${hash}`;
  if (chainId === 8453) return `https://basescan.org/tx/${hash}`;
  if (chainId === 4663) return `https://robinhoodchain.blockscout.com/tx/${hash}`;
  return `#`;
}
