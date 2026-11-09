import type { Key } from "@mediant/theory";
import { useCallback, useState } from "react";
import type { SoundId } from "./audio/piano.ts";

export interface Settings {
  holdLastChord: boolean;
  keyLabels: "intervals" | "notes";
  middleC: "C3" | "C4";
  key: string;
  sound: SoundId | "";
  volume: number;
  bpm: number;
  beats: number;
  clickVolume: number;
  /** Seconds of silence kept before the first note and after the last sound of a take. */
  leadIn: number;
  tail: number;
  videoMark: boolean;
  /** The audio input recorded with each take, such as BlackHole, or "" for notes only. */
  audioInput: string;
  audioLabel: string;
}

const STORAGE_KEY = "mediant.settings";
const DEFAULTS: Settings = {
  holdLastChord: false,
  keyLabels: "intervals",
  middleC: "C4",
  key: "",
  sound: "",
  volume: 0.8,
  bpm: 100,
  beats: 4,
  clickVolume: 0.6,
  leadIn: 1,
  tail: 2,
  videoMark: true,
  audioInput: "",
  audioLabel: "",
};

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
