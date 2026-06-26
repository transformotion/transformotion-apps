import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Without a local config this package inherits apps/launchpad/vitest.config.ts
    // (`include: ['lib/**']`), which silently skips these co-located src tests
    // (same class as the accounts/user/ai-config fn fixes). Pin to src.
    include: ['src/**/*.test.ts'],
    // Module-load env for the const X = process.env.X! reads at import time. The
    // tests exercise the exported pure functions (no handler IO), so these only
    // need to be present.
    env: {
      USERS_TABLE: 'users-test',
      ACCOUNTS_TABLE: 'accounts-test',
      ACCOUNT_MEMBERS_TABLE: 'members-test',
      APP_ADMIN_GRANTS_TABLE: 'app-admin-grants-test',
      INVITATIONS_TABLE: 'invitations-test',
      USER_POOL_ID: 'pool-test',
    },
  },
});
