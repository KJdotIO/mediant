import { useEffect, useRef, useState } from "react";

export interface NoteSnapshot {
  /** Every sounding note: keys down, plus notes the sustain pedal holds. */
  notes: number[];
  /** Only the keys physically down. */
  held: number[];
  /**
   * The notes that count towards the chord name. With the pedal down, a new chord replaces the
   * earlier notes the pedal still holds, apart from a bass note played just before it.
   */
  harmony: number[];
  pedal: boolean;
  /** Goes up by one each time someone clears the notes. */
  clears: number;
}

export type NoteEvent =
  | { type: "on"; note: number; velocity: number }
  | { type: "off"; note: number }
  | { type: "pedal"; down: boolean }
  | { type: "clear" };

/** Notes struck within this many milliseconds of the one before belong to one strike, such as a chord. */
const STRIKE_WINDOW_MS = 100;
/** A strike is a chord when it puts down at least this many different notes at once. */
const CHORD_SIZE = 3;

const pitchClasses = (notes: Iterable<number>) => new Set([...notes].map((note) => note % 12)).size;

/**
 * Tracks which notes sound. A note sounds while its key is down, or after release while the
 * sustain pedal is down. MIDI and the computer keyboard both feed one tracker.
 */
export class NoteTracker {
  private held = new Set<number>();
  private sustained = new Set<number>();
  private pedal = false;
  private clears = 0;
  private snapshot: NoteSnapshot = { notes: [], held: [], harmony: [], pedal: false, clears: 0 };
  /** The strike each note belongs to. Strikes are numbered in the order they happen. */
  private strikes = new Map<number, number>();
  private strike = 0;
  private struckAt = -Infinity;
  private strikeNotes = new Set<number>();
  private previousStrikeSize = 0;
  /** The strike of the latest chord, its lowest note, and whether the strike before it was a bass note. */
  private chord = 0;
  private chordLowest = 0;
  private bassBeforeChord = false;
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: NoteEvent, at: number) => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /**
   * Receives every note, pedal and clear event as it happens, for sound and recording. `at` is
   * when the event happened, as a performance.now() time: for MIDI, when the message arrived.
   */
  listen(listener: (event: NoteEvent, at: number) => void) {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  noteOn(note: number, velocity = 96, at = performance.now()) {
    this.sustained.delete(note);
    this.held.add(note);
    this.struck(note, at);
    this.send({ type: "on", note, velocity }, at);
    this.emit();
  }

  noteOff(note: number, at = performance.now()) {
    if (!this.held.delete(note)) return;
    if (this.pedal) this.sustained.add(note);
    this.send({ type: "off", note }, at);
    this.emit();
  }

  setPedal(down: boolean, at = performance.now()) {
    if (down === this.pedal) return;
    this.pedal = down;
    if (!down) this.sustained.clear();
    this.send({ type: "pedal", down }, at);
    this.emit();
  }

  clear(at = performance.now()) {
    this.held.clear();
    this.sustained.clear();
    this.clears++;
    this.send({ type: "clear" }, at);
    this.emit();
  }

  /** Files a note under its strike, and notes when that strike becomes a chord. */
  private struck(note: number, at: number) {
    if (at - this.struckAt > STRIKE_WINDOW_MS) {
      this.previousStrikeSize = pitchClasses(this.strikeNotes);
      this.strikeNotes = new Set();
      this.strike++;
    }
    this.struckAt = at;
    this.strikeNotes.add(note);
    this.strikes.set(note, this.strike);
    const down = [...this.held].filter((n) => this.strikes.get(n) === this.strike);
    if (pitchClasses(down) < CHORD_SIZE) return;
    if (this.chord !== this.strike) this.bassBeforeChord = this.previousStrikeSize > 0 && this.previousStrikeSize < CHORD_SIZE;
    this.chord = this.strike;
    this.chordLowest = Math.min(...down);
  }

  private counts(note: number): boolean {
    if (this.held.has(note)) return true;
    const strike = this.strikes.get(note) ?? 0;
    return strike >= this.chord || (strike === this.chord - 1 && this.bassBeforeChord && note < this.chordLowest);
  }

  private send(event: NoteEvent, at: number) {
    for (const listener of this.eventListeners) listener(event, at);
  }

  private emit() {
    const notes = [...new Set([...this.held, ...this.sustained])].sort((a, b) => a - b);
    const held = [...this.held].sort((a, b) => a - b);
    const harmony = notes.filter((note) => this.counts(note));
    this.snapshot = { notes, held, harmony, pedal: this.pedal, clears: this.clears };
    for (const listener of this.listeners) listener();
  }
}

export type MidiStatus =
  | { state: "connecting" }
  | { state: "unsupported" }
  | { state: "blocked" }
  | { state: "ready"; inputs: string[]; active: string | undefined };

