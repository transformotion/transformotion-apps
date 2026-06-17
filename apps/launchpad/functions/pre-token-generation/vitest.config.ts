import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Without a local config this package inherits apps/launchpad/vitest.config.ts
    // (`include: ['lib/**']`), which silently skips these co-located src tests.
    include: ['src/**/*.test.ts'],
    // The handler module parses these at load (JSON.parse(APP_REGISTRY), table
    // names). planReconcile takes its slugs/groups as params, but importing the
    // module still evaluates the top-level consts — so they must be present.
    env: {
      ACCOUNT_MEMBERS_TABLE: 'members-test',
      ACCOUNTS_TABLE: 'accounts-test',
      APP_REGISTRY: JSON.stringify({
        apps: [
          { slug: 'stock-analyser', cognitoGroup: 'stock-app-access' },
          { slug: 'budget-tracker', cognitoGroup: 'budget-app-access' },
        ],
      }),
    },
  },
});
