import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * StorageStack — Platform-level S3 buckets not tied to a specific app.
 *
 * Buckets:
 *   transformotion-backups-{account}  — shared across stages (dev/prod coexist
 *                                       under different key prefixes).
 *                                       Versioned, SSE-S3, public access blocked.
 *                                       Lifecycle on migration-backups/ prefix:
 *                                       → Standard-IA after 30 days
 *                                       → Expire after 365 days
 *
 * No cross-stack exports or imports.
 */
export class StorageStack extends cdk.Stack {
  public readonly backupsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';

    cdk.Tags.of(this).add('app',         'platform');
    cdk.Tags.of(this).add('environment', stage);

    // ── transformotion-backups-{account} ──────────────────────────────────
    // Bucket name uses account (not stage) — intentionally shared across
    // stages so dev and prod backups coexist under different key prefixes.
    this.backupsBucket = new s3.Bucket(this, 'BackupsBucket', {
      bucketName:        `transformotion-backups-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned:         true,
      encryption:        s3.BucketEncryption.S3_MANAGED,
      removalPolicy:     isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      lifecycleRules: [
        {
          id:     'migration-backups-lifecycle',
          prefix: 'migration-backups/',
          transitions: [
            {
              storageClass:      s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter:   cdk.Duration.days(30),
            },
          ],
          expiration: cdk.Duration.days(365),
        },
      ],
    });

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'BackupsBucketName', {
      value:       this.backupsBucket.bucketName,
      description: 'Platform backups S3 bucket name',
      exportName:  `Transformotion-${stage}-BackupsBucketName`,
    });
  }
}
