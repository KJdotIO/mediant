import { formatSymbol, identify, noteName, type NoteReading, type Reading } from "@mediant/theory";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Circle } from "./Circle.tsx";
import { Keyboard } from "./Keyboard.tsx";
import { NoteTracker, useComputerKeys, useMidi, type MidiStatus } from "./notes.ts";
import { useSettings } from "./settings.ts";
import { GrandStaff } from "./Staff.tsx";

const tracker = new NoteTracker();
const EMPTY: NoteReading[] = [];

const plain = (name: string) => formatSymbol(name.replace(/-?\d+$/, ""));

function statusText(status: MidiStatus): { text: string; on: boolean } {
  switch (status.state) {
    case "connecting":
      return { text: "Looking for MIDI devices", on: false };
    case "unsupported":
      return { text: "This browser can't read MIDI. Use Chrome, Edge or Firefox.", on: false };
    case "blocked":
      return { text: "MIDI access is blocked. Allow it in the site settings.", on: false };
    case "ready":
      return status.inputs.length
        ? { text: status.inputs.join(", "), on: true }
        : { text: "No MIDI keyboard connected", on: false };
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

export function App() {
  const { notes, pedal } = useSyncExternalStore(tracker.subscribe, tracker.getSnapshot);
  const midi = useMidi(tracker);
  const octave = useComputerKeys(tracker);
  const [settings, update] = useSettings();

  const live = useMemo(() => identify(notes), [notes]);
  const [last, setLast] = useState<Reading | null>(null);
  useEffect(() => {
    if (live) setLast(live);
  }, [live]);

  const reading = live ?? (settings.holdLastChord ? last : null);
  const dim = !live && reading !== null;
  const readingNotes = reading?.notes ?? EMPTY;
  const rootPc = reading?.kind === "chord" ? readingNotes.find((n) => n.degree === "1")?.pitchClass : undefined;
  const heading = title(reading);
  const status = statusText(midi);
  const alternatives = reading?.kind === "chord" ? reading.alternatives.map((a) => formatSymbol(a.symbol)) : [];
  const count = readingNotes.length;

  return (
    <div className="app">
      <header className="bar reveal">
        <span className="wordmark">Mediant</span>
        <div className="controls" aria-label="Settings">
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.holdLastChord}
              onChange={(e) => update({ holdLastChord: e.target.checked })}
            />
            <span>Hold last chord</span>
          </label>
          <div className="segmented" role="radiogroup" aria-label="Key labels">
            {(["intervals", "notes"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={settings.keyLabels === value}
                onClick={() => update({ keyLabels: value })}
              >
                {value === "intervals" ? "Intervals" : "Note names"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="stage">
        <section className="panel hero reveal" aria-label="Circle of fifths">
          <Circle notes={readingNotes} rootPc={rootPc} dim={dim} />
          <div className={`readout${dim ? " is-dim" : ""}`} aria-live="polite" aria-atomic="true">
            {heading ? (
              <h1 className="symbol" style={{ fontSize: `${symbolScale(heading)}em` }}>
                {heading}
              </h1>
            ) : (
              <p className="placeholder">Play something</p>
            )}
          </div>
        </section>

        <div className="side reveal">
          <section className={`panel chord${dim ? " is-dim" : ""}`} aria-label="Chord details">
            <div className="panel-head">
              <h2 className="label">Notes</h2>
              <span className="count">
                <span className="count-value">{count}</span>
              </span>
            </div>
            <div className="tones">
              {count ? (
                readingNotes.map((n) => (
                  <div key={n.midi} className={`tone${n.pitchClass === rootPc ? " is-root" : ""}`}>
                    <span className="tone-name">{plain(n.name)}</span>
                    <span className="tone-degree">{n.degree ? formatSymbol(n.degree) : "\u00a0"}</span>
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
              Computer keys A to K from {noteName(octave, { letter: 0, accidental: 0 })}, Z and X for octave
            </span>
          </div>
          <div className="deck-group">
            <span className={`pedal${pedal ? " is-on" : ""}`}>
              <span className="dot" aria-hidden="true" />
              <span className="label">Sustain</span>
            </span>
            <button type="button" className="button" onClick={() => tracker.clear()} title="Esc">
              Clear notes
            </button>
          </div>
        </div>
        <Keyboard notes={readingNotes} rootPc={rootPc} labels={settings.keyLabels} dim={dim} />
      </footer>
    </div>
  );
}
