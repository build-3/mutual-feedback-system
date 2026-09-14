// Stand-in for the "server-only" marker package under vitest — see
// vitest.config.ts. Next resolves the real thing at build time; this exists
// only so server modules can be imported by a test runner.
export {}
