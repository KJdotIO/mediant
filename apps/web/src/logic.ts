import type { Degree, NoteReading, Reading } from "@mediant/theory";

/** Keys lifted within this many milliseconds of silence count as one release. */
export const RELEASE_WINDOW = 250;

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
