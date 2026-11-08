import { describe, expect, it } from "vitest";
import { formatSymbol, identify, parseNote, scaleNotes, type IdentifyOptions, type Reading } from "../src/index.ts";

describe("scaleNotes", () => {
  it.each([
    ["E", "major", "E F# G# A B C# D#"],
    ["Db", "major", "Db Eb F Gb Ab Bb C"],
    ["C#", "minor", "C# D# E F# G# A B"],
    ["F", "minor", "F G Ab Bb C Db Eb"],
  ] as const)("spells %s %s as %s", (tonic, mode, names) => {
    expect(scaleNotes({ tonic, mode }).map((n) => n.name).join(" ")).toBe(names);
  });
});

const play = (notes: string, options?: IdentifyOptions): Reading | null =>
  identify(notes.split(" ").map(parseNote), options);

const symbolOf = (notes: string, options?: IdentifyOptions): string | undefined => {
  const reading = play(notes, options);
  return reading?.kind === "chord" ? reading.symbol : undefined;
};

describe("chord names, root in the bass", () => {
  it.each([
    ["C4 E4 G4", "C"],
    ["C4 Eb4 G4", "Cm"],
    ["C4 Eb4 Gb4", "Cdim"],
    ["C4 E4 G#4", "Caug"],
    ["C4 D4 G4", "Csus2"],
    ["C4 F4 G4", "Csus4"],
    ["C3 G3", "C5"],
    ["C4 E4 G4 A4", "C6"],
    ["C4 Eb4 G4 A4", "Cm6"],
    ["C4 E4 G4 A4 D5", "C6/9"],
    ["C4 E4 G4 D5", "Cadd9"],
    ["C4 Eb4 G4 D5", "Cm(add9)"],
    ["C4 E4 G4 F5", "Cadd11"],
    ["C4 E4 G4 B4", "Cmaj7"],
    ["C4 E4 G4 Bb4", "C7"],
    ["C4 Eb4 G4 Bb4", "Cm7"],
    ["C4 Eb4 G4 B4", "Cm(maj7)"],
    ["C4 Eb4 Gb4 Bb4", "Cm7b5"],
    ["C4 Eb4 Gb4 A4", "Cdim7"],
    ["C4 F4 G4 Bb4", "C7sus4"],
    ["C4 E4 G#4 Bb4", "C7#5"],
    ["C4 E4 Gb4 Bb4", "C7b5"],
    ["C4 E4 G#4 B4", "Cmaj7#5"],
    ["C4 E4 G4 B4 D5", "Cmaj9"],
    ["C4 E4 G4 Bb4 D5", "C9"],
    ["C4 Eb4 G4 Bb4 D5", "Cm9"],
    ["C4 F4 G4 Bb4 D5", "C9sus4"],
    ["C4 Eb4 G4 Bb4 D5 F5", "Cm11"],
    ["C4 E4 G4 Bb4 D5 A5", "C13"],
    ["C4 E4 G4 B4 D5 A5", "Cmaj13"],
    ["C4 Eb4 G4 Bb4 D5 F5 A5", "Cm13"],
    ["C4 E4 G4 Bb4 Db5", "C7b9"],
    ["C4 E4 G4 Bb4 D#5", "C7#9"],
    ["C4 E4 G4 Bb4 F#5", "C7#11"],
    ["C4 E4 G4 Bb4 Ab5", "C7b13"],
    ["C4 E4 G4 B4 F#5", "Cmaj7#11"],
    ["C4 E4 G4 B4 D5 F#5", "Cmaj9#11"],
    ["G3 B3 D4 F4", "G7"],
    ["F3 A3 C4 E4", "Fmaj7"],
    ["B3 D4 F4 A4", "Bm7b5"],
    ["A3 C4 E4 G4", "Am7"],
    ["D3 F3 A3 C4", "Dm7"],
  ])("%s is %s", (notes, symbol) => {
    expect(symbolOf(notes)).toBe(symbol);
  });
});

describe("open, shell and doubled voicings", () => {
  it.each([
    ["C2 C3 E3 G3 C4 E4", "C"],
    ["C3 G3 E4", "C"],
    ["C3 E3 Bb3", "C7"],
    ["C3 Bb3 E4", "C7"],
    ["C3 E3 B3", "Cmaj7"],
    ["C3 Eb3 Bb3", "Cm7"],
    ["G2 F3 B3", "G7"],
    ["C3 Bb3 E4 A4", "C13"],
    ["C3 Bb3 D4 E4", "C9"],
    ["D3 C4 F4 E5", "Dm9"],
    ["E3 G3 B3 D4", "Em7"],
  ])("%s is %s", (notes, symbol) => {
    expect(symbolOf(notes)).toBe(symbol);
  });
});

