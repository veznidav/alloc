export const erc20Abi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
] as const;

export const aggregatorV3Abi = [
  { type: "function", name: "latestRoundData", stateMutability: "view", inputs: [], outputs: [
    { type: "uint80", name: "roundId" }, { type: "int256", name: "answer" }, { type: "uint256", name: "startedAt" }, { type: "uint256", name: "updatedAt" }, { type: "uint80", name: "answeredInRound" } ] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const quoterAbi = [
  { type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
    inputs: [{ type: "tuple", name: "params", components: [
      { type: "tuple", name: "poolKey", components: [
        { type: "address", name: "currency0" }, { type: "address", name: "currency1" }, { type: "uint24", name: "fee" }, { type: "int24", name: "tickSpacing" }, { type: "address", name: "hooks" } ] },
      { type: "bool", name: "zeroForOne" }, { type: "uint128", name: "exactAmount" }, { type: "bytes", name: "hookData" } ] }],
    outputs: [{ type: "uint256", name: "amountOut" }, { type: "uint256", name: "gasEstimate" }] },
] as const;

export const permit2Abi = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }, { type: "address" }],
    outputs: [{ type: "uint160", name: "amount" }, { type: "uint48", name: "expiration" }, { type: "uint48", name: "nonce" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address", name: "token" }, { type: "address", name: "spender" }, { type: "uint160", name: "amount" }, { type: "uint48", name: "expiration" }], outputs: [] },
] as const;

export const universalRouterAbi = [
  { type: "function", name: "execute", stateMutability: "payable", inputs: [{ type: "bytes", name: "commands" }, { type: "bytes[]", name: "inputs" }, { type: "uint256", name: "deadline" }], outputs: [] },
] as const;
