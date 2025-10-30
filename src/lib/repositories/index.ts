/**
 * Repository Layer
 * 
 * This module exports all repository instances as singletons.
 * Repositories encapsulate all database access logic and provide
 * a clean interface for data operations.
 * 
 * Benefits:
 * - Single Responsibility: Each repository handles one domain
 * - Testability: Easy to mock for unit tests
 * - Maintainability: Database logic centralized
 * - Reusability: Same queries used across multiple actions
 * - Type Safety: Strong typing for all data operations
 */

import { UserRepository } from "./user-repository";
import { SessionRepository } from "./session-repository";
import { AccountRepository } from "./account-repository";
import { OAuthClientRepository } from "./oauth-client-repository";
import { JwksRepository } from "./jwks-repository";

// Export repository instances as singletons
export const userRepository = new UserRepository();
export const sessionRepository = new SessionRepository();
export const accountRepository = new AccountRepository();
export const oauthClientRepository = new OAuthClientRepository();
export const jwksRepository = new JwksRepository();

// Export types
export type { UserEntity, UserWithAccounts, UserStats } from "./user-repository";
export type { SessionEntity, SessionWithToken, SessionStats } from "./session-repository";
export type { AccountEntity } from "./account-repository";
export type { OAuthClientEntity, ClientStats } from "./oauth-client-repository";
export type { JwksKeyEntity, JwksKeyWithStatus } from "./jwks-repository";
export type { PaginatedResult } from "./base-repository";