describe("inversions and slash chords", () => {
  it.each([
    ["E3 G3 C4", "C/E"],
    ["G3 C4 E4", "C/G"],
    ["A3 C4 F4", "F/A"],
    ["E3 G3 B3 C4", "Cmaj7/E"],
    ["Bb2 C3 E3 G3", "C7/Bb"],
    ["B2 D3 F3 G3", "G7/B"],
    ["F2 G3 B3 D4", "G7/F"],
    ["C3 D3 F3 A3", "Dm7/C"],
    ["Eb3 G3 C4", "Cm/Eb"],
    ["Eb3 Gb3 C4", "Cdim/Eb"],
  ])("%s is %s", (notes, symbol) => {
    expect(symbolOf(notes)).toBe(symbol);
  });
});

describe("ambiguous sets follow the bass", () => {
  it.each([
    ["C4 E4 G4 A4", "C6"],
    ["A3 C4 E4 G4", "Am7"],
    ["Eb3 Gb3 Bb3 C4", "Ebm6"],
    ["C3 Eb3 Gb3 Bb3", "Cm7b5"],
    ["Eb3 G3 Bb3 C4", "Eb6"],
  ])("%s is %s", (notes, symbol) => {
    expect(symbolOf(notes)).toBe(symbol);
  });

  it("offers the other reading as an alternative", () => {
    const reading = play("C4 E4 G4 A4");
    expect(reading?.kind === "chord" && reading.alternatives.map((a) => a.symbol)).toContain("Am7/C");
  });
});

describe("spelling", () => {
  const spelt = (notes: string, options?: IdentifyOptions) =>
    play(notes, options)?.notes.map((n) => `${n.name}:${n.degree ?? "-"}`).join(" ");

  it.each([
    ["E4 G#4 B4", "E", "E4:1 G#4:3 B4:5"],
    ["Ab3 C4 Eb4", "Ab", "Ab3:1 C4:3 Eb4:5"],
    ["G#3 B3 D#4", "G#m", "G#3:1 B3:b3 D#4:5"],
    ["Eb3 Gb3 Bb3", "Ebm", "Eb3:1 Gb3:b3 Bb3:5"],
    ["C#4 E4 G4", "C#dim", "C#4:1 E4:b3 G4:b5"],
    ["F#3 A#3 C#4", "F#", "F#3:1 A#3:3 C#4:5"],
    ["F3 Ab3 B3 Eb4", "Fm7b5", "F3:1 Ab3:b3 Cb4:b5 Eb4:b7"],
    ["C4 E4 G4 Bb4 D#5", "C7#9", "C4:1 E4:3 G4:5 Bb4:b7 D#5:#9"],
    ["C4 E4 G4 Bb4 Db5", "C7b9", "C4:1 E4:3 G4:5 Bb4:b7 Db5:b9"],
    ["C4 E4 Gb4 Bb4", "C7b5", "C4:1 E4:3 Gb4:b5 Bb4:b7"],
    ["C4 E4 G4 B4 F#5", "Cmaj7#11", "C4:1 E4:3 G4:5 B4:7 F#5:#11"],
    ["C4 Eb4 Gb4 A4", "Cdim7", "C4:1 Eb4:b3 Gb4:b5 Bbb4:bb7"],
    ["C4 F4 G4", "Csus4", "C4:1 F4:4 G4:5"],
    ["C4 D4 G4", "Csus2", "C4:1 D4:2 G4:5"],
  ])("%s is %s, spelt %s", (notes, symbol, spelling) => {
    expect(symbolOf(notes)).toBe(symbol);
    expect(spelt(notes)).toBe(spelling);
  });

  it("keeps the octave of B# on the right side of C", () => {
    const key: IdentifyOptions = { key: { tonic: "C#", mode: "major" } };
    expect(symbolOf("G#3 C4 D#4", key)).toBe("G#");
    expect(spelt("G#3 C4 D#4", key)).toBe("G#3:1 B#3:3 D#4:5");
  });

  it("spells roots from the key when the key is set", () => {
    expect(symbolOf("F#3 A#3 C#4", { key: { tonic: "Db", mode: "major" } })).toBe("Gb");
    expect(symbolOf("G#3 B3 D#4", { key: { tonic: "E", mode: "major" } })).toBe("G#m");
    expect(symbolOf("Eb3 G3 Bb3", { key: { tonic: "C", mode: "minor" } })).toBe("Eb");
  });
});

