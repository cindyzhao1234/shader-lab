import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK_ID, EXPERIMENTAL_LOOK_ID } from "./catalogue";
import { DEFAULT_LOOK_REGISTRY, LookRegistry } from "./registry";
import {
  areLookParamsEqual,
  defaultParamsFor,
  isDefaultLookParams,
  sanitiseParamValue,
  validateLookParams,
  type LookParamDescriptor,
} from "./schema";

const SAMPLE_SCHEMA: readonly LookParamDescriptor[] = [
  {
    key: "steps",
    label: "Shading Steps",
    kind: "number",
    min: 2,
    max: 8,
    step: 1,
    default: 4,
  },
  {
    key: "strength",
    label: "Strength",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    default: 0.5,
  },
  {
    key: "enabled",
    label: "Enabled",
    kind: "boolean",
    default: true,
  },
  {
    key: "mode",
    label: "Mode",
    kind: "select",
    options: [
      { value: "soft", label: "Soft" },
      { value: "crisp", label: "Crisp" },
    ],
    default: "soft",
  },
];

describe("Look parameter schema and validation", () => {
  it("builds default parameter maps from a schema", () => {
    expect(defaultParamsFor(SAMPLE_SCHEMA)).toEqual({
      steps: 4,
      strength: 0.5,
      enabled: true,
      mode: "soft",
    });
  });

  it("clamps numbers to range, snaps to step, and falls back on non-finite or wrong types", () => {
    const stepsDesc = SAMPLE_SCHEMA[0]!;
    const strengthDesc = SAMPLE_SCHEMA[1]!;
    const boolDesc = SAMPLE_SCHEMA[2]!;
    const selectDesc = SAMPLE_SCHEMA[3]!;

    expect(sanitiseParamValue(stepsDesc, 99)).toBe(8);
    expect(sanitiseParamValue(stepsDesc, -5)).toBe(2);
    expect(sanitiseParamValue(stepsDesc, 5.6)).toBe(6);
    expect(sanitiseParamValue(stepsDesc, Number.NaN)).toBe(4);
    expect(sanitiseParamValue(stepsDesc, "6")).toBe(4);

    expect(sanitiseParamValue(strengthDesc, 0.326)).toBe(0.35);
    expect(sanitiseParamValue(boolDesc, false)).toBe(false);
    expect(sanitiseParamValue(boolDesc, "false")).toBe(true);
    expect(sanitiseParamValue(selectDesc, "crisp")).toBe("crisp");
    expect(sanitiseParamValue(selectDesc, "invalid")).toBe("soft");
  });

  it("drops unknown keys and fills missing keys with defaults when validating a manifest map", () => {
    const validated = validateLookParams(SAMPLE_SCHEMA, {
      steps: 7,
      unknownKey: 123,
      mode: "not-an-option",
    });

    expect(validated).toEqual({
      steps: 7,
      strength: 0.5,
      enabled: true,
      mode: "soft",
    });
  });

  it("detects when parameters match or differ from defaults", () => {
    const defaults = defaultParamsFor(SAMPLE_SCHEMA);
    expect(isDefaultLookParams(SAMPLE_SCHEMA, defaults)).toBe(true);
    expect(isDefaultLookParams(SAMPLE_SCHEMA, { ...defaults, steps: 6 })).toBe(false);
    expect(areLookParamsEqual(SAMPLE_SCHEMA, defaults, { ...defaults })).toBe(true);
  });
});

describe("LookRegistry", () => {
  it("registers Original and the experimental Stage 3 Look by default", () => {
    expect(DEFAULT_LOOK_REGISTRY.has(DEFAULT_LOOK_ID)).toBe(true);
    expect(DEFAULT_LOOK_REGISTRY.has(EXPERIMENTAL_LOOK_ID)).toBe(true);
    expect(DEFAULT_LOOK_REGISTRY.has("cartoon")).toBe(false);
  });

  it("resolves unknown or unplanned Look ids safely back to Original", () => {
    expect(DEFAULT_LOOK_REGISTRY.resolveId(EXPERIMENTAL_LOOK_ID)).toBe(EXPERIMENTAL_LOOK_ID);
    expect(DEFAULT_LOOK_REGISTRY.resolveId("cartoon")).toBe(DEFAULT_LOOK_ID);
    expect(DEFAULT_LOOK_REGISTRY.resolveId("nonexistent")).toBe(DEFAULT_LOOK_ID);
    expect(DEFAULT_LOOK_REGISTRY.resolveId(undefined)).toBe(DEFAULT_LOOK_ID);
  });

  it("rejects empty Look ids on registration", () => {
    const registry = new LookRegistry();
    expect(() =>
      registry.register({
        id: "   ",
        name: "Bad",
        tagline: "",
        description: "",
        experimental: true,
        isIdentity: false,
        paramSchema: [],
        techniques: [],
      }),
    ).toThrow(/cannot be empty/);
  });
});
