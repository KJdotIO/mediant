import { useEffect, useRef, useState } from "react";
import { Meter } from "../audio/Meter.tsx";
import { audioContext } from "../audio/context.ts";
import { releasePacks, type SoundId } from "../audio/piano.ts";
import type { NoteTracker } from "../notes.ts";
import type { Settings } from "../settings.ts";
import type { VideoLayout } from "./frame.ts";
import { useInputLevel } from "./audioInput.ts";
import { useRecorder } from "./recorder.ts";
import { loadAudio, saveAudio, useTakes } from "./store.ts";
import { chordChanges, type Take } from "./take.ts";
import { download, midiBlob } from "./files.ts";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** If no sound arrives within this long of the first note, the input is probably not connected. */
const SILENCE_GRACE_MS = 600;

const LAYOUT_NAMES: Record<VideoLayout, string> = { landscape: "16:9", portrait: "9:16" };

const plural = new Intl.PluralRules("en-GB");
const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

/** "0:42, 1 chord, 14:32": length, chord count and the time it was recorded. */
function takeMeta(take: Take): string {
  const chords = chordChanges(take.events);
  const noun = plural.select(chords) === "one" ? "chord" : "chords";
  const sound = take.audio ? `, ${take.audio.source || "recorded sound"}` : "";
  return `${clock(take.duration)}, ${chords} ${noun}, ${time.format(take.createdAt)}${sound}`;
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
  const [audioProblem, setAudioProblem] = useState("");
  const nextNumber = Math.max(0, ...takes.map((t) => t.number)) + 1;
  const recorder = useRecorder(tracker, {
    leadIn: settings.leadIn,
    tail: settings.tail,
    bpm: settings.bpm,
    beats: settings.beats,
    key: settings.key,
    nextNumber,
    audioInput: settings.audioInput,
    audioLabel: settings.audioLabel,
    onTake: (take, audio) => {
      if (audio) void saveAudio(take.id, audio);
      add(take);
      setLastId(take.id);
      const missing = settings.audioInput && !audio;
      setNote(`Take ${take.number} saved, ${clock(take.duration)}${missing ? ", notes only" : ""}`);
      if (missing) setAudioProblem(`Couldn't record from ${settings.audioLabel || "the chosen input"}. Choose it again in Settings.`);
    },
    onEmpty: () => setNote("No notes played, so no take saved"),
    onAudioError: () => setAudioProblem(`Couldn't record from ${settings.audioLabel || "the chosen input"}. Choose it again in Settings.`),
  });
  const { state } = recorder;
  const busy = state.state === "counting" || state.state === "recording";

  /** Loads and decodes a take's recorded sound, if it has one. */
  const recordingOf = async (take: Take): Promise<AudioBuffer | undefined> => {
    if (!take.audio) return undefined;
    const blob = await loadAudio(take.id);
    return blob ? audioContext().decodeAudioData(await blob.arrayBuffer()) : undefined;
  };

  const playTake = async (take: Take) => recorder.play(take, await recordingOf(take).catch(() => undefined));

  const toggle = () => {
    if (busy) return recorder.stop();
    setNote("");
    setAudioProblem("");
    setLastId(undefined);
    recorder.record();
  };

  const retake = () => {
    if (lastId) remove(lastId);
    setLastId(undefined);
    setNote("");
    setAudioProblem("");
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
      const { exportVideo } = await import("./video.ts");
      const { blob, extension } = await exportVideo(take, layout, {
        sound,
        recording: await recordingOf(take),
        middleC: settings.middleC,
        mark: settings.videoMark,
        keyLabels: settings.keyLabels,
        onProgress: (progress) => setJob({ takeId: take.id, label, progress }),
      });
      download(blob, `mediant-take-${take.number}-${label.replace(":", "x")}.${extension}`);
      setJob(undefined);
    } catch (error) {
      setJob({ takeId: take.id, error: error instanceof Error && error.message ? error.message : "Export failed. Try again." });
    } finally {
      if (!settings.sound) releasePacks();
    }
  };

  const { inputAnalyser } = recorder;
  const idleLevel = useInputLevel(settings.audioInput, settings.monitorInput && state.state === "idle");
  const level = busy ? inputAnalyser : idleLevel;
  const heard = useRef(false);
  const [silent, setSilent] = useState(false);
  useEffect(() => {
    heard.current = false;
    setSilent(false);
    if (!inputAnalyser) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = tracker.listen((event) => {
      if (event.type !== "on" || timer) return;
      timer = setTimeout(() => setSilent(!heard.current), SILENCE_GRACE_MS);
    });
    return () => {
      unlisten();
      clearTimeout(timer);
    };
  }, [inputAnalyser, tracker]);

  const status =
    silent && busy
      ? `No sound from ${settings.audioLabel || "the input"}`
      : state.state === "counting"
      ? `Count-in ${state.beatsLeft}`
      : state.state === "recording"
        ? clock(state.seconds)
        : state.state === "saving"
          ? "Saving take"
          : state.state === "playing"
          ? `Playing ${clock(state.seconds)}`
          : note;

  return (
    <div className="recorder">
      <span className={`record-status${busy ? " is-live" : ""}${silent && busy ? " is-warning" : ""}`} aria-live="polite">
        {settings.audioInput && (busy ? !silent : settings.monitorInput) && (
          <Meter analyser={level} dots={8} label={`${settings.audioLabel} level`} onSignal={() => (heard.current = true)} />
        )}
        <span className="record-status-text">{status}</span>
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
        {audioProblem && <p className="takes-warning">{audioProblem}</p>}
        {takes.length === 0 ? (
          <div className="takes-empty" hidden={!!audioProblem}>
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
                        onClick={() => (playing ? recorder.stop() : playTake(take))}
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
        {!settings.sound && takes.some((t) => !t.audio) && (
          <p className="takes-note">Takes without recorded sound use the Felt Piano in videos, because Sound is off.</p>
        )}
      </div>
    </div>
  );
}
