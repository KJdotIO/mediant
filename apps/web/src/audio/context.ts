import { useEffect, useState } from "react";

let context: AudioContext | undefined;

/**
 * The one shared audio context. Browsers keep audio suspended until the page gets a click or
 * key press, so this resumes it on the first one.
 */
export function audioContext(): AudioContext {
  if (context) return context;
  const created = new AudioContext({ latencyHint: "interactive" });
  context = created;
  if (import.meta.env.DEV) Object.assign(window, { mediantAudio: created });
  const resume = () => {
    if (created.state !== "suspended") return;
    void created.resume();
  };
  for (const type of ["pointerdown", "keydown"] as const) window.addEventListener(type, resume, { capture: true });
  resume();
  return created;
}

/** True while audio is wanted but the browser still needs a click or key press to start it. */
export function useAudioBlocked(wanted: boolean): boolean {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    if (!wanted) {
      setBlocked(false);
      return;
    }
    const ctx = audioContext();
    const update = () => setBlocked(ctx.state !== "running");
    update();
    ctx.addEventListener("statechange", update);
    return () => ctx.removeEventListener("statechange", update);
  }, [wanted]);
  return blocked;
}
