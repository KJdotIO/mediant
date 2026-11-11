import { formatSymbol, identify, scaleNotes, type IdentifyOptions, type NoteReading, type Reading } from "@mediant/theory";
import { Renderer } from "vexflow/bravura";
import { HOLD_GRACE_MS, heldReading, octaveOf, readingTitle, type Sample } from "../logic.ts";
import { parseKey } from "../settings.ts";
import { renderStaff, STAFF_SIZE } from "../Staff.tsx";
import { TakeCursor, type Take } from "./take.ts";

export type VideoLayout = "landscape" | "portrait";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface LayoutSpec {
  width: number;
  height: number;
  /** The logo, with the take's name under it. `width` is the room the name has. */
  mark: { x: number; y: number; align: CanvasTextAlign; width: number };
  circle: { cx: number; cy: number; r: number };
  staff: Box;
  keys: Box;
}

export const LAYOUTS: Record<VideoLayout, LayoutSpec> = {
  landscape: {
    width: 1920,
    height: 1080,
    mark: { x: 96, y: 104, align: "left", width: 430 },
    circle: { cx: 600, cy: 480, r: 290 },
    staff: { x: 1100, y: 140, w: 724, h: 660 },
    keys: { x: 96, y: 868, w: 1728, h: 140 },
  },
  portrait: {
    width: 1080,
    height: 1920,
    mark: { x: 540, y: 168, align: "center", width: 900 },
    circle: { cx: 540, cy: 690, r: 350 },
    staff: { x: 120, y: 1150, w: 840, h: 430 },
    keys: { x: 60, y: 1660, w: 960, h: 160 },
  },
};

const COLOURS = {
  bg: "#151515",
  panel: "#1c1c1c",
  raised: "#262626",
  line: "#383838",
  text: "#f2efe9",
  muted: "#9b978f",
  faint: "#67635d",
  root: "#ff8f3f",
  tone: "#ede0c4",
  toneBlack: "#c9b78f",
  onLight: "#1a140e",
  white: "#e8e5df",
  black: "#0e0e0e",
};

const FONT = '"Archivo Variable", -apple-system, sans-serif';
const FIFTHS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5] as const;
const DEFAULT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);
const DIM = 0.42;
const TITLE_SIZE = 30;
const TITLE_MIN_SIZE = 22;

const withoutOctave = (name: string) => name.replace(/-?\d+$/, "");

/** Mixes two #rrggbb colours: amount 0 gives the first, 1 the second. */
function mix(from: string, to: string, amount: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const parts = [0, 1, 2].map((i) => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * amount));
  return `rgb(${parts.join(" ")})`;
}

/** The keys a video shows: whole octaves around everything played, at least three. */
export function videoRange(take: Pick<Take, "events">): [number, number] {
  const notes = take.events.flatMap((e) => (e.type === "on" ? [e.note] : []));
  let low = notes.length ? Math.min(...notes) : 48;
  let high = notes.length ? Math.max(...notes) : 84;
  low -= low % 12;
  high += (12 - (high % 12)) % 12;
  while (high - low < 36) {
    if (low > 24) low -= 12;
    if (high - low < 36 && high < 108) high += 12;
    if (low <= 24 && high >= 108) break;
  }
  return [Math.max(21, low), Math.min(108, high)];
}

export interface FrameOptions {
  middleC: "C3" | "C4";
  mark: boolean;
  keyLabels: "intervals" | "notes";
}

