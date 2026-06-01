# M9 #386 Launchpad Auth Reseed Runbook

This runbook prepares the staged Launchpad-owned auth domain for cutover.

Current live auth still uses the Platform-owned `Transformotion{Stage}-Auth`
stack. Do not set `LAUNCHPAD_AUTH_CUTOVER_ENABLED=true` until the Launchpad
User Pool, groups, users, and tables below are seeded and validated.

## Resources

`Transformotion{Stage}-LaunchpadAuth` creates:

- `launchpad-users-{stage}`
- `launchpad-accounts-{stage}`
- `launchpad-account-members-{stage}`
- `launchpad-invitations-{stage}`
- `launchpad-rate-limits-{stage}`
- `launchpad-pre-token-generation-{stage}`
- Launchpad-owned Cognito User Pool, Hosted UI domain, app clients, and groups

The pre-token trigger reads only `launchpad-account-members-{stage}` and
`launchpad-accounts-{stage}` to produce the existing `apps`, `accounts`, and
`site_admin` claims.

## Required Seed Data

For the platform owner's account, seed:

1. A Cognito user in the Launchpad-owned User Pool.
2. Cognito group membership:
   - `site-admin`
   - `stock-app-access`
   - `budget-app-access`
3. One `launchpad-users-{stage}` row for the user.
4. One `launchpad-accounts-{stage}` row per app account:
   - Stock Analyser account with `appSlug = stock-analyser`
   - Budget Tracker account with `appSlug = budget-tracker`
5. One `launchpad-account-members-{stage}` row for each account:
   - partition key `accountId`
   - sort key `userId`
   - `role = owner`

`launchpad-invitations-{stage}` and `launchpad-rate-limits-{stage}` do not need
baseline rows for cutover.

## Executable Dev Seed

After `TransformotionDev-LaunchpadAuth` is deployed, run:

```bash
node scripts/migrations/launchpad/seed-auth-domain-dev.mjs \
  --stage dev \
  --email <owner-email> \
  --temp-password '<temporary-password>'
```

Preview writes first with:

```bash
node scripts/migrations/launchpad/seed-auth-domain-dev.mjs \
  --stage dev \
  --email <owner-email> \
  --dry-run
```

The helper:

- reads `TransformotionDev-LaunchpadAuth` outputs
- creates or confirms the owner user in the Launchpad-owned User Pool
- adds required Cognito groups
- copies matching source account/account-membership rows by owner email
- writes equivalent rows using the Launchpad-owned User Pool username/userId

The manual commands below are retained for debugging and one-off repair.

## Manual Seed Sketch

Use the current live Platform tables as the source of truth:

```bash
aws dynamodb scan --table-name platform.users-dev
aws dynamodb scan --table-name platform.accounts-dev
aws dynamodb scan --table-name platform.account-members-dev
```

Write equivalent rows to the Launchpad-owned tables:

```bash
aws dynamodb put-item --table-name launchpad-users-dev --item file://user.json
aws dynamodb put-item --table-name launchpad-accounts-dev --item file://stock-account.json
aws dynamodb put-item --table-name launchpad-accounts-dev --item file://budget-account.json
aws dynamodb put-item --table-name launchpad-account-members-dev --item file://stock-member.json
aws dynamodb put-item --table-name launchpad-account-members-dev --item file://budget-member.json
```

Create or confirm the user and group memberships in the Launchpad-owned User
Pool:

```bash
aws cognito-idp admin-get-user \
  --user-pool-id <LaunchpadAuth UserPoolId> \
  --username <user-sub-or-username>

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <LaunchpadAuth UserPoolId> \
  --username <user-sub-or-username> \
  --group-name site-admin

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <LaunchpadAuth UserPoolId> \
  --username <user-sub-or-username> \
  --group-name stock-app-access

aws cognito-idp admin-add-user-to-group \
  --user-pool-id <LaunchpadAuth UserPoolId> \
  --username <user-sub-or-username> \
  --group-name budget-app-access
```

## Pre-Cutover Validation

Before enabling cutover:

- Confirm `Transformotion{Stage}-LaunchpadAuth` outputs exist.
- Confirm the Launchpad-owned User Pool has the expected user.
- Confirm the user is in `site-admin`, `stock-app-access`, and
  `budget-app-access`.
- Confirm `launchpad-account-members-{stage}` has rows for the user.
- Confirm `launchpad-accounts-{stage}` has matching `appSlug` values.
- Trigger a sign-in against the staged User Pool and inspect the ID token for:
  - `site_admin = "true"`
  - `apps` containing `stock-analyser` and `budget-tracker`
  - `accounts` containing the seeded account memberships

Only after this validation should a later PR flip
`LAUNCHPAD_AUTH_CUTOVER_ENABLED=true` and update live frontend/runtime auth
configuration.

For the full dev cutover sequence, use
[`m9-386-dev-auth-cutover-checklist.md`](./m9-386-dev-auth-cutover-checklist.md).
