import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Without a local config this package inherits apps/launchpad/vitest.config.ts
    // (`include: ['lib/**']`), which silently skips these co-located src tests
    // (same class as the `user`/ai-config fn fixes). Pin to src.
    include: ['src/**/*.test.ts'],
    // Module-load env for the default deps (the tests inject their own deps, so
    // these only need to be present). appSlug now comes from the request body
    // (m16.6.0), not an app-client env, so no APP_CLIENT_* / APP_SLUGS needed.
    env: {
      USER_POOL_ID: 'pool-test',
      ACCOUNTS_TABLE: 'accounts-test',
      ACCOUNT_MEMBERS_TABLE: 'members-test',
    },
  },
});
