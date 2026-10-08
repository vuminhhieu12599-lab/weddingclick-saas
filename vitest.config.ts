import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * RS-01: Next's compiler resolves `next/dynamic` to its app-router
 * implementation for app-directory code (`next/dist/api/app-dynamic`, see
 * next/dist/build/create-compiler-aliases.js); vitest would otherwise load
 * the pages-router implementation. This mirrors that one production alias so
 * tests exercise the same lazy-renderer behaviour. Nothing else is configured:
 * vitest defaults apply.
 */
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^next\/dynamic$/,
        replacement: fileURLToPath(new URL("./node_modules/next/dist/api/app-dynamic.js", import.meta.url)),
      },
    ],
  },
});
