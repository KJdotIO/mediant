import { identify, type NoteReading } from "./identify.ts";
import { keyContext, keyRoot, type Key, type KeyContext } from "./key.ts";
import { DEFAULT_SPELLINGS, pitchClass, spellingName } from "./notes.ts";

/** Why a chord is suggested. `of` and `from` are ASCII names, for `formatSymbol`. */
export type Reason =
  | { kind: "home" }
  | { kind: "fifth" }
  | { kind: "fifthUp" }
  | { kind: "deceptive" }
  | { kind: "secondary"; of: string }
  | { kind: "tritone"; of: string }
  | { kind: "borrowed"; from: string }
  | { kind: "shared"; count: number };

export interface Suggestion {
  symbol: string;
  quality: string;
  roman?: string;
  rootPc: number;
  /** The chord voiced as close to the played notes as it can be, lowest first. */
  notes: NoteReading[];
  /** Pitch classes a voicing needs to count as this chord: the root, the third and the seventh. */
  required: number[];
  reason: Reason;
}

/**
 * How suggestions are voiced. `closest` moves the hand as little as it can and allows inversions.
 * `root` keeps the root in the bass. `rich` puts the root in the left hand and a rootless voicing
 * with 9ths and 13ths in the right, near the hand but not as close as it can be.
 */
export type VoicingStyle = "closest" | "root" | "rich";

export interface SuggestOptions {
  key?: Key;
  count?: number;
  voicing?: VoicingStyle;
}

export interface SuggestResult {
  key: Key;
  /** True when no key was set and the key comes from the chord itself. */
  guessed: boolean;
  suggestions: Suggestion[];
}

type ChordType = "maj" | "min" | "dim" | "maj7" | "m7" | "7" | "m7b5" | "dim7";

const TYPES: Record<ChordType, { tones: number[]; required: number[]; tensions: number[] }> = {
  maj: { tones: [0, 4, 7], required: [0, 4, 7], tensions: [] },
  min: { tones: [0, 3, 7], required: [0, 3, 7], tensions: [] },
  dim: { tones: [0, 3, 6], required: [0, 3, 6], tensions: [] },
  maj7: { tones: [0, 4, 7, 11], required: [0, 4, 11], tensions: [2, 9] },
  m7: { tones: [0, 3, 7, 10], required: [0, 3, 10], tensions: [2, 5] },
  "7": { tones: [0, 4, 7, 10], required: [0, 4, 10], tensions: [2, 9] },
  m7b5: { tones: [0, 3, 6, 10], required: [0, 3, 6, 10], tensions: [5] },
  dim7: { tones: [0, 3, 6, 9], required: [0, 3, 6, 9], tensions: [] },
};

/**
 * Rootless voicings for the right hand, as semitones above the root: the A form starts on the
 * third, the B form on the seventh. `alt` is for a dominant that resolves to a minor chord.
 */
const ROOTLESS: Partial<Record<ChordType | "alt", number[][]>> = {
  maj7: [[4, 7, 11, 14], [11, 14, 16, 19]],
  m7: [[3, 7, 10, 14], [10, 14, 15, 19]],
  "7": [[4, 9, 10, 14], [10, 14, 16, 21]],
  alt: [[4, 8, 10, 13], [10, 13, 16, 20]],
  m7b5: [[3, 6, 10, 12], [10, 12, 15, 18]],
  dim7: [[3, 6, 9, 12], [9, 12, 15, 18]],
};
/** D3 to C6: below D3 a rootless voicing is mud. */
const ROOTLESS_RANGE = [50, 84] as const;

