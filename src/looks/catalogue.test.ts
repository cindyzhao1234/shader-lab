import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOOK_ID,
  EXPERIMENTAL_LOOK_ID,
  LOOKS,
  findLook,
} from "./catalogue";

describe("Look catalogue", () => {
  it("lists Original first, the experimental Stage 3 Look, and the six planned artistic presets", () => {
    expect(LOOKS.map((look) => look.id)).toEqual([
      "original",
      EXPERIMENTAL_LOOK_ID,
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

  it("only marks Original and the experimental Stage 3 proof-of-concept Look as available, keeping all six artistic presets planned", () => {
    const available = LOOKS.filter((look) => look.availability === "available");
    expect(available.map((look) => look.id)).toEqual(["original", EXPERIMENTAL_LOOK_ID]);

    const exp = findLook(EXPERIMENTAL_LOOK_ID)!;
    expect(exp.experimental).toBe(true);

    const plannedIds = LOOKS.filter((look) => look.availability === "planned").map((look) => look.id);
    expect(plannedIds).toEqual(["cartoon", "dreamy", "retro", "painterly", "cinematic", "flat"]);
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