/**
 * When a MIDI message arrived. The browser stamps it on arrival, which is earlier than the
 * handler runs when the page is busy. A stamp that is missing or out of range is ignored.
 */
export function arrivalTime(stamp: number, now: number): number {
  return stamp > 0 && stamp <= now && now - stamp < 1000 ? stamp : now;
}

const inputName = (input: MIDIInput) => input.name ?? "MIDI keyboard";

/**
 * Connects MIDI inputs to the tracker and follows devices as they connect and disconnect. It
 * listens to the chosen input, or to every input when none is chosen. A DAW that echoes your
 * keyboard to a virtual port would otherwise play every note twice.
 */
export function useMidi(tracker: NoteTracker, chosen = ""): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(() =>
    "requestMIDIAccess" in navigator ? { state: "connecting" } : { state: "unsupported" },
  );
  const wanted = useRef(chosen);
  const reconnect = useRef(() => {});

  useEffect(() => {
    if (!("requestMIDIAccess" in navigator)) return;
    let access: MIDIAccess | undefined;
    let cancelled = false;
    let active: string | undefined;
    let names: string[] = [];

    const onMessage = (event: MIDIMessageEvent) => {
      const data = event.data;
      if (!data || data.length < 2) return;
      const type = data[0]! & 0xf0;
      const a = data[1]!;
      const b = data[2] ?? 0;
      const at = arrivalTime(event.timeStamp, performance.now());
      if (type === 0x90 && b > 0) {
        const input = event.currentTarget as MIDIInput | null;
        const name = input ? inputName(input) : undefined;
        if (name && name !== active) {
          active = name;
          setStatus({ state: "ready", inputs: names, active });
        }
        tracker.noteOn(a, b, at);
      } else if (type === 0x80 || type === 0x90) tracker.noteOff(a, at);
      else if (type === 0xb0 && a === 64) tracker.setPedal(b >= 64, at);
      else if (type === 0xb0 && (a === 120 || a === 123)) tracker.clear(at);
    };

    const connect = () => {
      if (!access) return;
      const inputs = [...access.inputs.values()].filter((input) => input.state === "connected");
      for (const input of inputs) {
        input.onmidimessage = !wanted.current || inputName(input) === wanted.current ? onMessage : null;
      }
      names = [...new Set(inputs.map(inputName))];
      if (active && !names.includes(active)) active = undefined;
      setStatus({ state: "ready", inputs: names, active });
    };

    reconnect.current = connect;

    navigator
      .requestMIDIAccess()
      .then((granted) => {
        if (cancelled) return;
        access = granted;
        access.onstatechange = (event) => {
          if ((event as MIDIConnectionEvent).port?.state === "disconnected") tracker.clear();
          connect();
        };
        connect();
      })
      .catch(() => !cancelled && setStatus({ state: "blocked" }));

    return () => {
      cancelled = true;
      if (!access) return;
      access.onstatechange = null;
      for (const input of access.inputs.values()) input.onmidimessage = null;
    };
  }, [tracker]);

  useEffect(() => {
    if (wanted.current === chosen) return;
    wanted.current = chosen;
    tracker.clear();
    reconnect.current();
  }, [tracker, chosen]);

  return status;
}

const COMPUTER_KEYS = "awsedftgyhujkolp;";

/** Plays notes from the computer keyboard: A to K is one octave from C, Z and X change octave. */
export function useComputerKeys(tracker: NoteTracker): number {
  const [base, setBase] = useState(60);

  useEffect(() => {
    const pressed = new Map<string, number>();
    const releaseAll = () => {
      for (const note of pressed.values()) tracker.noteOff(note);
      pressed.clear();
    };
    const ignore = (event: KeyboardEvent) =>
      event.metaKey || event.ctrlKey || event.altKey ||
      (event.target instanceof HTMLElement &&
        event.target.closest("input:not([type=checkbox]):not([type=radio]), select, textarea") !== null);

    const onDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        releaseAll();
        tracker.clear();
        return;
      }
      if (event.repeat || ignore(event)) return;
      const key = event.key.toLowerCase();
      if (key === "z" || key === "x") {
        releaseAll();
        setBase((b) => Math.min(96, Math.max(24, b + (key === "z" ? -12 : 12))));
        return;
      }
      const offset = COMPUTER_KEYS.indexOf(key);
      if (offset < 0 || pressed.has(key)) return;
      event.preventDefault();
      pressed.set(key, base + offset);
      tracker.noteOn(base + offset);
    };

    const onUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const note = pressed.get(key);
      if (note === undefined) return;
      pressed.delete(key);
      tracker.noteOff(note);
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseAll);
    return () => {
      releaseAll();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", releaseAll);
    };
  }, [tracker, base]);

  return base;
}
