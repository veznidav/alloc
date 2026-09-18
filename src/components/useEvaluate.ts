"use client";
import { useCallback, useRef, useState } from "react";
import type { Decision, Position, PositionInput, Preferences } from "@/lib/types";

export type Stage = "idle" | "position" | "market" | "reasoning" | "done" | "error";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as T;
}

export function useEvaluate(mode: "playground" | "real") {
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const evaluate = useCallback(async (position: PositionInput, preferences: Preferences) => {
    setError(null);
    setStage("market");
    timer.current = setTimeout(() => setStage("reasoning"), 6000);
    try {
      const { decision } = await post<{ decision: Decision }>("/api/evaluate", { position, preferences, mode });
      setStage("done");
      return decision;
    } catch (e) {
      setError((e as Error).message);
      setStage("error");
      return null;
    } finally {
      if (timer.current) clearTimeout(timer.current);
    }
  }, [mode]);

  return { stage, error, resolve, evaluate, reset: () => { setStage("idle"); setError(null); } };
}

export { post };