describe("Roman numerals", () => {
  const roman = (notes: string, tonic: string, mode: "major" | "minor") => {
    const reading = play(notes, { key: { tonic, mode } });
    return reading?.kind === "chord" ? reading.roman : undefined;
  };

  it.each([
    ["C4 E4 G4 B4", "Imaj7"],
    ["D4 F4 A4 C5", "ii7"],
    ["E4 G4 B4", "iii"],
    ["F4 A4 C5", "IV"],
    ["G3 B3 D4 F4", "V7"],
    ["A3 C4 E4", "vi"],
    ["B3 D4 F4 A4", "viiø7"],
    ["B3 D4 F4", "vii°"],
    ["Bb3 D4 F4", "bVII"],
    ["Ab3 C4 Eb4", "bVI"],
    ["F4 Ab4 C5", "iv"],
    ["E3 G#3 B3 D4", "III7"],
    ["E3 G3 C4", "I"],
  ])("in C major, %s is %s", (notes, numeral) => {
    expect(roman(notes, "C", "major")).toBe(numeral);
  });

  it.each([
    ["A3 C4 E4", "i"],
    ["C4 E4 G4", "bIII"],
    ["E3 G#3 B3 D4", "V7"],
    ["F3 A3 C4", "bVI"],
    ["G3 B3 D4", "bVII"],
    ["B3 D4 F4 A4", "iiø7"],
    ["G#3 B3 D4 F4", "vii°7"],
  ])("in A minor, %s is %s", (notes, numeral) => {
    expect(roman(notes, "A", "minor")).toBe(numeral);
  });

  it("leaves the numeral out when no key is set", () => {
    const reading = play("C4 E4 G4");
    expect(reading?.kind === "chord" && reading.roman).toBeUndefined();
  });
});

describe("fewer than three notes", () => {
  it("returns null for no notes", () => {
    expect(identify([])).toBeNull();
  });

  it("names a single note", () => {
    expect(play("C#4")).toMatchObject({ kind: "note", name: "C#" });
  });

  it("names the same note in two octaves as a single note", () => {
    expect(play("C3 C4")).toMatchObject({ kind: "note", name: "C" });
  });

  it.each([
    ["C4 E4", "major third", "C4 E4"],
    ["C4 Eb4", "minor third", "C4 Eb4"],
    ["C4 F#4", "tritone", "C4 F#4"],
    ["D4 C5", "minor seventh", "D4 C5"],
    ["E4 C5", "minor sixth", "E4 C5"],
  ])("names %s as a %s", (notes, name, spelling) => {
    const reading = play(notes);
    expect(reading).toMatchObject({ kind: "interval", name });
    expect(reading?.notes.map((n) => n.name).join(" ")).toBe(spelling);
  });
});

describe("clusters", () => {
  it.each(["C4 Db4 D4", "C4 Db4 D4 Eb4"])("does not force a chord name onto %s", (notes) => {
    expect(play(notes)).toMatchObject({ kind: "cluster" });
  });
});

describe("alternatives", () => {
  it.each([
    ["G3 B3 F4 Ab4", "G7b9"],
    ["F2 A3 Eb4 G4", "F9"],
  ])("keeps far-fetched readings of %s (%s) out of the alternatives", (notes, symbol) => {
    const reading = play(notes);
    expect(reading).toMatchObject({ kind: "chord", symbol });
    const alternatives = reading?.kind === "chord" ? reading.alternatives.map((a) => a.symbol) : [];
    expect(alternatives.filter((a) => /##|\(b5\)/.test(a))).toEqual([]);
  });

  it("keeps a close second reading", () => {
    const reading = play("C3 F3 Bb3");
    expect(reading?.kind === "chord" && reading.alternatives.map((a) => a.symbol)).toContain("Fsus4/C");
  });

  it("names the chords from the reference screenshots", () => {
    expect(symbolOf("F3 Ab3 C4 Eb4 G4 Bb4")).toBe("Fm11");
    expect(symbolOf("E3 B3 G#4")).toBe("E");
  });
});

describe("input handling", () => {
  it("ignores the order and duplicates of the notes", () => {
    expect(identify([67, 60, 64, 64, 60])).toMatchObject({ kind: "chord", symbol: "C" });
  });
});

describe("formatSymbol", () => {
  it.each([
    ["Bbm7b5", "B♭m7♭5"],
    ["C7#9", "C7♯9"],
    ["F#/A#", "F♯/A♯"],
    ["Cmaj7", "Cmaj7"],
    ["Cdim", "Cdim"],
  ])("formats %s as %s", (symbol, formatted) => {
    expect(formatSymbol(symbol)).toBe(formatted);
  });
});

describe("parseNote", () => {
  it.each([
    ["C4", 60],
    ["A4", 69],
    ["C#4", 61],
    ["Db4", 61],
    ["B#3", 60],
    ["Cb4", 59],
    ["C-1", 0],
    ["G9", 127],
  ])("parses %s as %i", (name, midi) => {
    expect(parseNote(name)).toBe(midi);
  });

  it("rejects names it can't read", () => {
    expect(() => parseNote("H4")).toThrow();
  });
});
