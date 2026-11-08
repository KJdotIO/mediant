import { useEffect, useState } from "react";
import type { NoteEvent, NoteTracker } from "../notes.ts";
import { audioContext } from "./context.ts";

export interface SoundPack {
  id: string;
  name: string;
  description: string;
  license: string;
  credit: string;
  url: string;
  release: number;
  layers: Array<{ lo: number; hi: number }>;
  zones: Array<{ key: number; layer: number; file: string }>;
}

export const SOUNDS = [
  ["felt", "Felt Piano"],
  ["upright", "Upright Piano"],
  ["grand", "Grand Piano"],
] as const;

export type SoundId = (typeof SOUNDS)[number][0];

const LOAD_CONCURRENCY = 8;
const RESTRIKE_FADE = 0.04;
const HEADROOM = 0.5;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

/** Picks the sample zone for a note: the velocity layer, then the nearest sampled key. */
export function pickZone(pack: SoundPack, note: number, velocity: number) {
  const layer = Math.max(0, pack.layers.findIndex((l) => velocity >= l.lo && velocity <= l.hi));
  let best: SoundPack["zones"][number] | undefined;
  for (const zone of pack.zones) {
    if (zone.layer !== layer) continue;
    if (!best || Math.abs(zone.key - note) < Math.abs(best.key - note)) best = zone;
  }
  const range = pack.layers[layer] ?? { lo: 1, hi: 127 };
  const within = range.hi > range.lo ? (velocity - range.lo) / (range.hi - range.lo) : 1;
  return best && { zone: best, rate: 2 ** ((note - best.key) / 12), gain: HEADROOM * (0.55 + 0.45 * within) };
}

/** Plays a sampled piano from note events, with its own sustain pedal handling. */
export class Piano {
  private readonly ctx = audioContext();
  private readonly output: GainNode;
  private pack: SoundPack | undefined;
  private buffers = new Map<string, AudioBuffer>();
  private voices = new Map<number, Voice>();
  private held = new Set<number>();
  private pedal = false;
  private loadId = 0;

  constructor() {
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    this.output = this.ctx.createGain();
    this.output.connect(limiter).connect(this.ctx.destination);
  }

  setVolume(volume: number) {
    this.output.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  async load(id: SoundId, onProgress: (fraction: number) => void): Promise<void> {
    const loadId = ++this.loadId;
    const base = `${import.meta.env.BASE_URL}sounds/${id}/`;
    const pack: SoundPack = await (await fetch(`${base}manifest.json`)).json();
    const buffers = new Map<string, AudioBuffer>();
    let next = 0;
    const worker = async () => {
      while (next < pack.zones.length) {
        const zone = pack.zones[next++]!;
        const response = await fetch(base + zone.file);
        if (!response.ok) throw new Error(`${response.status} for ${zone.file}`);
        const data = await response.arrayBuffer();
        buffers.set(zone.file, await this.ctx.decodeAudioData(data));
        if (loadId === this.loadId) onProgress(buffers.size / pack.zones.length);
      }
    };
    await Promise.all(Array.from({ length: LOAD_CONCURRENCY }, worker));
    if (loadId !== this.loadId) return;
    this.allOff();
    this.pack = pack;
    this.buffers = buffers;
  }

  unload() {
    this.loadId++;
    this.allOff();
    this.pack = undefined;
    this.buffers = new Map();
  }

  handle = (event: NoteEvent) => {
    switch (event.type) {
      case "on":
        return this.noteOn(event.note, event.velocity);
      case "off":
        this.held.delete(event.note);
        if (!this.pedal) this.release(event.note);
        return;
      case "pedal":
        this.pedal = event.down;
        if (!event.down) for (const note of [...this.voices.keys()]) if (!this.held.has(note)) this.release(note);
        return;
      case "clear":
        this.held.clear();
        return this.allOff();
    }
  };

  private noteOn(note: number, velocity: number) {
    this.held.add(note);
    if (!this.pack) return;
    const picked = pickZone(this.pack, note, velocity);
    const buffer = picked && this.buffers.get(picked.zone.file);
    if (!picked || !buffer) return;
    this.stop(note, RESTRIKE_FADE);
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = picked.rate;
    const gain = this.ctx.createGain();
    gain.gain.value = picked.gain;
    source.connect(gain).connect(this.output);
    source.start(now);
    const voice = { source, gain };
    source.onended = () => {
      if (this.voices.get(note) === voice) this.voices.delete(note);
      gain.disconnect();
    };
    this.voices.set(note, voice);
  }

  private release(note: number) {
    this.stop(note, this.pack?.release ?? 0.3);
  }

  private stop(note: number, seconds: number) {
    const voice = this.voices.get(note);
    if (!voice) return;
    this.voices.delete(note);
    const now = this.ctx.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.setTargetAtTime(0, now, seconds / 4);
    voice.source.stop(now + seconds * 2);
  }

  private allOff() {
    for (const note of [...this.voices.keys()]) this.stop(note, RESTRIKE_FADE);
  }
}

let piano: Piano | undefined;

export type SoundState = { state: "off" } | { state: "loading"; progress: number } | { state: "ready" } | { state: "error" };

/** Loads the chosen sound and plays it from the tracker's note events. */
export function usePiano(tracker: NoteTracker, sound: SoundId | "", volume: number): SoundState {
  const [state, setState] = useState<SoundState>({ state: "off" });

  useEffect(() => {
    if (!sound) {
      piano?.unload();
      setState({ state: "off" });
      return;
    }
    piano ??= new Piano();
    const instance = piano;
    let cancelled = false;
    setState({ state: "loading", progress: 0 });
    instance
      .load(sound, (progress) => !cancelled && setState({ state: "loading", progress }))
      .then(() => !cancelled && setState({ state: "ready" }))
      .catch(() => !cancelled && setState({ state: "error" }));
    const unlisten = tracker.listen(instance.handle);
    return () => {
      cancelled = true;
      unlisten();
    };
  }, [tracker, sound]);

  useEffect(() => {
    piano?.setVolume(volume);
  }, [volume, sound]);

  return state;
}
