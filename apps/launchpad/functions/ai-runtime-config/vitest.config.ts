import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Required: without a local config this package inherits
    // apps/launchpad/vitest.config.ts, whose `include: ['lib/**']` does not
    // match these co-located src tests — so they (and any new ones) are silently
    // skipped by `vitest run` / `turbo test`. Same class as the `user` fn fix
    // (#435); surfaced when wiring app-admin authz onto the override routes (M11).
    include: ['src/**/*.test.ts'],
  },
});
