import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';

export interface NetworkStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
}

/**
 * NetworkStack — S3 static hosting bucket + CloudFront distribution.
 *
 * Dev:  TransformotionDev-Network  → dev.apps.transformotion.com.au (Phase 1, S1.7)
 * Prod: TransformotionProd-Network → apps.transformotion.com.au     (Phase 1, S1.7)
 *
 * Custom domain + ACM certificate are wired up in Phase 1 (S1.7) once the
 * React app is ready to deploy. This stack creates the distribution first so
 * the CloudFront domain name is available for the GoDaddy CNAME record.
 */
export class NetworkStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isProd = stage === 'prod';

    // ── S3 bucket ──────────────────────────────────────────────────────────
    // Private bucket — CloudFront accesses it via Origin Access Control (OAC).
    // Dev bucket is destroyed on stack deletion; prod bucket is retained.
    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `transformotion-web-${stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // ── CloudFront distribution ────────────────────────────────────────────
    // SPA routing: 403/404 → index.html so React Router handles the path.
    // Custom domain + ACM cert added in Phase 1, S1.7.
    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA fallback — let React Router handle 403/404
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
      comment: `Transformotion Apps — ${stage}`,
      // priceClass restricts to AU/NZ/Asia-Pacific edge locations to reduce cost
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront domain for ${stage} — add as CNAME target in GoDaddy`,
      exportName: `Transformotion-${stage}-DistributionDomain`,
    });

    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      exportName: `Transformotion-${stage}-DistributionId`,
    });

    new cdk.CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: `S3 bucket for ${stage} static assets`,
      exportName: `Transformotion-${stage}-BucketName`,
    });
  }
}
