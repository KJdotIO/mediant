import { useEffect } from "react";
import type { NoteTracker } from "./notes.ts";

/** How long after the last note the screen can sleep again. */
const IDLE_MS = 5 * 60_000;

/**
 * Keeps the screen awake while you play. Notes from a MIDI keyboard don't count as activity,
 * so the display would otherwise dim in the middle of a piece.
 */
export function useWakeLock(tracker: NoteTracker) {
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastNote = -Infinity;

    const release = () => {
      void lock?.release();
      lock = undefined;
    };
    const acquire = async () => {
      if (lock || pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        sentinel.addEventListener("release", () => lock === sentinel && (lock = undefined));
        lock = sentinel;
      } catch {
        // The system can refuse, for example in low power mode. The screen then sleeps as usual.
      } finally {
        pending = false;
      }
    };

    const unlisten = tracker.listen((event) => {
      if (event.type !== "on") return;
      lastNote = performance.now();
      clearTimeout(timer);
      timer = setTimeout(release, IDLE_MS);
      void acquire();
    });
    // The browser drops the lock when the tab is hidden, so take it again on the way back.
    const onVisible = () => performance.now() - lastNote < IDLE_MS && void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      unlisten();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      release();
    };
  }, [tracker]);
}