/** Chords in a key: semitones above the tonic, then the seventh chord and the triad on that note. */
const DIATONIC: Record<Key["mode"], ReadonlyArray<[step: number, seventh: ChordType, triad: ChordType]>> = {
  major: [[0, "maj7", "maj"], [2, "m7", "min"], [4, "m7", "min"], [5, "maj7", "maj"], [7, "7", "maj"], [9, "m7", "min"], [11, "m7b5", "dim"]],
  minor: [[0, "m7", "min"], [2, "m7b5", "dim"], [3, "maj7", "maj"], [5, "m7", "min"], [7, "7", "maj"], [8, "maj7", "maj"], [10, "7", "maj"], [11, "dim7", "dim"]],
};

/** Chords that a secondary dominant can lead to, with their Roman numerals. */
const SECONDARY_TARGETS: Record<Key["mode"], ReadonlyArray<[step: number, numeral: string]>> = {
  major: [[2, "ii"], [4, "iii"], [5, "IV"], [7, "V"], [9, "vi"]],
  minor: [[3, "bIII"], [5, "iv"], [8, "bVI"]],
};

const BORROWED: ReadonlyArray<[step: number, seventh: ChordType, triad: ChordType]> = [[5, "m7", "min"], [8, "maj7", "maj"], [10, "7", "maj"]];

/** Function costs, added to how far the hand moves. Lower is a stronger pull. */
const COST = { home: -1, fifth: 0, deceptive: 0, secondaryFifth: 0.5, tritoneStep: 1.5, borrowed: 2, diatonic: 1.5, secondary: 2, tritone: 3 };
const FUNCTION_WEIGHT = 3;
/** The bass leaps by fourths and fifths as a matter of course, so its movement counts for less. */
const BASS_WEIGHT = 0.2;
const DOUBLING_PENALTY = 0.5;
/** Furthest an upper voice moves, in semitones. */
const REACH = 5;
/**
 * A lowest note at least this far below the next is a separate bass. In a voicing with no separate
 * bass, the lowest note is the root, the third or the fifth, and each step from the root costs
 * `INVERSION_PENALTY`.
 */
const BASS_GAP = 7;
/** E1: a bass below this is mud. */
const LOWEST_BASS = 28;
/** A bass that steps to the chord's third, such as C to G/B, costs this much more than the root. */
const INVERSION_PENALTY = 0.5;
/** Furthest the bass steps to land on the third. */
const INVERSION_STEP = 2;
/** A rich voicing moves the hand further by design, so its movement counts for half. */
const RICH_MOVE_WEIGHT = 0.5;
const RICH_DEGREES = new Set(["9", "b9", "#9", "11", "#11", "13", "b13"]);

type Shape = "major" | "dominant" | "minor" | "minorTonic" | "halfDiminished" | "diminished";

interface Candidate {
  root: number;
  type: ChordType;
  reason: Reason;
  cost: number;
  /** A dominant that resolves to a minor chord, so a rich voicing takes b9 and b13. */
  alt?: boolean;
}

/** The key a chord most likely belongs to, read the way a jazz player would: m7 as ii, 7 as V. */
function guessKey(shape: Shape, root: number): Key {
  const [offset, mode] = {
    major: [0, "major"],
    dominant: [5, "major"],
    minor: [10, "major"],
    minorTonic: [0, "minor"],
    halfDiminished: [10, "minor"],
    diminished: [1, "minor"],
  }[shape] as [number, Key["mode"]];
  const tonic = pitchClass(root + offset);
  return { tonic: spellingName(DEFAULT_SPELLINGS[mode][tonic]!), mode };
}

