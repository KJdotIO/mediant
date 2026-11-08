export const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11] as const;

/** A written note without an octave: a letter index (0 is C) and an accidental in semitones. */
export interface Spelling {
  letter: number;
  accidental: number;
}

export const pitchClass = (n: number): number => ((n % 12) + 12) % 12;

const naturalOf = (letter: number): number => NATURAL_PITCH_CLASSES[((letter % 7) + 7) % 7]!;

/** Spells a pitch class with a given letter, for example pitch class 3 with letter D gives D#. */
export function spellWithLetter(letter: number, pc: number): Spelling {
  const wrapped = ((letter % 7) + 7) % 7;
  return { letter: wrapped, accidental: pitchClass(pc - naturalOf(wrapped) + 6) - 6 };
}

export const spellingPitchClass = (s: Spelling): number => pitchClass(naturalOf(s.letter) + s.accidental);

export function spellingName(s: Spelling): string {
  const sign = s.accidental > 0 ? "#" : "b";
  return LETTERS[s.letter] + sign.repeat(Math.abs(s.accidental));
}

/** Names a MIDI note with a spelling and an octave. B#3 and C4 are the same key. */
export function noteName(midi: number, s: Spelling): string {
  return `${spellingName(s)}${Math.floor((midi - s.accidental) / 12) - 1}`;
}

const SPELLING_PATTERN = /^([A-G])(#{1,2}|b{1,2})?$/;
const NOTE_PATTERN = /^([A-G](?:#{1,2}|b{1,2})?)(-?\d+)$/;

export function parseSpelling(name: string): Spelling {
  const match = SPELLING_PATTERN.exec(name);
  if (!match) throw new Error(`Can't read the note name "${name}".`);
  const accidentals = match[2] ?? "";
  return {
    letter: LETTERS.indexOf(match[1] as (typeof LETTERS)[number]),
    accidental: accidentals.startsWith("#") ? accidentals.length : -accidentals.length,
  };
}

/** Converts a note name such as "C#4" to a MIDI note number. Middle C is C4, 60. */
export function parseNote(name: string): number {
  const match = NOTE_PATTERN.exec(name);
  if (!match) throw new Error(`Can't read the note "${name}".`);
  const s = parseSpelling(match[1]!);
  return (Number(match[2]) + 1) * 12 + naturalOf(s.letter) + s.accidental;
}

const table = (names: string): Spelling[] => names.split(" ").map(parseSpelling);

/** Root spellings used when no key is set, chosen per chord family. */
export const DEFAULT_SPELLINGS = {
  major: table("C Db D Eb E F F# G Ab A Bb B"),
  minor: table("C C# D Eb E F F# G G# A Bb B"),
  diminished: table("C C# D D# E F F# G G# A A# B"),
} as const;

/** Replaces # and b with the sharp and flat signs for display. */
export const formatSymbol = (symbol: string): string => symbol.replaceAll("#", "♯").replaceAll("b", "♭");
