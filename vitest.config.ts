import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/engine/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/engine/index.ts"],
    },
  },
});
