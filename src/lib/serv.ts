import OpenAI from "openai";

/**
 * SERV Reasoning is the intelligence layer behind every Alloc decision.
 * It is OpenAI-compatible, so the official SDK works with a base URL swap.
 * https://docs.openserv.ai/serv-reasoning/why
 */
export const SERV_BASE_URL = "https://inference-api.openserv.ai/v1";
export const SERV_MODEL = process.env.SERV_MODEL || "gpt-5.4-mini";

let client: OpenAI | null = null;
export function servClient() {
  const apiKey = process.env.SERV_API_KEY;
  if (!apiKey) throw new Error("SERV_API_KEY is not configured.");
  if (!client) client = new OpenAI({ apiKey, baseURL: SERV_BASE_URL });
  return client;
}

/** SERV Tools: named tools SERV intercepts server-side (prompt guard, optional shadow-agent validation). */
export function servTools(): OpenAI.Chat.Completions.ChatCompletionTool[] {
  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    { type: "function", function: { name: "serv_prompt_guard", parameters: { type: "object", properties: {} } } },
  ];
  if (process.env.SERV_SHADOW_AGENT === "1") {
    tools.push({
      type: "function",
      function: {
        name: "serv_shadow_agent",
        parameters: {
          type: "object",
          properties: {
            hint: { type: "string", default: "Check every number quoted in the explanation matches the supplied data, the action respects the user's preferences, and HOLD is chosen when no alternative clears the threshold after costs." },
            max_iterations: { type: "integer", default: 2 },
          },
        },
      },
    });
  }
  return tools;
}

export const DECISION_SCHEMA = {
  name: "alloc_decision",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["HOLD", "MOVE_TO_STABLECOIN", "MOVE_TO_ROBINHOOD"] },
      target_symbol: { type: ["string", "null"], description: "Destination asset symbol. null for HOLD." },
      allocation_pct: { type: "number", description: "Share of the position to move, 0-100. 0 for HOLD. Never above the user's maximum." },
      expected_opportunity_pct: { type: ["number", "null"], description: "Estimated relative advantage of the destination over the current asset, before costs, as a percentage. null for HOLD." },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
      headline: { type: "string", description: "Short imperative title, e.g. 'Hold ABC' or 'Move 20% into NVDA'." },
      summary: { type: "string", description: "Two or three plain sentences a non-technical user understands." },
      reasoning: { type: "array", items: { type: "string" }, description: "3-6 concrete reasoning steps citing the supplied numbers." },
      why_not: {
        type: "array",
        description: "One entry for every alternative that was NOT chosen (including the current asset when moving). Explain why it lost.",
        items: { type: "object", additionalProperties: false, properties: { option: { type: "string" }, reason: { type: "string" } }, required: ["option", "reason"] },
      },
      warnings: { type: "array", items: { type: "string" }, description: "Risks the user should see before approving. Empty if none." },
    },
    required: ["action", "target_symbol", "allocation_pct", "expected_opportunity_pct", "confidence", "headline", "summary", "reasoning", "why_not", "warnings"],
  },
} as const;

export type ServDecision = {
  action: "HOLD" | "MOVE_TO_STABLECOIN" | "MOVE_TO_ROBINHOOD";
  target_symbol: string | null;
  allocation_pct: number;
  expected_opportunity_pct: number | null;
  confidence: "low" | "medium" | "high";
  headline: string;
  summary: string;
  reasoning: string[];
  why_not: { option: string; reason: string }[];
  warnings: string[];
};

export async function reasonDecision(system: string, user: string): Promise<{ decision: ServDecision; model: string }> {
  const res = await servClient().chat.completions.create({
    model: SERV_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: servTools(),
    response_format: { type: "json_schema", json_schema: DECISION_SCHEMA },
    temperature: 0.2,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("SERV returned no decision.");
  let parsed: ServDecision;
  try { parsed = JSON.parse(content) as ServDecision; } catch { throw new Error("SERV returned a non-JSON decision."); }
  return { decision: parsed, model: res.model || SERV_MODEL };
}
