import { describe, expect, it } from "vitest";
import { clamp, decimalsOf, fillPercent, formatValue, snapToStep } from "./sliderMath";

describe("slider maths", () => {
  it("clamps into range", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });

  it("snaps to steps measured from the minimum", () => {
    expect(snapToStep(23, 20, 5)).toBe(25);
    expect(snapToStep(22, 20, 5)).toBe(20);
  });

  it("snaps without floating-point drift", () => {
    expect(snapToStep(0.30000000000000004, 0, 0.1)).toBe(0.3);
    expect(snapToStep(0.7, 0, 0.05)).toBe(0.7);
  });

  it("leaves the value alone for a non-positive step", () => {
    expect(snapToStep(0.123, 0, 0)).toBe(0.123);
  });

  it("reports the fill position as a percentage", () => {
    expect(fillPercent(50, 20, 80)).toBe(50);
    expect(fillPercent(20, 20, 80)).toBe(0);
    expect(fillPercent(200, 20, 80)).toBe(100);
    expect(fillPercent(5, 5, 5)).toBe(0);
  });

  it("formats to the precision the step implies", () => {
    expect(decimalsOf(1)).toBe(0);
    expect(decimalsOf(0.1)).toBe(1);
    expect(decimalsOf(0.05)).toBe(2);
    expect(decimalsOf(1e-7)).toBe(7);
    expect(formatValue(50, 1, "°")).toBe("50°");
    expect(formatValue(0.5, 0.05)).toBe("0.50");
  });
});
