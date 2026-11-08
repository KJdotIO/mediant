import { formatSymbol, type NoteReading } from "@mediant/theory";

const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;
const DEFAULT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

const SIZE = 400;
const RADIUS = 160;
const NODE = 23;

const position = (index: number) => {
  const angle = (index / 12) * Math.PI * 2 - Math.PI / 2;
  return { x: SIZE / 2 + RADIUS * Math.cos(angle), y: SIZE / 2 + RADIUS * Math.sin(angle) };
};

interface Props {
  notes: NoteReading[];
  rootPc: number | undefined;
  /** Notes of the selected key, spelled for that key. Empty when no key is set. */
  keyNotes: ReadonlyArray<{ name: string; pitchClass: number }>;
  dim: boolean;
}

export function Circle({ notes, rootPc, keyNotes, dim }: Props) {
  const names = new Map(notes.map((n) => [n.pitchClass, n.name.replace(/-?\d+$/, "")]));
  const inKey = new Map(keyNotes.map((n) => [n.pitchClass, n.name]));
  const lit = FIFTHS.map((pc, i) => ({ pc, i })).filter(({ pc }) => names.has(pc));
  const points = lit.map(({ i }) => position(i));
  const path = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + (points.length > 2 ? " Z" : "");

  return (
    <svg className={`circle${dim ? " is-dim" : ""}`} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
      <defs>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <circle className="circle-track" cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} />
      {points.length > 1 && <path className="circle-shape" d={path} filter="url(#glow)" />}
      {FIFTHS.map((pc, i) => {
        const { x, y } = position(i);
        const on = names.has(pc);
        const tone = !on ? (inKey.has(pc) ? "key" : "off") : pc === rootPc ? "root" : "tone";
        return (
          <g key={pc} className={`circle-node is-${tone}`} filter={on ? "url(#glow)" : undefined}>
            <circle cx={x} cy={y} r={NODE} />
            <text x={x} y={y} dy="0.35em" textAnchor="middle">
              {formatSymbol(names.get(pc) ?? inKey.get(pc) ?? DEFAULT_NAMES[pc]!)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
