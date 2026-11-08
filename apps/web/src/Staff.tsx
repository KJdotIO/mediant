import type { NoteReading } from "@mediant/theory";
import { useEffect, useRef } from "react";
import { Accidental, Formatter, Renderer, Stave, StaveConnector, StaveNote, Voice } from "vexflow/bravura";

const WIDTH = 300;
const HEIGHT = 250;
const INK = { fillStyle: "#9b978f", strokeStyle: "#9b978f" };
const NOTE = { fillStyle: "#f2efe9", strokeStyle: "#f2efe9" };
const ROOT = { fillStyle: "#ff8f3f", strokeStyle: "#ff8f3f" };

const NAME = /^([A-G])(#{0,2}|b{0,2})(-?\d+)$/;

function vexKey(name: string): { key: string; accidental: string } {
  const [, letter = "C", accidental = "", octave = "4"] = NAME.exec(name) ?? [];
  return { key: `${letter.toLowerCase()}${accidental}/${octave}`, accidental };
}

function draw(element: HTMLDivElement, notes: NoteReading[], rootPc: number | undefined) {
  element.replaceChildren();
  const renderer = new Renderer(element, Renderer.Backends.SVG);
  renderer.resize(WIDTH, HEIGHT);
  const svg = element.querySelector("svg");
  svg?.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  svg?.removeAttribute("width");
  svg?.removeAttribute("height");
  svg?.style.removeProperty("width");
  svg?.style.removeProperty("height");
  const context = renderer.getContext();
  context.setFillStyle(INK.fillStyle);
  context.setStrokeStyle(INK.strokeStyle);

  const treble = new Stave(24, 20, WIDTH - 34).addClef("treble");
  const bass = new Stave(24, 130, WIDTH - 34).addClef("bass");
  for (const stave of [treble, bass]) stave.setStyle(INK).setContext(context).draw();
  for (const type of ["brace", "singleLeft", "singleRight"] as const) {
    new StaveConnector(treble, bass).setType(type).setStyle(INK).setContext(context).draw();
  }

  const parts = [
    { stave: treble, clef: "treble", notes: notes.filter((n) => n.midi >= 60) },
    { stave: bass, clef: "bass", notes: notes.filter((n) => n.midi < 60) },
  ].filter((part) => part.notes.length > 0);
  if (parts.length === 0) return;

  const voices = parts.map(({ stave, clef, notes: part }) => {
    const spelled = part.map((n) => vexKey(n.name));
    const chord = new StaveNote({ keys: spelled.map((s) => s.key), duration: "w", clef });
    chord.setStyle(NOTE);
    part.forEach((n, i) => {
      if (n.pitchClass === rootPc) chord.setKeyStyle(i, ROOT);
      const accidental = spelled[i]!.accidental;
      if (accidental) chord.addModifier(new Accidental(accidental).setStyle(n.pitchClass === rootPc ? ROOT : NOTE), i);
    });
    return { stave, voice: new Voice({ numBeats: 4, beatValue: 4 }).addTickables([chord]) };
  });

  const formatter = new Formatter();
  for (const { voice } of voices) formatter.joinVoices([voice]);
  formatter.format(voices.map(({ voice }) => voice), treble.getNoteEndX() - treble.getNoteStartX() - 20);
  for (const { stave, voice } of voices) voice.draw(context, stave);
}

interface Props {
  notes: NoteReading[];
  rootPc: number | undefined;
  dim: boolean;
}

export function GrandStaff({ notes, rootPc, dim }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    document.fonts.load("30px Bravura").then(() => {
      if (!cancelled && ref.current) draw(ref.current, notes, rootPc);
    });
    return () => {
      cancelled = true;
    };
  }, [notes, rootPc]);

  return <div ref={ref} className={`staff${dim ? " is-dim" : ""}`} aria-hidden="true" />;
}
