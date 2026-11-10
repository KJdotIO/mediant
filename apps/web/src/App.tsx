import { formatSymbol, identify, scaleNotes, type IdentifyOptions, type NoteReading, type Reading } from "@mediant/theory";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAudioBlocked } from "./audio/context.ts";
import { SOUNDS, usePiano, type SoundId, type SoundState } from "./audio/piano.ts";
import { Circle } from "./Circle.tsx";
import { Keyboard } from "./Keyboard.tsx";
import { HOLD_GRACE_MS, heldReading, noteGroups, octaveOf, readingTitle, type Sample } from "./logic.ts";
import { NoteTracker, useComputerKeys, useMidi, type MidiStatus } from "./notes.ts";
import { KEY_OPTIONS, parseKey, useSettings } from "./settings.ts";
import { Recorder } from "./recording/Recorder.tsx";
import { SettingsPanel } from "./SettingsPanel.tsx";
import { GrandStaff } from "./Staff.tsx";
import { Tempo } from "./Tempo.tsx";
import { useWakeLock } from "./wakeLock.ts";

const tracker = new NoteTracker();
const EMPTY: NoteReading[] = [];
const NO_NOTES: number[] = [];
const NO_INPUTS: string[] = [];
if (import.meta.env.DEV) Object.assign(window, { mediantTracker: tracker });

function statusText(status: MidiStatus, chosen: string): { text: string; on: boolean } {
  switch (status.state) {
    case "connecting":
      return { text: "Looking for MIDI keyboards", on: false };
    case "unsupported":
      return { text: "This browser can't read MIDI. Use Chrome, Edge or Firefox.", on: false };
    case "blocked":
      return { text: "MIDI access is blocked. Allow it in the site settings.", on: false };
    case "ready": {
      const count = status.inputs.length;
      if (chosen) return status.inputs.includes(chosen) ? { text: chosen, on: true } : { text: `${chosen} isn't connected`, on: false };
      if (!count) return { text: "No MIDI keyboard connected", on: false };
      const text = status.active ?? (count === 1 ? status.inputs[0]! : `${count} MIDI inputs ready`);
      return { text, on: true };
    }
  }
}

function soundText(sound: SoundId | "", state: SoundState, blocked: boolean): string | undefined {
  const name = SOUNDS.find(([id]) => id === sound)?.[1];
  if (!name) return undefined;
  if (state.state === "loading") return `Loading ${name}, ${Math.round(state.progress * 100)}%`;
  if (state.state === "error") return `${name} didn't load. Check your connection and choose it again.`;
  if (blocked) return "Click or press any key to turn on sound";
  return undefined;
}

const symbolScale = (text: string) => (text.length <= 4 ? 1 : text.length <= 7 ? 0.74 : text.length <= 10 ? 0.56 : 0.44);


