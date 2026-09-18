"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
/** True once the component renders on the client (after persisted stores can be read). */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
