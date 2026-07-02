# Platform Substrate Contract

Platform owns neutral substrate only.

## Included Boundaries

- CloudFront distribution and routing substrate.
- S3/static asset hosting foundations.
- DNS and ACM certificate substrate.
- Shared deployment foundations that do not own app runtime behavior.
- Shared runtime profile/environment naming conventions where they are
  platform-wide.

## Explicit Exclusions

Platform does not own:

- Launchpad auth domain.
- Launchpad control-plane APIs.
- Stock Analyser REST, WSS, AI runtime, data tables, or app deploy lifecycle.
- Budget Tracker REST, WSS, AI runtime, data tables, or app deploy lifecycle.
- App-specific provider/model resolution.

## Deployment Boundary

Platform deploys must not cascade app runtime deploys. App deploys may consume
stable substrate outputs, but must not require Platform to activate app routes,
WSS routes, or AI execution paths.
