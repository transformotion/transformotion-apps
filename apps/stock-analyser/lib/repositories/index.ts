/**
 * Repository Factory
 * 
 * Creates repository instances based on configuration.
 * Allows swapping between localStorage and DynamoDB implementations.
 */

export { type Repository, type RepositoryOptions, type QueryOptions, type PaginatedResult } from './base-repository'

// Stock Signal repositories (to be created)
// export { WatchlistRepository, createWatchlistRepository } from './stock-signal/watchlist-repository'
// export { PortfolioRepository, createPortfolioRepository } from './stock-signal/portfolio-repository'

// Shared repositories
// export { UserRepository, createUserRepository } from './shared/user-repository'