/** Draws video frames for a take, one moment at a time, in time order. */
export class FrameRenderer {
  private readonly spec: LayoutSpec;
  private readonly cursor: TakeCursor;
  private readonly identifyOptions: IdentifyOptions;
  private readonly keyNotes: Map<number, string>;
  private readonly range: [number, number];
  private readonly readings = new Map<string, Reading | null>();
  private history: Sample[] = [];
  private held: Reading | null = null;
  private staff: { id: string; image: HTMLCanvasElement } | undefined;
  private lastId = "";
  private silentFrom: number | undefined;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    layout: VideoLayout,
    private readonly take: Take,
    private readonly options: FrameOptions,
  ) {
    this.spec = LAYOUTS[layout];
    this.cursor = new TakeCursor(take.events);
    const key = parseKey(take.key);
    this.identifyOptions = key ? { key } : {};
    this.keyNotes = new Map(key ? scaleNotes(key).map((n) => [n.pitchClass, n.name]) : []);
    this.range = videoRange(take);
  }

  draw(t: number) {
    const notes = this.cursor.notesAt(t);
    const id = notes.join(",");
    let live = this.readings.get(id);
    if (live === undefined) {
      live = identify(notes, this.identifyOptions);
      this.readings.set(id, live);
    }
    if (live) {
      if (id !== this.lastId) this.history.push({ at: t * 1000, reading: live });
      this.history = this.history.slice(-32);
    } else if (this.history.length) {
      this.held = heldReading(this.history, t * 1000);
      this.history = [];
    }
    if (live) this.held = null;
    this.lastId = id;
    if (live) this.silentFrom = undefined;
    else this.silentFrom ??= t;

    const reading = live ?? this.held;
    const dim = !live && !!reading && t - this.silentFrom! >= HOLD_GRACE_MS / 1000;
    const pressed = live ? new Set(this.cursor.tracker.getSnapshot().held) : undefined;
    const readingNotes = reading?.notes ?? [];
    const rootPc = reading?.kind === "chord" ? readingNotes.find((n) => n.degree === "1")?.pitchClass : undefined;

    const { ctx, spec } = this;
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLOURS.bg;
    ctx.fillRect(0, 0, spec.width, spec.height);
    this.drawMark();
    ctx.globalAlpha = dim ? DIM : 1;
    this.drawCircle(readingNotes, rootPc, readingTitle(reading));
    this.drawStaff(readingNotes, rootPc);
    this.drawKeys(readingNotes, rootPc, pressed);
    ctx.globalAlpha = 1;
    this.drawDetails();
  }

  private text(text: string, x: number, y: number, size: number, colour: string, options: { weight?: number; wide?: boolean; align?: CanvasTextAlign } = {}) {
    const { ctx } = this;
    ctx.font = `${options.weight ?? 700} ${size}px ${FONT}`;
    ctx.fontStretch = options.wide ? "expanded" : "normal";
    ctx.textAlign = options.align ?? "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  /** The logo, and under it the take's name. A long name shrinks, then ends in an ellipsis. */
  private drawMark() {
    const { ctx } = this;
    const { mark } = this.spec;
    if (this.options.mark) this.text("MEDIANT", mark.x, mark.y, 30, COLOURS.text, { weight: 800, wide: true, align: mark.align });
    let title = this.take.name?.trim();
    if (!title) return;
    let size = TITLE_SIZE;
    ctx.fontStretch = "normal";
    const width = () => {
      ctx.font = `600 ${size}px ${FONT}`;
      return ctx.measureText(title!).width;
    };
    size = Math.max(TITLE_MIN_SIZE, Math.min(size, (size * mark.width) / width()));
    while (title.length > 1 && width() > mark.width) title = `${title.slice(0, -2).trimEnd()}…`;
    this.text(title, mark.x, this.options.mark ? mark.y + 48 : mark.y, size, COLOURS.tone, { weight: 600, align: mark.align });
  }

  /** The key and tempo, in the corner of the staff panel like the marking at the top of a score. */
  private drawDetails() {
    const key = parseKey(this.take.key);
    const details = [key && `${formatSymbol(key.tonic)} ${key.mode}`, this.take.bpm && `${this.take.bpm} BPM`].filter(Boolean).join("   ");
    const { x, y } = this.spec.staff;
    if (details) this.text(details.toUpperCase(), x + 34, y + 40, 16, COLOURS.muted, { wide: true, align: "left" });
  }

  private drawCircle(notes: NoteReading[], rootPc: number | undefined, title: string) {
    const { ctx } = this;
    const { cx, cy, r } = this.spec.circle;
    const node = r * 0.145;
    const names = new Map(notes.map((n) => [n.pitchClass, withoutOctave(n.name)]));
    const at = (i: number) => {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    };

    ctx.lineWidth = 2;
    ctx.strokeStyle = COLOURS.line;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const lit = FIFTHS.map((pc, i) => ({ pc, i })).filter(({ pc }) => names.has(pc));
    if (lit.length > 1) {
      ctx.beginPath();
      lit.forEach(({ i }, n) => {
        const p = at(i);
        if (n) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      });
      if (lit.length > 2) ctx.closePath();
      ctx.save();
      ctx.shadowColor = "rgb(255 143 63 / 0.6)";
      ctx.shadowBlur = node * 0.6;
      ctx.fillStyle = "rgb(255 143 63 / 0.12)";
      if (lit.length > 2) ctx.fill();
      ctx.strokeStyle = COLOURS.root;
      ctx.lineWidth = 3.5;
      ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();
    }

    FIFTHS.forEach((pc, i) => {
      const { x, y } = at(i);
      const on = names.has(pc);
      const isRoot = on && pc === rootPc;
      const inKey = this.keyNotes.has(pc);
      ctx.save();
      if (on) {
        ctx.shadowColor = isRoot ? "rgb(255 143 63 / 0.7)" : "rgb(237 224 196 / 0.5)";
        ctx.shadowBlur = node * 0.7;
      }
      ctx.beginPath();
      ctx.arc(x, y, node, 0, Math.PI * 2);
      ctx.fillStyle = isRoot ? COLOURS.root : on ? COLOURS.tone : COLOURS.raised;
      ctx.fill();
      ctx.restore();
      if (!on) {
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = inKey ? COLOURS.faint : COLOURS.line;
        ctx.stroke();
      }
      const label = names.get(pc) ?? this.keyNotes.get(pc) ?? DEFAULT_NAMES[pc]!;
      this.text(formatSymbol(label), x, y + 1, node * 0.66, on ? COLOURS.onLight : inKey ? COLOURS.text : COLOURS.faint);
    });

    if (!title) return;
    let size = r * 0.4;
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fontStretch = "normal";
    const room = r * 1.3;
    const width = ctx.measureText(title).width;
    if (width > room) size *= room / width;
    this.text(title, cx, cy + size * 0.04, size, COLOURS.text);
  }

  private drawStaff(notes: NoteReading[], rootPc: number | undefined) {
    const { ctx } = this;
    const box = this.spec.staff;
    ctx.fillStyle = COLOURS.panel;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 28);
    ctx.fill();

    const scale = Math.min((box.w - 48) / STAFF_SIZE.width, (box.h - 48) / STAFF_SIZE.height);
    const id = `${notes.map((n) => n.name).join(",")}|${rootPc}`;
    if (this.staff?.id !== id) {
      const image = document.createElement("canvas");
      const renderer = new Renderer(image, Renderer.Backends.CANVAS);
      renderer.resize(Math.ceil(STAFF_SIZE.width * scale), Math.ceil(STAFF_SIZE.height * scale));
      const context = renderer.getContext();
      context.scale(scale, scale);
      renderStaff(context, notes, rootPc);
      this.staff = { id, image };
    }
    const w = STAFF_SIZE.width * scale;
    const h = STAFF_SIZE.height * scale;
    ctx.drawImage(this.staff.image, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
  }

  private drawKeys(notes: NoteReading[], rootPc: number | undefined, pressed: ReadonlySet<number> | undefined) {
    const { ctx } = this;
    const box = this.spec.keys;
    const [low, high] = this.range;
    const byMidi = new Map(notes.map((n) => [n.midi, n]));
    let whites = 0;
    for (let m = low; m <= high; m++) if (!BLACK.has(m % 12)) whites++;
    const kw = box.w / whites;
    const bw = kw * 0.58;
    const bh = box.h * 0.62;
    const labelSize = Math.min(22, kw * 0.48);

    const keys: Array<{ midi: number; black: boolean; x: number }> = [];
    let index = 0;
    for (let m = low; m <= high; m++) {
      const black = BLACK.has(m % 12);
      keys.push({ midi: m, black, x: box.x + (black ? index * kw - bw / 2 : index * kw) });
      if (!black) index++;
    }

    const paint = ({ midi, black, x }: (typeof keys)[number]) => {
      const note = byMidi.get(midi);
      const isRoot = note && note.pitchClass === rootPc;
      ctx.beginPath();
      if (black) ctx.roundRect(x, box.y, bw, bh, [0, 0, 4, 4]);
      else ctx.roundRect(x + 1.5, box.y, kw - 3, box.h, [0, 0, 6, 6]);
      const base = black ? COLOURS.black : COLOURS.white;
      const lit = isRoot ? COLOURS.root : black ? COLOURS.toneBlack : COLOURS.tone;
      const sustained = note && pressed && !pressed.has(midi);
      ctx.fillStyle = !note ? base : sustained ? mix(lit, base, isRoot ? 0.5 : 0.55) : lit;
      ctx.fill();
      if (note) {
        const label = this.options.keyLabels === "intervals" ? (note.degree ?? "") : withoutOctave(note.name);
        const width = black ? bw : kw;
        this.text(formatSymbol(label), x + width / 2, box.y - (black ? labelSize * 2.1 : labelSize * 0.9), labelSize, isRoot ? COLOURS.root : COLOURS.tone);
      }
      if (!black && midi % 12 === 0) {
        this.text(`C${octaveOf(midi, this.options.middleC)}`, x + kw / 2, box.y + box.h + 22, 15, COLOURS.faint, { weight: 600 });
      }
    };
    keys.filter((k) => !k.black).forEach(paint);
    keys.filter((k) => k.black).forEach(paint);
  }
}
