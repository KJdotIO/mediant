import { formatSymbol, type Degree, type NoteReading, type Reading, type Reason, type Suggestion } from "@mediant/theory";

/** The big text for a reading: the chord symbol, the note, the interval name or "Cluster". */
export function readingTitle(reading: Reading | null): string {
  if (!reading) return "";
  switch (reading.kind) {
    case "chord":
      return formatSymbol(reading.symbol);
    case "note":
      return formatSymbol(reading.name);
    case "interval":
      return reading.name.charAt(0).toUpperCase() + reading.name.slice(1);
    case "cluster":
      return "Cluster";
  }
}

/** Keys lifted within this many milliseconds of silence count as one release. */
export const RELEASE_WINDOW = 250;

/**
 * A gap shorter than this between chords isn't silence: the last chord stays on screen, at full
 * strength, until the next one arrives. Without it the display flickers on every chord change.
 */
export const HOLD_GRACE_MS = 300;

export interface Sample {
  at: number;
  reading: Reading;
}

/**
 * Picks the chord to hold once every note stops. Fingers never lift at the same instant, so the
 * last reading is often one stray note. Take the fullest reading that was showing at any point
 * in the release window instead.
 */
export function heldReading(history: readonly Sample[], now: number): Reading | null {
  let best: Reading | null = null;
  history.forEach((sample, i) => {
    const shownUntil = history[i + 1]?.at ?? now;
    if (shownUntil < now - RELEASE_WINDOW) return;
    if (!best || sample.reading.notes.length >= best.notes.length) best = sample.reading;
  });
  return best;
}

/**
 * The reading to show while keys come up. Fingers never lift together, so each key up leaves a
 * smaller chord for a few milliseconds. While the notes sounding are part of the fuller chord shown
 * within the release window, that chord stays. A new note, or holding the smaller chord past the
 * window, shows what you play.
 */
export function releaseReading(history: readonly Sample[], live: Reading | null, now: number): Reading | null {
  if (!live) return null;
  const fuller = heldReading(history, now);
  if (!fuller || fuller.notes.length <= live.notes.length) return live;
  const notes = new Set(fuller.notes.map((n) => n.midi));
  return live.notes.every((n) => notes.has(n.midi)) ? fuller : live;
}

export interface NoteGroup {
  id: string;
  name: string;
  pitchClass: number;
  count: number;
  degree?: Degree;
}

const withoutOctave = (name: string) => name.replace(/-?\d+$/, "");

/** One chip per note while they fit. Past the limit, one chip per note name with a count. */
export function noteGroups(notes: readonly NoteReading[], limit = 8): NoteGroup[] {
  const group = (n: NoteReading, id: string): NoteGroup => ({
    id,
    name: withoutOctave(n.name),
    pitchClass: n.pitchClass,
    count: 1,
    ...(n.degree ? { degree: n.degree } : {}),
  });
  if (notes.length <= limit) return notes.map((n) => group(n, String(n.midi)));
  const groups = new Map<string, NoteGroup>();
  for (const n of notes) {
    const name = withoutOctave(n.name);
    const existing = groups.get(name);
    if (existing) existing.count++;
    else groups.set(name, group(n, name));
  }
  return [...groups.values()];
}

const TREBLE_HIGHEST = 91;
const BASS_LOWEST = 29;

/**
 * Octaves to shift a staff so no note needs more than four ledger lines. The treble staff
 * shifts down (8va, 15ma) and the bass staff shifts up (8vb, 15mb).
 */
export function ottava(midi: readonly number[], clef: "treble" | "bass"): 0 | 1 | 2 {
  if (midi.length === 0) return 0;
  const extreme = clef === "treble" ? Math.max(...midi) - TREBLE_HIGHEST : BASS_LOWEST - Math.min(...midi);
  return extreme <= 0 ? 0 : extreme <= 12 ? 1 : 2;
}

/** Octave number for a MIDI note. Logic and Ableton call middle C "C3"; most other software calls it "C4". */
export const octaveOf = (midi: number, middleC: "C3" | "C4") => Math.floor(midi / 12) - (middleC === "C3" ? 2 : 1);

/** A chord must sound this long, unchanged, before the suggestions follow it. Faster playing leaves them as they were. */
export const SETTLE_MS = 400;

/** The short reason shown under a suggestion. */
export function reasonText(reason: Reason): string {
  switch (reason.kind) {
    case "home":
      return "Resolves home";
    case "fifth":
      return "Down a fifth";
    case "fifthUp":
      return "Up a fifth";
    case "deceptive":
      return "Deceptive cadence";
    case "secondary":
      return `V of ${formatSymbol(reason.of)}`;
    case "tritone":
      return `Tritone sub for ${formatSymbol(reason.of)}`;
    case "borrowed":
      return `From ${formatSymbol(reason.from)}`;
    case "shared":
      return reason.count === 0 ? "Shares no notes" : reason.count === 1 ? "Shares 1 note" : `Shares ${reason.count} notes`;
  }
}

/** The suggestion you're playing: same root, with its root, third and seventh all sounding. */
export function playedSuggestion(reading: Reading | null, suggestions: readonly Suggestion[]): number {
  if (reading?.kind !== "chord") return -1;
  const root = reading.notes.find((n) => n.degree === "1")?.pitchClass;
  const sounding = new Set(reading.notes.map((n) => n.pitchClass));
  return suggestions.findIndex((s) => s.rootPc === root && s.required.every((pc) => sounding.has(pc)));
}

export const sameNotes = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((n, i) => n === b[i]);