function candidates(key: KeyContext, sevenths: boolean, root: number, dominant: boolean, played: Set<number>): Candidate[] {
  const t = key.tonicPc;
  const kind = (seventh: ChordType, triad: ChordType) => (sevenths ? seventh : triad);
  const interval = (r: number) => pitchClass(r - root);
  const shared = (r: number, type: ChordType) => TYPES[type].tones.filter((i) => played.has(pitchClass(r + i))).length;
  const list: Candidate[] = [];

  for (const [step, seventh, triad] of DIATONIC[key.mode]) {
    const r = pitchClass(t + step);
    const type = kind(seventh, triad);
    const deceptive = dominant && interval(t + 7) === 0 && step === (key.mode === "major" ? 9 : 8);
    const [reason, cost]: [Reason, number] =
      step === 0 && dominant && interval(r) === 5 ? [{ kind: "home" }, COST.home]
      : interval(r) === 5 ? [{ kind: "fifth" }, COST.fifth]
      : deceptive ? [{ kind: "deceptive" }, COST.deceptive]
      : interval(r) === 7 ? [{ kind: "fifthUp" }, dominant ? COST.secondary : COST.diatonic]
      : [{ kind: "shared", count: shared(r, type) }, COST.diatonic];
    list.push({ root: r, type, reason, cost, alt: key.mode === "minor" && step === 7 });
  }

  const dominants = [7, ...SECONDARY_TARGETS[key.mode].map(([step]) => step + 7)].map((step) => pitchClass(t + step));
  for (const [step, numeral] of SECONDARY_TARGETS[key.mode]) {
    const r = pitchClass(t + step + 7);
    const cost = interval(r) === 5 ? COST.secondaryFifth : COST.secondary;
    list.push({ root: r, type: kind("7", "maj"), reason: { kind: "secondary", of: numeral }, cost, alt: numeral === numeral.toLowerCase() });
  }
  if (sevenths) {
    for (const d of dominants) {
      const r = pitchClass(d + 6);
      const of = `${spellingName(keyRoot(key, d, "major").root)}7`;
      const fromTwo = !dominant && interval(r) === 11 && pitchClass(root - (d + 5)) === 2;
      list.push({ root: r, type: "7", reason: { kind: "tritone", of }, cost: fromTwo ? COST.tritoneStep : COST.tritone });
    }
  }
  if (key.mode === "major") {
    const from = `${spellingName(key.tonic)} minor`;
    for (const [step, seventh, triad] of BORROWED) {
      list.push({ root: pitchClass(t + step), type: kind(seventh, triad), reason: { kind: "borrowed", from }, cost: COST.borrowed });
    }
  }

  const seen = new Map<string, Candidate>();
  for (const c of list) {
    const id = `${c.root} ${TYPES[c.type].tones.join()}`;
    if (c.root !== root && (!seen.has(id) || seen.get(id)!.cost > c.cost)) seen.set(id, c);
  }
  return [...seen.values()];
}

/**
 * Moves each played note to the nearest note of the chord, without crossing voices, so the chord
 * keeps its root, third and seventh. A separate bass moves to the root. Returns the notes and how
 * far the hand moves, or null when the notes can't cover the chord.
 */
/** True when a voicing reads as the chord it was built for, so its name matches its reason. */
type Check = (notes: readonly number[]) => boolean;

function voice(
  played: readonly number[],
  root: number,
  type: ChordType,
  rich: boolean,
  style: VoicingStyle,
  check: Check,
): { notes: number[]; cost: number } | null {
  const { tones, required, tensions } = TYPES[type];
  const allowed = new Set([...tones, ...(rich ? tensions : [])]);
  const split = style === "root" ? played.length >= 3 : played.length >= 3 && played[1]! - played[0]! >= BASS_GAP;
  if (!split) {
    const lowest = new Map([[0, 0], [tones[1]!, INVERSION_PENALTY], [tones[2]!, 2 * INVERSION_PENALTY]]);
    return nearestVoicing(played, root, allowed, required, check, lowest);
  }

  const bass = played[0]!;
  const upper = played.slice(1);
  const options: Array<{ notes: number[]; cost: number }> = [];
  const third = tones[1]!;
  const bassChoices: Array<[bassInterval: number, extra: number]> = [[0, 0]];
  if (style === "closest") bassChoices.push([third, INVERSION_PENALTY]);
  for (const [bassInterval, extra] of bassChoices) {
    const pc = pitchClass(root + bassInterval);
    const reach = bassInterval === 0 ? 24 : INVERSION_STEP;
    const under = (notes: readonly number[]) => bassNear(bass, notes[0]!, pc, reach);
    const withBass = (notes: readonly number[]) => {
      const note = under(notes);
      return note !== null && check([note, ...notes]);
    };
    const voiced = nearestVoicing(upper, root, allowed, required.filter((i) => i !== bassInterval), withBass);
    const note = voiced && under(voiced.notes);
    if (voiced && note !== null && note !== undefined) {
      options.push({ notes: [note, ...voiced.notes], cost: voiced.cost + BASS_WEIGHT * Math.abs(note - bass) + extra });
    }
  }
  return options.sort((a, b) => a.cost - b.cost)[0] ?? null;
}

