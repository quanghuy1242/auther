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
import { WebhookRepository } from "./webhook-repository";
import { UserClientAccessRepository } from "./user-client-access-repository";
import { OAuthClientMetadataRepository } from "./oauth-client-metadata-repository";
import { UserGroupRepository } from "./user-group-repository";

// Export repository instances as singletons
export const userRepository = new UserRepository();
export const sessionRepository = new SessionRepository();
export const accountRepository = new AccountRepository();
export const oauthClientRepository = new OAuthClientRepository();
export const jwksRepository = new JwksRepository();
export const webhookRepository = new WebhookRepository();
export const userClientAccessRepository = new UserClientAccessRepository();
export const oauthClientMetadataRepository = new OAuthClientMetadataRepository();
export const userGroupRepository = new UserGroupRepository();

// Export types
export type { UserEntity, UserWithAccounts, UserStats } from "./user-repository";
export type { SessionEntity, SessionWithToken, SessionStats } from "./session-repository";
export type { AccountEntity } from "./account-repository";
export type { OAuthClientEntity, ClientStats } from "./oauth-client-repository";
export type { JwksKeyEntity, JwksKeyWithStatus } from "./jwks-repository";
export type { GetWebhooksFilter, GetDeliveriesFilter } from "./webhook-repository";
export type { UserClientAccessEntity, CreateUserClientAccessData } from "./user-client-access-repository";
export type { OAuthClientMetadataEntity, CreateOAuthClientMetadataData } from "./oauth-client-metadata-repository";
export type { UserGroupEntity, CreateUserGroupData } from "./user-group-repository";
export type { PaginatedResult } from "./base-repository";
