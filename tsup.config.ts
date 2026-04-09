import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/index": "src/cli/index.ts",
    "server/index": "src/server/index.ts",
    "server/start": "src/server/start.ts",
  },
  format: ["esm"],
  target: "node20",
  platform: "node",
  splitting: true,
  clean: true,
  dts: false,
  sourcemap: true,
  // better-sqlite3 is a native module — cannot be bundled
  external: ["better-sqlite3", "web-tree-sitter"],
  banner: {
    js: "// codepakt",
  },
});
