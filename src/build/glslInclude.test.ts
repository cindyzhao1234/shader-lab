import { describe, expect, it } from "vitest";
import { GlslIncludeError, resolveIncludes } from "./glslInclude";

const library = (chunks: Record<string, string>) => (name: string) => chunks[name];

describe("resolveIncludes", () => {
  it("leaves a shader without includes untouched", () => {
    const source = "void main() { gl_FragColor = vec4(1.0); }";
    expect(resolveIncludes(source, library({})).code).toBe(source);
  });

  it("expands an include in place", () => {
    const result = resolveIncludes(
      '#include "luma.glsl"\nvoid main() {}',
      library({ "luma.glsl": "float luma(vec3 c) { return c.g; }" }),
    );

    expect(result.code).toBe("float luma(vec3 c) { return c.g; }\nvoid main() {}");
    expect(result.included).toEqual(["luma.glsl"]);
  });

  it("accepts angle brackets and trailing semicolons", () => {
    const chunks = library({ "a.glsl": "A", "b.glsl": "B" });
    expect(resolveIncludes("#include <a.glsl>\n#include \"b.glsl\";", chunks).code).toBe("A\nB");
  });

  it("expands nested includes depth-first", () => {
    const result = resolveIncludes(
      '#include "outer.glsl"',
      library({ "outer.glsl": '#include "inner.glsl"\nouter', "inner.glsl": "inner" }),
    );

    expect(result.code).toBe("inner\nouter");
    expect(result.included).toEqual(["outer.glsl", "inner.glsl"]);
  });

  it("includes a shared chunk only once, as #pragma once would", () => {
    // Expanding twice would redeclare the chunk's functions and fail to link.
    const result = resolveIncludes(
      '#include "shared.glsl"\n#include "shared.glsl"',
      library({ "shared.glsl": "float k = 1.0;" }),
    );

    expect(result.code).toBe("float k = 1.0;\n");
    expect(result.included).toEqual(["shared.glsl"]);
  });

  it("deduplicates a chunk reached through two different parents", () => {
    const result = resolveIncludes(
      '#include "a.glsl"\n#include "b.glsl"',
      library({
        "a.glsl": '#include "shared.glsl"\nA',
        "b.glsl": '#include "shared.glsl"\nB',
        "shared.glsl": "S",
      }),
    );

    expect(result.code).toBe("S\nA\n\nB");
    expect(result.included).toEqual(["a.glsl", "shared.glsl", "b.glsl"]);
  });

  it("reports a missing chunk by name", () => {
    expect(() => resolveIncludes('#include "ghost.glsl"', library({}))).toThrow(GlslIncludeError);
    expect(() => resolveIncludes('#include "ghost.glsl"', library({}))).toThrow(/ghost\.glsl/);
  });

  it("detects a circular include instead of recursing forever", () => {
    const chunks = library({ "a.glsl": '#include "b.glsl"', "b.glsl": '#include "a.glsl"' });

    expect(() => resolveIncludes('#include "a.glsl"', chunks)).toThrow(/Circular/);
  });

  it("includes the chain in the error so the source is findable", () => {
    const chunks = library({ "a.glsl": '#include "missing.glsl"' });

    expect(() => resolveIncludes('#include "a.glsl"', chunks, "entry.glsl")).toThrow(
      /included from: entry\.glsl -> a\.glsl/,
    );
  });

  it("ignores an include inside a line comment", () => {
    const source = '// #include "skipme.glsl"\nvoid main() {}';
    expect(resolveIncludes(source, library({})).code).toBe(source);
  });
});
