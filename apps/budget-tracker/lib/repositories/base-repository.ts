/**
 * Base Repository Interface
 * 
 * All repositories implement this interface.
 * UI and Business Logic interact ONLY with repositories.
 * 
 * Current: localStorage implementation
 * Future: DynamoDB via Lambda (swap implementation, keep interface)
 */

export interface Repository<T, ID = string> {
  /**
   * Find a single entity by ID.
   */
  findById(id: ID): Promise<T | null>

  /**
   * Find all entities, optionally filtered.
   */
  findAll(filters?: Partial<T>): Promise<T[]>

  /**
   * Save (create or update) a single entity.
   */
  save(entity: T): Promise<T>

  /**
   * Save multiple entities in a batch.
   */
  saveMany(entities: T[]): Promise<T[]>

  /**
   * Delete a single entity by ID.
   */
  delete(id: ID): Promise<void>

  /**
   * Delete multiple entities by ID.
   */
  deleteMany(ids: ID[]): Promise<void>

  /**
   * Count entities matching optional filters.
   */
  count(filters?: Partial<T>): Promise<number>

  /**
   * Check if an entity exists.
   */
  exists(id: ID): Promise<boolean>
}

/**
 * Base repository options for all implementations.
 */
export interface RepositoryOptions {
  /**
   * Storage key prefix (for localStorage) or table name (for DynamoDB).
   */
  storageKey: string

  /**
   * Function to extract the ID from an entity.
   */
  getId: (entity: unknown) => string
}

/**
 * Query options for findAll operations.
 */
export interface QueryOptions<T> {
  filters?: Partial<T>
  sort?: {
    field: keyof T
    direction: 'asc' | 'desc'
  }
  limit?: number
  offset?: number
}

/**
 * Paginated response for list queries.
 */
export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
