# Migration backups

This document records S3-stored backups taken before destructive
migration operations. Each entry captures the source table, row
count at backup time, the S3 location, and a checksum for
verification.

## Phase 0 backup — stock-analyser tables (2026-04-25)

Taken before the account bootstrap migration, which will rewrite
accountIds on all rows and eventually delete the -v2 tables.

| Source table | Rows | S3 key | ETag |
|---|---|---|---|
| stock-analyser.portfolio-dev-v2 | 7 | migration-backups/2026-04-25/portfolio-dev-v2.json | "c071c4b038254f84a59fa18e1b317e21" |
| stock-analyser.watchlist-dev-v2 | 6 | migration-backups/2026-04-25/watchlist-dev-v2.json | "4b9bdbad672fa968c778f88223a0e12f" |

S3 bucket: `transformotion-backups-959516291617`

Full S3 URIs:
- `s3://transformotion-backups-959516291617/migration-backups/2026-04-25/portfolio-dev-v2.json`
- `s3://transformotion-backups-959516291617/migration-backups/2026-04-25/watchlist-dev-v2.json`

## Restoring from a backup

To restore a table from one of these backups:

1. Download the backup file:
   ```
   aws s3 cp s3://transformotion-backups-959516291617/migration-backups/<date>/<file>.json /tmp/
   ```

2. Write a restoration script that reads the JSON and calls
   `aws dynamodb put-item` or `aws dynamodb batch-write-item`
   for each row. The scan output is in the standard DynamoDB
   JSON format.

3. Verify the row count matches after restoration.

## Bucket configuration

The `transformotion-backups-959516291617` bucket is managed by
the `TransformotionDev-Storage` CDK stack (see
`infrastructure/lib/platform/storage-stack.ts`). It has:

- Versioning enabled
- SSE-S3 encryption
- Public access blocked
- Lifecycle rule on `migration-backups/` prefix: transition to
  Standard-IA after 30 days, expire after 365 days

**Do not add `autoDeleteObjects` to this bucket**; see the
comment in `storage-stack.ts` for the rationale.
