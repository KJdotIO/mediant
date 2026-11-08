import { useEffect, useRef, useState } from "react";
import { BPM_MAX, BPM_MIN, clampBpm, tapTempo, useMetronome } from "./audio/metronome.ts";

interface Props {
  bpm: number;
  beats: number;
  volume: number;
  onBpm: (bpm: number) => void;
}

/** Metronome switch, tempo field, tap tempo and a beat light for each beat in the bar. */
export function Tempo({ bpm, beats, volume, onBpm }: Props) {
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState(String(bpm));
  const taps = useRef<number[]>([]);
  const lights = useRef<HTMLSpanElement>(null);
  const metronome = useMetronome(running, bpm, beats, volume);

  useEffect(() => setDraft(String(bpm)), [bpm]);

  useEffect(() => {
    const element = lights.current;
    if (!running || !element) return;
    let frame = 0;
    const paint = () => {
      const beat = metronome.current?.currentBeat();
      element.dataset["beat"] = beat === undefined ? "" : String(beat);
      frame = requestAnimationFrame(paint);
    };
    paint();
    return () => {
      cancelAnimationFrame(frame);
      element.dataset["beat"] = "";
    };
  }, [running, metronome]);

  const commit = () => {
    const value = Number(draft);
    const next = Number.isFinite(value) && draft.trim() !== "" ? clampBpm(value) : bpm;
    setDraft(String(next));
    if (next !== bpm) onBpm(next);
  };

  const tap = () => {
    const now = performance.now();
    if (now - (taps.current.at(-1) ?? 0) > 2000) taps.current = [];
    taps.current.push(now);
    const tempo = tapTempo(taps.current);
    if (tempo) onBpm(tempo);
  };

  return (
    <div className="tempo">
      <button
        type="button"
        className="tempo-toggle"
        aria-pressed={running}
        aria-label={running ? "Stop metronome" : "Start metronome"}
        onClick={() => setRunning((r) => !r)}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 14.5h9L10 2.5H6z" />
          <path d="M8 11l3.5-6.5" />
          <path d="M5.2 10.5h5.6" />
        </svg>
      </button>
      <label className="bpm">
        <input
          type="number"
          inputMode="numeric"
          min={BPM_MIN}
          max={BPM_MAX}
          value={draft}
          aria-label="Tempo in beats per minute"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <span className="label">BPM</span>
      </label>
      <button type="button" className="tap" onClick={tap}>
        Tap
      </button>
      <span ref={lights} className="beats" aria-hidden="true">
        {Array.from({ length: beats }, (_, i) => (
          <span key={i} className="beat" data-index={i} />
        ))}
      </span>
    </div>
  );
}
