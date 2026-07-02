# Stock Analyser Backend Data Contract

## Tables

Current app-owned tables include portfolio, watchlist, analysis-cache,
job-results, and WSS connections. Account-scoped records are keyed by account
id. WSS connection records use connection id and a TTL.

## Cache And Job Results

Analysis cache and job result records use the executable cache shapes in
`types.ts`. TTL values are required for cache expiry.

Shared cache entries are allowed only for non-account-specific market data.
Account-specific analysis must remain account scoped.
