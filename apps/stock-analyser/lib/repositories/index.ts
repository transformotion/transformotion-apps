/**
 * Repository Factory
 * 
 * Creates repository instances based on configuration.
 * Allows swapping between localStorage and DynamoDB implementations.
 */

export type { Repository, RepositoryOptions, QueryOptions, PaginatedResult } from '@transformotion/data-access'

// Stock Analyser repositories (to be created)
// export { WatchlistRepository, createWatchlistRepository } from './stock-analyser/watchlist-repository'
// export { PortfolioRepository, createPortfolioRepository } from './stock-analyser/portfolio-repository'

// Shared repositories
// export { UserRepository, createUserRepository } from './shared/user-repository'
