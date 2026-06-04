# Observability

Current Transformotion observability is CloudWatch Logs first. M13 may add
dashboards and metrics, but M9 AI runtime switching emits structured AI proxy
telemetry from the shared `@transformotion/fn-ai-proxy-core` package.

## AI Runtime Telemetry

Stock Analyser and Budget Tracker AI proxy Lambdas emit the same structured JSON
log event:

```text
{"eventName":"ai_runtime_execution", ...}
```

Fields:

| Field | Meaning |
|---|---|
| `eventName` | Always `ai_runtime_execution` |
| `appSlug` | `stock-analyser` or `budget-tracker` when configured |
| `requestId` | API Gateway request ID carried into async jobs when available |
| `asyncMode` | `true` for async job execution, `false` for direct proxy calls |
| `provider` | Resolved provider, currently `claude` or `openai` |
| `model` | Resolved model used for the provider call |
| `configurationSource` | `app_override`, `platform_default`, or `environment_fallback` |
| `latencyMs` | Provider execution latency measured inside the proxy |
| `success` | `true` for provider success, `false` for provider/proxy failure |
| `inputTokens` | Provider-reported input tokens, when available |
| `outputTokens` | Provider-reported output tokens, when available |
| `totalTokens` | Provider-reported or derived total tokens, when available |
| `errorClass` | Normalized AI error class on failures |
| `errorRetryable` | Retryability when known from provider normalization |
| `providerErrorCode` | Provider or HTTP error code when safely available |
| `httpStatusCode` | Normalized HTTP status associated with the failure |

Telemetry must not include prompts, model responses, API keys, raw provider
payloads, account data, transaction details, or Cognito claims.

## CloudWatch Queries

Provider/model usage:

```sql
fields @timestamp, appSlug, provider, model, configurationSource, asyncMode, success, latencyMs
| filter eventName = "ai_runtime_execution"
| stats count(*) as calls, avg(latencyMs) as avgLatencyMs, pct(latencyMs, 95) as p95LatencyMs
  by appSlug, provider, model, configurationSource, asyncMode, success
| sort calls desc
```

Errors by class:

```sql
fields @timestamp, appSlug, provider, model, errorClass, errorRetryable, providerErrorCode, httpStatusCode
| filter eventName = "ai_runtime_execution" and success = false
| stats count(*) as failures by appSlug, provider, model, errorClass, errorRetryable, providerErrorCode, httpStatusCode
| sort failures desc
```

Token usage:

```sql
fields @timestamp, appSlug, provider, model, inputTokens, outputTokens, totalTokens
| filter eventName = "ai_runtime_execution" and success = true
| stats sum(inputTokens) as inputTokens, sum(outputTokens) as outputTokens, sum(totalTokens) as totalTokens
  by appSlug, provider, model
| sort totalTokens desc
```
