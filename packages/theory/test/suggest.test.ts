import { describe, expect, it } from "vitest";
import { parseNote, suggest, type Key, type Suggestion, type VoicingStyle } from "../src/index.ts";

const notes = (names: string) => names.split(" ").map(parseNote);
const C_MAJOR: Key = { tonic: "C", mode: "major" };
const A_MINOR: Key = { tonic: "A", mode: "minor" };

const top = (played: string, key?: Key, voicing?: VoicingStyle): Suggestion =>
  suggest(notes(played), { ...(key ? { key } : {}), ...(voicing ? { voicing } : {}) })!.suggestions[0]!;
const symbols = (played: string, key: Key | undefined, count = 3) =>
  suggest(notes(played), { ...(key ? { key } : {}), count })!.suggestions.map((s) => s.symbol);
const spelled = (s: Suggestion) => s.notes.map((n) => n.name).join(" ");

describe("next chord", () => {
  it("goes from ii to V, keeping the common note", () => {
    const s = top("D2 F3 A3 C4", C_MAJOR);
    expect(s.symbol).toBe("G7");
    expect(spelled(s)).toBe("G2 F3 G3 B3");
    expect(s.reason).toEqual({ kind: "fifth" });
  });

  it("resolves V home", () => {
    const s = top("G2 F3 B3 D4", C_MAJOR);
    expect(s.symbol).toBe("Cmaj7");
    expect(s.reason).toEqual({ kind: "home" });
  });

  it("resolves V home in a minor key", () => {
    const s = top("E2 D3 G#3 B3", A_MINOR);
    expect(s.symbol).toBe("Am7");
    expect(s.roman).toBe("i7");
  });

  it("offers the tritone sub after ii, with the bass a semitone down", () => {
    const s = suggest(notes("D2 F3 A3 C4"), { key: C_MAJOR })!.suggestions.find((x) => x.symbol === "Db7");
    expect(s?.reason).toEqual({ kind: "tritone", of: "G7" });
  });

  it("offers the deceptive cadence after V, and no tritone sub away from ii", () => {
    expect(symbols("G2 F3 B3 D4", C_MAJOR)).toEqual(["Cmaj7", "Am7", "C7"]);
  });

  it("borrows from the parallel minor", () => {
    const all = suggest(notes("C2 E3 G3 B3"), { key: C_MAJOR, count: 8 })!.suggestions;
    expect(all.find((s) => s.reason.kind === "borrowed")).toMatchObject({ symbol: "Abmaj7", reason: { from: "C minor" } });
  });

  it("keeps the colour of a rich voicing: Dm9 goes to G13", () => {
    const s = top("D2 F3 A3 C4 E4", C_MAJOR);
    expect(s.symbol).toBe("G13");
    expect(spelled(s)).toBe("G2 F3 A3 B3 E4");
  });

  it("answers a triad with a triad, moving the hand as little as it can", () => {
    expect(top("C4 E4 G4", C_MAJOR).symbol).toBe("F/C");
  });

  it("guesses the key from the chord when none is set", () => {
    const result = suggest(notes("D2 F3 A3 C4"))!;
    expect(result.key).toEqual(C_MAJOR);
    expect(result.guessed).toBe(true);
    expect(result.suggestions[0]!.symbol).toBe("G7");
  });

  it("suggests nothing for a single note or an interval", () => {
    expect(suggest(notes("C4"))).toBeNull();
    expect(suggest(notes("C4 E4"))).toBeNull();
  });
});

describe("voicing styles", () => {
  it("steps the bass to the third when that is the smoother move", () => {
    const g = suggest(notes("C2 E3 G3 C4"), { key: C_MAJOR, count: 8 })!.suggestions.find((s) => s.rootPc === 7);
    expect(g?.symbol).toBe("G/B");
  });

  it("keeps the root in the bass when asked", () => {
    expect(top("C4 E4 G4", C_MAJOR, "root").symbol).toBe("F");
    const g = suggest(notes("C2 E3 G3 C4"), { key: C_MAJOR, count: 8, voicing: "root" })!.suggestions.find((s) => s.rootPc === 7);
    expect(g?.symbol).toBe("G");
  });

  it("voices ii to V as root and a rootless B form", () => {
    const s = top("D2 F3 A3 C4", C_MAJOR, "rich");
    expect(s.symbol).toBe("G13");
    expect(spelled(s)).toBe("G2 F3 A3 B3 E4");
  });

  it("gives a rich dominant b9 and b13 when it resolves to a minor chord", () => {
    const s = top("B2 A3 D4 F4", A_MINOR, "rich");
    expect(s.symbol).toBe("E7#5b9");
  });

  it("turns a plain triad into a seventh chord with colour", () => {
    expect(top("C4 E4 G4", C_MAJOR, "rich").symbol).toMatch(/^Fmaj9/);
  });
});
