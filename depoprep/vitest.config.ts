import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit tests run without a Convex deployment, so the generated modules point at small stubs.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
  resolve: {
    alias: [
      { find: /^.*\/_generated\/api$/, replacement: path.resolve(__dirname, "tests/stubs/generated-api.ts") },
      { find: /^.*\/_generated\/server$/, replacement: path.resolve(__dirname, "tests/stubs/generated-server.ts") },
    ],
  },
});
