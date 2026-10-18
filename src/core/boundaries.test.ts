import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `core/` holds the serialisable project model. It must stay free of three.js,
 * the DOM and Node built-ins so it can be reasoned about and unit tested
 * without a GPU — and so the document can never end up holding a live GPU
 * handle, which is exactly the flaw that made the original renderer's
 * materials impossible to save.
 *
 * Node imports are permitted in test files only; that is what lets this test
 * read the directory it is policing.
 */

const CORE_DIR = join(import.meta.dirname, ".");

const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /from\s+["']three/, reason: "three.js belongs in render/, not core/" },
  { pattern: /from\s+["']node:/, reason: "Node built-ins would break core/ in the browser" },
  { pattern: /from\s+["']react/, reason: "React belongs in app/, not core/" },
  { pattern: /\bdocument\s*\./, reason: "the DOM is not available where core/ runs" },
  { pattern: /\bwindow\s*\./, reason: "the DOM is not available where core/ runs" },
];

function sourceFiles(): string[] {
  return readdirSync(CORE_DIR)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => join(CORE_DIR, name));
}

/** Comments are prose and may legitimately mention "window" or "document". */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("core module boundaries", () => {
  it("contains source files to check", () => {
    expect(sourceFiles().length).toBeGreaterThan(0);
  });

  it("actually catches a violation", () => {
    const violations = [
      'import * as THREE from "three";',
      'import { readFile } from "node:fs";',
      'import { useState } from "react";',
      "const el = document.createElement('div');",
      "const dpr = window.devicePixelRatio;",
    ];

    for (const [index, source] of violations.entries()) {
      expect(FORBIDDEN[index]!.pattern.test(stripComments(source))).toBe(true);
    }
  });

  it.each(sourceFiles())("%s imports nothing outside core's remit", (file) => {
    const source = stripComments(readFileSync(file, "utf8"));

    for (const { pattern, reason } of FORBIDDEN) {
      expect(pattern.test(source), `${file} violates a boundary: ${reason}`).toBe(false);
    }
  });
});
