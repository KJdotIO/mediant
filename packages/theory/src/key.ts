import { parseSpelling, pitchClass, spellingName, spellingPitchClass, spellWithLetter, type Spelling } from "./notes.ts";

export interface Key {
  tonic: string;
  mode: "major" | "minor";
}

export const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const NATURAL_MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

export interface KeyContext {
  tonic: Spelling;
  tonicPc: number;
  mode: Key["mode"];
  scale: Spelling[];
}

export function keyContext(key: Key): KeyContext {
  const tonic = parseSpelling(key.tonic);
  const tonicPc = spellingPitchClass(tonic);
  const steps = key.mode === "major" ? MAJOR_STEPS : NATURAL_MINOR_STEPS;
  return {
    tonic,
    tonicPc,
    mode: key.mode,
    scale: steps.map((step, i) => spellWithLetter(tonic.letter + i, tonicPc + step)),
  };
}

export const scaleSpelling = (key: KeyContext | undefined, pc: number): Spelling | undefined =>
  key?.scale.find((s) => spellingPitchClass(s) === pc);

/** Semitones above the tonic where a borrowed chord sits on a lowered scale note, such as bII or bVI. */
const LOWERED_STEPS = { major: new Set([1, 3, 8, 10]), minor: new Set([1]) };

/** Sharps and flats in the triad on a root: fewer is easier to read. */
function triadAccidentals(root: Spelling, pc: number, minor: boolean): number {
  const third = spellWithLetter(root.letter + 2, pc + (minor ? 3 : 4));
  const fifth = spellWithLetter(root.letter + 4, pc + 7);
  return Math.abs(root.accidental) + Math.abs(third.accidental) + Math.abs(fifth.accidental);
}

/**
 * Spells a chord root in a key. A root outside the scale is a raised or a lowered scale note.
 * `degree` is the spelling for the Roman numeral: raised for diminished chords and the raised
 * notes of a minor key, lowered for borrowed chords such as bII and bVI. `root` is the name
 * to show: the same, unless the other spelling is plainly easier to read.
 */
export function keyRoot(
  key: KeyContext,
  pc: number,
  family: "major" | "minor" | "diminished",
): { root: Spelling; degree: Spelling } {
  const inScale = scaleSpelling(key, pc);
  if (inScale) return { root: inScale, degree: inScale };
  const raised = spellWithLetter(scaleSpelling(key, pitchClass(pc - 1))!.letter, pc);
  const lowered = spellWithLetter(scaleSpelling(key, pitchClass(pc + 1))!.letter, pc);
  if (family === "diminished") return { root: Math.abs(raised.accidental) > 1 ? lowered : raised, degree: raised };
  const step = pitchClass(pc - key.tonicPc);
  const [first, second] = LOWERED_STEPS[key.mode].has(step) ? [lowered, raised] : [raised, lowered];
  const cost = (root: Spelling) => triadAccidentals(root, pc, family === "minor");
  const root = cost(second) < cost(first) ? second : first;
  return { root, degree: step === 6 ? root : first };
}

/** The seven notes of a key, spelled for that key, with their pitch classes. E major gives G#, not Ab. */
export const scaleNotes = (key: Key): Array<{ name: string; pitchClass: number }> =>
  keyContext(key).scale.map((s) => ({ name: spellingName(s), pitchClass: spellingPitchClass(s) }));
