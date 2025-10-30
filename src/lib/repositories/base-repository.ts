/**
 * Base Repository Interface
 * Defines common CRUD operations that all repositories should implement
 */
export interface BaseRepository<T, TId = string> {
  /**
   * Find a single entity by ID
   */
  findById(id: TId): Promise<T | null>;

  /**
   * Find all entities with optional filtering
   */
  findMany(options?: FindManyOptions): Promise<T[]>;

  /**
   * Count entities with optional filtering
   */
  count(options?: CountOptions): Promise<number>;

  /**
   * Create a new entity
   */
  create(data: Partial<T>): Promise<T>;

  /**
   * Update an entity by ID
   */
  update(id: TId, data: Partial<T>): Promise<T | null>;

  /**
   * Delete an entity by ID
   */
  delete(id: TId): Promise<boolean>;
}

/**
 * Common options for finding multiple entities
 */
export interface FindManyOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

/**
 * Common options for counting entities
 */
export interface CountOptions {
  where?: Record<string, unknown>;
}

/**
 * Paginated result structure
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
