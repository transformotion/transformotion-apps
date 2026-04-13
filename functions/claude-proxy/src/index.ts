import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import {
  withAuth,
  parseBody,
  ok,
  badRequest,
  HttpError,
} from '@transformotion/lambda-middleware';

// ── Secrets Manager client (one per Lambda container) ────────────────────────
const sm = new SecretsManagerClient({});

// In-memory API key cache — Lambda containers are reused across invocations.
// Refresh the key every 5 minutes without hitting Secrets Manager every call.
let cachedApiKey: string | undefined;
let cacheExpiresAt = 0;

async function getAnthropicApiKey(): Promise<string> {
  const now = Date.now();
  if (cachedApiKey && now < cacheExpiresAt) return cachedApiKey;

  const res = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.ANTHROPIC_SECRET_NAME! }),
  );

  if (!res.SecretString) throw new HttpError(500, 'Anthropic API key secret is empty');

  cachedApiKey   = res.SecretString.trim();
  cacheExpiresAt = now + 5 * 60 * 1000; // 5 minutes
  return cachedApiKey;
}

// ── Anthropic request/response types ─────────────────────────────────────────

interface ClaudeRequest {
  prompt:     string;
  system?:    string;
  model?:     string;
  maxTokens?: number;
  /** When true, enables the web_search tool so Claude can use live data. */
  webSearch?: boolean;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  model:   string;
  usage: {
    input_tokens:  number;
    output_tokens: number;
  };
  error?: { type: string; message: string };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = withAuth(async ({ event }) => {
  const {
    prompt,
    system,
    model     = 'claude-sonnet-4-20250514',
    maxTokens = 4000,
    webSearch = false,
  } = parseBody<ClaudeRequest>(event);

  if (!prompt?.trim()) throw badRequest('prompt is required');
  if (maxTokens < 1 || maxTokens > 32000) throw badRequest('maxTokens must be between 1 and 32000');

  const apiKey = await getAnthropicApiKey();

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  };

  if (system) requestBody['system'] = system;
  if (webSearch) requestBody['tools'] = [{ type: 'web_search_20250305', name: 'web_search' }];

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await res.json() as AnthropicResponse;

  if (!res.ok) {
    // Log internally but never send API key details or quota info to the client
    console.error('[claude-proxy] Anthropic error', res.status, data?.error);

    if (res.status === 429) {
      throw new HttpError(429, 'API rate limit reached. Please try again shortly.');
    }
    if (res.status === 401) {
      throw new HttpError(502, 'Upstream API authentication failed — check the API key secret.');
    }
    throw new HttpError(502, 'Upstream API error');
  }

  // When web_search is used, Claude returns multiple content blocks
  // (tool_use, tool_result, text). Collect all text blocks and return
  // the first non-empty one that contains valid content.
  const textBlocks = data.content.filter(b => b.type === 'text' && b.text?.trim());
  if (!textBlocks.length) {
    throw new HttpError(502, 'No text content returned from the AI model');
  }

  // Return the last text block — when web_search is active, the final
  // text block contains the synthesised answer based on search results.
  const content = textBlocks[textBlocks.length - 1].text!;

  return ok({
    content,
    model: data.model,
    usage: {
      inputTokens:  data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    },
  });
});
