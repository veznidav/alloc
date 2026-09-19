"use client";
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AllocEvent, Decision, Position, PositionInput, Preferences } from "@/lib/types";

export type Stage = "idle" | "position" | "market" | "routes" | "reasoning" | "done" | "error";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}

export function useEvaluate(mode: "playground" | "real") {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<AllocEvent[]>([]);
  const [livePosition, setLivePosition] = useState<Position | null>(null);
  const qc = useQueryClient();

  const resolve = useCallback(async (input: PositionInput) => {
    setError(null);
    setStage("position");
    try {
      const { position } = await post<{ position: Position }>("/api/position", input);
      setStage("idle");
      return position;
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      return null;
    }
  }, []);

  /** Streams the agent's work; resolves with the decision (or null on error). */
  const evaluate = useCallback(async (position: PositionInput, preferences: Preferences): Promise<{ decision: Decision; position: Position } | null> => {
    setError(null); setFeed([]); setLivePosition(null); setStage("position");
    try {
      const res = await fetch("/api/evaluate/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ position, preferences, mode }) });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).error || "Evaluation failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let decision: Decision | null = null;
      let pos: Position | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as AllocEvent;
          if (ev.type === "stage") setStage(ev.stage);
          else if (ev.type === "position") { pos = ev.position; setLivePosition(ev.position); }
          else if (ev.type === "decision") decision = ev.decision;
          else if (ev.type === "error") throw new Error(ev.message);
          else setFeed((f) => [...f, ev]);
        }
      }
      if (!decision || !pos) throw new Error("Alloc did not return a decision. Try again.");
      setStage("done");
      return { decision, position: pos };
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      return null;
    } finally {
      qc.invalidateQueries({ queryKey: ["quota"] });
    }
  }, [mode, qc]);

  return { stage, error, feed, livePosition, resolve, evaluate, reset: () => { setStage("idle"); setError(null); setFeed([]); setLivePosition(null); } };
}

export { post };
