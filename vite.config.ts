import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";

// The build is one self-contained index.html, matching the original artifacts, so it can be
// opened from disk, shared as a file, or published as a Claude artifact.
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  test: {
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    environment: "node",
  },
});
