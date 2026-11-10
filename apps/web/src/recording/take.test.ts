import { describe, expect, it } from "vitest";
import { chordChanges, fileStem, TakeCursor, takeLabel, toMidiFile, trimTake, type TakeEvent } from "./take.ts";

const on = (t: number, note: number, velocity = 90): TakeEvent => ({ t, type: "on", note, velocity });
const off = (t: number, note: number): TakeEvent => ({ t, type: "off", note });
const pedal = (t: number, down: boolean): TakeEvent => ({ t, type: "pedal", down });

const chord = (start: number, end: number, notes: number[]) => [
  ...notes.map((n) => on(start, n)),
  ...notes.map((n) => off(end, n)),
];

describe("trimTake", () => {
  const options = { leadIn: 1, tail: 2, aligned: false };

  it("returns null when nothing was played", () => {
    expect(trimTake([pedal(1, true)], 5, options)).toBeNull();
  });

  it("keeps the lead-in before the first note and the tail after the last sound", () => {
    const trimmed = trimTake(chord(4, 6, [60, 64, 67]), 20, options)!;
    expect(trimmed.events[0]!.t).toBe(1);
    expect(trimmed.duration).toBe(5);
  });

  it("counts sound held by the pedal as part of the take", () => {
    const events = [pedal(0.5, true), ...chord(1, 2, [60, 64]), pedal(7, false)];
    expect(trimTake(events, 30, options)!.duration).toBe(9);
  });

  it("ends at the stop when notes still sound", () => {
    expect(trimTake([on(1, 60)], 4, options)!.duration).toBe(4);
  });

  describe("against the metronome", () => {
    const grid = { bar: 2, beat: 0.5 };

    it("cuts the count-in and starts on the bar line where you come in", () => {
      const trimmed = trimTake(chord(2, 3, [60]), 10, { ...options, grid })!;
      expect(trimmed.shift).toBe(2);
      expect(trimmed.events[0]!.t).toBe(0);
      expect(trimmed.duration).toBe(3);
    });

    it("counts a note played slightly early as the downbeat", () => {
      const trimmed = trimTake(chord(3.95, 5, [60]), 10, { ...options, grid })!;
      expect(trimmed.shift).toBe(4);
      expect(trimmed.events[0]!.t).toBe(0);
    });

    it("keeps the bar before the downbeat for a pickup", () => {
      const trimmed = trimTake(chord(3.5, 5, [60]), 10, { ...options, grid })!;
      expect(trimmed.shift).toBe(2);
      expect(trimmed.events[0]!.t).toBe(1.5);
    });
  });
});

describe("TakeCursor", () => {
  it("reports the notes sounding at each moment, including under the pedal", () => {
    const cursor = new TakeCursor([pedal(0, true), ...chord(1, 2, [60, 64, 67]), pedal(3, false)]);
    expect([0.5, 1, 2.5, 3].map((t) => cursor.notesAt(t))).toEqual([[], [60, 64, 67], [60, 64, 67], []]);
  });
});

describe("chordChanges", () => {
  it("counts each new chord once", () => {
    expect(chordChanges([...chord(0, 1, [60, 64, 67]), ...chord(1, 2, [62, 65, 69]), on(3, 72)])).toBe(2);
  });
});

describe("take names", () => {
  it("shows the name, or the take number when there is none", () => {
    expect(takeLabel({ number: 4, name: "Peace Piece" })).toBe("Peace Piece");
    expect(takeLabel({ number: 4 })).toBe("Take 4");
    expect(takeLabel({ number: 4, name: "  " })).toBe("Take 4");
  });

  it.each([
    ["Peace Piece, take 2", "peace-piece-take-2"],
    ["Clair de Lune (début)", "clair-de-lune-debut"],
    ["月の光", "mediant-take-4"],
    [undefined, "mediant-take-4"],
  ])("names the files of %s %s", (name, stem) => {
    expect(fileStem(name === undefined ? { number: 4 } : { number: 4, name })).toBe(stem);
  });
});

/** Reads back the parts of a MIDI file the writer produces. */
function readMidi(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer);
  const ppq = view.getUint16(12);
  let i = 22;
  const end = 22 + view.getUint32(18);
  let ticks = 0;
  const events: Array<{ ticks: number; status: number; data: number[] }> = [];
  while (i < end) {
    let delta = 0;
    let b: number;
    do {
      b = bytes[i++]!;
      delta = (delta << 7) | (b & 0x7f);
    } while (b & 0x80);
    ticks += delta;
    const status = bytes[i++]!;
    if (status === 0xff) {
      const type = bytes[i++]!;
      const length = bytes[i++]!;
      events.push({ ticks, status: 0xff00 | type, data: [...bytes.slice(i, i + length)] });
      i += length;
    } else {
      events.push({ ticks, status, data: [bytes[i]!, bytes[i + 1]!] });
      i += 2;
    }
  }
  return { header: new TextDecoder().decode(bytes.slice(0, 4)), format: view.getUint16(8), ppq, events };
}

describe("toMidiFile", () => {
  const take = {
    number: 3,
    bpm: 90,
    beats: 3,
    duration: 4,
    events: [pedal(0.5, true), on(1, 60, 100), off(2, 60), pedal(3, false)],
  };
  const midi = readMidi(toMidiFile(take));

  it("writes a type 0 file with the tempo and time signature", () => {
    expect(midi.header).toBe("MThd");
    expect(midi.format).toBe(0);
    const tempo = midi.events.find((e) => e.status === 0xff51)!.data;
    expect(Math.round(60_000_000 / ((tempo[0]! << 16) | (tempo[1]! << 8) | tempo[2]!))).toBe(90);
    expect(midi.events.find((e) => e.status === 0xff58)!.data.slice(0, 2)).toEqual([3, 2]);
  });

  it("places notes and the pedal on the beat grid of the tempo", () => {
    const beat = midi.ppq;
    const notes = midi.events.filter((e) => e.status < 0xf0).map((e) => [e.ticks, e.status, ...e.data]);
    expect(notes).toEqual([
      [0.75 * beat, 0xb0, 64, 127],
      [1.5 * beat, 0x90, 60, 100],
      [3 * beat, 0x80, 60, 64],
      [4.5 * beat, 0xb0, 64, 0],
    ]);
    expect(midi.events.at(-1)).toMatchObject({ status: 0xff2f, ticks: 6 * beat });
  });

  it("closes notes and the pedal that are still on at the end", () => {
    const open = readMidi(toMidiFile({ ...take, events: [pedal(0, true), on(1, 64)] }));
    const closing = open.events.filter((e) => e.ticks === 6 * open.ppq && e.status < 0xf0).map((e) => e.status);
    expect(closing).toEqual([0x80, 0xb0]);
  });

  it("names the track after the take", () => {
    const trackName = (bytes: Uint8Array) => new TextDecoder().decode(new Uint8Array(readMidi(bytes).events.find((e) => e.status === 0xff03)!.data));
    expect(trackName(toMidiFile(take))).toBe("Mediant take 3");
    expect(trackName(toMidiFile({ ...take, name: "Peace Piece" }))).toBe("Peace Piece");
  });
});
