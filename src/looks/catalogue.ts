/**
 * The built-in Looks as the gallery presents them.
 *
 * This is presentation metadata only — names, descriptions and the beginner
 * controls each Look will offer. The rendering techniques behind each Look
 * live in the Look System, which arrives in a later stage. Until a Look's
 * pipeline exists it is marked `planned`, and the gallery shows it as
 * unavailable rather than pretending to apply it.
 */

export type LookAvailability = "available" | "planned";

export interface LookSummary {
  id: string;
  name: string;
  /** One line, shown on the gallery card. */
  tagline: string;
  /** A sentence or two, shown when the Look is selected. */
  description: string;
  availability: LookAvailability;
  /** The beginner-friendly controls this Look exposes in Simple mode. */
  controls: readonly string[];
  /**
   * Colours for the card emblem shown while no rendered preview exists.
   * These describe the Look's mood; they are not a render of it.
   */
  palette: readonly [string, string, string];
  /** The Look's colour in the studio's own interface: its tape and seal. */
  accent: string;
}

export const LOOKS: readonly LookSummary[] = [
  {
    id: "original",
    name: "Original",
    tagline: "Your scene, exactly as it was made",
    description:
      "Realistic lighting and materials, untouched. Every other Look starts from here, and switching back always returns your scene to this.",
    availability: "available",
    controls: [],
    palette: ["#8f8a80", "#c9c2b6", "#4a453f"],
    accent: "#f8d978",
  },
  {
    id: "cartoon",
    name: "Cartoon",
    tagline: "Bold outlines and stepped shading",
    description:
      "Crisp ink outlines and flat bands of light, like a hand-drawn animated series.",
    availability: "planned",
    controls: [
      "Outline Thickness",
      "Shading Steps",
      "Colour Vibrancy",
      "Shadow Darkness",
      "Highlight Strength",
    ],
    palette: ["#f2b33d", "#3d7be0", "#1d1b22"],
    accent: "#a9d9f5",
  },
  {
    id: "dreamy",
    name: "Dreamy",
    tagline: "Soft glow and warm haze",
    description: "A gentle bloom and pastel haze, as if the scene were a half-remembered summer.",
    availability: "planned",
    controls: ["Dreaminess", "Glow", "Warmth", "Softness", "Haze"],
    palette: ["#f6c7d4", "#f8e3b8", "#b9b4e8"],
    accent: "#f2a7c3",
  },
  {
    id: "retro",
    name: "Retro",
    tagline: "Chunky pixels and a limited palette",
    description: "Low resolution, dithered colour and a handful of tones, like an early console game.",
    availability: "planned",
    controls: ["Pixel Size", "Colour Count", "Dithering", "Contrast", "Retro Palette"],
    palette: ["#2f8f6f", "#e2d36b", "#2a2140"],
    accent: "#9fdcc0",
  },
  {
    id: "painterly",
    name: "Painterly",
    tagline: "Brushwork and paper grain",
    description: "Surfaces break into soft strokes over a textured paper ground, like a gouache study.",
    availability: "planned",
    controls: ["Brush Feel", "Detail", "Colour Variation", "Texture Strength"],
    palette: ["#c9844f", "#6d8f9e", "#efe4cf"],
    accent: "#f6c08e",
  },
  {
    id: "cinematic",
    name: "Cinematic",
    tagline: "Filmic contrast and mood",
    description: "Rich contrast, graded colour and a subtle glow, framed like a still from a film.",
    availability: "planned",
    controls: ["Exposure", "Contrast", "Mood", "Warmth", "Bloom"],
    palette: ["#1f3a4a", "#e08a4b", "#0d0f12"],
    accent: "#c9b8ef",
  },
  {
    id: "flat",
    name: "Flat",
    tagline: "Clean shapes, minimal shading",
    description: "Simplified colours and clean silhouettes, for a calm, graphic, modern style.",
    availability: "planned",
    controls: ["Colour Simplicity", "Outline Thickness", "Shadow Strength"],
    palette: ["#e86a5c", "#f3ede2", "#3a5a78"],
    accent: "#f39a8f",
  },
];

export const DEFAULT_LOOK_ID = "original";

export function findLook(id: string): LookSummary | undefined {
  return LOOKS.find((look) => look.id === id);
}

/** What the current renderer genuinely does, shown in the Original Look's details. */
export const ORIGINAL_TECHNIQUES: readonly string[] = [
  "Physically based materials",
  "Image-based environment lighting",
  "Soft real-time shadows",
  "Filmic tone mapping",
];
