import { describe, expect, it } from "vitest";
import { hexToRgb, linearToSrgb, luminance, rgbToHex, srgbToLinear } from "./colour";

describe("srgbToLinear", () => {
  it("linearises mid-grey to the canonical value", () => {
    // The anchor for the whole colour pipeline. If this drifts, every bloom
    // threshold and grading curve tuned later is wrong.
    expect(srgbToLinear(0.5)).toBeCloseTo(0.21404, 5);
  });

  it("holds the endpoints exactly", () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 10);
  });

  it("is continuous across the piecewise break at 0.04045", () => {
    const below = srgbToLinear(0.04045 - 1e-9);
    const above = srgbToLinear(0.04045 + 1e-9);
    expect(Math.abs(above - below)).toBeLessThan(1e-7);
  });

  it("round-trips through linearToSrgb", () => {
    for (const value of [0, 0.02, 0.18, 0.5, 0.73, 1]) {
      expect(linearToSrgb(srgbToLinear(value))).toBeCloseTo(value, 10);
    }
  });
});

describe("hex conversion", () => {
  it("round-trips every byte value", () => {
    for (const hex of ["#000000", "#ffffff", "#c06a42", "#2a2724", "#80ff01"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("accepts a missing hash and mixed case", () => {
    expect(hexToRgb("C06A42")).toEqual(hexToRgb("#c06a42"));
  });

  it("rejects anything that is not a six-digit hex colour", () => {
    expect(() => hexToRgb("#fff")).toThrow(/not a #rrggbb colour/);
    expect(() => hexToRgb("tomato")).toThrow();
  });

  it("clamps out-of-range components instead of producing invalid hex", () => {
    expect(rgbToHex([-1, 0.5, 2])).toBe("#0080ff");
  });
});

describe("luminance", () => {
  it("returns 1 for linear white and 0 for black", () => {
    expect(luminance([1, 1, 1])).toBeCloseTo(1, 10);
    expect(luminance([0, 0, 0])).toBe(0);
  });

  it("weights green most heavily", () => {
    expect(luminance([0, 1, 0])).toBeGreaterThan(luminance([1, 0, 0]));
    expect(luminance([1, 0, 0])).toBeGreaterThan(luminance([0, 0, 1]));
  });
});
