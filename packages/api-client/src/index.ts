// @transformotion/api-client
// Typed API client for all Transformotion backend endpoints.
//
// Usage in a React app:
//   import { ApiClient } from '@transformotion/api-client';
//   import { fetchAuthSession } from 'aws-amplify/auth';
//
//   const client = new ApiClient({
//     baseUrl:      process.env.NEXT_PUBLIC_API_URL,
//     getToken:     () => fetchAuthSession().then(s => s.tokens?.idToken?.toString() ?? ''),
//     getAccountId: () => cognitoAuth.getAccountIdForApp('stock-signal'),
//   });
//
//   const { holdings } = await client.getPortfolio();
//   await client.putPortfolio({ holdings });
//   const result = await client.claude({ prompt: '...' });

export { ApiClient }                      from './client';
export { HttpClient }                     from './http';
export { ApiError }                       from './errors';
export type { ApiClientOptions }          from './http';

export type {
  // Portfolio
  PortfolioHolding,
  GetPortfolioResponse,
  PutPortfolioRequest,
  PutPortfolioResponse,

  // Watchlist
  WatchlistItem,
  GetWatchlistResponse,
  PutWatchlistRequest,
  PutWatchlistResponse,

  // Analysis cache
  CacheEntry,
  PutCacheRequest,
  PutCacheResponse,

  // Accounts
  Account,
  AccountMember,
  CreateAccountRequest,
  CreateAccountResponse,
  GetAccountResponse,
  UpdateAccountRequest,
  UpdateAccountResponse,
  ListMembersResponse,
  CreateInvitationRequest,
  CreateInvitationResponse,

  // Claude proxy
  ClaudeProxyRequest,
  ClaudeProxyResponse,

  // User preferences
  UserPreferences,
  GetUserProfileResponse,
  PutUserPreferencesRequest,
  PutUserPreferencesResponse,

  // Cycle data
  CycleDataResponse,
  CycleSignal,
  CycleStage,
  RsiDivergence,
  MacdMomentum,
  VolumeTrend,
} from './types';
