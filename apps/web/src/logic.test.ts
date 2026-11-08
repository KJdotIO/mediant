import { identify, parseNote, type Reading } from "@mediant/theory";
import { describe, expect, it } from "vitest";
import { heldReading, noteGroups, octaveOf, ottava, RELEASE_WINDOW, type Sample } from "./logic.ts";

const read = (notes: string): Reading => identify(notes.split(" ").map(parseNote))!;
const symbol = (reading: Reading | null) => (reading?.kind === "chord" ? reading.symbol : reading?.kind);

describe("heldReading", () => {
  it("holds the chord, not the last finger up, when keys lift unevenly", () => {
    const history: Sample[] = [
      { at: 0, reading: read("A3 C4 E4 G4") },
      { at: 1000, reading: read("C4 E4 G4") },
      { at: 1030, reading: read("E4 G4") },
      { at: 1060, reading: read("G4") },
    ];
    expect(symbol(heldReading(history, 1080))).toBe("Am7");
  });

  it("holds the remaining note when you let go of the chord slowly", () => {
    const history: Sample[] = [
      { at: 0, reading: read("A3 C4 E4 G4") },
      { at: 1000, reading: read("G4") },
    ];
    expect(heldReading(history, 1000 + RELEASE_WINDOW + 500)).toMatchObject({ kind: "note", name: "G" });
  });

  it("holds the whole chord when the pedal lifts", () => {
    const history: Sample[] = [{ at: 0, reading: read("C#3 E3 G#3 C#4 E4 G#4") }];
    expect(symbol(heldReading(history, 5000))).toBe("C#m");
  });
});

describe("noteGroups", () => {
  it("keeps one chip per note up to the limit", () => {
    expect(noteGroups(read("C4 E4 G4").notes).map((g) => `${g.name}×${g.count}`)).toEqual(["C×1", "E×1", "G×1"]);
  });

  it("groups by note name past the limit", () => {
    const notes = read("C#2 G#2 E3 C#4 E4 G#4 C#5 E5 G#5").notes;
    expect(noteGroups(notes).map((g) => `${g.name}:${g.degree}×${g.count}`)).toEqual(["C#:1×3", "G#:5×3", "E:b3×3"]);
  });
});

describe("ottava", () => {
  it.each([
    [[91], "treble", 0],
    [[96], "treble", 1],
    [[108], "treble", 2],
    [[29], "bass", 0],
    [[21], "bass", 1],
    [[], "bass", 0],
  ] as const)("shifts %j on the %s staff by %i octaves", (midi, clef, octaves) => {
    expect(ottava(midi, clef)).toBe(octaves);
  });
});

describe("octaveOf", () => {
  it("names middle C as C4 or C3", () => {
    expect(octaveOf(60, "C4")).toBe(4);
    expect(octaveOf(60, "C3")).toBe(3);
    expect(octaveOf(21, "C4")).toBe(0);
    expect(octaveOf(108, "C3")).toBe(7);
  });
});
