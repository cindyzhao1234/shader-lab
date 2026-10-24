import { describe, expect, it } from "vitest";
import {
  SPLIT_BOUNDS,
  clampSplitRatio,
  computeSideBySideRegions,
  computeSplitRegions,
  pointerToSplitRatio,
  stepSplitRatio,
} from "./comparison";

describe("comparison divider clamping and stepping", () => {
  it("clamps split ratios into the safe viewport range [0.08, 0.92]", () => {
    expect(clampSplitRatio(0.5)).toBe(0.5);
    expect(clampSplitRatio(0)).toBe(SPLIT_BOUNDS.min);
    expect(clampSplitRatio(-5)).toBe(SPLIT_BOUNDS.min);
    expect(clampSplitRatio(1)).toBe(SPLIT_BOUNDS.max);
    expect(clampSplitRatio(42)).toBe(SPLIT_BOUNDS.max);
  });

  it("falls back to 0.5 on non-finite ratios", () => {
    expect(clampSplitRatio(Number.NaN)).toBe(0.5);
    expect(clampSplitRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
  });

  it("converts pointer coordinates to clamped split ratios", () => {
    expect(pointerToSplitRatio(500, 100, 800)).toBe(0.5);
    expect(pointerToSplitRatio(100, 100, 800)).toBe(SPLIT_BOUNDS.min);
    expect(pointerToSplitRatio(900, 100, 800)).toBe(SPLIT_BOUNDS.max);
    expect(pointerToSplitRatio(400, 100, 0)).toBe(0.5);
  });

  it("steps the split ratio by keyboard increments and clamps at the bounds", () => {
    expect(stepSplitRatio(0.5, 0.02)).toBe(0.52);
    expect(stepSplitRatio(0.5, -0.1)).toBe(0.4);
    expect(stepSplitRatio(0.91, 0.05)).toBe(SPLIT_BOUNDS.max);
    expect(stepSplitRatio(0.09, -0.05)).toBe(SPLIT_BOUNDS.min);
  });
});

describe("comparison region geometry and resize behaviour", () => {
  it("computes contiguous, non-overlapping split regions that sum to the full viewport width", () => {
    const regions = computeSplitRegions(1440, 900, 0.5);
    expect(regions.dividerX).toBe(720);
    expect(regions.left).toEqual({ x: 0, y: 0, width: 720, height: 900 });
    expect(regions.right).toEqual({ x: 720, y: 0, width: 720, height: 900 });
    expect(regions.left.width + regions.right.width).toBe(1440);
  });

  it("preserves exact pixel continuity across arbitrary split ratios and odd viewport widths", () => {
    for (const width of [390, 761, 1024, 1440, 1920]) {
      for (const ratio of [0.08, 0.25, 0.37, 0.5, 0.73, 0.92]) {
        const { left, right, dividerX } = computeSplitRegions(width, 844, ratio);
        expect(left.x).toBe(0);
        expect(left.width).toBe(dividerX);
        expect(right.x).toBe(dividerX);
        expect(left.width + right.width).toBe(width);
        expect(left.width).toBeGreaterThan(0);
        expect(right.width).toBeGreaterThan(0);
      }
    }
  });

  it("splits odd and even viewports cleanly in Side-by-Side mode", () => {
    const even = computeSideBySideRegions(1440, 900);
    expect(even.left).toEqual({ x: 0, y: 0, width: 720, height: 900 });
    expect(even.right).toEqual({ x: 720, y: 0, width: 720, height: 900 });

    const odd = computeSideBySideRegions(391, 844);
    expect(odd.left.width).toBe(195);
    expect(odd.right.x).toBe(195);
    expect(odd.right.width).toBe(196);
    expect(odd.left.width + odd.right.width).toBe(391);
  });
});
