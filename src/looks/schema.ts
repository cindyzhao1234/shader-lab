/**
 * Typed parameter schema and validation for the Modular Look System.
 *
 * Pure and free of Three.js/DOM dependencies so parameter validation,
 * defaults and project manifest sanitisation can run anywhere.
 */

export type LookParamValue = number | string | boolean;
export type LookParams = Record<string, LookParamValue>;

export interface NumberParamDescriptor {
  readonly key: string;
  readonly label: string;
  readonly kind: "number";
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly default: number;
  readonly unit?: string;
  readonly hint?: string;
}

export interface BooleanParamDescriptor {
  readonly key: string;
  readonly label: string;
  readonly kind: "boolean";
  readonly default: boolean;
  readonly hint?: string;
}

export interface SelectParamOption {
  readonly value: string;
  readonly label: string;
}

export interface SelectParamDescriptor {
  readonly key: string;
  readonly label: string;
  readonly kind: "select";
  readonly options: readonly SelectParamOption[];
  readonly default: string;
  readonly hint?: string;
}

export type LookParamDescriptor =
  | NumberParamDescriptor
  | BooleanParamDescriptor
  | SelectParamDescriptor;

/** Returns a fresh parameter map populated with every descriptor's default value. */
export function defaultParamsFor(schema: readonly LookParamDescriptor[]): LookParams {
  const out: LookParams = {};
  for (const descriptor of schema) {
    out[descriptor.key] = descriptor.default;
  }
  return out;
}

/**
 * Validates and clamps a single parameter value against its descriptor.
 * Falls back to `descriptor.default` when the input is missing or of the wrong type.
 */
export function sanitiseParamValue(
  descriptor: LookParamDescriptor,
  raw: unknown,
): LookParamValue {
  switch (descriptor.kind) {
    case "number": {
      if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return descriptor.default;
      }
      const clamped = Math.min(Math.max(raw, descriptor.min), descriptor.max);
      if (descriptor.step > 0) {
        const steps = Math.round((clamped - descriptor.min) / descriptor.step);
        const snapped = descriptor.min + steps * descriptor.step;
        const decimals = (descriptor.step.toString().split(".")[1] ?? "").length;
        return Number(Math.min(Math.max(snapped, descriptor.min), descriptor.max).toFixed(decimals));
      }
      return clamped;
    }
    case "boolean": {
      return typeof raw === "boolean" ? raw : descriptor.default;
    }
    case "select": {
      if (typeof raw === "string" && descriptor.options.some((opt) => opt.value === raw)) {
        return raw;
      }
      return descriptor.default;
    }
  }
}

/**
 * Sanitises an arbitrary key-value map (such as a loaded project manifest's
 * `look.params`) against a Look's parameter schema. Unknown keys are dropped
 * and missing or invalid keys fall back to their defaults.
 */
export function validateLookParams(
  schema: readonly LookParamDescriptor[],
  raw: Readonly<Record<string, unknown>> | undefined | null,
): LookParams {
  const out: LookParams = {};
  const source = raw && typeof raw === "object" ? raw : {};

  for (const descriptor of schema) {
    out[descriptor.key] = sanitiseParamValue(descriptor, source[descriptor.key]);
  }

  return out;
}

/** True when every parameter in `params` matches its schema default. */
export function isDefaultLookParams(
  schema: readonly LookParamDescriptor[],
  params: Readonly<LookParams>,
): boolean {
  for (const descriptor of schema) {
    const current = params[descriptor.key] ?? descriptor.default;
    if (descriptor.kind === "number" && typeof current === "number") {
      if (Math.abs(current - descriptor.default) > 1e-6) {
        return false;
      }
    } else if (current !== descriptor.default) {
      return false;
    }
  }
  return true;
}

export function areLookParamsEqual(
  schema: readonly LookParamDescriptor[],
  a: Readonly<LookParams>,
  b: Readonly<LookParams>,
): boolean {
  for (const descriptor of schema) {
    const va = a[descriptor.key] ?? descriptor.default;
    const vb = b[descriptor.key] ?? descriptor.default;
    if (descriptor.kind === "number" && typeof va === "number" && typeof vb === "number") {
      if (Math.abs(va - vb) > 1e-6) {
        return false;
      }
    } else if (va !== vb) {
      return false;
    }
  }
  return true;
}
