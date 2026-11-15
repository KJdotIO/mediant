import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { identify, parseNote, pitchClass, suggest } from "../src/index.ts";

/** A reading without its pitch: the kind, and for a chord its quality and where the root sits above the bass. */
function shape(notes: readonly number[]): string {
  const reading = identify(notes);
  if (reading?.kind !== "chord") return reading?.kind ?? "nothing";
  const root = reading.notes.find((n) => n.degree === "1")!.pitchClass;
  return `${reading.quality} ${pitchClass(root - Math.min(...notes))}`;
}

const voicing = fc.uniqueArray(fc.integer({ min: 33, max: 96 }), { minLength: 1, maxLength: 8 });

describe("every set of notes", () => {
  it("reads the same in all twelve keys", () => {
    for (let mask = 1; mask < 4096; mask += 2) {
      const notes = Array.from({ length: 12 }, (_, i) => i).filter((i) => mask & (1 << i)).map((i) => 48 + i);
      const shapes = new Set(Array.from({ length: 12 }, (_, shift) => shape(notes.map((n) => n + shift))));
      expect([...shapes], notes.join(" ")).toHaveLength(1);
    }
  });

  it("reads a voicing the same wherever it sits on the keyboard", () => {
    fc.assert(
      fc.property(voicing, fc.integer({ min: -12, max: 12 }), (notes, shift) => {
        expect(shape(notes.map((n) => n + shift))).toBe(shape(notes));
      }),
    );
  });

  it("reads the same when a note above the bass is doubled an octave up", () => {
    fc.assert(
      fc.property(voicing, fc.nat(), (notes, pick) => {
        const bass = Math.min(...notes);
        const upper = notes.filter((n) => pitchClass(n) !== pitchClass(bass));
        fc.pre(upper.length > 0);
        expect(shape([...notes, upper[pick % upper.length]! + 12])).toBe(shape(notes));
      }),
    );
  });

  it("gives each note a name that is the key you pressed", () => {
    fc.assert(
      fc.property(voicing, (notes) => {
        const reading = identify(notes)!;
        expect(reading.notes.map((n) => parseNote(n.name))).toEqual([...notes].sort((a, b) => a - b));
      }),
    );
  });
});

describe("suggestions", () => {
  const voicings = [
    "D2 F3 A3 C4",
    "G2 F3 B3 D4",
    "C4 E4 G4",
    "D2 F3 A3 C4 E4",
    "A2 G3 C4 E4",
    "B2 A3 D4 F4",
    "C#3 E3 G3 Bb3",
  ].map((v) => v.split(" ").map(parseNote));

  it("move the same way in all twelve keys", () => {
    for (const notes of voicings) {
      const shapes = (shift: number) =>
        suggest(notes.map((n) => n + shift))!.suggestions.map((s) => `${s.quality} ${s.notes.map((n) => n.midi - shift).join(",")}`);
      for (let shift = 1; shift < 12; shift++) expect(shapes(shift), notes.join(" ")).toEqual(shapes(0));
    }
  });
});
