import { NoteTracker, type NoteEvent } from "../notes.ts";

/** A note, pedal or clear event, at a time in seconds from the start of the take. */
export type TakeEvent = NoteEvent & { t: number };

export interface Take {
  id: string;
  number: number;
  createdAt: number;
  /** Seconds. */
  duration: number;
  events: TakeEvent[];
  /** The metronome tempo when the take was recorded against it, otherwise null. */
  bpm: number | null;
  beats: number;
  key: string;
}

export function applyEvent(tracker: NoteTracker, event: NoteEvent) {
  switch (event.type) {
    case "on":
      return tracker.noteOn(event.note, event.velocity);
    case "off":
      return tracker.noteOff(event.note);
    case "pedal":
      return tracker.setPedal(event.down);
    case "clear":
      return tracker.clear();
  }
}

/** The time the last sound ends: when no key is down and the pedal holds nothing. */
function lastSound(events: readonly TakeEvent[], stoppedAt: number): number {
  const tracker = new NoteTracker();
  let silentFrom: number | undefined;
  for (const event of events) {
    applyEvent(tracker, event);
    silentFrom = tracker.getSnapshot().notes.length === 0 ? event.t : undefined;
  }
  return silentFrom ?? stoppedAt;
}

export interface TrimOptions {
  leadIn: number;
  tail: number;
  /** Keep the start where it is, so the take stays on the metronome's bar lines. */
  aligned: boolean;
}

/**
 * Cuts the silence around a take down to the lead-in and tail. Returns null when nothing was
 * played.
 */
export function trimTake(
  events: readonly TakeEvent[],
  stoppedAt: number,
  { leadIn, tail, aligned }: TrimOptions,
): { events: TakeEvent[]; duration: number } | null {
  const firstOn = events.find((e) => e.type === "on")?.t;
  if (firstOn === undefined) return null;
  const shift = aligned ? 0 : Math.max(0, firstOn - leadIn);
  const end = Math.min(stoppedAt, lastSound(events, stoppedAt) + tail);
  return {
    events: events.map((e) => ({ ...e, t: Math.max(0, e.t - shift) })),
    duration: Math.max(end - shift, firstOn - shift + 0.1),
  };
}

/** Steps through a take in time order and reports the notes sounding at each moment. */
export class TakeCursor {
  private index = 0;
  readonly tracker = new NoteTracker();

  constructor(private readonly events: readonly TakeEvent[]) {}

  notesAt(t: number): number[] {
    while (this.index < this.events.length && this.events[this.index]!.t <= t) {
      applyEvent(this.tracker, this.events[this.index++]!);
    }
    return this.tracker.getSnapshot().notes;
  }
}

/** Counts the distinct chords in a take, for the takes list. */
export function chordChanges(events: readonly TakeEvent[]): number {
  const tracker = new NoteTracker();
  let count = 0;
  let wasChord = false;
  for (const event of events) {
    applyEvent(tracker, event);
    const isChord = tracker.getSnapshot().notes.length >= 3;
    if (isChord && !wasChord) count++;
    wasChord = isChord;
  }
  return count;
}

const PPQ = 480;

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  for (let v = value >> 7; v > 0; v >>= 7) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

const text = (s: string) => [...new TextEncoder().encode(s)];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

/**
 * Writes the take as a standard MIDI file (type 0). The tempo is the metronome's when the take
 * was recorded against it, so bars line up in a DAW. Otherwise it's 120 BPM.
 */
export function toMidiFile(take: Pick<Take, "events" | "duration" | "bpm" | "beats" | "number">): Uint8Array {
  const bpm = take.bpm ?? 120;
  const tick = (t: number) => Math.round((t * PPQ * bpm) / 60);
  const track: number[] = [];
  let last = 0;
  const put = (t: number, bytes: number[]) => {
    const now = tick(t);
    track.push(...variableLength(Math.max(0, now - last)), ...bytes);
    last = Math.max(last, now);
  };

  const name = text(`Mediant take ${take.number}`);
  put(0, [0xff, 0x03, ...variableLength(name.length), ...name]);
  const microseconds = Math.round(60_000_000 / bpm);
  put(0, [0xff, 0x51, 0x03, (microseconds >> 16) & 0xff, (microseconds >> 8) & 0xff, microseconds & 0xff]);
  put(0, [0xff, 0x58, 0x04, take.beats, 2, 24, 8]);

  const down = new Set<number>();
  let pedal = false;
  const allOff = (t: number) => {
    for (const note of down) put(t, [0x80, note, 64]);
    down.clear();
    if (pedal) put(t, [0xb0, 64, 0]);
    pedal = false;
  };
  for (const event of take.events) {
    if (event.type === "on") {
      if (down.has(event.note)) put(event.t, [0x80, event.note, 64]);
      put(event.t, [0x90, event.note, Math.max(1, Math.min(127, event.velocity))]);
      down.add(event.note);
    } else if (event.type === "off" && down.delete(event.note)) {
      put(event.t, [0x80, event.note, 64]);
    } else if (event.type === "pedal" && event.down !== pedal) {
      pedal = event.down;
      put(event.t, [0xb0, 64, pedal ? 127 : 0]);
    } else if (event.type === "clear") {
      allOff(event.t);
    }
  }
  allOff(take.duration);
  put(take.duration, [0xff, 0x2f, 0x00]);

  const header = [...text("MThd"), ...u32(6), 0, 0, 0, 1, (PPQ >> 8) & 0xff, PPQ & 0xff];
  return new Uint8Array([...header, ...text("MTrk"), ...u32(track.length), ...track]);
}
