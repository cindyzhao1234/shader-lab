/**
 * Panel sizes, which panels are open, and how the workspace adapts to the
 * window. Pure so the rules can be tested without a browser.
 */

export type PanelSide = "left" | "right";

/**
 * - wide: both panels docked beside the viewport.
 * - medium: the Look Studio stays docked; the scene panel slides over.
 * - compact: both panels slide over the viewport.
 */
export type LayoutMode = "wide" | "medium" | "compact";

export const BREAKPOINTS = { wide: 1180, medium: 860 } as const;

export const PANEL_LIMITS: Record<PanelSide, { min: number; max: number; initial: number }> = {
  left: { min: 220, max: 380, initial: 264 },
  right: { min: 300, max: 460, initial: 344 },
};

/** The viewport is the point of the app; panels give way before it does. */
export const MIN_VIEWPORT_WIDTH = 420;

export interface LayoutPreferences {
  leftWidth: number;
  rightWidth: number;
  /** Docked visibility. Drawers in narrower modes are transient and not stored. */
  leftOpen: boolean;
  rightOpen: boolean;
  showStats: boolean;
  welcomeSeen: boolean;
}

export const DEFAULT_LAYOUT: LayoutPreferences = {
  leftWidth: PANEL_LIMITS.left.initial,
  rightWidth: PANEL_LIMITS.right.initial,
  leftOpen: true,
  rightOpen: true,
  showStats: false,
  welcomeSeen: false,
};

export function layoutModeFor(windowWidth: number): LayoutMode {
  if (windowWidth >= BREAKPOINTS.wide) {
    return "wide";
  }

  return windowWidth >= BREAKPOINTS.medium ? "medium" : "compact";
}

/** Whether a panel sits beside the viewport (true) or slides over it (false). */
export function isDocked(side: PanelSide, mode: LayoutMode): boolean {
  if (mode === "wide") {
    return true;
  }

  return mode === "medium" && side === "right";
}

export function clampPanelWidth(side: PanelSide, width: number): number {
  const { min, max } = PANEL_LIMITS[side];
  return Math.round(Math.min(Math.max(width, min), max));
}

/**
 * Shrinks docked panels, wider one first, until the viewport has room. Never
 * goes below a panel's minimum; on a window too small for that, the layout
 * mode should already have switched to drawers.
 */
export function fitPanels(
  widths: { left: number; right: number },
  docked: { left: boolean; right: boolean },
  available: number,
): { left: number; right: number } {
  let left = docked.left ? clampPanelWidth("left", widths.left) : 0;
  let right = docked.right ? clampPanelWidth("right", widths.right) : 0;
  let excess = left + right + MIN_VIEWPORT_WIDTH - available;

  while (excess > 0) {
    const leftSlack = docked.left ? left - PANEL_LIMITS.left.min : 0;
    const rightSlack = docked.right ? right - PANEL_LIMITS.right.min : 0;

    if (leftSlack <= 0 && rightSlack <= 0) {
      break;
    }

    if (rightSlack >= leftSlack) {
      const take = Math.min(rightSlack, excess);
      right -= take;
      excess -= take;
    } else {
      const take = Math.min(leftSlack, excess);
      left -= take;
      excess -= take;
    }
  }

  return { left, right };
}

/**
 * Reads stored preferences field by field. Anything missing, mistyped or out
 * of range falls back to its default, so a stale or hand-edited value can
 * never stop the app from opening.
 */
export function parseLayout(text: string | null): LayoutPreferences {
  if (!text) {
    return { ...DEFAULT_LAYOUT };
  }

  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch {
    return { ...DEFAULT_LAYOUT };
  }

  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_LAYOUT };
  }

  const value = raw as Record<string, unknown>;
  const number = (key: string, side: PanelSide, fallback: number) =>
    typeof value[key] === "number" && Number.isFinite(value[key])
      ? clampPanelWidth(side, value[key] as number)
      : fallback;
  const boolean = (key: string, fallback: boolean) =>
    typeof value[key] === "boolean" ? (value[key] as boolean) : fallback;

  return {
    leftWidth: number("leftWidth", "left", DEFAULT_LAYOUT.leftWidth),
    rightWidth: number("rightWidth", "right", DEFAULT_LAYOUT.rightWidth),
    leftOpen: boolean("leftOpen", DEFAULT_LAYOUT.leftOpen),
    rightOpen: boolean("rightOpen", DEFAULT_LAYOUT.rightOpen),
    showStats: boolean("showStats", DEFAULT_LAYOUT.showStats),
    welcomeSeen: boolean("welcomeSeen", DEFAULT_LAYOUT.welcomeSeen),
  };
}

export function serialiseLayout(preferences: LayoutPreferences): string {
  return JSON.stringify(preferences);
}
