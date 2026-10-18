/**
 * Colour-space conversion.
 *
 * The renderer lights and composites in linear space and only encodes to sRGB
 * at the very end. Any colour that came from a hex value, a colour picker or an
 * sRGB texture has to be linearised before it is used in maths, or grading,
 * bloom and exposure all behave incorrectly.
 */

/** sRGB transfer function, inverse. Input and output are 0..1. */
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** sRGB transfer function. Input and output are 0..1. */
export function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

export type Rgb = [number, number, number];

/** `#rrggbb` to non-linear 0..1 sRGB components. */
export function hexToRgb(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());

  if (!match?.[1]) {
    throw new Error(`"${hex}" is not a #rrggbb colour.`);
  }

  const value = Number.parseInt(match[1], 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Non-linear 0..1 sRGB components to `#rrggbb`. */
export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((c) => clamp01(c) * 255).map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Rec. 709 relative luminance of a linear colour. */
export function luminance(linear: Rgb): number {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
