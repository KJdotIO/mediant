import { useEffect, useState } from "react";
import type { SoundId } from "../audio/piano.ts";
import type { NoteTracker } from "../notes.ts";
import type { Settings } from "../settings.ts";
import type { VideoLayout } from "./frame.ts";
import { useRecorder } from "./recorder.ts";
import { useTakes } from "./store.ts";
import { chordChanges, type Take } from "./take.ts";
import { download, exportVideo, midiBlob } from "./video.ts";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const LAYOUT_NAMES: Record<VideoLayout, string> = { landscape: "16:9", portrait: "9:16" };

const plural = new Intl.PluralRules("en-GB");
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** "0:42, 1 chord, 14:32": length, chord count and the time it was recorded. */
function takeMeta(take: Take): string {
  const chords = chordChanges(take.events);
  const noun = plural.select(chords) === "one" ? "chord" : "chords";
  return `${clock(take.duration)}, ${chords} ${noun}, ${time.format(take.createdAt)}`;
}

interface Props {
  tracker: NoteTracker;
  settings: Settings;
}

type Job = { takeId: string; label: string; progress: number } | { takeId: string; error: string };

/** Record, stop and retake controls for the deck, and the list of saved takes. */
export function Recorder({ tracker, settings }: Props) {
  const { takes, add, remove } = useTakes();
  const [note, setNote] = useState("");
  const [lastId, setLastId] = useState<string>();
  const [job, setJob] = useState<Job>();
  const nextNumber = Math.max(0, ...takes.map((t) => t.number)) + 1;
  const recorder = useRecorder(tracker, {
    leadIn: settings.leadIn,
    tail: settings.tail,
    bpm: settings.bpm,
    beats: settings.beats,
    key: settings.key,
    nextNumber,
    onTake: (take) => {
      add(take);
      setLastId(take.id);
      setNote(`Take ${take.number} saved, ${clock(take.duration)}`);
    },
    onEmpty: () => setNote("No notes played, so no take saved"),
  });
  const { state } = recorder;
  const busy = state.state === "counting" || state.state === "recording";

  const toggle = () => {
    if (busy) return recorder.stop();
    setNote("");
    setLastId(undefined);
    recorder.record();
  };

  const retake = () => {
    if (lastId) remove(lastId);
    setLastId(undefined);
    setNote("");
    recorder.record();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "r" || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.target instanceof HTMLElement && event.target.closest("input:not([type=checkbox]):not([type=range]), select, textarea")) return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const exportTake = async (take: Take, layout: VideoLayout) => {
    const label = LAYOUT_NAMES[layout];
    setJob({ takeId: take.id, label, progress: 0 });
    try {
      const sound: SoundId = settings.sound || "felt";
      const { blob, extension } = await exportVideo(take, layout, {
        sound,
        middleC: settings.middleC,
        mark: settings.videoMark,
        keyLabels: settings.keyLabels,
        onProgress: (progress) => setJob({ takeId: take.id, label, progress }),
      });
      download(blob, `mediant-take-${take.number}-${label.replace(":", "x")}.${extension}`);
      setJob(undefined);
    } catch (error) {
      setJob({ takeId: take.id, error: error instanceof Error && error.message ? error.message : "Export failed. Try again." });
    }
  };

  const status =
    state.state === "counting"
      ? `Count-in ${state.beatsLeft}`
      : state.state === "recording"
        ? clock(state.seconds)
        : state.state === "playing"
          ? `Playing ${clock(state.seconds)}`
          : note;

  return (
    <div className="recorder">
      <span className={`record-status${busy ? " is-live" : ""}`} aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        className="button retake"
        onClick={retake}
        hidden={!lastId || busy}
        title="Delete the last take and record again"
      >
        Retake
      </button>
      <button type="button" className={`button record${busy ? " is-live" : ""}`} onClick={toggle} title="Record (R)">
        <span className={busy ? "stop-icon" : "record-icon"} aria-hidden="true" />
        {busy ? "Stop" : "Record"}
      </button>
      <button type="button" className="button takes-button" popoverTarget="takes">
        Takes <span className="takes-count">{takes.length}</span>
      </button>
      <div id="takes" popover="auto" className="popover takes" aria-label="Takes">
        {takes.length === 0 ? (
          <div className="takes-empty">
            <p className="takes-empty-title">No takes yet</p>
            <p>Press Record or R to record one.</p>
          </div>
        ) : (
          <ul className="take-list">
            {takes.map((take) => {
              const playing = state.state === "playing" && state.takeId === take.id;
              const working = job?.takeId === take.id ? job : undefined;
              return (
                <li key={take.id} className="take">
                  <div className="take-info">
                    <span className="take-name">Take {take.number}</span>
                    <span className="take-meta">
                      {takeMeta(take)}
                    </span>
                  </div>
                  {working ? (
                    <span className="take-job">
                      {"error" in working ? working.error : `Exporting ${working.label}, ${Math.round(working.progress * 100)}%`}
                    </span>
                  ) : (
                    <div className="take-actions">
                      <button
                        type="button"
                        className="button"
                        disabled={busy}
                        onClick={() => (playing ? recorder.stop() : recorder.play(take))}
                      >
                        {playing ? "Stop" : "Play"}
                      </button>
                      <button type="button" className="button" onClick={() => download(midiBlob(take), `mediant-take-${take.number}.mid`)}>
                        MIDI
                      </button>
                      <button type="button" className="button" disabled={!!job} onClick={() => exportTake(take, "landscape")}>
                        16:9
                      </button>
                      <button type="button" className="button" disabled={!!job} onClick={() => exportTake(take, "portrait")}>
                        9:16
                      </button>
                      <button
                        type="button"
                        className="button delete"
                        aria-label={`Delete take ${take.number}`}
                        onClick={() => {
                          if (playing) recorder.stop();
                          remove(take.id);
                          if (take.id === lastId) setLastId(undefined);
                        }}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
                        </svg>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {!settings.sound && takes.length > 0 && <p className="takes-note">Sound is off, so videos use the Felt Piano.</p>}
      </div>
    </div>
  );
}
