import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/admin/**/*.test.tsx"],
    mockReset: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
