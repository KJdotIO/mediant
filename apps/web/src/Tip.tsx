import { useEffect, useId, useRef, useState, type ElementType, type FocusEvent, type ReactNode } from "react";

/** A tooltip opens after the pointer rests this long, so a pass across the list doesn't flash them all. */
const OPEN_DELAY = 400;
/** A tooltip that opens this soon after another closed skips its delay and its animation. */
const WARM_MS = 300;
const GAP = 8;

let openTip: HTMLElement | null = null;
let closedAt = -Infinity;

/** Sizes come from `offsetWidth` and `offsetHeight`, which ignore the opening scale. */
function place(tip: HTMLElement, anchor: HTMLElement) {
  const a = anchor.getBoundingClientRect();
  const t = { width: tip.offsetWidth, height: tip.offsetHeight };
  const above = a.top - t.height - GAP;
  const side = above >= GAP ? "top" : "bottom";
  tip.dataset["side"] = side;
  tip.style.top = `${side === "top" ? above : a.bottom + GAP}px`;
  tip.style.left = `${Math.min(Math.max(GAP, a.left), innerWidth - t.width - GAP)}px`;
}

interface SettingProps {
  label: string;
  /** One short sentence, shown on hover and on keyboard focus. */
  tip?: string | undefined;
  /** An info button that sits after the label, for anything longer than a sentence. */
  info?: ReactNode;
  as?: ElementType;
  /** The control. It gets the tooltip's id for `aria-describedby`. */
  children: (describedBy: string | undefined) => ReactNode;
}

/**
 * A row in Settings: a label, an optional tooltip and info button, and a control. The tooltip opens
 * when the pointer rests on the label or the control gets keyboard focus, and Esc closes it.
 */
export function Setting({ label, tip, info, as: Tag = "div", children }: SettingProps) {
  const id = useId();
  const tipRef = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const timer = useRef(0);

  const hide = () => {
    clearTimeout(timer.current);
    const el = tipRef.current;
    if (!el?.matches(":popover-open")) return;
    el.hidePopover();
    closedAt = performance.now();
    if (openTip === el) openTip = null;
  };

  const show = () => {
    const el = tipRef.current;
    if (!el || !name.current || el.matches(":popover-open")) return;
    let instant = performance.now() - closedAt < WARM_MS;
    if (openTip && openTip !== el && openTip.matches(":popover-open")) {
      openTip.hidePopover();
      instant = true;
    }
    el.toggleAttribute("data-instant", instant);
    el.showPopover();
    place(el, name.current);
    openTip = el;
  };

  useEffect(() => {
    if (!tip) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !tipRef.current?.matches(":popover-open")) return;
      event.stopPropagation();
      hide();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      clearTimeout(timer.current);
    };
  }, [tip]);

  const focus = tip
    ? {
        onFocus: (event: FocusEvent) => (event.target as Element).matches(":focus-visible") && show(),
        onBlur: hide,
      }
    : {};

  return (
    <Tag className="setting" {...focus}>
      <span className="setting-name">
        <span
          ref={name}
          className={tip ? "has-tip" : undefined}
          onPointerEnter={(event) => {
            if (!tip || event.pointerType !== "mouse") return;
            clearTimeout(timer.current);
            if (performance.now() - closedAt < WARM_MS || openTip?.matches(":popover-open")) show();
            else timer.current = window.setTimeout(show, OPEN_DELAY);
          }}
          onPointerLeave={hide}
        >
          {label}
        </span>
        {info}
      </span>
      {children(tip ? id : undefined)}
      {tip && (
        <span ref={tipRef} id={id} popover="manual" role="tooltip" className="tip">
          {tip}
        </span>
      )}
    </Tag>
  );
}

const INFO_ICON = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <circle cx="8" cy="8" r="6.25" />
    <path d="M8 7.25v3.75" />
    <circle cx="8" cy="4.9" r="0.4" className="info-dot" />
  </svg>
);

interface InfoProps {
  title: string;
  /** Visible text after the icon. Without it the button is the icon alone. */
  text?: string;
  children: ReactNode;
}

/**
 * An info button and the pane it opens. The pane sits beside Settings in the top layer, so the
 * column's scrolling never clips it. Esc, a click outside or the close button closes it, and focus
 * goes back to the button.
 */
export function Info({ title, text, children }: InfoProps) {
  const id = useId();
  const pane = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const wasOpen = useRef(false);

  useEffect(() => {
    const el = pane.current!;
    const onToggle = (event: Event) => {
      const isOpen = (event as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (!isOpen && el.contains(document.activeElement)) button.current?.focus({ preventScroll: true });
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, []);

  const show = () => {
    const el = pane.current!;
    const b = button.current!.getBoundingClientRect();
    el.showPopover();
    const p = { width: el.offsetWidth, height: el.offsetHeight };
    const column = button.current!.closest(".settings-panel")?.getBoundingClientRect();
    let left = (column?.left ?? b.left) - GAP * 1.5 - p.width;
    let top = b.top - 16;
    let origin = "right top";
    if (left < GAP * 1.5) {
      left = Math.min(Math.max(GAP * 1.5, b.left), innerWidth - p.width - GAP * 1.5);
      top = b.bottom + GAP;
      origin = "left top";
    }
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(GAP * 1.5, Math.min(top, innerHeight - p.height - GAP * 1.5))}px`;
    el.style.transformOrigin = origin;
    el.focus({ preventScroll: true });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={`info-button${text ? " has-text" : ""}`}
        aria-expanded={open}
        aria-controls={id}
        aria-label={text ? undefined : `About ${title.toLowerCase()}`}
        onPointerDown={() => (wasOpen.current = open)}
        onClick={(event) => {
          event.preventDefault();
          if (wasOpen.current) wasOpen.current = false;
          else if (!pane.current!.matches(":popover-open")) show();
        }}
      >
        {INFO_ICON}
        {text}
      </button>
      <div ref={pane} id={id} popover="auto" role="dialog" aria-labelledby={`${id}-title`} tabIndex={-1} className="info-pane">
        <div className="info-head">
          <h2 id={`${id}-title`} className="info-title">
            {title}
          </h2>
          <button type="button" className="icon-button" aria-label="Close" onClick={() => pane.current?.hidePopover()}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

/** An on/off row in Settings. */
export function Switch({ label, tip, checked, onChange }: { label: string; tip?: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Setting as="label" label={label} tip={tip}>
      {(describedBy) => (
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={checked}
          aria-describedby={describedBy}
          onChange={(e) => onChange(e.target.checked)}
        />
      )}
    </Setting>
  );
}
