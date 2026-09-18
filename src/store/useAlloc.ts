"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PREFERENCES, type Decision, type Position, type Preferences } from "@/lib/types";

interface AllocState {
  preferences: Preferences;
  setPreferences: (p: Partial<Preferences>) => void;
  history: Decision[];
  addDecision: (d: Decision) => void;
  updateDecision: (id: string, patch: Partial<Decision>) => void;
  clearHistory: () => void;
  playgroundPosition: Position | null;
  setPlaygroundPosition: (p: Position | null) => void;
  playgroundDecision: Decision | null;
  setPlaygroundDecision: (d: Decision | null) => void;
  realPosition: Position | null;
  setRealPosition: (p: Position | null) => void;
  realDecision: Decision | null;
  setRealDecision: (d: Decision | null) => void;
}

export const useAlloc = create<AllocState>()(
  persist(
    (set) => ({
      preferences: DEFAULT_PREFERENCES,
      setPreferences: (p) => set((s) => ({ preferences: { ...s.preferences, ...p } })),
      history: [],
      addDecision: (d) => set((s) => ({ history: [d, ...s.history].slice(0, 200) })),
      updateDecision: (id, patch) => set((s) => ({
        history: s.history.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        playgroundDecision: s.playgroundDecision?.id === id ? { ...s.playgroundDecision, ...patch } : s.playgroundDecision,
        realDecision: s.realDecision?.id === id ? { ...s.realDecision, ...patch } : s.realDecision,
      })),
      clearHistory: () => set({ history: [] }),
      playgroundPosition: null,
      setPlaygroundPosition: (p) => set({ playgroundPosition: p }),
      playgroundDecision: null,
      setPlaygroundDecision: (d) => set({ playgroundDecision: d }),
      realPosition: null,
      setRealPosition: (p) => set({ realPosition: p }),
      realDecision: null,
      setRealDecision: (d) => set({ realDecision: d }),
    }),
    { name: "alloc-v1", partialize: (s) => ({ preferences: s.preferences, history: s.history, playgroundPosition: s.playgroundPosition, playgroundDecision: s.playgroundDecision }) },
  ),
);
