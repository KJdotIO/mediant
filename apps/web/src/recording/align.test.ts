import { describe, expect, it } from "vitest";
import { findLag, onsetTimes } from "./align.ts";

const RATE = 48000;

/** A fake recording: a quiet noise floor and a decaying, piano-like hit at each time. */
function recording(seconds: number, hits: number[], seed = 1) {
  const samples = new Float32Array(Math.round(seconds * RATE));
  let state = seed;
  const noise = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648) * 2 - 1;
  for (let i = 0; i < samples.length; i++) samples[i] = noise() * 0.002;
  for (const hit of hits) {
    const start = Math.round(hit * RATE);
    for (let i = 0; i < RATE * 0.6 && start + i < samples.length; i++) {
      samples[start + i]! += Math.sin((2 * Math.PI * 440 * i) / RATE) * 0.5 * Math.exp(-i / (RATE * 0.15));
    }
  }
  return samples;
}

describe("onsetTimes", () => {
  it("counts a chord once", () => {
    const on = (t: number) => ({ t, type: "on" });
    expect(onsetTimes([on(1), on(1.01), on(1.02), { t: 1.5, type: "off" }, on(2)])).toEqual([1, 2]);
  });
});

describe("findLag", () => {
  const notes = [0.5, 1.1, 1.6, 2.4, 2.9, 3.5];

  it.each([0, 0.012, 0.037, 0.12, 0.25])("finds a delay of %s seconds", (delay) => {
    const result = findLag(recording(4.5, notes.map((t) => t + delay)), RATE, notes)!;
    expect(Math.abs(result.lag - delay)).toBeLessThanOrEqual(0.005);
    expect(result.confidence).toBeGreaterThan(1.5);
  });

  it("finds sound that starts slightly before the notes", () => {
    const result = findLag(recording(4.5, notes.map((t) => t - 0.02)), RATE, notes)!;
    expect(Math.abs(result.lag + 0.02)).toBeLessThanOrEqual(0.005);
  });

  it("gives up when the recording has no attacks to match", () => {
    expect(findLag(recording(4.5, []), RATE, notes)).toBeNull();
  });

  it("returns null with no notes", () => {
    expect(findLag(recording(1, [0.5]), RATE, [])).toBeNull();
  });
});
