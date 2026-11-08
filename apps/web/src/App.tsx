import { formatSymbol, identify, scaleNotes, type IdentifyOptions, type NoteReading, type Reading } from "@mediant/theory";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Circle } from "./Circle.tsx";
import { Keyboard } from "./Keyboard.tsx";
import { heldReading, noteGroups, octaveOf, type Sample } from "./logic.ts";
import { NoteTracker, useComputerKeys, useMidi, type MidiStatus } from "./notes.ts";
import { KEY_OPTIONS, parseKey, useSettings } from "./settings.ts";
import { GrandStaff } from "./Staff.tsx";

const tracker = new NoteTracker();
const EMPTY: NoteReading[] = [];
const NO_NOTES: number[] = [];
if (import.meta.env.DEV) Object.assign(window, { mediantTracker: tracker });

function statusText(status: MidiStatus): { text: string; on: boolean } {
  switch (status.state) {
    case "connecting":
      return { text: "Looking for MIDI devices", on: false };
    case "unsupported":
      return { text: "This browser can't read MIDI. Use Chrome, Edge or Firefox.", on: false };
    case "blocked":
      return { text: "MIDI access is blocked. Allow it in the site settings.", on: false };
    case "ready": {
      const count = status.inputs.length;
      if (!count) return { text: "No MIDI keyboard connected", on: false };
      const text = status.active ?? (count === 1 ? status.inputs[0]! : `${count} MIDI inputs ready`);
      return { text, on: true };
    }
  }
}

function title(reading: Reading | null): string {
  if (!reading) return "";
  switch (reading.kind) {
    case "chord":
      return formatSymbol(reading.symbol);
    case "note":
      return formatSymbol(reading.name);
    case "interval":
      return reading.name.charAt(0).toUpperCase() + reading.name.slice(1);
    case "cluster":
      return "Cluster";
  }
}

const symbolScale = (text: string) => (text.length <= 4 ? 1 : text.length <= 7 ? 0.74 : text.length <= 10 ? 0.56 : 0.44);

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button key={option} type="button" role="radio" aria-checked={value === option} onClick={() => onChange(option)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function App() {
  const { notes, pedal, clears } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const midi = useMidi(tracker);
  const octave = useComputerKeys(tracker);
  const [settings, update] = useSettings();
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
  const held = useMemo(() => (settings.holdLastChord ? identify(heldNotes, options) : null), [heldNotes, options, settings.holdLastChord]);

  const reading = live ?? held;
  const dim = !live && reading !== null;
  const readingNotes = reading?.notes ?? EMPTY;
  const rootPc = reading?.kind === "chord" ? readingNotes.find((n) => n.degree === "1")?.pitchClass : undefined;
  const heading = title(reading);
  const status = statusText(midi);
  const alternatives = reading?.kind === "chord" ? reading.alternatives.map((a) => formatSymbol(a.symbol)) : [];
  const groups = noteGroups(readingNotes);

  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setAnnouncement(heading), 500);
    return () => clearTimeout(id);
  }, [heading]);

  return (
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
          <button type="button" className="button settings-button" popoverTarget="settings">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
              <circle cx="10.5" cy="4.5" r="1.5" />
              <circle cx="5.5" cy="11.5" r="1.5" />
            </svg>
            <span className="settings-text">Settings</span>
          </button>
          <div id="settings" popover="auto" className="popover" aria-label="Settings">
            <label className="setting">
              <span>Hold last chord</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={settings.holdLastChord}
                onChange={(e) => update({ holdLastChord: e.target.checked })}
              />
            </label>
            <div className="setting">
              <span>Key labels</span>
              <Segmented
                label="Key labels"
                value={settings.keyLabels}
                options={[["intervals", "Intervals"], ["notes", "Notes"]]}
                onChange={(keyLabels) => update({ keyLabels })}
              />
            </div>
            <div className="setting">
              <span>Middle C</span>
              <Segmented
                label="Middle C"
                value={settings.middleC}
                options={[["C3", "C3"], ["C4", "C4"]]}
                onChange={(middleC) => update({ middleC })}
              />
            </div>
          </div>
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
                <p className="empty">Lowest to highest</p>
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
            <span className="hint">
              Computer keys A to K from C{octaveOf(octave, settings.middleC)}, Z and X for octave
            </span>
          </div>
          <div className="deck-group">
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
          rootPc={rootPc}
          labels={settings.keyLabels}
          middleC={settings.middleC}
          dim={dim}
        />
      </footer>
    </div>
  );
}
