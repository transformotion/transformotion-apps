# infra/lib — AWS CDK Stacks

CDK stacks are implemented in Phase 0 session S0.3.

Planned stacks:
- `NetworkStack` — CloudFront distribution, S3 bucket, ACM certificate
- `AuthStack` — Cognito User Pool, App Client, Groups
- `ApiStack` — API Gateway HTTP API, Lambda functions
- `DataStack` — DynamoDB tables
- `MonitoringStack` — CloudWatch dashboards, Budget alarms

See DEVELOPMENT_PLAN.md for full architecture.
