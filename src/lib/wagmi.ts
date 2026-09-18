import { createConfig, http } from "wagmi";
import { base, mainnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { robinhoodChain } from "./chains";

export const wagmiConfig = createConfig({
  chains: [base, mainnet, robinhoodChain],
  connectors: [injected()],
  transports: {
    [base.id]: http("https://mainnet.base.org"),
    [mainnet.id]: http("https://ethereum-rpc.publicnode.com"),
    [robinhoodChain.id]: http("https://rpc.mainnet.chain.robinhood.com"),
  },
  ssr: true,
});
