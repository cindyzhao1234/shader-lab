/**
 * Pure state and region geometry for Stage 4 Before/After Comparison.
 *
 * Kept free of WebGL and DOM globals so divider clamping, keyboard stepping
 * and viewport region math can be unit-tested deterministically.
 */

export type ComparisonMode = "off" | "split" | "side-by-side";

export const SPLIT_BOUNDS = {
  min: 0.08,
  max: 0.92,
  default: 0.5,
  keyboardStep: 0.02,
  keyboardLargeStep: 0.1,
} as const;

export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ComparisonRegions {
  readonly left: ViewportRect;
  readonly right: ViewportRect;
  /** X coordinate of the divider in logical CSS pixels from the left edge. */
  readonly dividerX: number;
}

/**
 * Clamps a normalised split ratio into `[SPLIT_BOUNDS.min, SPLIT_BOUNDS.max]`.
 * Non-finite inputs fall back to `SPLIT_BOUNDS.default` (0.5).
 */
export function clampSplitRatio(ratio: number): number {
  if (typeof ratio !== "number" || !Number.isFinite(ratio)) {
    return SPLIT_BOUNDS.default;
  }
  return Math.min(Math.max(ratio, SPLIT_BOUNDS.min), SPLIT_BOUNDS.max);
}

/**
 * Converts a pointer X coordinate relative to a container's `[left, width]`
 * into a clamped split ratio.
 */
export function pointerToSplitRatio(clientX: number, rectLeft: number, rectWidth: number): number {
  if (!Number.isFinite(clientX) || !Number.isFinite(rectLeft) || rectWidth <= 0) {
    return SPLIT_BOUNDS.default;
  }
  const raw = (clientX - rectLeft) / rectWidth;
  return clampSplitRatio(raw);
}

/**
 * Steps a split ratio by a signed delta and clamps the result.
 */
export function stepSplitRatio(current: number, delta: number): number {
  const next = clampSplitRatio(current) + delta;
  return Number(clampSplitRatio(next).toFixed(4));
}

/**
 * Computes the left (Original) and right (Active Look) scissor regions for
 * Split Comparison mode in logical CSS pixels. Both halves share the full
 * viewport camera projection; only the screen output is scissored.
 */
export function computeSplitRegions(
  width: number,
  height: number,
  splitRatio: number,
): ComparisonRegions {
  const safeWidth = Math.max(2, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const ratio = clampSplitRatio(splitRatio);
  const dividerX = Math.min(
    Math.max(1, Math.round(safeWidth * ratio)),
    safeWidth - 1,
  );

  return {
    left: { x: 0, y: 0, width: dividerX, height: safeHeight },
    right: { x: dividerX, y: 0, width: safeWidth - dividerX, height: safeHeight },
    dividerX,
  };
}

/**
 * Computes the left (Original) and right (Active Look) sub-viewport regions
 * for Side-by-Side Comparison mode in logical CSS pixels.
 */
export function computeSideBySideRegions(
  width: number,
  height: number,
): ComparisonRegions {
  const safeWidth = Math.max(2, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const dividerX = Math.floor(safeWidth * 0.5);

  return {
    left: { x: 0, y: 0, width: dividerX, height: safeHeight },
    right: { x: dividerX, y: 0, width: safeWidth - dividerX, height: safeHeight },
    dividerX,
  };
}
