import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Without a local config this package inherits apps/launchpad/vitest.config.ts
    // (`include: ['lib/**']`), which silently skips these co-located src tests
    // (same class as the `user`/ai-config fn fixes). Pin to src.
    include: ['src/**/*.test.ts'],
    // The handler reads these at module load (APP_CLIENT_TO_SLUG, table names).
    // vitest applies test.env before loading test modules, so `aud`→appSlug resolves.
    env: {
      APP_SLUGS: 'stock-analyser,budget-tracker',
      APP_CLIENT_STOCK_ANALYSER: 'client-sa',
      APP_CLIENT_BUDGET_TRACKER: 'client-bt',
      USER_POOL_ID: 'pool-test',
      ACCOUNTS_TABLE: 'accounts-test',
      ACCOUNT_MEMBERS_TABLE: 'members-test',
    },
  },
});
