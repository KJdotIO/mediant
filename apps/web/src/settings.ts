import type { Key } from "@mediant/theory";
import { useCallback, useState } from "react";

export interface Settings {
  holdLastChord: boolean;
  keyLabels: "intervals" | "notes";
  middleC: "C3" | "C4";
  key: string;
}

const STORAGE_KEY = "mediant.settings";
const DEFAULTS: Settings = { holdLastChord: true, keyLabels: "intervals", middleC: "C4", key: "" };

const MAJOR_TONICS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONICS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Key choices as stored values, such as "Eb major", grouped for the key picker. */
export const KEY_OPTIONS = {
  major: MAJOR_TONICS.map((tonic) => `${tonic} major`),
  minor: MINOR_TONICS.map((tonic) => `${tonic} minor`),
};

export function parseKey(value: string): Key | undefined {
  const [tonic, mode] = value.split(" ");
  return tonic && (mode === "major" || mode === "minor") ? { tonic, mode } : undefined;
}

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
