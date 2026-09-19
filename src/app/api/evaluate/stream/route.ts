import { evaluatePosition } from "@/lib/evaluate";
import { resolvePosition } from "@/lib/tokens";
import { DEFAULT_PREFERENCES, type AllocEvent, type PositionInput, type Preferences } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Streams Alloc's work as server-sent events, then the decision. */
export async function POST(req: Request) {
  const body = (await req.json()) as { position: PositionInput; preferences?: Partial<Preferences>; mode?: "playground" | "real" };
  const prefs: Preferences = { ...DEFAULT_PREFERENCES, ...(body.preferences || {}) };
  prefs.maxAllocationPct = Math.min(100, Math.max(1, Number(prefs.maxAllocationPct) || 20));
  prefs.minOpportunityPct = Math.max(0, Number(prefs.minOpportunityPct) || 0);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AllocEvent) => { try { controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
      const keepalive = setInterval(() => { try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { /* closed */ } }, 10_000);
      try {
        emit({ type: "stage", stage: "position" });
        const position = await resolvePosition({ chain: body.position.chain, token: body.position.token, amount: body.position.amount });
        emit({ type: "position", position });
        const decision = await evaluatePosition(position, prefs, body.mode === "real" ? "real" : "playground", emit);
        emit({ type: "decision", decision });
        emit({ type: "stage", stage: "done" });
      } catch (e) {
        emit({ type: "error", message: (e as Error).message });
      } finally {
        clearInterval(keepalive);
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
}
