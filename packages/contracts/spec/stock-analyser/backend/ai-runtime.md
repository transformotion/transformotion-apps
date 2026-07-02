# Stock Analyser Backend AI Runtime Contract

Stock Analyser owns the AI proxy that starts async analysis and publishes WSS
results.

As of M15.1, Stock Analyser also **owns its own AI provider/model override**.
It exposes app-owned endpoints under `/ai-config` (`GET`, `PUT /override`,
`DELETE /override`, auth `account`) returning `AppAiRuntimeConfigResponse`. The
app reads the Launchpad-owned platform default **read-only** and never writes
it. The override record uses the canonical key shape `pk: 'AI_CONFIG'`,
`sk: 'APP#stock-analyser'` (`AiRuntimeConfigRecord`).

Provider/model resolution uses the shared `resolveEffectiveAiRuntimeConfig`
helper: app override, platform default, then environment fallback
(`app_override` -> `platform_default` -> `environment_fallback`). The fallback
provider/model are environment variables.

The deprecated Launchpad app-override write endpoints are retained for runtime
transition only; new writes must go through the app-owned endpoints above.

Secrets for Anthropic and OpenAI remain provider-secret dependencies. They are
not stored in Launchpad AI runtime config and are not exposed to the frontend.

Job acknowledgements use `AiAsyncStartResponse`; final text payloads use
`AiTextResponse`; pushed WSS results use `StockAnalyserWsServerMessage`.
