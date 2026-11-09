import { useCallback, useEffect, useRef, useState } from "react";
import { runningMetronome } from "../audio/metronome.ts";
import type { NoteTracker } from "../notes.ts";
import { applyEvent, trimTake, type Take, type TakeEvent } from "./take.ts";

export type RecorderState =
  | { state: "idle" }
  | { state: "counting"; beatsLeft: number }
  | { state: "recording"; seconds: number }
  | { state: "playing"; takeId: string; seconds: number };

interface Options {
  leadIn: number;
  tail: number;
  bpm: number;
  beats: number;
  key: string;
  nextNumber: number;
  onTake: (take: Take) => void;
  onEmpty: () => void;
}

const now = () => performance.now();

/**
 * Records what you play into a take. With the metronome running, it restarts the click, counts
 * in one bar and keeps the take on the bar lines. It also plays takes back through the tracker,
 * so the whole app performs them.
 */
export function useRecorder(tracker: NoteTracker, options: Options) {
  const [state, setState] = useState<RecorderState>({ state: "idle" });
  const latest = useRef(options);
  latest.current = options;
  const session = useRef<{ stop: () => void } | undefined>(undefined);

  const end = useCallback(() => {
    session.current?.stop();
    session.current = undefined;
    setState({ state: "idle" });
  }, []);

  const record = useCallback(() => {
    session.current?.stop();
    const { bpm, beats } = latest.current;
    const metronome = runningMetronome();
    const zero = metronome ? metronome.restart() : now();
    const countInEnds = metronome ? zero + (beats * 60_000) / bpm : zero;
    const events: TakeEvent[] = [];
    const unlisten = tracker.listen((event) => events.push({ ...event, t: Math.max(0, (now() - zero) / 1000) }));

    const timer = setInterval(() => {
      const time = now();
      if (time < countInEnds) {
        setState({ state: "counting", beatsLeft: Math.min(beats, Math.ceil((countInEnds - time) / (60_000 / bpm))) });
      } else {
        setState({ state: "recording", seconds: (time - countInEnds) / 1000 });
      }
    }, 50);

    session.current = {
      stop: () => {
        clearInterval(timer);
        unlisten();
        const { leadIn, tail, key, nextNumber, onTake, onEmpty } = latest.current;
        const trimmed = trimTake(events, (now() - zero) / 1000, { leadIn, tail, aligned: !!metronome });
        if (!trimmed) return onEmpty();
        onTake({
          id: crypto.randomUUID(),
          number: nextNumber,
          createdAt: Date.now(),
          duration: trimmed.duration,
          events: trimmed.events,
          bpm: metronome ? bpm : null,
          beats,
          key,
        });
      },
    };
    setState(metronome ? { state: "counting", beatsLeft: beats } : { state: "recording", seconds: 0 });
  }, [tracker]);

  const play = useCallback(
    (take: Take) => {
      session.current?.stop();
      tracker.clear();
      const start = now();
      let index = 0;
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        const t = (now() - start) / 1000;
        while (index < take.events.length && take.events[index]!.t <= t) applyEvent(tracker, take.events[index++]!);
        if (t >= take.duration) return end();
        setState({ state: "playing", takeId: take.id, seconds: t });
        timer = setTimeout(tick, 4);
      };
      session.current = {
        stop: () => {
          clearTimeout(timer);
          tracker.clear();
        },
      };
      tick();
    },
    [tracker, end],
  );

  useEffect(() => () => session.current?.stop(), []);

  return { state, record, stop: end, play };
}
