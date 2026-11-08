import { parseSpelling, spellingPitchClass, spellWithLetter, type Spelling } from "./notes.ts";

export interface Key {
  tonic: string;
  mode: "major" | "minor";
}

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

export interface KeyContext {
  tonic: Spelling;
  tonicPc: number;
  scale: Spelling[];
}

export function keyContext(key: Key): KeyContext {
  const tonic = parseSpelling(key.tonic);
  const tonicPc = spellingPitchClass(tonic);
  const steps = key.mode === "major" ? MAJOR_STEPS : NATURAL_MINOR_STEPS;
  return {
    tonic,
    tonicPc,
    scale: steps.map((step, i) => spellWithLetter(tonic.letter + i, tonicPc + step)),
  };
}

export const scaleSpelling = (key: KeyContext | undefined, pc: number): Spelling | undefined =>
  key?.scale.find((s) => spellingPitchClass(s) === pc);
