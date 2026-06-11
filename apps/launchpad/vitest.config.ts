import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    // Mirror the Next.js `@/*` path alias (tsconfig) so tests can import modules
    // that reference `@/lib/...`.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
});
