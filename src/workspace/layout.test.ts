import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAYOUT,
  MIN_VIEWPORT_WIDTH,
  PANEL_LIMITS,
  clampPanelWidth,
  fitPanels,
  isDocked,
  layoutModeFor,
  parseLayout,
  serialiseLayout,
} from "./layout";

describe("layout mode", () => {
  it("docks both panels on a wide window", () => {
    expect(layoutModeFor(1440)).toBe("wide");
    expect(isDocked("left", "wide")).toBe(true);
    expect(isDocked("right", "wide")).toBe(true);
  });

  it("keeps the Look Studio docked at medium widths", () => {
    expect(layoutModeFor(1000)).toBe("medium");
    expect(isDocked("left", "medium")).toBe(false);
    expect(isDocked("right", "medium")).toBe(true);
  });

  it("turns both panels into drawers on a compact window", () => {
    expect(layoutModeFor(700)).toBe("compact");
    expect(isDocked("left", "compact")).toBe(false);
    expect(isDocked("right", "compact")).toBe(false);
  });
});

describe("panel sizing", () => {
  it("clamps widths to each panel's limits", () => {
    expect(clampPanelWidth("left", 10)).toBe(PANEL_LIMITS.left.min);
    expect(clampPanelWidth("right", 9999)).toBe(PANEL_LIMITS.right.max);
    expect(clampPanelWidth("left", 300.4)).toBe(300);
  });

  it("leaves panels alone when the viewport has room", () => {
    expect(fitPanels({ left: 264, right: 344 }, { left: true, right: true }, 1600)).toEqual({
      left: 264,
      right: 344,
    });
  });

  it("shrinks the wider panel first to protect the viewport", () => {
    const fitted = fitPanels({ left: 300, right: 440 }, { left: true, right: true }, 1100);

    expect(fitted.left + fitted.right + MIN_VIEWPORT_WIDTH).toBe(1100);
    expect(fitted.right).toBe(380);
    expect(fitted.left).toBe(300);
  });

  it("never shrinks a panel below its minimum", () => {
    const fitted = fitPanels({ left: 380, right: 460 }, { left: true, right: true }, 600);

    expect(fitted.left).toBe(PANEL_LIMITS.left.min);
    expect(fitted.right).toBe(PANEL_LIMITS.right.min);
  });

  it("ignores panels that are not docked", () => {
    const fitted = fitPanels({ left: 300, right: 400 }, { left: false, right: true }, 900);

    expect(fitted.left).toBe(0);
    expect(fitted.right + MIN_VIEWPORT_WIDTH).toBeLessThanOrEqual(900);
  });
});

describe("stored preferences", () => {
  it("round-trips", () => {
    const preferences = { ...DEFAULT_LAYOUT, leftWidth: 300, showStats: true, welcomeSeen: true };
    expect(parseLayout(serialiseLayout(preferences))).toEqual(preferences);
  });

  it("falls back to defaults for missing or unreadable data", () => {
    expect(parseLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("{not json")).toEqual(DEFAULT_LAYOUT);
    expect(parseLayout("42")).toEqual(DEFAULT_LAYOUT);
  });

  it("repairs individual bad fields without discarding good ones", () => {
    const parsed = parseLayout(
      JSON.stringify({ leftWidth: "wide", rightWidth: 5000, leftOpen: false, welcomeSeen: 1 }),
    );

    expect(parsed.leftWidth).toBe(DEFAULT_LAYOUT.leftWidth);
    expect(parsed.rightWidth).toBe(PANEL_LIMITS.right.max);
    expect(parsed.leftOpen).toBe(false);
    expect(parsed.welcomeSeen).toBe(false);
  });
});
