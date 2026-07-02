# Budget Tracker Backend Runtime Contract

## IAM And External Dependencies

Budget Tracker Lambdas require scoped access only to Budget Tracker-owned
tables, the app WSS management endpoint, LaunchpadAuth token verification, and
provider secrets consumed by the AI proxy.

## Lambda/API Behaviour

The REST API routes in `api.ts` are account scoped. Handlers must authorize
Budget Tracker app access and account membership before DynamoDB access.

The WSS connection contract is in `wss.ts`. `$connect` validates JWT claims and
optional account id, `$default` supports init, and `$disconnect` removes the
connection record.

## Deployment Boundary

Budget Tracker deploys independently from Launchpad, Stock Analyser, and
Platform runtime stacks except for stable substrate and LaunchpadAuth
integration values.
