import { keyContext, keyRoot, MAJOR_STEPS, scaleSpelling, type Key, type KeyContext } from "./key.ts";
import {
  DEFAULT_SPELLINGS,
  noteName,
  pitchClass,
  spellingName,
  spellingPitchClass,
  spellWithLetter,
  type Spelling,
} from "./notes.ts";

/** A chord tone's role, as labelled on the keyboard. */
export type Degree =
  | "1" | "b9" | "2" | "9" | "#9" | "b3" | "3" | "4" | "11" | "#11"
  | "b5" | "5" | "#5" | "b6" | "6" | "b13" | "13" | "bb7" | "b7" | "7";

const DEGREE_LETTER_STEPS: Record<Degree, number> = {
  "1": 0, b9: 1, "2": 1, "9": 1, "#9": 1, b3: 2, "3": 2, "4": 3, "11": 3, "#11": 3,
  b5: 4, "5": 4, "#5": 4, b6: 5, "6": 5, b13: 5, "13": 5, bb7: 6, b7: 6, "7": 6,
};

export interface IdentifyOptions {
  key?: Key;
}

export interface NoteReading {
  midi: number;
  pitchClass: number;
  name: string;
  degree?: Degree;
}

export interface Alternative {
  symbol: string;
  roman?: string;
}

export interface ChordReading {
  kind: "chord";
  symbol: string;
  root: string;
  bass: string;
  quality: string;
  roman?: string;
  notes: NoteReading[];
  alternatives: Alternative[];
}

export type Reading =
  | { kind: "note"; name: string; notes: NoteReading[] }
  | { kind: "interval"; name: string; semitones: number; notes: NoteReading[] }
  | { kind: "cluster"; notes: NoteReading[] }
  | ChordReading;

type Family = keyof typeof DEFAULT_SPELLINGS;

interface Analysis {
  degrees: Map<number, Degree>;
  quality: string;
  family: Family;
  penalty: number;
  /** Splits ties between readings: altered extensions count most, then the highest extension. */
  complexity: number;
}

const SLASH_PENALTY = 2.5;
const NATURAL_PENALTY = 0.5;
const ALTERED_PENALTY = 1.5;
const CLUSTER_PENALTY = 6;
const ALTERNATIVE_PENALTY = 5;
const ALTERNATIVE_RANGE = 2;

const EXTENSIONS: ReadonlyArray<[interval: number, degree: Degree, natural: boolean]> = [
  [1, "b9", false],
  [2, "9", true],
  [3, "#9", false],
  [5, "11", true],
  [6, "#11", false],
  [8, "b13", false],
  [9, "13", true],
];

/** Reads a set of intervals above a candidate root. A lower penalty is a more natural reading. */
function analyse(intervals: Set<number>, pitchClassCount: number): Analysis | null {
  const has = (i: number) => intervals.has(i);
  const degrees = new Map<number, Degree>([[0, "1"]]);
  if (intervals.size === 2 && has(7)) {
    degrees.set(7, "5");
    return { degrees, quality: "5", family: "major", penalty: 1, complexity: 0 };
  }
  if (has(10) && has(11)) return null;

  let penalty = 0;
  const third = has(4) ? "maj" : has(3) ? "min" : has(5) ? "sus4" : has(2) ? "sus2" : "none";
  const thirdDegree = { maj: [4, "3"], min: [3, "b3"], sus4: [5, "4"], sus2: [2, "2"], none: undefined } as const;
  const thirdTone = thirdDegree[third];
  if (thirdTone) degrees.set(thirdTone[0], thirdTone[1]);
  if (third === "sus4" || third === "sus2") penalty += 2;
  if (third === "none") penalty += 5;

  const lydian = third === "maj" && has(6) && has(11) && !has(7) && !has(8);
  let fifth: "perfect" | "diminished" | "augmented" | "flat" | "none";
  if (has(7)) fifth = "perfect";
  else if (third === "min" && has(6)) fifth = "diminished";
  else if (third === "maj" && has(8)) fifth = "augmented";
  else if (third === "maj" && has(6) && !lydian) fifth = "flat";
  else fifth = "none";
  const fifthTone = { perfect: [7, "5"], diminished: [6, "b5"], augmented: [8, "#5"], flat: [6, "b5"], none: undefined } as const;
  const fifthDegree = fifthTone[fifth];
  if (fifthDegree) degrees.set(fifthDegree[0], fifthDegree[1]);
  penalty += { perfect: 0, diminished: 0, augmented: 0.5, flat: 1.5, none: lydian ? 0 : pitchClassCount <= 3 ? 2.5 : 1 }[fifth];

  const seventh = has(11) ? "major" : has(10) ? "minor" : fifth === "diminished" && has(9) ? "diminished" : "none";
  const seventhTone = { major: [11, "7"], minor: [10, "b7"], diminished: [9, "bb7"], none: undefined } as const;
  const seventhDegree = seventhTone[seventh];
  if (seventhDegree) degrees.set(seventhDegree[0], seventhDegree[1]);

  const sixth = seventh === "none" && has(9);
  if (sixth) {
    degrees.set(9, "6");
    penalty += 0.5;
  }

  const naturals: number[] = [];
  const extensions: string[] = [];
  for (const [interval, degree, natural] of EXTENSIONS) {
    if (!has(interval) || degrees.has(interval)) continue;
    if (interval === 8 && seventh === "none") {
      degrees.set(8, "b6");
      extensions.push("b6");
      penalty += 4;
      continue;
    }
    degrees.set(interval, degree);
    extensions.push(degree);
    if (natural) naturals.push(Number(degree));
    penalty += natural ? NATURAL_PENALTY : ALTERED_PENALTY;
  }
  if ([...intervals].some((i) => !degrees.has(i))) return null;
  if (has(1) && has(2)) penalty += 3;

  const family: Family = third !== "min" ? "major" : fifth === "diminished" ? "diminished" : "minor";
  const quality =
    seventh === "none"
      ? triadQuality(third, fifth, sixth, extensions)
      : seventhQuality(third, fifth, seventh, naturals, extensions);
  const complexity = (extensions.length - naturals.length) * 100 + Math.max(sixth ? 6 : 0, ...naturals);
  return { degrees, quality, family, penalty, complexity };
}

