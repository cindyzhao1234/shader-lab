/**
 * Resolves `#include "chunk.glsl"` directives so technique shaders can be built
 * from shared chunks instead of duplicated files.
 *
 * Kept free of Node APIs so it can be unit tested directly; the caller supplies
 * `load`, which maps an include name to its source text.
 */

const INCLUDE_PATTERN = /^[ \t]*#include[ \t]+(?:"([^"]+)"|<([^>]+)>)[ \t]*;?[ \t]*$/gm;

export class GlslIncludeError extends Error {
  constructor(message: string, readonly chain: readonly string[]) {
    super(chain.length > 0 ? `${message}\n  included from: ${chain.join(" -> ")}` : message);
    this.name = "GlslIncludeError";
  }
}

export interface ResolveResult {
  /** The source with every include expanded. */
  code: string;
  /** Every chunk pulled in, in first-seen order. Used to register watch files. */
  included: string[];
}

/**
 * A chunk included more than once is expanded only on first encounter, matching
 * the behaviour of a `#pragma once` header. Re-expanding would redeclare its
 * functions and fail to compile.
 */
export function resolveIncludes(
  source: string,
  load: (name: string) => string | undefined,
  entryName = "<entry>",
): ResolveResult {
  const included: string[] = [];
  const seen = new Set<string>();

  function expand(text: string, chain: string[]): string {
    return text.replace(INCLUDE_PATTERN, (_match, quoted?: string, angled?: string) => {
      const name = quoted ?? angled ?? "";

      if (chain.includes(name)) {
        throw new GlslIncludeError(`Circular #include of "${name}".`, [...chain, name]);
      }

      if (seen.has(name)) {
        return "";
      }

      const chunk = load(name);

      if (chunk === undefined) {
        throw new GlslIncludeError(`Could not resolve #include "${name}".`, chain);
      }

      seen.add(name);
      included.push(name);
      return expand(chunk, [...chain, name]);
    });
  }

  return { code: expand(source, [entryName]), included };
}
