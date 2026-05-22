/**
 * Repository Factory
 * 
 * Creates repository instances based on configuration.
 * Allows swapping between localStorage and DynamoDB implementations.
 */

export type { Repository, RepositoryOptions, QueryOptions, PaginatedResult } from '@transformotion/data-access'

// Budget Tracker repositories
export * from './budget-tracker'

