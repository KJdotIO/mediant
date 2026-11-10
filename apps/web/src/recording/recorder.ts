import { useCallback, useEffect, useRef, useState } from "react";
import { audioContext } from "../audio/context.ts";
import { runningMetronome } from "../audio/metronome.ts";
import { muteLivePiano } from "../audio/piano.ts";
import type { NoteTracker } from "../notes.ts";
import { findLag, onsetTimes } from "./align.ts";
import { startCapture, type Capture } from "./audioInput.ts";
import { applyEvent, trimTake, type Take, type TakeAudio, type TakeEvent } from "./take.ts";

export type RecorderState =
  | { state: "idle" }
  | { state: "counting"; beatsLeft: number }
  /** Whole seconds, as the clock shows them. */
  | { state: "recording"; seconds: number }
  | { state: "saving" }
  | { state: "playing"; takeId: string; seconds: number };

interface Options {
  leadIn: number;
  tail: number;
  bpm: number;
  beats: number;
  key: string;
  nextNumber: number;
  /** The audio input to record alongside the notes, or "" for notes only. */
  audioInput: string;
  audioLabel: string;
  onTake: (take: Take, audio?: Blob) => void;
  onEmpty: () => void;
  onAudioError: () => void;
}

const now = () => performance.now();

/** Whether two states show the same thing, so the clock only redraws when a second passes. */
function sameState(a: RecorderState, b: RecorderState): boolean {
  const from: Record<string, unknown> = a;
  return Object.entries(b).every(([key, value]) => from[key] === value);
}

/** Mixes a recording to one channel for finding note attacks. */
function mono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i]! += data[i]! / buffer.numberOfChannels;
  }
  return out;
}

/**
 * Lines the recorded sound up with the notes. The browser hears your DAW a little after the
 * keyboard, so the delay is measured from the note attacks in the recording.
 */
async function alignAudio(blob: Blob, events: TakeEvent[], audioStart: number, shift: number, source: string): Promise<TakeAudio> {
  const buffer = await audioContext().decodeAudioData(await blob.arrayBuffer());
  const found = findLag(mono(buffer), buffer.sampleRate, onsetTimes(events).map((t) => t - audioStart));
  return { offset: audioStart - (found?.lag ?? 0) - shift, aligned: !!found, source };
}

/**
 * Records what you play into a take. With the metronome running, it restarts the click, counts
 * in one bar and keeps the take on the bar lines. With an audio input chosen, it records that
 * sound too. It also plays takes back through the tracker, so the whole app performs them.
 */
export function useRecorder(tracker: NoteTracker, options: Options) {
  const [state, setState] = useState<RecorderState>({ state: "idle" });
  const [inputAnalyser, setInputAnalyser] = useState<AnalyserNode>();
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<{ stop: () => Promise<void> | void } | undefined>(undefined);
  const show = useCallback((next: RecorderState) => setState((current) => (sameState(current, next) ? current : next)), []);

  const end = useCallback(async () => {
    const current = session.current;
    session.current = undefined;
    await current?.stop();
    setState({ state: "idle" });
  }, []);

  const record = useCallback(() => {
    void session.current?.stop();
    const { bpm, beats, audioInput } = latest.current;
    const capture: Promise<Capture | undefined> = audioInput
      ? startCapture(audioInput).catch(() => {
          latest.current.onAudioError();
          return undefined;
        })
      : Promise.resolve(undefined);
    void capture.then((c) => c && setInputAnalyser(c.analyser));
    const metronome = runningMetronome();
    const zero = metronome ? metronome.restart() : now();
    const countInEnds = metronome ? zero + (beats * 60_000) / bpm : zero;
    const events: TakeEvent[] = [];
    const unlisten = tracker.listen((event, at) => events.push({ ...event, t: Math.max(0, (at - zero) / 1000) }));

    const timer = setInterval(() => {
      const time = now();
      if (time < countInEnds) {
        show({ state: "counting", beatsLeft: Math.min(beats, Math.ceil((countInEnds - time) / (60_000 / bpm))) });
      } else {
        show({ state: "recording", seconds: Math.floor((time - countInEnds) / 1000) });
      }
    }, 50);

    session.current = {
      stop: async () => {
        clearInterval(timer);
        unlisten();
        setInputAnalyser(undefined);
        const stoppedAt = (now() - zero) / 1000;
        const { leadIn, tail, key, nextNumber, audioLabel, onTake, onEmpty } = latest.current;
        const recording = await capture;
        const grid = metronome ? { bar: (beats * 60) / bpm, beat: 60 / bpm } : undefined;
        const trimmed = trimTake(events, stoppedAt, { leadIn, tail, grid });
        if (!trimmed) {
          await recording?.stop();
          return onEmpty();
        }
        setState({ state: "saving" });
        let audio: { blob: Blob; meta: TakeAudio } | undefined;
        if (recording) {
          const blob = await recording.stop();
          const audioStart = ((await recording.started) - zero) / 1000;
          const meta = await alignAudio(blob, events, audioStart, trimmed.shift, audioLabel).catch(() => undefined);
          if (meta) audio = { blob, meta };
        }
        onTake(
          {
            id: crypto.randomUUID(),
            number: nextNumber,
            createdAt: Date.now(),
            duration: trimmed.duration,
            events: trimmed.events,
            bpm: metronome ? bpm : null,
            beats,
            key,
            ...(audio ? { audio: audio.meta } : {}),
          },
          audio?.blob,
        );
      },
    };
    setState(metronome ? { state: "counting", beatsLeft: beats } : { state: "recording", seconds: 0 });
  }, [tracker, show]);

  const play = useCallback(
    (take: Take, sound?: AudioBuffer) => {
      void session.current?.stop();
      tracker.clear();
      const ctx = audioContext();
      let source: AudioBufferSourceNode | undefined;
      muteLivePiano(!!sound);
      if (sound && take.audio) {
        source = ctx.createBufferSource();
        source.buffer = sound;
        source.connect(ctx.destination);
        const start = ctx.currentTime + 0.05;
        source.start(start + Math.max(0, take.audio.offset), Math.max(0, -take.audio.offset));
      }
      const start = now() + (source ? 50 : 0);
      let index = 0;
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        const t = (now() - start) / 1000;
        while (index < take.events.length && take.events[index]!.t <= t) applyEvent(tracker, take.events[index++]!);
        if (t >= take.duration) return void end();
        show({ state: "playing", takeId: take.id, seconds: Math.max(0, Math.floor(t)) });
        timer = setTimeout(tick, 4);
      };
      session.current = {
        stop: () => {
          clearTimeout(timer);
          source?.stop();
          tracker.clear();
          muteLivePiano(false);
        },
      };
      tick();
    },
    [tracker, end, show],
  );

  useEffect(() => () => void session.current?.stop(), []);

  return { state, record, stop: end, play, inputAnalyser };
}
