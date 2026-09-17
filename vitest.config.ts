import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [
      ["apps/web/**/*.test.tsx", "jsdom"],
      ["apps/web/src/draft-store.test.ts", "jsdom"],
    ],
    setupFiles: ["./apps/web/src/test/setup.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
