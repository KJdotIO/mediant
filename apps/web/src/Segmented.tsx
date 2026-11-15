import { useRef, type CSSProperties, type KeyboardEvent } from "react";

export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<readonly [T, string]>;
  onChange: (value: T) => void;
  describedBy?: string | undefined;
}

/**
 * Options of equal width, with a highlight that slides to the one you pick. Arrow keys move the
 * choice, as in any radio group.
 */
export function Segmented<T extends string>({ label, value, options, onChange, describedBy }: SegmentedProps<T>) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const index = Math.max(0, options.findIndex(([option]) => option === value));

  const onKeyDown = (event: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    buttons.current[next]?.focus();
    onChange(options[next]![0]);
  };

  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      aria-describedby={describedBy}
      style={{ "--count": options.length, "--index": index } as CSSProperties}
      onKeyDown={onKeyDown}
    >
      <span className="segmented-thumb" aria-hidden="true" />
      {options.map(([option, text], i) => (
        <button
          key={option}
          ref={(node) => void (buttons.current[i] = node)}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
