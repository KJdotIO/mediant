const HOP = 0.0025;
const CHORD_WINDOW = 0.03;
/** The average jump in log energy a real note attack makes: about four times louder. */
const MIN_ATTACK = Math.log(4);

/** Note onsets from a take, merged so a chord counts once. Times in seconds. */
export function onsetTimes(events: ReadonlyArray<{ t: number; type: string }>): number[] {
  const times: number[] = [];
  for (const event of events) {
    if (event.type !== "on") continue;
    if (times.length && event.t - times[times.length - 1]! < CHORD_WINDOW) continue;
    times.push(event.t);
  }
  return times;
}

/** How sharply the sound gets louder in each 2.5 ms step: high at every note attack. */
function attackStrength(samples: Float32Array, sampleRate: number): Float32Array {
  const hop = Math.round(sampleRate * HOP);
  const frames = Math.floor(samples.length / hop);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop, end = Math.min(samples.length, i + hop * 2); i < end; i++) sum += samples[i]! * samples[i]!;
    energy[f] = Math.log(1e-9 + sum);
  }
  const strength = new Float32Array(frames);
  for (let f = 4; f < frames; f++) {
    const before = Math.min(energy[f - 1]!, energy[f - 2]!, energy[f - 3]!, energy[f - 4]!);
    strength[f] = Math.max(0, energy[f]! - before);
  }
  return strength;
}

export interface Alignment {
  /** Seconds the sound arrives after the notes. */
  lag: number;
  /** How far the best match stands above the average. Below about 1.5 the match is a guess. */
  confidence: number;
}

/**
 * Finds the delay between the notes you played and the recorded sound. It slides the note
 * onsets across the recording and keeps the delay where they land on the most attacks.
 * `onsets` are in seconds from the first recorded sample. Returns null when the recording has
 * no clear attacks to match.
 */
export function findLag(
  samples: Float32Array,
  sampleRate: number,
  onsets: readonly number[],
  { min = -0.05, max = 0.3 } = {},
): Alignment | null {
  if (onsets.length === 0) return null;
  const strength = attackStrength(samples, sampleRate);
  const peak = (frame: number) =>
    Math.max(strength[frame - 1] ?? 0, strength[frame] ?? 0, strength[frame + 1] ?? 0);
  const scores: number[] = [];
  let best = { lag: 0, score: -1 };
  for (let lag = min; lag <= max + 1e-9; lag += HOP) {
    let score = 0;
    for (const t of onsets) score += peak(Math.round((t + lag) / HOP));
    scores.push(score);
    if (score > best.score) best = { lag, score };
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (best.score / onsets.length < MIN_ATTACK) return null;
  return { lag: Math.round(best.lag * 10000) / 10000, confidence: mean > 0 ? best.score / mean : Infinity };
}
