"use client";
import { PreferencesForm } from "@/components/PreferencesForm";
import { useHydrated } from "@/components/useHydrated";

export default function SettingsPage() {
  const ready = useHydrated();
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-3">Preferences</p>
        <h1 className="mt-1 text-2xl font-bold">How Alloc should treat your capital</h1>
        <p className="mt-2 max-w-[60ch] text-ink-2">These rules apply to every decision, in Playground and Real mode. Changes are saved on this device.</p>
      </div>
      <div className="card p-6 sm:p-8">{ready && <PreferencesForm />}</div>
    </div>
  );
}
