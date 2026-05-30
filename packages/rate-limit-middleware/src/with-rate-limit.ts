import {
  HttpError,
  type LambdaResponse,
  type ProtectedHandler,
} from '@transformotion/lambda-middleware';
import { checkRateLimit } from './check-rate-limit';
import type { WithRateLimitOptions } from './types';

export function withRateLimit(
  handler: ProtectedHandler,
  options: WithRateLimitOptions,
): ProtectedHandler {
  return async (ctx): Promise<LambdaResponse> => {
    const rateLimitOptions = await options.getOptions(ctx);
    const result = await checkRateLimit(rateLimitOptions);

    if (!result.allowed) {
      if (options.onLimited) {
        return options.onLimited(result, ctx);
      }
      throw new HttpError(429, 'Too many requests', {
        retryAfterMs: result.retryAfterMs,
        resetAt: result.resetAt,
      });
    }

    return handler(ctx);
  };
}
