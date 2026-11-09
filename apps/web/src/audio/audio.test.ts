import { describe, expect, it } from "vitest";
import felt from "../../public/sounds/felt/manifest.json";
import grand from "../../public/sounds/grand/manifest.json";
import upright from "../../public/sounds/upright/manifest.json";
import { litDots, levelDb } from "./Meter.tsx";
import { beatAt, clampBpm, tapTempo } from "./metronome.ts";

describe("level meter", () => {
  it("measures a full-scale square wave at 0 dB and silence at the floor", () => {
    expect(levelDb(new Float32Array([1, -1, 1, -1]))).toBeCloseTo(0);
    expect(levelDb(new Float32Array(64))).toBe(-60);
  });

  it("lights more dots as the level rises", () => {
    expect([-60, -30, -6, 0].map((db) => litDots(db, 12))).toEqual([0, 6, 11, 12]);
  });
});
import { pickZone, type SoundPack } from "./piano.ts";

const packs = { felt, upright, grand } as Record<string, SoundPack>;

describe("beatAt", () => {
  const booked = [0, 1, 2, 3, 0].map((beat, i) => ({ time: 10 + i * 0.5, beat }));

  it("is undefined before the first click", () => {
    expect(beatAt(booked, 9.9)).toBeUndefined();
  });

  it("follows each booked click and wraps to the downbeat", () => {
    expect([10, 10.49, 10.5, 11.2, 11.6, 12.1].map((t) => beatAt(booked, t))).toEqual([0, 0, 1, 2, 3, 0]);
  });
});

describe("pickZone", () => {
  it("plays a sampled key at its own pitch", () => {
    expect(pickZone(packs["felt"]!, 60, 64)).toMatchObject({ zone: { key: 60 }, rate: 1 });
  });

  it("shifts the nearest sample by at most two semitones, three at the ends of the keyboard", () => {
    for (const pack of Object.values(packs)) {
      for (let note = 21; note <= 108; note++) {
        for (const velocity of [1, 40, 64, 100, 127]) {
          const picked = pickZone(pack, note, velocity)!;
          const limit = note < 24 || note > 105 ? 3 : 2;
          expect(Math.abs(note - picked.zone.key), `${pack.id} ${note} ${velocity}`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it("uses the soft layer for soft playing and the loud layer for hard playing", () => {
    const pack = packs["grand"]!;
    expect(pickZone(pack, 60, 10)!.zone.layer).toBe(0);
    expect(pickZone(pack, 60, 127)!.zone.layer).toBe(pack.layers.length - 1);
  });

  it("plays louder within a layer as velocity rises", () => {
    const pack = packs["felt"]!;
    expect(pickZone(pack, 60, 85)!.gain).toBeGreaterThan(pickZone(pack, 60, 43)!.gain);
  });
});

describe("tapTempo", () => {
  it("needs at least two taps", () => {
    expect(tapTempo([0])).toBeUndefined();
  });

  it("averages the gaps between recent taps", () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 600, 1250, 1850])).toBe(97);
  });

  it("keeps the tempo in range", () => {
    expect(tapTempo([0, 10])).toBe(300);
    expect(clampBpm(5)).toBe(30);
  });
});
