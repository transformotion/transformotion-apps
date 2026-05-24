import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { APPS } from '@transformotion/runtime-config';

export interface NetworkStackProps extends cdk.StackProps {
  stage: 'dev' | 'prod';
  /**
   * ARN of the ACM certificate for the custom domain.
   * Certificate MUST be in us-east-1 (CloudFront requirement).
   * If omitted the distribution uses the default *.cloudfront.net domain.
   *
   * Dev:  arn:aws:acm:us-east-1:959516291617:certificate/de463b1f-...
   *       → dev.apps.transformotion.com.au
   * Prod: requested in a later session
   *       → apps.transformotion.com.au
   */
  certificateArn?: string;
  /**
   * Custom domain names to attach to the CloudFront distribution.
   * Must correspond to the certificate above.
   */
  domainNames?: string[];
}

/**
 * NetworkStack — S3 static hosting bucket + CloudFront distribution.
 *
 * Dev:  TransformotionDev-Network  → dev.apps.transformotion.com.au
 * Prod: TransformotionProd-Network → apps.transformotion.com.au
 *
 * certificateArn + domainNames are passed in from app.ts once the ACM cert
 * has been issued (DNS validation via GoDaddy).
 */
export class NetworkStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: NetworkStackProps) {
    super(scope, id, props);

    const { stage, certificateArn, domainNames } = props;
    const isProd = stage === 'prod';

    // ── S3 bucket ──────────────────────────────────────────────────────────
    this.bucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `transformotion-web-${stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // ── ACM certificate (optional — omit until cert is issued) ────────────
    const certificate = certificateArn
      ? acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn)
      : undefined;

    // ── CloudFront Function — index rewrite ───────────────────────────────
    // S3 OAC REST API returns 403 for both directory keys (e.g. /sign-in/) and
    // extension-less paths (e.g. /stock-signal/callback). Without rewriting these
    // to their index.html equivalents, all such requests fall through to the
    // 403→/index.html error response, which serves the SA root page. This breaks
    // OAuth callbacks because the SA root page does not configure Amplify and the
    // auth code in the query string is never exchanged.
    //
    // The function handles three cases:
    //   /path/   → /path/index.html   (trailing slash directory)
    //   /path    → /path/index.html   (no trailing slash, no extension)
    //   /path.js → unchanged          (static asset — has an extension)
    const indexRewrite = new cloudfront.Function(this, 'IndexRewrite', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          if (uri.includes('.')) return request;
          if (uri.endsWith('/')) {
            request.uri = uri + 'index.html';
          } else {
            request.uri = uri + '/index.html';
          }
          return request;
        }
      `),
      comment: 'Rewrite all route paths to their index.html (handles /path, /path/, skips /path.ext)',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // ── CloudFront distribution ────────────────────────────────────────────
    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        functionAssociations: [{
          function: indexRewrite,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      additionalBehaviors: Object.fromEntries(
        APPS.map(app => [`${app.urlPrefix}/*`, {
          origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          compress: true,
          functionAssociations: [{
            function: indexRewrite,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          }],
        }])
      ),
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA fallback — React Router handles 403/404
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.seconds(0) },
      ],
      // Custom domain + cert (wired once ACM cert is ISSUED)
      ...(certificate && domainNames ? {
        certificate,
        domainNames,
      } : {}),
      comment: `Transformotion Apps — ${stage}`,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
    });

    // ── Outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'DistributionDomainName', {
      value: this.distribution.distributionDomainName,
      description: `CloudFront domain for ${stage}`,
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

    if (domainNames && domainNames.length > 0) {
      new cdk.CfnOutput(this, 'CustomDomain', {
        value: `https://${domainNames[0]}`,
        description: `Custom domain URL for ${stage}`,
        exportName: `Transformotion-${stage}-CustomDomain`,
      });
    }
  }
}
