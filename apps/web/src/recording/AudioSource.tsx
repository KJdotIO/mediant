import { Meter } from "../audio/Meter.tsx";
import type { Settings } from "../settings.ts";
import { useAudioInputs, useInputLevel } from "./audioInput.ts";

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  /** True while the settings panel is open, so the level meter listens. */
  active: boolean;
}

/** Picks the audio input that takes record, with setup steps for capturing a DAW on a Mac. */
export function AudioSource({ settings, update, active }: Props) {
  const { inputs, named, allow } = useAudioInputs();
  const known = inputs.some((input) => input.deviceId === settings.audioInput);
  const level = useInputLevel(settings.audioInput, active && known);

  return (
    <div className="audio-source">
      <label className="setting">
        <span>Record sound from</span>
        <span className="select is-compact">
          <select
            value={settings.audioInput}
            onChange={(e) => {
              const input = inputs.find((i) => i.deviceId === e.target.value);
              update({ audioInput: input?.deviceId ?? "", audioLabel: input?.label ?? "" });
            }}
          >
            <option value="">Notes only</option>
            {!known && settings.audioInput && (
              <option value={settings.audioInput}>
                {settings.audioLabel || "Saved input"}
                {named ? " (not connected)" : ""}
              </option>
            )}
            {inputs.map((input) => (
              <option key={input.deviceId} value={input.deviceId}>
                {input.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      {settings.audioInput && known && (
        <div className="setting">
          <span>Level</span>
          <Meter analyser={level} label={`${settings.audioLabel} level`} />
        </div>
      )}
      {settings.audioInput && (
        <label className="setting">
          <span>Show level while playing</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={settings.monitorInput}
            onChange={(e) => update({ monitorInput: e.target.checked })}
          />
        </label>
      )}
      {!named && (
        <button type="button" className="button show-inputs" onClick={() => void allow()}>
          Show input names
        </button>
      )}
      <details className="guide">
        <summary>Record your DAW's sound on a Mac</summary>
        <ol>
          <li>
            Install BlackHole 2ch. Run <code>brew install --cask blackhole-2ch</code> in Terminal, or use the installer from
            existential.audio. Then restart your Mac.
          </li>
          <li>Open Audio MIDI Setup, click +, then choose Create Multi-Output Device.</li>
          <li>Tick your headphones or speakers first, then BlackHole 2ch. Turn on Drift Correction for BlackHole.</li>
          <li>In your DAW, set the output device to the Multi-Output Device.</li>
          <li>Here, choose BlackHole 2ch above, and set Sound to Off so you hear only your DAW.</li>
          <li>Play a note in your DAW. The level meter above moves when the sound comes through.</li>
        </ol>
        <p>Your Mac's volume keys don't change a Multi-Output Device. Use the volume in your DAW.</p>
      </details>
    </div>
  );
}
