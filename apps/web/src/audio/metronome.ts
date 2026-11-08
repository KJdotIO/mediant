import { useEffect, useRef } from "react";
import { audioContext } from "./context.ts";

const LOOKAHEAD = 0.1;
const TICK_MS = 25;
export const BPM_MIN = 30;
export const BPM_MAX = 300;

export const clampBpm = (bpm: number) => Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));

/** Tempo from tap times in milliseconds: the average gap of the last few taps, or undefined. */
export function tapTempo(taps: readonly number[]): number | undefined {
  const recent = taps.slice(-5);
  if (recent.length < 2) return undefined;
  const gaps = recent.slice(1).map((t, i) => t - recent[i]!);
  return clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length));
}

/** The beat sounding at a given audio time: the latest booked click at or before it. */
export function beatAt(booked: ReadonlyArray<{ time: number; beat: number }>, now: number): number | undefined {
  let beat: number | undefined;
  for (const item of booked) if (item.time <= now) beat = item.beat;
  return beat;
}

/**
 * A click track scheduled on the audio clock. A timer looks a short way ahead and books each
 * click at an exact audio time, so the beat stays steady even when the page is busy.
 */
export class Metronome {
  private readonly ctx = audioContext();
  private readonly output: GainNode;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nextTime = 0;
  private nextBeat = 0;
  private booked: Array<{ time: number; beat: number }> = [];
  bpm = 100;
  beats = 4;

  constructor() {
    this.output = this.ctx.createGain();
    this.output.connect(this.ctx.destination);
  }

  get running() {
    return this.timer !== undefined;
  }

  setVolume(volume: number) {
    this.output.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.02);
  }

  start() {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.nextBeat = 0;
    this.booked = [];
    this.schedule();
    this.timer = setInterval(this.schedule, TICK_MS);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.booked = [];
  }

  /** The beat sounding now, counted from 0, or undefined when stopped. */
  currentBeat(): number | undefined {
    return this.running ? beatAt(this.booked, this.ctx.currentTime) : undefined;
  }

  private schedule = () => {
    const now = this.ctx.currentTime;
    this.booked = this.booked.filter((item) => item.time > now - 1);
    while (this.nextTime < now + LOOKAHEAD) {
      this.click(this.nextTime, this.nextBeat === 0);
      this.booked.push({ time: this.nextTime, beat: this.nextBeat });
      this.nextTime += 60 / this.bpm;
      this.nextBeat = (this.nextBeat + 1) % this.beats;
    }
  };

  private click(time: number, accent: boolean) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = accent ? 1760 : 1320;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(accent ? 0.9 : 0.6, time + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(this.output);
    osc.start(time);
    osc.stop(time + 0.07);
    osc.onended = () => gain.disconnect();
  }
}

let metronome: Metronome | undefined;

/** Runs the shared metronome and keeps its tempo, beats and volume in step with the settings. */
export function useMetronome(running: boolean, bpm: number, beats: number, volume: number) {
  const ref = useRef<Metronome | undefined>(undefined);
  useEffect(() => {
    if (!running) {
      metronome?.stop();
      return;
    }
    metronome ??= new Metronome();
    ref.current = metronome;
    metronome.bpm = bpm;
    metronome.beats = beats;
    metronome.setVolume(volume);
    metronome.start();
    return () => metronome?.stop();
  }, [running]);

  useEffect(() => {
    if (!metronome) return;
    metronome.bpm = bpm;
    metronome.beats = beats;
    metronome.setVolume(volume);
  }, [bpm, beats, volume, running]);

  return ref;
}
