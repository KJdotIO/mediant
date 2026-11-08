import { useEffect, useState } from "react";

export interface NoteSnapshot {
  notes: number[];
  pedal: boolean;
  /** Goes up by one each time someone clears the notes. */
  clears: number;
}

export type NoteEvent =
  | { type: "on"; note: number; velocity: number }
  | { type: "off"; note: number }
  | { type: "pedal"; down: boolean }
  | { type: "clear" };

/**
 * Tracks which notes sound. A note sounds while its key is down, or after release while the
 * sustain pedal is down. MIDI and the computer keyboard both feed one tracker.
 */
export class NoteTracker {
  private held = new Set<number>();
  private sustained = new Set<number>();
  private pedal = false;
  private clears = 0;
  private snapshot: NoteSnapshot = { notes: [], pedal: false, clears: 0 };
  private listeners = new Set<() => void>();
  private eventListeners = new Set<(event: NoteEvent) => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Receives every note, pedal and clear event as it happens, for sound. */
  listen(listener: (event: NoteEvent) => void) {
    this.eventListeners.add(listener);
    return () => void this.eventListeners.delete(listener);
  }

  noteOn(note: number, velocity = 96) {
    this.sustained.delete(note);
    this.held.add(note);
    this.send({ type: "on", note, velocity });
    this.emit();
  }

  noteOff(note: number) {
    if (!this.held.delete(note)) return;
    if (this.pedal) this.sustained.add(note);
    this.send({ type: "off", note });
    this.emit();
  }

  setPedal(down: boolean) {
    if (down === this.pedal) return;
    this.pedal = down;
    if (!down) this.sustained.clear();
    this.send({ type: "pedal", down });
    this.emit();
  }

  clear() {
    this.held.clear();
    this.sustained.clear();
    this.clears++;
    this.send({ type: "clear" });
    this.emit();
  }

  private send(event: NoteEvent) {
    for (const listener of this.eventListeners) listener(event);
  }

  private emit() {
    const notes = [...new Set([...this.held, ...this.sustained])].sort((a, b) => a - b);
    this.snapshot = { notes, pedal: this.pedal, clears: this.clears };
    for (const listener of this.listeners) listener();
  }
}

export type MidiStatus =
  | { state: "connecting" }
  | { state: "unsupported" }
  | { state: "blocked" }
  | { state: "ready"; inputs: string[]; active: string | undefined };

/** Connects every MIDI input to the tracker and follows devices as they connect and disconnect. */
export function useMidi(tracker: NoteTracker): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(() =>
    "requestMIDIAccess" in navigator ? { state: "connecting" } : { state: "unsupported" },
  );

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
      if (type === 0x90 && b > 0) {
        const name = (event.currentTarget as MIDIInput | null)?.name ?? undefined;
        if (name && name !== active) {
          active = name;
          setStatus({ state: "ready", inputs: names, active });
        }
        tracker.noteOn(a, b);
      } else if (type === 0x80 || type === 0x90) tracker.noteOff(a);
      else if (type === 0xb0 && a === 64) tracker.setPedal(b >= 64);
      else if (type === 0xb0 && (a === 120 || a === 123)) tracker.clear();
    };

    const connect = () => {
      if (!access) return;
      const inputs = [...access.inputs.values()].filter((input) => input.state === "connected");
      for (const input of inputs) input.onmidimessage = onMessage;
      names = inputs.map((input) => input.name ?? "MIDI keyboard");
      if (active && !names.includes(active)) active = undefined;
      setStatus({ state: "ready", inputs: names, active });
    };

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
