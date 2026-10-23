import type { LookParamDescriptor } from "./schema";

/**
 * The built-in Looks as the gallery presents them.
 *
 * This is presentation metadata and parameter schemas — names, descriptions
 * and the beginner controls each Look offers. Until a Look's rendering
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
  /** True when this Look is a technical proof-of-concept rather than a final artistic preset. */
  experimental?: boolean;
  /** The beginner-friendly controls this Look exposes in Simple mode. */
  controls: readonly string[];
  /** Typed parameter schema for available Looks. */
  paramSchema?: readonly LookParamDescriptor[];
  /** Pipeline techniques active in this Look, shown as pills in the inspector. */
  techniques?: readonly string[];
  /**
   * Colours for the card emblem shown while no rendered preview exists.
   * These describe the Look's mood; they are not a render of it.
   */
  palette: readonly [string, string, string];
}

export const EXPERIMENTAL_LOOK_ID = "stage3-test-look";

export const EXPERIMENTAL_LOOK_SCHEMA: readonly LookParamDescriptor[] = [
  {
    key: "toneBands",
    label: "Shading Bands",
    kind: "number",
    min: 2,
    max: 12,
    step: 1,
    default: 4,
    hint: "Quantises surface lighting via a custom GLSL shader hook without altering source materials.",
  },
  {
    key: "surfaceWarmth",
    label: "Surface Warmth",
    kind: "number",
    min: -1,
    max: 1,
    step: 0.05,
    default: 0.25,
    hint: "Shifts material albedo and scene key light between cool slate and warm amber.",
  },
  {
    key: "saturation",
    label: "Colour Saturation",
    kind: "number",
    min: 0,
    max: 2,
    step: 0.05,
    default: 0.85,
    hint: "Adjusts linear screen-space colour saturation in the post-processing pass.",
  },
  {
    key: "contrast",
    label: "Contrast",
    kind: "number",
    min: 0.6,
    max: 1.6,
    step: 0.05,
    default: 1.15,
    hint: "Shapes screen-space tonal contrast before filmic tone mapping.",
  },
  {
    key: "vignette",
    label: "Frame Vignette",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.3,
    hint: "Darkens the outer frame in the post-processing pass.",
  },
];

/** What the current renderer genuinely does, shown in the Original Look's details. */
export const ORIGINAL_TECHNIQUES: readonly string[] = [
  "Physically based materials",
  "Image-based environment lighting",
  "Soft real-time shadows",
  "Filmic tone mapping",
];

export const EXPERIMENTAL_TECHNIQUES: readonly string[] = [
  "Non-destructive material clones",
  "GLSL onBeforeCompile band shading",
  "Dynamic lighting rig modulation",
  "Linear screen-space grading pass",
];

export const LOOKS: readonly LookSummary[] = [
  {
    id: "original",
    name: "Original",
    tagline: "Your scene, exactly as it was made",
    description:
      "Realistic lighting and materials, untouched. Every other Look starts from here, and switching back always returns your scene to this.",
    availability: "available",
    controls: [],
    paramSchema: [],
    techniques: ORIGINAL_TECHNIQUES,
    palette: ["#8f8a80", "#c9c2b6", "#4a453f"],
  },
  {
    id: EXPERIMENTAL_LOOK_ID,
    name: "Pipeline Test",
    tagline: "Experimental Stage 3 Look Engine proof of concept",
    description:
      "Technical proof of concept exercising all three stages of the Look Engine — GLSL material band shading, lighting modulation and screen-space colour grading — while keeping your source assets untouched.",
    availability: "available",
    experimental: true,
    controls: EXPERIMENTAL_LOOK_SCHEMA.map((param) => param.label),
    paramSchema: EXPERIMENTAL_LOOK_SCHEMA,
    techniques: EXPERIMENTAL_TECHNIQUES,
    palette: ["#9ca3af", "#d1d5db", "#374151"],
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
  },
  {
    id: "dreamy",
    name: "Dreamy",
    tagline: "Soft glow and warm haze",
    description: "A gentle bloom and pastel haze, as if the scene were a half-remembered summer.",
    availability: "planned",
    controls: ["Dreaminess", "Glow", "Warmth", "Softness", "Haze"],
    palette: ["#f6c7d4", "#f8e3b8", "#b9b4e8"],
  },
  {
    id: "retro",
    name: "Retro",
    tagline: "Chunky pixels and a limited palette",
    description: "Low resolution, dithered colour and a handful of tones, like an early console game.",
    availability: "planned",
    controls: ["Pixel Size", "Colour Count", "Dithering", "Contrast", "Retro Palette"],
    palette: ["#2f8f6f", "#e2d36b", "#2a2140"],
  },
  {
    id: "painterly",
    name: "Painterly",
    tagline: "Brushwork and paper grain",
    description: "Surfaces break into soft strokes over a textured paper ground, like a gouache study.",
    availability: "planned",
    controls: ["Brush Feel", "Detail", "Colour Variation", "Texture Strength"],
    palette: ["#c9844f", "#6d8f9e", "#efe4cf"],
  },
  {
    id: "cinematic",
    name: "Cinematic",
    tagline: "Filmic contrast and mood",
    description: "Rich contrast, graded colour and a subtle glow, framed like a still from a film.",
    availability: "planned",
    controls: ["Exposure", "Contrast", "Mood", "Warmth", "Bloom"],
    palette: ["#1f3a4a", "#e08a4b", "#0d0f12"],
  },
  {
    id: "flat",
    name: "Flat",
    tagline: "Clean shapes, minimal shading",
    description: "Simplified colours and clean silhouettes, for a calm, graphic, modern style.",
    availability: "planned",
    controls: ["Colour Simplicity", "Outline Thickness", "Shadow Strength"],
    palette: ["#e86a5c", "#f3ede2", "#3a5a78"],
  },
];

export const DEFAULT_LOOK_ID = "original";

export function findLook(id: string): LookSummary | undefined {
  return LOOKS.find((look) => look.id === id);
}