function triadQuality(third: string, fifth: string, sixth: boolean, extensions: string[]): string {
  let base =
    third === "min"
      ? fifth === "diminished" ? "dim" : "m"
      : third === "maj"
        ? fifth === "augmented" ? "aug" : fifth === "flat" ? "(b5)" : ""
        : third === "none" ? "(no3)" : third;
  let adds = [...extensions];
  if (sixth) {
    if (base === "" || base === "m") {
      const nine = adds.indexOf("9");
      base += nine >= 0 ? "6/9" : "6";
      if (nine >= 0) adds.splice(nine, 1);
    } else adds = ["6", ...adds];
  }
  if (adds.length === 0) return base;
  if (base === "" && adds.length === 1) return `add${adds[0]}`;
  return `${base}(add${adds.join(",")})`;
}

function seventhQuality(third: string, fifth: string, seventh: string, naturals: number[], extensions: string[]): string {
  if (seventh === "diminished") return extensions.length ? `dim7(add${extensions.join(",")})` : "dim7";
  const fifthSuffix = fifth === "augmented" ? "#5" : fifth === "flat" ? "b5" : "";
  const thirdSuffix = third === "sus4" || third === "sus2" ? third : third === "none" ? "(no3)" : "";
  let base: string;
  if (seventh === "major") {
    base = third === "min" ? `m(maj7)${fifth === "diminished" ? "b5" : ""}` : `maj7${fifthSuffix}${thirdSuffix}`;
  } else {
    base = third === "min" ? (fifth === "diminished" ? "m7b5" : "m7") : `7${fifthSuffix}${thirdSuffix}`;
  }
  const highest = Math.max(0, ...naturals);
  if (highest) base = base.replace("7", String(highest));
  return base + extensions.filter((e) => !naturals.includes(Number(e))).join("");
}

const INTERVAL_NAMES = [
  "unison", "minor second", "major second", "minor third", "major third", "perfect fourth",
  "tritone", "perfect fifth", "minor sixth", "major sixth", "minor seventh", "major seventh",
] as const;
const INTERVAL_LETTER_STEPS = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"] as const;

const plainSpelling = (pc: number, key: KeyContext | undefined): Spelling =>
  scaleSpelling(key, pc) ?? DEFAULT_SPELLINGS.minor[pc]!;

/** How settled each chord tone sounds in the bass: the third, then the fifth, then the seventh. */
const BASS_RANK: Partial<Record<Degree, number>> = { "3": 0, b3: 0, "5": 1, b5: 1, "#5": 1, "6": 2, bb7: 2, b7: 2, "7": 2 };
const NATURAL_DEGREES: ReadonlySet<Degree> = new Set(["9", "11", "13"]);

/** The bass of a slash chord, in its simplest name unless the key spells it another way. */
function bassName(bass: Spelling, key: KeyContext | undefined): string {
  const name = spellingName(bass);
  const inKey = key?.scale.some((s) => spellingName(s) === name);
  const awkward = Math.abs(bass.accidental) > 1 || ["Cb", "B#", "E#", "Fb"].includes(name);
  return awkward && !inKey ? spellingName(plainSpelling(spellingPitchClass(bass), key)) : name;
}

const reading = (midi: number, s: Spelling, degree?: Degree): NoteReading => ({
  midi,
  pitchClass: pitchClass(midi),
  name: noteName(midi, s),
  ...(degree ? { degree } : {}),
});

function romanNumeral(root: Spelling, rootPc: number, analysis: Analysis, key: KeyContext): string {
  const index = (root.letter - key.tonic.letter + 7) % 7;
  const offset = pitchClass(rootPc - (key.tonicPc + MAJOR_STEPS[index]!) + 6) - 6;
  const accidental = (offset > 0 ? "#" : "b").repeat(Math.abs(offset));
  const numeral = analysis.family === "major" ? NUMERALS[index]! : NUMERALS[index]!.toLowerCase();
  const { quality, family } = analysis;
  const suffix =
    family === "diminished"
      ? quality.replace(/^m(\d+)b5/, "ø$1").replace(/^dim/, "°")
      : family === "minor"
        ? quality.replace(/^m/, "")
        : quality.replace(/^aug/, "+");
  return accidental + numeral + suffix;
}

