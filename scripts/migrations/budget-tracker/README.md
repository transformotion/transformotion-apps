# Budget Tracker — One-Shot Migrations

Scripts for one-shot data migrations from the v0 prototype into the canonical
DynamoDB-backed budget-tracker tables.

These are run-once operations executed manually by a platform admin. The scripts
are kept in the repo for audit and replay purposes.

## Scripts

### import-transactions.ts

Imports historical transactions from the v0 prototype into
`budget-tracker.transactions-dev`.

**Source:** `migration-artifacts/budget-tracker/transactions/exports/export.json` (732 transactions)

**Mechanism:**
1. Reads export file from disk
2. Prompts for Cognito ID token (interactive)
3. Generates timestamped S3 key
4. Uploads file to `transformotion-migration-uploads-959516291617`
5. POSTs `{ s3Key }` to `/api/migrations/budget-tracker/transactions/import`
6. Lambda reads from S3, transforms, persists to DynamoDB
7. Verifies row count and `_ignore: true` count against expected values

**Usage:**

```bash
# From repo root — AWS credentials and correct region must be configured
pnpm tsx scripts/migrations/budget-tracker/import-transactions.ts
```

**Pre-conditions:**
- AWS credentials configured for the dev account (`ap-southeast-2`)
- Cognito ID token for a user in the `budget-tracker` group
- `budget-tracker.transactions-dev` table is empty (or already partially migrated — idempotent)

**Expected output on first run:**
- `migrated.transactions: 732`, `alreadyPresent.transactions: 0`
- DynamoDB row count: 732
- `_ignore: true` count: 39 (33 pre-existing transfers + 6 Hawkins payments)

---

### import-rules.ts

Imports matching rules from the v0 prototype localStorage export into
`budget-tracker.budget-data-dev` (stored as a rules list on the account item).

**Source:** `migration-artifacts/budget-tracker/matching-rules/exports/export.json` (73 rules)

**Mechanism:**
1. Reads export file from disk
2. Prompts for Cognito ID token (interactive)
3. Resolves each rule's string category/subcategory labels to canonical UUIDs via `GET /api/budget/v1/categories`
4. Detects `matchType` from pattern syntax (`contains` / `startsWith` / `regex`); converts bare `*` → `.*`
5. In dry-run mode: prints resolution table, matchType summary, conflict report, and simulated transaction diff — then exits
6. In execute mode: POSTs each rule to `POST /api/budget/v1/rules` and verifies final DynamoDB count

**Usage:**

```bash
# Dry-run (default — no writes)
pnpm tsx scripts/migrations/budget-tracker/import-rules.ts

# Execute: set DRY_RUN = false at the top of the file, then run
pnpm tsx scripts/migrations/budget-tracker/import-rules.ts
```

**Pre-conditions:**
- Cognito ID token for Steve's account (`aed9dcdf-81b5-47a1-a0d5-5afbae940e93`)
- Rules table must be empty (script does not deduplicate)
- Deployed API accessible at the configured `API_BASE`

**Expected output after execute:**
- 73 rules POSTed successfully
- DynamoDB rule count: 73
- Design decisions (conflict resolution, matchType detection, `_ignore` handling): see PR description
