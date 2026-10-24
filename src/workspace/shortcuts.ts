/**
 * Keyboard shortcuts. Only commands that work today are listed; the
 * shortcuts dialog renders straight from this table so it cannot drift.
 */

export type ShortcutId =
  | "undo"
  | "redo"
  | "focus"
  | "resetView"
  | "toggleComparison"
  | "toggleScene"
  | "toggleLooks"
  | "shortcuts";

export interface ShortcutDefinition {
  id: ShortcutId;
  description: string;
  /** Keys as shown to the user. `Mod` becomes ⌘ on a Mac and Ctrl elsewhere. */
  keys: readonly string[];
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  { id: "undo", description: "Undo", keys: ["Mod", "Z"] },
  { id: "redo", description: "Redo", keys: ["Mod", "Shift", "Z"] },
  { id: "focus", description: "Focus the selection, or the whole scene", keys: ["F"] },
  { id: "resetView", description: "Return to the starting view", keys: ["R"] },
  { id: "toggleComparison", description: "Compare Original with the active Look", keys: ["C"] },
  { id: "toggleScene", description: "Show or hide the scene panel", keys: ["["] },
  { id: "toggleLooks", description: "Show or hide the Look Studio", keys: ["]"] },
  { id: "shortcuts", description: "Show keyboard shortcuts", keys: ["?"] },
];

export interface KeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchShortcut(event: KeyInput, isMac: boolean): ShortcutId | null {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

  if (event.altKey) {
    return null;
  }

  if (mod) {
    if (key === "z") {
      return event.shiftKey ? "redo" : "undo";
    }

    if (key === "y" && !isMac) {
      return "redo";
    }

    return null;
  }

  // A bare letter typed with Ctrl or Cmd held belongs to the browser.
  if (event.metaKey || event.ctrlKey) {
    return null;
  }

  switch (key) {
    case "f":
      return event.shiftKey ? null : "focus";
    case "r":
      return event.shiftKey ? null : "resetView";
    case "c":
      return event.shiftKey ? null : "toggleComparison";
    case "[":
      return "toggleScene";
    case "]":
      return "toggleLooks";
    case "?":
      return "shortcuts";
    default:
      return null;
  }
}

export function displayKeys(keys: readonly string[], isMac: boolean): string[] {
  return keys.map((key) => {
    if (key === "Mod") {
      return isMac ? "⌘" : "Ctrl";
    }

    if (key === "Shift") {
      return isMac ? "⇧" : "Shift";
    }

    return key;
  });
}

export function shortcutKeys(id: ShortcutId, isMac: boolean): string[] {
  const definition = SHORTCUTS.find((shortcut) => shortcut.id === id);
  return definition ? displayKeys(definition.keys, isMac) : [];
}

/**
 * Shortcuts are single letters, so they must stand aside while the user is
 * typing — renaming the project should not reset the camera on every "r".
 */
export function isTypingTarget(target: { tagName?: string; isContentEditable?: boolean; type?: string } | null): boolean {
  if (!target) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  const tag = target.tagName?.toUpperCase();

  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  if (tag === "INPUT") {
    // Sliders and checkboxes do not take text, so shortcuts still apply.
    return !["range", "checkbox", "radio", "button", "submit"].includes(target.type ?? "text");
  }

  return false;
}
