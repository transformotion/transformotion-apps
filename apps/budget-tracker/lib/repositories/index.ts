/**
 * Repository Factory
 * 
 * Creates repository instances based on configuration.
 * Allows swapping between localStorage and DynamoDB implementations.
 */

export { type Repository, type RepositoryOptions, type QueryOptions, type PaginatedResult } from './base-repository'

// Budget Tracker repositories
export * from './budget-tracker'

