import { formatSymbol, type SuggestResult, type Suggestion } from "@mediant/theory";
import { reasonText } from "./logic.ts";

const SLOTS = 3;
const BLACK = new Set([1, 3, 6, 8, 10]);
const MIN_WHITES = 14;
const isWhite = (midi: number) => !BLACK.has(midi % 12);

/** White keys from the lowest to the highest note of every suggestion, so all cards share one scale. */
function whiteRange(suggestions: readonly Suggestion[]): number[] {
  const notes = suggestions.flatMap((s) => s.notes.map((n) => n.midi));
  let low = Math.min(...notes);
  let high = Math.max(...notes);
  if (!isWhite(low)) low--;
  if (!isWhite(high)) high++;
  const whites = () => Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(isWhite);
  while (whites().length < MIN_WHITES) {
    do high++; while (!isWhite(high));
    if (whites().length < MIN_WHITES) do low--; while (!isWhite(low));
  }
  return whites();
}

function MiniKeys({ suggestion, whites }: { suggestion: Suggestion; whites: number[] }) {
  const lit = new Map(suggestion.notes.map((n) => [n.midi, n.pitchClass === suggestion.rootPc ? "root" : "tone"]));
  const blacks = whites.slice(0, -1).flatMap((w, i) => (BLACK.has((w + 1) % 12) ? [{ midi: w + 1, x: i + 1 }] : []));
  return (
    <svg className="mini-keys" viewBox={`0 0 ${whites.length * 10} 40`} preserveAspectRatio="none" aria-hidden="true">
      {whites.map((midi, i) => (
        <rect key={midi} className={`mini-key is-white is-${lit.get(midi) ?? "off"}`} x={i * 10 + 0.5} y={0} width={9} height={40} rx={1.5} />
      ))}
      {blacks.map(({ midi, x }) => (
        <rect key={midi} className={`mini-key is-black is-${lit.get(midi) ?? "off"}`} x={x * 10 - 3} y={0} width={6} height={25} rx={1} />
      ))}
    </svg>
  );
}

interface Props {
  result: SuggestResult | null;
  /** The chord the suggestions follow. */
  after: string;
  /** The suggestion you're playing now, or -1. */
  played: number;
}

/**
 * Up to three chords to play next. Nothing here needs a click: the cards follow the last chord you
 * held, the first one also shows on the keyboard, and a card lights up when you play it.
 */
export function Next({ result, after, played }: Props) {
  const suggestions = result?.suggestions ?? [];
  const whites = suggestions.length ? whiteRange(suggestions) : [];
  const key = result && `${formatSymbol(result.key.tonic)} ${result.key.mode}`;

  return (
    <section className="panel next" aria-label="Next chords">
      <div className="next-head">
        <h2 className="label">Next</h2>
        <p className="next-context">
          {result ? `After ${formatSymbol(after)}, ${result.guessed ? "heard in" : "in"} ${key}` : "\u00a0"}
        </p>
      </div>
      <ol className="next-list">
        {Array.from({ length: SLOTS }, (_, i) => {
          const s = suggestions[i];
          if (!s) {
            return (
              <li key={i} className="next-card is-empty">
                {i === 0 && !result && <p className="empty">Hold a chord to see what could follow it.</p>}
              </li>
            );
          }
          return (
            <li key={i} className={`next-card${i === 0 ? " is-first" : ""}${i === played ? " is-played" : ""}`}>
              <div className="next-top">
                <span className="next-symbol">{formatSymbol(s.symbol)}</span>
                {s.roman && <span className="next-roman">{formatSymbol(s.roman)}</span>}
              </div>
              <span className="next-reason">{reasonText(s.reason)}</span>
              <MiniKeys suggestion={s} whites={whites} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
