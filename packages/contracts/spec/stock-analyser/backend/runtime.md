# Stock Analyser Backend Runtime Contract

## IAM And External Dependencies

Stock Analyser Lambdas require scoped access only to Stock Analyser-owned
tables, the app WSS management endpoint, LaunchpadAuth token verification, and
app AI provider secrets consumed by the AI proxy.

## Lambda/API Behaviour

The REST API routes in `api.ts` are account scoped. Handlers must authorize
Stock Analyser app access and account membership before DynamoDB access.

The WSS connection contract is in `wss.ts`. `$connect` validates JWT claims and
optional account id, `$default` supports init, and `$disconnect` removes the
connection record.

## Deployment Boundary

Stock Analyser deployment must not require Launchpad, Budget Tracker, or
Platform runtime stack deployment except for stable substrate and LaunchpadAuth
integration values.
