import { describe, expect, it } from "vitest";
import { arrivalTime, NoteTracker, type NoteEvent } from "./notes.ts";

const track = () => {
  const tracker = new NoteTracker();
  const events: NoteEvent[] = [];
  tracker.listen((event) => events.push(event));
  return { tracker, events, notes: () => tracker.getSnapshot().notes };
};

describe("NoteTracker", () => {
  it("sounds a note while its key is down", () => {
    const { tracker, notes } = track();
    tracker.noteOn(64);
    tracker.noteOn(60);
    expect(notes()).toEqual([60, 64]);
    tracker.noteOff(60);
    expect(notes()).toEqual([64]);
  });

  it("keeps released notes sounding while the pedal is down, and drops them when it lifts", () => {
    const { tracker, notes } = track();
    tracker.setPedal(true);
    tracker.noteOn(60);
    tracker.noteOn(64);
    tracker.noteOff(60);
    tracker.noteOff(64);
    expect(notes()).toEqual([60, 64]);
    tracker.noteOn(67);
    tracker.setPedal(false);
    expect(notes()).toEqual([67]);
  });

  it("tells keys that are down apart from notes the pedal holds", () => {
    const { tracker } = track();
    tracker.setPedal(true);
    tracker.noteOn(60);
    tracker.noteOn(64);
    tracker.noteOff(60);
    tracker.noteOff(64);
    tracker.noteOn(64);
    expect(tracker.getSnapshot()).toMatchObject({ notes: [60, 64], held: [64] });
  });

  it("counts a note struck again under the pedal once, and keeps it while the key is down", () => {
    const { tracker, notes } = track();
    tracker.setPedal(true);
    tracker.noteOn(60);
    tracker.noteOff(60);
    tracker.noteOn(60);
    expect(notes()).toEqual([60]);
    tracker.setPedal(false);
    expect(notes()).toEqual([60]);
  });

  it("clears held and sustained notes", () => {
    const { tracker, notes, events } = track();
    tracker.setPedal(true);
    tracker.noteOn(60);
    tracker.noteOff(60);
    tracker.noteOn(64);
    tracker.clear();
    expect(notes()).toEqual([]);
    expect(tracker.getSnapshot().clears).toBe(1);
    expect(events.at(-1)).toEqual({ type: "clear" });
  });

  it("sends velocity, ignores a stray note off, and reports the pedal only when it changes", () => {
    const { tracker, events } = track();
    tracker.noteOff(72);
    tracker.noteOn(60, 40);
    tracker.setPedal(true);
    tracker.setPedal(true);
    tracker.noteOff(60);
    expect(events).toEqual([
      { type: "on", note: 60, velocity: 40 },
      { type: "pedal", down: true },
      { type: "off", note: 60 },
    ]);
  });

  it("passes on the time each event happened", () => {
    const tracker = new NoteTracker();
    const times: number[] = [];
    tracker.listen((_, at) => times.push(at));
    tracker.noteOn(60, 90, 1200);
    tracker.setPedal(true, 1250);
    tracker.noteOff(60, 1300);
    tracker.clear(1400);
    expect(times).toEqual([1200, 1250, 1300, 1400]);
  });

  it("returns the same snapshot until something changes", () => {
    const { tracker } = track();
    const first = tracker.getSnapshot();
    expect(tracker.getSnapshot()).toBe(first);
    tracker.noteOn(60);
    expect(tracker.getSnapshot()).not.toBe(first);
  });
});

describe("the notes that count towards the chord name", () => {
  const playing = () => {
    const tracker = new NoteTracker();
    let now = 0;
    /** Strikes notes together, a second after the last strike. */
    const strike = (...notes: number[]) => {
      now += 1000;
      notes.forEach((note, i) => tracker.noteOn(note, 90, now + i * 5));
    };
    const lift = (...notes: number[]) => notes.forEach((note) => tracker.noteOff(note));
    return { tracker, strike, lift, harmony: () => tracker.getSnapshot().harmony, notes: () => tracker.getSnapshot().notes };
  };
  const AM7 = [57, 60, 64, 67];

  it("counts every sounding note when there is no pedal", () => {
    const { strike, lift, harmony } = playing();
    strike(...AM7);
    lift(57);
    strike(72);
    expect(harmony()).toEqual([60, 64, 67, 72]);
  });

  it("leaves out an earlier chord the pedal still holds when you play a new chord", () => {
    const { tracker, strike, lift, harmony, notes } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    strike(72, 76, 79, 83);
    expect(harmony()).toEqual([72, 76, 79, 83]);
    expect(notes()).toEqual([...AM7, 72, 76, 79, 83]);
    lift(72, 76, 79, 83);
    expect(harmony()).toEqual([72, 76, 79, 83]);
  });

  it("leaves out what remains of the earlier chord when the new chord uses some of its keys", () => {
    const { tracker, strike, lift, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    strike(60, 64, 67, 71);
    expect(harmony()).toEqual([60, 64, 67, 71]);
  });

  it("keeps a bass note played just before the chord", () => {
    const { tracker, strike, lift, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    strike(41);
    lift(41);
    strike(57, 60, 64);
    expect(harmony()).toEqual([41, 57, 60, 64]);
  });

  it("keeps single notes played over the chord", () => {
    const { tracker, strike, lift, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    strike(74);
    lift(74);
    strike(76);
    expect(harmony()).toEqual([...AM7, 74, 76]);
  });

  it("keeps a chord you are still holding down", () => {
    const { tracker, strike, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    strike(72, 76, 79, 83);
    expect(harmony()).toEqual([...AM7, 72, 76, 79, 83]);
  });

  it("does not treat a fast run as a new chord", () => {
    const { tracker, strike, lift, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    for (const [i, note] of [72, 74, 76, 77].entries()) {
      tracker.noteOn(note, 90, 5000 + i * 60);
      tracker.noteOff(note, 5000 + i * 60 + 50);
    }
    expect(harmony()).toEqual([...AM7, 72, 74, 76, 77]);
  });

  it("counts everything again after the pedal lifts", () => {
    const { tracker, strike, lift, harmony } = playing();
    tracker.setPedal(true);
    strike(...AM7);
    lift(...AM7);
    strike(72, 76, 79);
    tracker.setPedal(false);
    expect(harmony()).toEqual([72, 76, 79]);
    lift(72, 76, 79);
    strike(57);
    expect(harmony()).toEqual([57]);
  });
});

describe("arrivalTime", () => {
  it.each([
    [4990, 5000, 4990],
    [0, 5000, 5000],
    [5200, 5000, 5000],
    [100, 5000, 5000],
  ])("reads a stamp of %i at %i as %i", (stamp, now, expected) => {
    expect(arrivalTime(stamp, now)).toBe(expected);
  });
});
