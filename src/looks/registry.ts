import {
  DEFAULT_LOOK_ID,
  EXPERIMENTAL_LOOK_ID,
  EXPERIMENTAL_LOOK_SCHEMA,
  EXPERIMENTAL_TECHNIQUES,
  LOOKS,
  ORIGINAL_TECHNIQUES,
  type LookSummary,
} from "./catalogue";
import {
  defaultParamsFor,
  validateLookParams,
  type LookParamDescriptor,
  type LookParams,
} from "./schema";

/**
 * Look Registry: central catalogue of Look definitions, their typed parameter
 * schemas, default values and validation rules.
 *
 * Kept separate from Three.js GPU execution so project manifests, undo/redo
 * commands and UI panels can query schemas and validate parameters without a
 * WebGL context.
 */

export interface LookDefinition {
  readonly id: string;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly experimental: boolean;
  readonly isIdentity: boolean;
  readonly paramSchema: readonly LookParamDescriptor[];
  readonly techniques: readonly string[];
}

export class LookRegistry {
  private readonly definitions = new Map<string, LookDefinition>();

  register(definition: LookDefinition): void {
    if (!definition.id.trim()) {
      throw new Error("Look definition id cannot be empty.");
    }
    this.definitions.set(definition.id, definition);
  }

  get(id: string): LookDefinition | undefined {
    return this.definitions.get(id);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  list(): LookDefinition[] {
    return [...this.definitions.values()];
  }

  /**
   * Resolves a Look id from a manifest or caller, falling back to `original`
   * if the id is unknown or belongs to a Look that is not registered yet.
   */
  resolveId(id: string | undefined | null): string {
    if (typeof id === "string" && this.definitions.has(id)) {
      return id;
    }
    return DEFAULT_LOOK_ID;
  }

  defaultParams(id: string): LookParams {
    const def = this.definitions.get(id);
    return def ? defaultParamsFor(def.paramSchema) : {};
  }

  validateParams(
    id: string,
    raw: Readonly<Record<string, unknown>> | undefined | null,
  ): LookParams {
    const def = this.definitions.get(id);
    return def ? validateLookParams(def.paramSchema, raw) : {};
  }
}

export function createDefaultLookRegistry(): LookRegistry {
  const registry = new LookRegistry();

  registry.register({
    id: DEFAULT_LOOK_ID,
    name: "Original",
    tagline: "Your scene, exactly as it was made",
    description:
      "Realistic lighting and materials, untouched. Every other Look starts from here, and switching back always returns your scene to this.",
    experimental: false,
    isIdentity: true,
    paramSchema: [],
    techniques: ORIGINAL_TECHNIQUES,
  });

  registry.register({
    id: EXPERIMENTAL_LOOK_ID,
    name: "Pipeline Test",
    tagline: "Experimental Stage 3 Look Engine proof of concept",
    description:
      "Technical proof of concept exercising all three stages of the Look Engine — GLSL material band shading, lighting modulation and screen-space colour grading — while keeping your source assets untouched.",
    experimental: true,
    isIdentity: false,
    paramSchema: EXPERIMENTAL_LOOK_SCHEMA,
    techniques: EXPERIMENTAL_TECHNIQUES,
  });

  return registry;
}

export const DEFAULT_LOOK_REGISTRY = createDefaultLookRegistry();

export function isAvailableLook(id: string): boolean {
  const summary: LookSummary | undefined = LOOKS.find((item) => item.id === id);
  return Boolean(summary && summary.availability === "available" && DEFAULT_LOOK_REGISTRY.has(id));
}
