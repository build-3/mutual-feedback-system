import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  resolve: {
    alias: {
      // Mirrors the "@/*" -> "./src/*" path alias in tsconfig.json. Without it,
      // any test whose import graph reaches a module using the alias fails to
      // resolve at collection time — which is why the tests that predate this
      // file all stick to relative imports.
      "@": path.resolve(__dirname, "./src"),
      // "server-only" is a Next build-time marker with no standalone package,
      // so anything importing it is unloadable under vitest. Stubbing it lets
      // server modules be unit-tested; the marker still does its real job in
      // the Next build, which is where it matters.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
})
