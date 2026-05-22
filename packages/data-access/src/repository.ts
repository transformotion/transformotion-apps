export interface Repository<T, ID = string> {
  findById(id: ID): Promise<T | null>
  findAll(filters?: Partial<T>): Promise<T[]>
  save(entity: T): Promise<T>
  saveMany(entities: T[]): Promise<T[]>
  delete(id: ID): Promise<void>
  deleteMany(ids: ID[]): Promise<void>
  count(filters?: Partial<T>): Promise<number>
  exists(id: ID): Promise<boolean>
}

export interface RepositoryOptions {
  storageKey: string
  getId: (entity: unknown) => string
}

export interface QueryOptions<T> {
  filters?: Partial<T>
  sort?: {
    field: keyof T
    direction: 'asc' | 'desc'
  }
  limit?: number
  offset?: number
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
