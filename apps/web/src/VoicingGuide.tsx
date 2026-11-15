import { formatSymbol, identify, parseNote, suggest, type VoicingStyle } from "@mediant/theory";
import { useMemo } from "react";
import { MiniKeys, whiteRange } from "./Next.tsx";

const FROM = ["C4", "E4", "G4"].map(parseNote);
const KEY = { tonic: "C", mode: "major" } as const;
/** F, the chord a fifth below C, voiced by each style. */
const TO_PC = 5;

const STYLES: ReadonlyArray<[VoicingStyle, string, string]> = [
  ["closest", "Closest", "Moves your hand as little as it can. The lowest note can be the third or fifth, so some chords are inversions."],
  ["root", "Root", "Keeps the root as the lowest note, and moves the other notes as little as it can."],
  ["rich", "Rich", "The root in your left hand and a jazz voicing in your right, with 9ths and 13ths."],
];

/** What each voicing style does, shown with the engine's own answer for C going to F. */
export function VoicingGuide() {
  const examples = useMemo(() => {
    const from = identify(FROM, { key: KEY });
    const rows = STYLES.map(([style, name, text]) => {
      const to = suggest(FROM, { key: KEY, voicing: style, count: 12 })?.suggestions.find((s) => s.rootPc === TO_PC);
      return { style, name, text, to };
    });
    const whites = whiteRange([...FROM, ...rows.flatMap((r) => r.to?.notes.map((n) => n.midi) ?? [])]);
    return { from, rows, whites };
  }, []);
  const { from, rows, whites } = examples;

  return (
    <div className="voicing-guide">
      <p className="info-text">How suggested chords are laid out under your hands. Here is each style going from C to F.</p>
      <div className="voicing-row is-from">
        <div className="voicing-text">
          <span className="voicing-name">You play</span>
          <span className="voicing-symbol">{from?.kind === "chord" ? formatSymbol(from.symbol) : ""}</span>
        </div>
        <MiniKeys notes={from?.notes ?? []} rootPc={0} whites={whites} />
      </div>
      {rows.map(({ style, name, text, to }) => (
        <div key={style} className="voicing-row">
          <div className="voicing-text">
            <span className="voicing-name">{name}</span>
            <span className="voicing-symbol">{to ? formatSymbol(to.symbol) : ""}</span>
          </div>
          <p className="voicing-about">{text}</p>
          {to && <MiniKeys notes={to.notes} rootPc={to.rootPc} whites={whites} />}
        </div>
      ))}
    </div>
  );
}
