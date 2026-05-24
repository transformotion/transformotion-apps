// Launchpad has no CDK stacks — it is a frontend-only app deployed by
// deploy-launchpad.yml as a static export to the shared S3/CloudFront bucket.
// The CloudFront distribution is owned by TransformotionDev-Network / TransformotionProd-Network
// in bin/platform.ts.
//
// This file exists so that --app bin/launchpad.ts can be used in CI commands
// without errors; it produces an empty CDK app.

import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';

new cdk.App();