/**
 * Moves each note to the nearest note of the chord, without crossing voices, so that the voicing
 * covers every `needed` interval above the root. Returns null when the notes can't cover them.
 */
function nearestVoicing(
  upper: readonly number[],
  root: number,
  allowed: Set<number>,
  needed: number[],
  check: Check,
  lowest?: ReadonlyMap<number, number>,
): { notes: number[]; cost: number } | null {
  if (needed.length > upper.length) return null;
  const options = upper.map((note) => {
    const near: number[] = [];
    for (let p = note - REACH; p <= note + REACH; p++) if (allowed.has(pitchClass(p - root))) near.push(p);
    return near.sort((a, b) => Math.abs(a - note) - Math.abs(b - note) || a - b);
  });

  let best: number[] | null = null;
  let bestCost = Infinity;
  const chosen: number[] = [];
  const search = (i: number, cost: number) => {
    if (cost >= bestCost) return;
    const covered = new Set(chosen.map((p) => pitchClass(p - root)));
    const missing = needed.filter((n) => !covered.has(n)).length;
    if (missing > upper.length - i) return;
    if (i === upper.length) {
      if (!check(chosen)) return;
      best = [...chosen];
      bestCost = cost;
      return;
    }
    for (const p of options[i]!) {
      if (chosen.length && p <= chosen[chosen.length - 1]!) continue;
      const interval = pitchClass(p - root);
      const bass = i === 0 && lowest ? lowest.get(interval) : 0;
      if (bass === undefined) continue;
      const doubled = covered.has(interval) && interval !== 0 && interval !== 7 ? DOUBLING_PENALTY : 0;
      chosen.push(p);
      search(i + 1, cost + Math.abs(p - upper[i]!) + doubled + bass);
      chosen.pop();
    }
  };
  search(0, 0);
  return best ? { notes: best, cost: bestCost } : null;
}

/** The nearest note of a pitch class to the played bass, below the voicing and within `reach`. */
function bassNear(bass: number, above: number, pc: number, reach: number): number | null {
  const up = pitchClass(pc - bass);
  const fits = [up, up - 12, up - 24]
    .filter((k) => Math.abs(k) <= reach && bass + k < above && bass + k >= LOWEST_BASS)
    .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b);
  return fits.length ? bass + fits[0]! : null;
}

/**
 * The root in the left hand and a rootless voicing in the right, placed where it is nearest the
 * hand. Returns null for chords with no rootless voicing, such as triads.
 */
function voiceRich(played: readonly number[], root: number, type: ChordType, alt: boolean, check: Check): { notes: number[]; cost: number } | null {
  const forms = ROOTLESS[alt && type === "7" ? "alt" : type];
  if (!forms) return null;
  const split = played.length >= 3 && played[1]! - played[0]! >= BASS_GAP;
  const upper = split ? played.slice(1) : played;
  const nearest = (p: number) => Math.min(...upper.map((u) => Math.abs(p - u)));
  let best: { notes: number[]; cost: number } | null = null;
  for (const form of forms) {
    for (let base = root; base <= ROOTLESS_RANGE[1]; base += 12) {
      const hand = form.map((i) => base + i);
      if (hand[0]! < ROOTLESS_RANGE[0] || hand[hand.length - 1]! > ROOTLESS_RANGE[1]) continue;
      const bass = bassNear(played[0]!, hand[0]! - 2, root, 24);
      if (bass === null) continue;
      const notes = [bass, ...hand];
      const cost = RICH_MOVE_WEIGHT * (hand.reduce((sum, p) => sum + nearest(p), 0) + BASS_WEIGHT * Math.abs(bass - played[0]!));
      if ((!best || cost < best.cost) && check(notes)) best = { notes, cost };
    }
  }
  return best;
}

