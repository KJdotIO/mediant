import { useEffect, useRef } from "react";
import { AudioSource } from "./recording/AudioSource.tsx";
import { Segmented } from "./Segmented.tsx";
import type { Settings } from "./settings.ts";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** Names of the connected MIDI inputs. */
  midiInputs: string[];
}

function Slider({ label, value, min = 0, max = 1, step = 0.01, unit, onChange }: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting">
      <span>{label}</span>
      <span className="slider-value">
        <input type="range" className="slider" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        {unit && <output>{`${value} ${unit}`}</output>}
      </span>
    </label>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="setting">
      <span>{label}</span>
      <input type="checkbox" role="switch" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

/**
 * Settings in a panel over the right-hand column. The circle and keyboard stay in view, so a
 * change shows straight away, and you can keep playing while it's open.
 */
export function SettingsPanel({ open, onClose, settings, update, midiInputs }: Props) {
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside id="settings" className="settings-panel" data-open={open} aria-label="Settings" aria-hidden={!open} inert={!open}>
      <div className="settings-head">
        <h2 className="label">Settings</h2>
        <button ref={close} type="button" className="icon-button" onClick={onClose} aria-label="Close settings">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>

      {(midiInputs.length > 1 || settings.midiInput) && (
        <section className="settings-group" aria-labelledby="settings-keyboard">
          <h3 id="settings-keyboard" className="settings-group-title">Keyboard</h3>
          <label className="setting">
            <span>MIDI input</span>
            <span className="select is-compact">
              <select value={settings.midiInput} onChange={(e) => update({ midiInput: e.target.value })}>
                <option value="">All inputs</option>
                {settings.midiInput && !midiInputs.includes(settings.midiInput) && (
                  <option value={settings.midiInput}>{settings.midiInput} (not connected)</option>
                )}
                {midiInputs.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </span>
          </label>
        </section>
      )}

      <section className="settings-group" aria-labelledby="settings-display">
        <h3 id="settings-display" className="settings-group-title">Display</h3>
        <Switch label="Hold last chord" checked={settings.holdLastChord} onChange={(holdLastChord) => update({ holdLastChord })} />
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
          <Segmented label="Middle C" value={settings.middleC} options={[["C3", "C3"], ["C4", "C4"]]} onChange={(middleC) => update({ middleC })} />
        </div>
      </section>

      <section className="settings-group" aria-labelledby="settings-sound">
        <h3 id="settings-sound" className="settings-group-title">Sound</h3>
        <Slider label="Piano volume" value={settings.volume} onChange={(volume) => update({ volume })} />
      </section>

      <section className="settings-group" aria-labelledby="settings-metronome">
        <h3 id="settings-metronome" className="settings-group-title">Metronome</h3>
        <div className="setting">
          <span>Beats per bar</span>
          <Segmented
            label="Beats per bar"
            value={String(settings.beats)}
            options={[["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"]]}
            onChange={(beats) => update({ beats: Number(beats) })}
          />
        </div>
        <Slider label="Click volume" value={settings.clickVolume} onChange={(clickVolume) => update({ clickVolume })} />
      </section>

      <section className="settings-group" aria-labelledby="settings-recording">
        <h3 id="settings-recording" className="settings-group-title">Recording</h3>
        <AudioSource settings={settings} update={update} active={open} />
        <Slider label="Silence before a take" value={settings.leadIn} max={5} step={0.5} unit="s" onChange={(leadIn) => update({ leadIn })} />
        <Slider label="Silence after a take" value={settings.tail} max={5} step={0.5} unit="s" onChange={(tail) => update({ tail })} />
        <Switch label="Mediant logo on videos" checked={settings.videoMark} onChange={(videoMark) => update({ videoMark })} />
      </section>

      <p className="credits">Pianos by Tom Guder (Felt) and Versilian Studios (Upright and Grand).</p>
    </aside>
  );
}
