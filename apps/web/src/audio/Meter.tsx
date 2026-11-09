import { useEffect, useRef } from "react";

const FLOOR_DB = -60;
const HOT_DB = -6;
const PEAK_HOLD_MS = 1000;
/** A level above this counts as sound arriving, not just the noise floor. */
export const SIGNAL_DB = -50;

/** The loudness of the latest block of samples, in decibels. */
export function levelDb(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? Math.max(FLOOR_DB, 20 * Math.log10(rms)) : FLOOR_DB;
}

/** How many of the meter's dots a level lights, from none at -60 dB to all at 0 dB. */
export function litDots(db: number, dots: number): number {
  return Math.max(0, Math.min(dots, Math.ceil(((db - FLOOR_DB) / -FLOOR_DB) * dots)));
}

interface Props {
  analyser: AnalyserNode | undefined;
  dots?: number;
  label: string;
  /** Called once, the first time the level rises above the noise floor. */
  onSignal?: () => void;
}

/**
 * A dot-matrix level meter. It reads the analyser every frame and writes straight to the dots,
 * so React never re-renders for it. Levels show instantly with no smoothing; the loudest dot
 * holds for a second.
 */
export function Meter({ analyser, dots = 12, label, onSignal }: Props) {
  const row = useRef<HTMLSpanElement>(null);
  const signal = useRef(onSignal);
  signal.current = onSignal;

  useEffect(() => {
    const element = row.current;
    if (!analyser || !element) return;
    const buffer = new Float32Array(analyser.fftSize);
    const cells = [...element.children] as HTMLElement[];
    let peak = 0;
    let peakAt = 0;
    let heard = false;
    let frame = 0;
    const paint = (time: number) => {
      analyser.getFloatTimeDomainData(buffer);
      const db = levelDb(buffer);
      const lit = litDots(db, dots);
      if (lit >= peak || time - peakAt > PEAK_HOLD_MS) {
        peak = lit;
        peakAt = time;
      }
      if (!heard && db > SIGNAL_DB) {
        heard = true;
        signal.current?.();
      }
      cells.forEach((cell, i) => {
        cell.classList.toggle("is-on", i < lit);
        cell.classList.toggle("is-peak", i === peak - 1 && i >= lit);
      });
      frame = requestAnimationFrame(paint);
    };
    frame = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame);
      for (const cell of cells) cell.classList.remove("is-on", "is-peak");
    };
  }, [analyser, dots]);

  const hotFrom = litDots(HOT_DB, dots);
  return (
    <span ref={row} className={`meter${analyser ? "" : " is-idle"}`} role="img" aria-label={label}>
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className={`meter-dot${i >= hotFrom - 1 ? " is-hot" : ""}`} />
      ))}
    </span>
  );
}
