/**
 * API Key Management
 * 
 * SECURITY: These functions should only be called server-side.
 * API keys must NEVER be exposed to the browser.
 * 
 * In production, these keys should be:
 * - Stored in AWS Secrets Manager or Parameter Store
 * - Injected as environment variables in Lambda
 * - Never prefixed with NEXT_PUBLIC_
 */

/**
 * Get the API Gateway API key for Lambda calls.
 * Server-side only - used in API routes or Lambda functions.
 */
export function getAPIKey(): string | null {
  // Never expose to client - no NEXT_PUBLIC_ prefix
  return process.env.API_KEY || null
}

/**
 * Get the Anthropic API key for Claude calls.
 * Server-side only - used in API routes or Lambda functions.
 */
export function getAnthropicAPIKey(): string | null {
  // Never expose to client - no NEXT_PUBLIC_ prefix
  return process.env.ANTHROPIC_API_KEY || null
}

/**
 * Get AWS credentials for DynamoDB access.
 * Server-side only - used in Lambda functions.
 * In production, use IAM roles instead of explicit credentials.
 */
export function getAWSCredentials(): { accessKeyId: string; secretAccessKey: string; region: string } | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION || 'ap-southeast-2'
  
  if (!accessKeyId || !secretAccessKey) {
    return null
  }
  
  return { accessKeyId, secretAccessKey, region }
}

/**
 * Validate that required API keys are present.
 * Call this at startup in production to fail fast.
 */
export function validateAPIKeys(required: ('api' | 'anthropic' | 'aws')[]): { valid: boolean; missing: string[] } {
  const missing: string[] = []
  
  if (required.includes('api') && !getAPIKey()) {
    missing.push('API_KEY')
  }
  if (required.includes('anthropic') && !getAnthropicAPIKey()) {
    missing.push('ANTHROPIC_API_KEY')
  }
  if (required.includes('aws') && !getAWSCredentials()) {
    missing.push('AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY')
  }
  
  return { valid: missing.length === 0, missing }
}
