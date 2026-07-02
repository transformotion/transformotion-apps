# Budget Tracker Backend AI Runtime Contract

Budget Tracker owns AI CSV analysis and AI transaction review execution.

As of M15.1, Budget Tracker also **owns its own AI provider/model override**.
It exposes app-owned endpoints under `/api/budget/v1/ai-config`
(`GET`, `PUT /override`, `DELETE /override`, auth `account`) returning
`AppAiRuntimeConfigResponse`. The app reads the Launchpad-owned platform default
**read-only** and never writes it. The AI proxy resolves provider/model using
the shared resolver: app override, then platform default, then environment
fallback (`app_override` -> `platform_default` -> `environment_fallback`).

The app override record uses the canonical key shape
`pk: 'AI_CONFIG'`, `sk: 'APP#budget-tracker'` (`AiRuntimeConfigRecord`).

The deprecated Launchpad app-override write endpoints are retained for runtime
transition only; new writes must go through the app-owned endpoints above.

AI review acknowledgements use `AiAsyncStartResponse`. Batch review progress
uses `ReviewBatchResult` inside `BudgetTrackerWsServerMessage`.

Provider secrets are external dependencies and must not be stored in app data
tables or Launchpad AI runtime config.
