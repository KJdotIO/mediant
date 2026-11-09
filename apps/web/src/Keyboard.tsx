import { formatSymbol, type NoteReading } from "@mediant/theory";
import { octaveOf } from "./logic.ts";

const LOWEST = 21;
const HIGHEST = 108;
const BLACK = new Set([1, 3, 6, 8, 10]);
const WHITE_WIDTH = 23;
const WHITE_HEIGHT = 112;
const BLACK_WIDTH = 13;
const BLACK_HEIGHT = 70;
const GAP = 1.5;
const TOP = 34;
const BOTTOM = 22;

interface Key {
  midi: number;
  black: boolean;
  x: number;
}

const KEYS: Key[] = [];
let whites = 0;
for (let midi = LOWEST; midi <= HIGHEST; midi++) {
  const black = BLACK.has(midi % 12);
  KEYS.push({ midi, black, x: black ? whites * WHITE_WIDTH - BLACK_WIDTH / 2 : whites * WHITE_WIDTH });
  if (!black) whites++;
}
const WIDTH = whites * WHITE_WIDTH;
const HEIGHT = TOP + WHITE_HEIGHT + BOTTOM;

interface Props {
  notes: NoteReading[];
  rootPc: number | undefined;
  labels: "intervals" | "notes";
  middleC: "C3" | "C4";
  dim: boolean;
  /** Keys physically down. Sounding notes outside this set are held by the pedal. */
  pressed?: ReadonlySet<number> | undefined;
}

/** A full 88-key keyboard, A0 to C8, so nothing moves when you play outside a small range. */
export function Keyboard({ notes, rootPc, labels, middleC, dim, pressed }: Props) {
  const byMidi = new Map(notes.map((n) => [n.midi, n]));

  const renderKey = ({ midi, black, x }: Key) => {
    const note = byMidi.get(midi);
    const tone = !note ? "off" : note.pitchClass === rootPc ? "root" : "tone";
    const sustained = note && pressed && !pressed.has(midi) ? " is-sustained" : "";
    const width = black ? BLACK_WIDTH : WHITE_WIDTH - GAP;
    const label = note && (labels === "intervals" ? (note.degree ?? "") : note.name.replace(/-?\d+$/, ""));
    return (
      <g key={midi} data-midi={midi} className={`key ${black ? "is-black" : "is-white"} is-${tone}${sustained}`}>
        <rect
          x={black ? x : x + GAP / 2}
          y={TOP}
          width={width}
          height={black ? BLACK_HEIGHT : WHITE_HEIGHT}
          rx={black ? 3 : 4}
        />
        {label && (
          <text className="key-label" x={x + (black ? BLACK_WIDTH : WHITE_WIDTH) / 2} y={TOP - (black ? 20 : 7)} textAnchor="middle">
            {formatSymbol(label)}
          </text>
        )}
        {!black && midi % 12 === 0 && (
          <text className="key-octave" x={x + WHITE_WIDTH / 2} y={TOP + WHITE_HEIGHT + 15} textAnchor="middle">
            C{octaveOf(midi, middleC)}
          </text>
        )}
      </g>
    );
  };

  return (
    <svg className={`keyboard${dim ? " is-dim" : ""}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true">
      {KEYS.filter((k) => !k.black).map(renderKey)}
      {KEYS.filter((k) => k.black).map(renderKey)}
    </svg>
  );
}
