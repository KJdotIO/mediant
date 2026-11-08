import { useCallback, useState } from "react";

export interface Settings {
  holdLastChord: boolean;
  keyLabels: "intervals" | "notes";
}

const STORAGE_KEY = "mediant.settings";
const DEFAULTS: Settings = { holdLastChord: true, keyLabels: "intervals" };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") };
  } catch {
    return DEFAULTS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);
  return [settings, update] as const;
}
