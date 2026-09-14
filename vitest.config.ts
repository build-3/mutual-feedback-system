import { defineConfig } from "vitest/config"
import path from "node:path"

// Mirrors the "@/*" -> "./src/*" path alias in tsconfig.json. Without it, any
// test whose import graph reaches a module using the alias fails to resolve at
// collection time — which is why the tests that predate this file all stick to
// relative imports.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
