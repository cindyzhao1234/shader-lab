/** Number handling behind the Slider component, kept pure so it can be tested. */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Snaps to the nearest step measured from `min`, without floating-point drift. */
export function snapToStep(value: number, min: number, step: number): number {
  if (step <= 0) {
    return value;
  }

  const snapped = min + Math.round((value - min) / step) * step;
  return Number(snapped.toFixed(decimalsOf(step)));
}

/** Where the value sits along the track, from 0 to 100. */
export function fillPercent(value: number, min: number, max: number): number {
  if (max <= min) {
    return 0;
  }

  return ((clamp(value, min, max) - min) / (max - min)) * 100;
}

/** Shows as many decimals as the step implies, so 0.05 steps never read "0.1". */
export function formatValue(value: number, step: number, unit = ""): string {
  return `${value.toFixed(decimalsOf(step))}${unit}`;
}

export function decimalsOf(step: number): number {
  if (!Number.isFinite(step) || Number.isInteger(step)) {
    return 0;
  }

  const text = step.toString();
  const exponent = text.match(/e-(\d+)$/);

  if (exponent) {
    return Number(exponent[1]);
  }

  return text.split(".")[1]?.length ?? 0;
}
