import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['components/**/*.test.ts', 'lib/**/*.test.ts', 'stores/**/*.test.ts', 'functions/**/*.test.ts'],
  },
});
