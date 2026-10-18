import { useId, type CSSProperties } from "react";
import { fillPercent, formatValue, snapToStep } from "./sliderMath";
import { Tooltip } from "./Tooltip";

/**
 * A labelled slider built on a native range input, so keyboard control,
 * screen-reader announcements and touch behaviour come from the browser.
 *
 * `onChange` fires continuously while dragging; `onCommit` fires once when
 * the gesture ends, which is where a caller closes its undo entry.
 */

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** Double-clicking the value returns here. */
  defaultValue?: number;
  hint?: string;
  onChange: (value: number) => void;
  onCommit?: () => void;
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  defaultValue,
  hint,
  onChange,
  onCommit,
}: SliderProps) {
  const id = useId();
  const style = { "--fill": `${fillPercent(value, min, max)}%` } as CSSProperties;
  const display = formatValue(value, step, unit);

  const reset =
    defaultValue === undefined
      ? undefined
      : () => {
          onChange(defaultValue);
          onCommit?.();
        };

  const valueLabel = (
    <output
      htmlFor={id}
      className={reset ? "slider__value slider__value--resettable" : "slider__value"}
      onDoubleClick={reset}
    >
      {display}
    </output>
  );

  return (
    <div className="slider">
      <div className="slider__header">
        <label htmlFor={id} className="slider__label">
          {label}
        </label>
        {reset ? (
          <Tooltip content={`Double-click to reset to ${formatValue(defaultValue!, step, unit)}`} side="top">
            {valueLabel}
          </Tooltip>
        ) : (
          valueLabel
        )}
      </div>
      <input
        id={id}
        type="range"
        className="slider__input"
        style={style}
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(event) => onChange(snapToStep(Number(event.target.value), min, step))}
        onPointerUp={onCommit}
        onKeyUp={(event) => {
          if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End" || event.key.startsWith("Page")) {
            onCommit?.();
          }
        }}
      />
      {hint && <p className="slider__hint">{hint}</p>}
    </div>
  );
}
