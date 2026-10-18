import { cp, access } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";
import { resolveIncludes } from "./src/build/glslInclude";

/**
 * Imports of `.glsl` return the composed shader source with `#include`
 * directives expanded, so technique chunks can be shared across Looks.
 */
function glslInclude(): Plugin {
  return {
    name: "glsl-include",
    transform(code, id) {
      if (!id.endsWith(".glsl")) {
        return null;
      }

      const { code: composed, included } = resolveIncludes(
        code,
        (name) => {
          try {
            return readFileSync(resolve(dirname(id), name), "utf8");
          } catch {
            return undefined;
          }
        },
        id,
      );

      for (const name of included) {
        this.addWatchFile(resolve(dirname(id), name));
      }

      return { code: `export default ${JSON.stringify(composed)};`, map: null };
    },
  };
}

/**
 * The original WebGL2 lesson pages are plain static files with no build step.
 * They are copied verbatim rather than passed through the bundler so they keep
 * working exactly as they did.
 */
function copyLegacy(): Plugin {
  return {
    name: "copy-legacy",
    apply: "build",
    async closeBundle() {
      const from = resolve(import.meta.dirname, "legacy");

      try {
        await access(from);
      } catch {
        return;
      }

      await cp(from, resolve(import.meta.dirname, "dist/legacy"), { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), glslInclude(), copyLegacy()],
  server: { open: false },
  build: { target: "es2022", sourcemap: true },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
