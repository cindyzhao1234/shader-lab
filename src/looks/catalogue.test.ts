import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK_ID, LOOKS, findLook } from "./catalogue";

describe("Look catalogue", () => {
  it("lists the seven built-in Looks with Original first", () => {
    expect(LOOKS.map((look) => look.id)).toEqual([
      "original",
      "cartoon",
      "dreamy",
      "retro",
      "painterly",
      "cinematic",
      "flat",
    ]);
    expect(DEFAULT_LOOK_ID).toBe(LOOKS[0]!.id);
  });

  it("has unique ids", () => {
    expect(new Set(LOOKS.map((look) => look.id)).size).toBe(LOOKS.length);
  });

  it("only offers Looks whose rendering pipeline exists", () => {
    // Raise this list as each Look's techniques land. A Look marked available
    // without a pipeline would be a gallery card that does nothing.
    const available = LOOKS.filter((look) => look.availability === "available");
    expect(available.map((look) => look.id)).toEqual(["original"]);
  });

  it("gives every Look a name, tagline and description", () => {
    for (const look of LOOKS) {
      expect(look.name.trim()).not.toBe("");
      expect(look.tagline.trim()).not.toBe("");
      expect(look.description.trim()).not.toBe("");
      expect(look.palette).toHaveLength(3);
    }
  });

  it("names the beginner controls from the product brief", () => {
    expect(findLook("cartoon")?.controls).toEqual([
      "Outline Thickness",
      "Shading Steps",
      "Colour Vibrancy",
      "Shadow Darkness",
      "Highlight Strength",
    ]);
    expect(findLook("flat")?.controls).toEqual([
      "Colour Simplicity",
      "Outline Thickness",
      "Shadow Strength",
    ]);
    expect(findLook("original")?.controls).toEqual([]);
  });

  it("uses plain-language control names rather than shader jargon", () => {
    const jargon = /uniform|sobel|kernel|fragment|threshold|quanti[sz]/i;

    for (const look of LOOKS) {
      for (const control of look.controls) {
        expect(control, `${look.name}: ${control}`).not.toMatch(jargon);
      }
    }
  });

  it("returns undefined for an unknown Look", () => {
    expect(findLook("vaporwave")).toBeUndefined();
  });
});