/**
 * Names what a set of held MIDI notes spells: a single note, an interval, a chord, or a cluster
 * with no sensible chord name. Order and duplicates in the input don't matter.
 */
export function identify(midiNotes: readonly number[], options: IdentifyOptions = {}): Reading | null {
  const midi = [...new Set(midiNotes)].sort((a, b) => a - b);
  if (midi.length === 0) return null;
  const key = options.key ? keyContext(options.key) : undefined;
  const pitchClasses = [...new Set(midi.map(pitchClass))];
  const bassPc = pitchClass(midi[0]!);
  const plain = () => midi.map((m) => reading(m, plainSpelling(pitchClass(m), key)));

  if (pitchClasses.length === 1) {
    return { kind: "note", name: spellingName(plainSpelling(bassPc, key)), notes: plain() };
  }

  if (pitchClasses.length === 2) {
    const upperPc = pitchClasses.find((pc) => pc !== bassPc)!;
    const semitones = pitchClass(upperPc - bassPc);
    if (semitones !== 7) {
      const lower = plainSpelling(bassPc, key);
      const upper = spellWithLetter(lower.letter + INTERVAL_LETTER_STEPS[semitones]!, upperPc);
      const notes = midi.map((m) => reading(m, pitchClass(m) === bassPc ? lower : upper));
      return { kind: "interval", name: INTERVAL_NAMES[semitones]!, semitones, notes };
    }
  }

  const bassDoubled = midi.filter((m) => pitchClass(m) === bassPc).length > 1;
  const candidates = pitchClasses
    .flatMap((rootPc) => {
      const intervals = new Set(pitchClasses.map((pc) => pitchClass(pc - rootPc)));
      const full = analyse(intervals, pitchClasses.length);
      if (!full) return [];
      if (rootPc === bassPc) return [{ rootPc, analysis: full, penalty: full.penalty, complexity: full.complexity, bassRank: -1, bassStep: 0 }];
      const bassStep = pitchClass(bassPc - rootPc);
      const bassDegree = full.degrees.get(bassStep)!;
      const bassRank = BASS_RANK[bassDegree] ?? 3;
      const slash = { rootPc, analysis: full, penalty: full.penalty + SLASH_PENALTY, complexity: full.complexity, bassRank, bassStep };
      if (bassRank < 3 || bassDoubled || pitchClasses.length < 4) return [slash];
      intervals.delete(bassStep);
      const upper = analyse(intervals, pitchClasses.length - 1);
      const bassPenalty = NATURAL_DEGREES.has(bassDegree) ? NATURAL_PENALTY : ALTERED_PENALTY;
      if (!upper || upper.penalty + bassPenalty > full.penalty) return [slash];
      return [{ ...slash, analysis: { ...upper, degrees: full.degrees } }];
    })
    .filter((c) => c.penalty < CLUSTER_PENALTY)
    .sort(
      (a, b) =>
        a.penalty - b.penalty ||
        Number(a.bassRank >= 0) - Number(b.bassRank >= 0) ||
        a.complexity - b.complexity ||
        a.bassRank - b.bassRank ||
        a.bassStep - b.bassStep,
    );
  if (candidates.length === 0) return { kind: "cluster", notes: plain() };

  const bestPenalty = candidates[0]!.penalty;
  const chords = candidates.map(({ rootPc, analysis }): ChordReading => {
    const inKey = key && keyRoot(key, rootPc, analysis.family);
    const root = inKey?.root ?? DEFAULT_SPELLINGS[analysis.family][rootPc]!;
    const notes = midi.map((m) => {
      const degree = analysis.degrees.get(pitchClass(m - rootPc))!;
      return reading(m, spellWithLetter(root.letter + DEGREE_LETTER_STEPS[degree], m), degree);
    });
    const rootName = spellingName(root);
    const bass = rootPc === bassPc ? rootName : bassName(spellWithLetter(root.letter + DEGREE_LETTER_STEPS[notes[0]!.degree!], bassPc), key);
    const chord: ChordReading = {
      kind: "chord",
      symbol: rootName + analysis.quality + (rootPc === bassPc ? "" : `/${bass}`),
      root: rootName,
      bass,
      quality: analysis.quality,
      notes,
      alternatives: [],
    };
    if (key && inKey) chord.roman = romanNumeral(inKey.degree, rootPc, analysis, key);
    return chord;
  });

  const [best, ...others] = chords;
  best!.alternatives = others
    .filter((chord, i) => {
      const penalty = candidates[i + 1]!.penalty;
      const doubleAccidental = /##|bb/.test(chord.notes.map((n) => n.name).join(" "));
      return penalty <= ALTERNATIVE_PENALTY && penalty - bestPenalty <= ALTERNATIVE_RANGE && !doubleAccidental;
    })
    .slice(0, 3)
    .map(({ symbol, roman }) => (roman ? { symbol, roman } : { symbol }));
  return best!;
}