/**
 * Suggests chords to play next from the voicing under your hands. Each suggestion is voiced as
 * close to what you played as it can be, and ranked by how little the hand moves and how strongly
 * the chord follows in the key. With no key set, the key comes from the chord: m7 reads as ii,
 * 7 as V. The same notes always give the same suggestions.
 */
export function suggest(midiNotes: readonly number[], options: SuggestOptions = {}): SuggestResult | null {
  const played = [...new Set(midiNotes)].sort((a, b) => a - b);
  const reading = identify(played, options.key ? { key: options.key } : {});
  if (reading?.kind !== "chord") return null;
  const root = reading.notes.find((n) => n.degree === "1")!.pitchClass;
  const degrees = new Set(reading.notes.map((n) => n.degree));
  const shape: Shape = degrees.has("bb7")
    ? "diminished"
    : degrees.has("b3")
      ? degrees.has("b5") ? (degrees.has("b7") ? "halfDiminished" : "diminished") : degrees.has("7") || degrees.has("6") ? "minorTonic" : "minor"
      : degrees.has("b7") || degrees.has("#5") ? "dominant" : "major";

  const key = options.key ?? guessKey(shape, root);
  const context = keyContext(key);
  const pcs = new Set(reading.notes.map((n) => n.pitchClass));
  const style = options.voicing ?? "closest";
  const sevenths = style === "rich" || degrees.has("b7") || degrees.has("7") || degrees.has("bb7") || pcs.size >= 4;
  const rich = [...degrees].some((d) => d && RICH_DEGREES.has(d));
  const dominant = shape === "dominant" || (shape === "major" && pitchClass(root - context.tonicPc) === 7 && !degrees.has("7"));

  const ranked = candidates(context, sevenths, root, dominant, pcs)
    .map((candidate, order) => {
      const check: Check = (notes) => {
        const chord = identify(notes, { key });
        return chord?.kind === "chord" && chord.notes.find((n) => n.degree === "1")!.pitchClass === candidate.root;
      };
      const voicing =
        style === "rich"
          ? voiceRich(played, candidate.root, candidate.type, candidate.alt ?? false, check)
          : voice(played, candidate.root, candidate.type, rich, style, check);
      return voicing && { candidate, order, notes: voicing.notes, score: voicing.cost + FUNCTION_WEIGHT * candidate.cost };
    })
    .filter((x) => x !== null)
    .sort((a, b) => a.score - b.score || a.candidate.cost - b.candidate.cost || a.order - b.order);

  const count = options.count ?? 3;
  const used = new Set<Reason["kind"]>();
  const suggestions: Suggestion[] = [];
  for (const { candidate, notes } of ranked) {
    if (suggestions.length >= count) break;
    const { kind } = candidate.reason;
    if ((kind === "tritone" || kind === "borrowed") && used.has(kind)) continue;
    const chord = identify(notes, { key });
    if (chord?.kind !== "chord") continue;
    used.add(kind);
    suggestions.push({
      symbol: chord.symbol,
      quality: chord.quality,
      ...(chord.roman ? { roman: chord.roman } : {}),
      rootPc: candidate.root,
      notes: chord.notes,
      required: TYPES[candidate.type].required.map((i) => pitchClass(candidate.root + i)),
      reason: candidate.reason,
    });
  }
  return { key, guessed: !options.key, suggestions };
}