export function App() {
  const { notes, held: heldKeys, pedal, clears } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const [settings, update] = useSettings();
  const midi = useMidi(tracker, settings.midiInput);
  const octave = useComputerKeys(tracker);
  useWakeLock(tracker);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButton.current?.focus({ preventScroll: true });
  }, []);
  const sound = usePiano(tracker, settings.sound, settings.volume);
  const blocked = useAudioBlocked(settings.sound !== "");
  const soundMessage = soundText(settings.sound, sound, blocked);
  const key = parseKey(settings.key);
  const options = useMemo<IdentifyOptions>(() => (key ? { key } : {}), [key?.tonic, key?.mode]);
  const keyNotes = useMemo(() => (options.key ? scaleNotes(options.key) : []), [options]);

  const live = useMemo(() => identify(notes, options), [notes, options]);
  const history = useRef<Sample[]>([]);
  const [heldNotes, setHeldNotes] = useState<number[]>(NO_NOTES);
  useEffect(() => {
    if (live) {
      history.current.push({ at: performance.now(), reading: live });
      if (history.current.length > 32) history.current.shift();
    } else if (history.current.length) {
      setHeldNotes(heldReading(history.current, performance.now())?.notes.map((n) => n.midi) ?? NO_NOTES);
      history.current = [];
    }
  }, [live]);
  useEffect(() => {
    setHeldNotes(NO_NOTES);
    history.current = [];
  }, [clears]);
  const [settled, setSettled] = useState(true);
  useEffect(() => {
    if (live) {
      setSettled(false);
      return;
    }
    const id = setTimeout(() => setSettled(true), HOLD_GRACE_MS);
    return () => clearTimeout(id);
  }, [live]);
  const held = useMemo(() => identify(heldNotes, options), [heldNotes, options]);

  const reading = live ?? (!settled || settings.holdLastChord ? held : null);
  const dim = !live && settled && reading !== null;
  const pressed = useMemo(() => (live ? new Set(heldKeys) : undefined), [live, heldKeys]);
  const readingNotes = reading?.notes ?? EMPTY;
  const rootPc = reading?.kind === "chord" ? readingNotes.find((n) => n.degree === "1")?.pitchClass : undefined;
  const heading = readingTitle(reading);
  const status = statusText(midi, settings.midiInput);
  const alternatives = reading?.kind === "chord" ? reading.alternatives.map((a) => formatSymbol(a.symbol)) : [];
  const groups = noteGroups(readingNotes);

  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setAnnouncement(heading), 500);
    return () => clearTimeout(id);
  }, [heading]);

  return (
    <div className="shell" data-settings={settingsOpen}>
    <div className="app">
      <header className="bar reveal">
        <span className="wordmark">Mediant</span>
        <div className="controls">
          <label className="select">
            <span className="label">Key</span>
            <select value={settings.key} onChange={(e) => update({ key: e.target.value })}>
              <option value="">None</option>
              <optgroup label="Major">
                {KEY_OPTIONS.major.map((value) => (
                  <option key={value} value={value}>
                    {formatSymbol(value)}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Minor">
                {KEY_OPTIONS.minor.map((value) => (
                  <option key={value} value={value}>
                    {formatSymbol(value)}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="select">
            <span className="label">Sound</span>
            <select value={settings.sound} onChange={(e) => update({ sound: e.target.value as SoundId | "" })}>
              <option value="">Off</option>
              {SOUNDS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <Tempo
            bpm={settings.bpm}
            beats={settings.beats}
            volume={settings.clickVolume}
            onBpm={(bpm) => update({ bpm })}
          />
          <button
            type="button"
            ref={settingsButton}
            className="button settings-button"
            aria-expanded={settingsOpen}
            aria-controls="settings"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
              <circle cx="10.5" cy="4.5" r="1.5" />
              <circle cx="5.5" cy="11.5" r="1.5" />
            </svg>
            <span className="settings-text">Settings</span>
          </button>
        </div>
      </header>

      <main className="stage">
        <section className="panel hero reveal" aria-label="Circle of fifths">
          <Circle notes={readingNotes} rootPc={rootPc} keyNotes={keyNotes} dim={dim} />
          <div className={`readout${dim ? " is-dim" : ""}`}>
            {heading ? (
              <h1 className="symbol" style={{ fontSize: `${symbolScale(heading)}em` }}>
                {heading}
              </h1>
            ) : (
              <p className="placeholder">Play something</p>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {announcement}
          </p>
        </section>

        <div className="side reveal">
          <section className={`panel chord${dim ? " is-dim" : ""}`} aria-label="Chord details">
            <div className="panel-head">
              <h2 className="label">Notes</h2>
              <span className="count-value">{readingNotes.length}</span>
            </div>
            <div className="tones">
              {groups.length ? (
                groups.map((g) => (
                  <div key={g.id} className={`tone${g.pitchClass === rootPc ? " is-root" : ""}`}>
                    <span className="tone-name">
                      {formatSymbol(g.name)}
                      {g.count > 1 && <span className="tone-count">×{g.count}</span>}
                    </span>
                    <span className="tone-degree">{g.degree ? formatSymbol(g.degree) : "\u00a0"}</span>
                  </div>
                ))
              ) : (
                <p className="empty">No notes</p>
              )}
            </div>
            <div className="also">
              <h2 className="label">Also reads as</h2>
              <p className="also-value">{alternatives.length ? alternatives.join(", ") : "\u00a0"}</p>
            </div>
          </section>

          <section className="panel" aria-label="Staff">
            <div className="panel-head">
              <h2 className="label">Staff</h2>
            </div>
            <GrandStaff notes={readingNotes} rootPc={rootPc} dim={dim} />
          </section>
        </div>
      </main>

      <footer className="deck panel reveal">
        <div className="deck-row">
          <div className="deck-group">
            <span className={`status${status.on ? " is-on" : ""}`}>
              <span className="dot" aria-hidden="true" />
              <span className="status-text">{status.text}</span>
            </span>
            {soundMessage ? (
              <span className="hint is-notice">{soundMessage}</span>
            ) : (
              <span className="hint">
                Keys A to K play from C{octaveOf(octave, settings.middleC)}. Z and X change octave.
              </span>
            )}
          </div>
          <div className="deck-group">
            <Recorder tracker={tracker} settings={settings} />
            <span className={`pedal${pedal ? " is-on" : ""}`}>
              <span className="dot" aria-hidden="true" />
              <span className="label">Sustain</span>
            </span>
            <button type="button" className="button" onClick={() => tracker.clear()} title="Clear notes (Esc)">
              Clear
            </button>
          </div>
        </div>
        <Keyboard
          notes={readingNotes}
          pressed={pressed}
          rootPc={rootPc}
          labels={settings.keyLabels}
          middleC={settings.middleC}
          dim={dim}
        />
      </footer>
    </div>
      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings}
        update={update}
        midiInputs={midi.state === "ready" ? midi.inputs : NO_INPUTS}
      />
    </div>
  );
}
