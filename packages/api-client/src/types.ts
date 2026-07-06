export type {
  PortfolioHolding,
  WatchlistItem,
  CycleDataResponse,
  CycleSignal,
  CycleStage,
  RsiDivergence,
  MacdMomentum,
  VolumeTrend,
  PriceRange as OhlcvRange,
  PriceInterval as OhlcvInterval,
  WriteAnalysisCacheRequest as PutCacheRequest,
  CachedQuote,
  CachedQuotesResponse,
} from '@transformotion/contracts/stock-analyser/types';

export type { PriceOhlcvResponse as OhlcvDataResponse } from '@transformotion/contracts/stock-analyser/types';
export type { AnalysisCacheEntry as CacheEntry } from '@transformotion/contracts/stock-analyser/types';

export type {
  CreateAccountRequest,
  CreateInvitationRequest,
  CreateInvitationResponse,
  GetAccountResponse,
  ListMembersResponse,
} from '@transformotion/contracts/launchpad/api';

export type { AccountMember, AccountSummary as Account } from '@transformotion/contracts/launchpad/types';
export type { UserPreferences, UserProfile as GetUserProfileResponse } from '@transformotion/contracts/_shared/auth';
export type { AiPromptRequest as ClaudeProxyRequest, AiTextResponse as ClaudeProxyResponse } from '@transformotion/contracts/_shared/ai-runtime';

export interface GetPortfolioResponse {
  holdings: import('@transformotion/contracts/stock-analyser/types').PortfolioHolding[];
}

export interface PutPortfolioRequest {
  holdings: import('@transformotion/contracts/stock-analyser/types').PortfolioHolding[];
}

export interface PutPortfolioResponse {
  ok: true;
}

export interface GetWatchlistResponse {
  items: import('@transformotion/contracts/stock-analyser/types').WatchlistItem[];
}

export interface PutWatchlistRequest {
  items: import('@transformotion/contracts/stock-analyser/types').WatchlistItem[];
}

export interface PutWatchlistResponse {
  ok: true;
}

export interface PutCacheResponse {
  ok: true;
}

export interface CreateAccountResponse {
  account: import('@transformotion/contracts/launchpad/types').AccountSummary;
}

export interface UpdateAccountRequest {
  name?: string;
}

export interface UpdateAccountResponse {
  account: import('@transformotion/contracts/launchpad/types').AccountSummary;
}

export interface PutUserPreferencesRequest extends Partial<import('@transformotion/contracts/_shared/auth').UserPreferences> {}

export interface PutUserPreferencesResponse {
  preferences: import('@transformotion/contracts/_shared/auth').UserPreferences;
}
