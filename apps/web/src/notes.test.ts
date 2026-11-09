import { describe, expect, it } from "vitest";
import { NoteTracker, type NoteEvent } from "./notes.ts";

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

  it("returns the same snapshot until something changes", () => {
    const { tracker } = track();
    const first = tracker.getSnapshot();
    expect(tracker.getSnapshot()).toBe(first);
    tracker.noteOn(60);
    expect(tracker.getSnapshot()).not.toBe(first);
  });
});
