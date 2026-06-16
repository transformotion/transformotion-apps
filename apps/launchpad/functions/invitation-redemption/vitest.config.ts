import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Local config so these src tests are not silently skipped by the inherited
    // apps/launchpad/vitest.config.ts (`include: ['lib/**']`).
    include: ['src/**/*.test.ts'],
  },
});
