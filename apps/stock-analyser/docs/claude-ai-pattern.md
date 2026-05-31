# Using the Claude AI Pattern

This document explains how to integrate AI features using the `useClaude` hook. The pattern supports both mock mode (development) and real Claude API calls via AWS Lambda.

## Overview

The Claude integration uses an **async WebSocket pattern**:
1. Open platform WebSocket (`NEXT_PUBLIC_PLATFORM_WSS_URL`) with Cognito ID token
2. POST to `/api/claude` with prompt + `connectionId` → returns `jobId`
3. Receive `{ type: 'job_complete' }` push notification on the WebSocket
4. Read the completed job result from the analysis-cache
5. Return typed result to component

## Quick Start

### In a React Component

```tsx
import { useClaude } from '@/lib/hooks'

interface SuggestionResult {
  category: string
  subcategory: string
  reason: string
}

function MyComponent() {
  const { call: callClaude, loading, error } = useClaude<SuggestionResult>()

  const handleAnalyze = async () => {
    try {
      const result = await callClaude({
        prompt: 'Analyze this transaction: "Coffee at Starbucks"',
        systemPrompt: 'You are a financial categorizer.',
      })
      
      console.log(result.category) // e.g. "Eating-out & Entertainment"
    } catch (err) {
      console.error('Analysis failed:', err)
    }
  }

  return (
    <>
      <button onClick={handleAnalyze} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </button>
      {error && <p className="text-red-500">{error}</p>}
    </>
  )
}
```

### Outside a Component (Server-side)

```tsx
import { callClaudeAPI } from '@/lib/hooks/use-claude'

async function categorizeTransactions() {
  const result = await callClaudeAPI<CategoriesSuggestions>({
    prompt: 'Categorize these transactions: ...',
  })
  return result
}
```

## Configuration

Set environment variables to control behavior:

```env
# Provider profile: mock (default, local dev) or live (deployed environments)
NEXT_PUBLIC_RUNTIME_PROFILE=mock

# API Endpoints
NEXT_PUBLIC_AI_API_URL=/api/claude           # Where to POST prompt
NEXT_PUBLIC_AI_CACHE_URL=/analysis-cache     # Where to read job results
NEXT_PUBLIC_PLATFORM_WSS_URL=wss://...         # Platform WebSocket URL for job notifications
```

## Hook API

### `useClaude<T>(options?)`

**Parameters:**
- `options.cacheKey?` - DynamoDB cache key for the result (optional)

**Returns:**
```tsx
{
  call: (request: ClaudeRequest) => Promise<T>
  loading: boolean
  error: string | null
  abort: () => void
}
```

**Types:**
```tsx
interface ClaudeRequest {
  prompt: string
  systemPrompt?: string
  webSearch?: boolean
  maxTokens?: number
}
```

## Examples

### Transaction Categorization

```tsx
const { call } = useClaude<TransactionSuggestions>()

const suggestions = await call({
  prompt: `Categorize these transactions:
${transactions.map(t => `- ${t.date}: ${t.description} $${t.amount}`).join('\n')}

Available categories: ${categories.join(', ')}

Return JSON with array of {transactionId, category, subcategory, reason}`,
  systemPrompt: 'You are a financial expert. Return only valid JSON.',
})
```

### Rule Generation

```tsx
const { call } = useClaude<{ pattern: string; explanation: string }>()

const newRule = await call({
  prompt: 'Create a regex pattern that matches "Spotify, Netflix, Disney+" as entertainment subscriptions',
  systemPrompt: 'Create regex patterns for financial transactions.',
})

// Result: { pattern: "spotify|netflix|disney", explanation: "..." }
```

### Market Analysis

```tsx
const { call } = useClaude<MarketAnalysis>()

const analysis = await call({
  prompt: `Analyze these stocks: ${stocks.join(', ')}. Return JSON with signals.`,
  systemPrompt: 'You are an expert stock analyst. Return structured JSON.',
  maxTokens: 2000,
})
```

## Development vs. Production

### Development (Mock Mode)
- `NEXT_PUBLIC_RUNTIME_PROFILE=mock` (default; no env var needed locally)
- Returns mock fixture data with a short simulated delay
- No API keys or WSS connection needed

### Production (Real Claude)
- `NEXT_PUBLIC_RUNTIME_PROFILE=live` (set by deploy workflows)
- Opens platform WebSocket (`NEXT_PUBLIC_PLATFORM_WSS_URL`) with Cognito ID token
- Calls actual Lambda + Claude API
- API key in Lambda (server-side only)

**The code stays identical — only configuration changes.**

## Error Handling

```tsx
const { call, error, loading } = useClaude<Result>()

try {
  const result = await call({ prompt: '...' })
} catch (err) {
  // Hook automatically sets error state
  console.error(error) // 'Request timeout' | 'API error: 500' | etc.
}
```

## Cancellation

```tsx
const { call, abort } = useClaude<Result>()

// Start request
const promise = call({ prompt: '...' })

// Cancel mid-request (e.g. if user navigates away)
abort()

// Promise will reject with "Request aborted"
```

## Implementation Details

### Mock Implementation (`config.ai.provider === 'mock'`)
1. Simulates `POST /api/claude` immediately with a mock jobId
2. Simulates `GET /analysis-cache/job-{jobId}` polling
3. Returns result after a short delay

### Real Implementation (`config.ai.provider === 'claude'`)
1. Opens platform WebSocket with `?token=...&app=stock-analyser&accountId=...`
2. Sends `{ action: 'init' }` — receives `{ type: 'connected', connectionId }`
3. `POST /api/claude` with prompt + `connectionId` (Lambda proxy endpoint)
4. Lambda returns `{ jobId }` immediately; async job runs in background
5. When job completes, Lambda pushes `{ type: 'job_complete' }` to the WebSocket
6. Reads `GET /analysis-cache/job-{jobId}` and returns typed result

## Migrating from Old Pattern

If you have old AI calls like:

```tsx
// Old
const aiService = createMockAIService()
const result = await aiService.complete(prompt)
```

Replace with:

```tsx
// New
const { call } = useClaude<ResultType>()
const result = await call({ prompt })
```

## When to Use `useClaude`

✅ **Use `useClaude` when:**
- In React components that need loading/error UI
- You want automatic polling and retry
- You need to cancel requests (e.g. on unmount)

❌ **Don't use `useClaude` when:**
- You're in a server-side function (use `callClaudeAPI` instead)
- You need streaming responses (not yet supported)

## Next Steps

When integrating with a deployed Claude backend:
1. Create a Lambda function that calls Anthropic Claude API
2. Expose it via API Gateway at `NEXT_PUBLIC_AI_API_URL`
3. Deploy with `NEXT_PUBLIC_RUNTIME_PROFILE=live` (already set in deploy workflows)
4. All component code stays the same ✨
