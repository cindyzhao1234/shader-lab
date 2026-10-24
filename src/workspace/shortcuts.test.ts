import { describe, expect, it } from "vitest";
import { SHORTCUTS, displayKeys, isTypingTarget, matchShortcut, type KeyInput } from "./shortcuts";

const key = (value: string, modifiers: Partial<KeyInput> = {}): KeyInput => ({
  key: value,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...modifiers,
});

describe("matchShortcut", () => {
  it("uses Cmd for undo and redo on a Mac", () => {
    expect(matchShortcut(key("z", { metaKey: true }), true)).toBe("undo");
    expect(matchShortcut(key("Z", { metaKey: true, shiftKey: true }), true)).toBe("redo");
    expect(matchShortcut(key("z", { ctrlKey: true }), true)).toBeNull();
  });

  it("uses Ctrl elsewhere, and accepts Ctrl+Y for redo", () => {
    expect(matchShortcut(key("z", { ctrlKey: true }), false)).toBe("undo");
    expect(matchShortcut(key("z", { ctrlKey: true, shiftKey: true }), false)).toBe("redo");
    expect(matchShortcut(key("y", { ctrlKey: true }), false)).toBe("redo");
  });

  it("maps single-key view and panel shortcuts", () => {
    expect(matchShortcut(key("f"), true)).toBe("focus");
    expect(matchShortcut(key("F"), true)).toBe("focus");
    expect(matchShortcut(key("r"), false)).toBe("resetView");
    expect(matchShortcut(key("c"), true)).toBe("toggleComparison");
    expect(matchShortcut(key("["), true)).toBe("toggleScene");
    expect(matchShortcut(key("]"), true)).toBe("toggleLooks");
    expect(matchShortcut(key("?", { shiftKey: true }), true)).toBe("shortcuts");
  });

  it("leaves browser shortcuts alone", () => {
    expect(matchShortcut(key("r", { metaKey: true }), true)).toBeNull();
    expect(matchShortcut(key("f", { ctrlKey: true }), false)).toBeNull();
    expect(matchShortcut(key("z", { altKey: true, metaKey: true }), true)).toBeNull();
  });

  it("ignores unrelated keys", () => {
    expect(matchShortcut(key("q"), true)).toBeNull();
    expect(matchShortcut(key("Escape"), true)).toBeNull();
  });

  it("has a matcher for every listed shortcut", () => {
    // Guards against the dialog advertising a shortcut that does nothing.
    const examples: Record<string, KeyInput> = {
      undo: key("z", { metaKey: true }),
      redo: key("z", { metaKey: true, shiftKey: true }),
      focus: key("f"),
      resetView: key("r"),
      toggleComparison: key("c"),
      toggleScene: key("["),
      toggleLooks: key("]"),
      shortcuts: key("?", { shiftKey: true }),
    };

    for (const shortcut of SHORTCUTS) {
      expect(matchShortcut(examples[shortcut.id]!, true)).toBe(shortcut.id);
    }
  });
});

describe("displayKeys", () => {
  it("shows platform-appropriate modifier names", () => {
    expect(displayKeys(["Mod", "Shift", "Z"], true)).toEqual(["⌘", "⇧", "Z"]);
    expect(displayKeys(["Mod", "Shift", "Z"], false)).toEqual(["Ctrl", "Shift", "Z"]);
  });
});

describe("isTypingTarget", () => {
  it("treats text fields as typing targets", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTypingTarget({ tagName: "input" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
  });

  it("lets shortcuts through from sliders, buttons and the page", () => {
    expect(isTypingTarget({ tagName: "INPUT", type: "range" })).toBe(false);
    expect(isTypingTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
