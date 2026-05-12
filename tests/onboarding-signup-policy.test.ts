import assert from "node:assert/strict";
import test from "node:test";

import { createRestrictedSignupPaths, validateInternalSignupAccess } from "@/lib/utils/auth-middleware";
import { RegistrationContextService } from "@/lib/services/registration-context-service";
import { AuthorizationSpaceRepository } from "@/lib/repositories/authorization-space-repository";
import { AuthorizationModelRepository } from "@/lib/repositories/authorization-model-repository";
import {
  registrationContextRepo,
  signupIntentNonceRepo,
  signupPolicyRepo,
} from "@/lib/repositories/platform-access-repository";
import { directSignUp } from "@/app/sign-up/actions";
import { metricsService } from "@/lib/services";

const originalMetricsCount = metricsService.count;

test.beforeEach(() => {
  (metricsService as unknown as { count: typeof metricsService.count }).count = async () => {};
});

test.after(() => {
  (metricsService as unknown as { count: typeof metricsService.count }).count = originalMetricsCount;
});

test("direct Better Auth signup is denied without the internal server secret", () => {
  const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
  });

  assert.throws(
    () =>
      validateInternalSignupAccess(
        request,
        "/sign-up/email",
        createRestrictedSignupPaths(),
        "server-secret"
      ),
    (error) => error instanceof Response && error.status === 403
  );
});

test("direct Auther signup action is denied when global direct signup is disabled", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: true,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    const result = await directSignUp(
      { success: false },
      new FormData()
    );

    assert.equal(result.success, false);
    assert.equal(result.error, "Direct signup is disabled.");
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
  }
});

test("onboarding trigger policy allows one client and denies another in the same space", () => {
  const service = new RegistrationContextService() as unknown as {
    isTriggerAllowed: (
      trigger: { kind: "oauth_client"; id: string },
      allowed: Array<{ kind: "oauth_client"; id: string }>
    ) => boolean;
  };

  const allowed = [{ kind: "oauth_client" as const, id: "blog-client" }];

  assert.equal(
    service.isTriggerAllowed({ kind: "oauth_client", id: "blog-client" }, allowed),
    true
  );
  assert.equal(
    service.isTriggerAllowed({ kind: "oauth_client", id: "other-client" }, allowed),
    false
  );
});

test("onboarding policy validates grant subsets, email domains, and return URLs", () => {
  const service = new RegistrationContextService() as unknown as {
    grantsAreSubset: (
      context: { grants: Array<{ entityTypeId: string; relation: string; entityId?: string }> },
      requestedGrants?: Array<{ entityTypeId: string; relation: string; entityId?: string }>
    ) => boolean;
    isEmailDomainAllowed: (email: string, allowedDomains?: string[]) => boolean;
    isReturnUrlAllowed: (returnUrl: string, allowedReturnUrls?: string[]) => boolean;
  };

  const context = {
    grants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "book-1" }],
  };

  assert.equal(
    service.grantsAreSubset(context, [{ entityTypeId: "model_book", relation: "commenter", entityId: "book-1" }]),
    true
  );
  assert.equal(
    service.grantsAreSubset(context, [{ entityTypeId: "model_book", relation: "admin" }]),
    false
  );
  assert.equal(
    service.grantsAreSubset(context, [{ entityTypeId: "model_book", relation: "commenter", entityId: "book-2" }]),
    false
  );
  assert.equal(service.isEmailDomainAllowed("reader@example.com", ["example.com"]), true);
  assert.equal(service.isEmailDomainAllowed("reader@blocked.com", ["example.com"]), false);
  assert.equal(service.isReturnUrlAllowed("https://blog.example.com/welcome", ["https://blog.example.com/"]), true);
  assert.equal(service.isReturnUrlAllowed("https://evil.example.com/welcome", ["https://blog.example.com/"]), false);
  assert.equal(service.isReturnUrlAllowed("https://blog.example.com/auth/callback", ["https://blog.example.com/auth/callback"]), true);
  assert.equal(service.isReturnUrlAllowed("https://blog.example.com/auth/callback-extra", ["https://blog.example.com/auth/callback"]), false);
});

test("signup intent policy is data-configured for arbitrary clients, spaces, models, and flows", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;
  const originalFindSpaceById = AuthorizationSpaceRepository.prototype.findById;
  const originalFindModelById = AuthorizationModelRepository.prototype.findById;

  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: true,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = async (slug) => {
    if (slug !== "new-app-reader") {
      return null;
    }

    return {
      id: "ctx_new_app_reader",
      slug,
      name: "New App Reader",
      description: null,
      clientId: null,
      triggerKind: "oauth_client",
      triggerClientId: "new-client",
      targetKind: "authorization_space",
      targetId: "space_new_app",
      allowedOrigins: ["https://new.example.com"],
      allowedDomains: ["example.com"],
      signupMode: "public_signed_intent",
      allowedTriggerPrincipals: [{ kind: "oauth_client", id: "new-client" }],
      allowedReturnUrls: ["https://new.example.com/onboarding"],
      theme: "new-app",
      grants: [{ entityTypeId: "model_article", relation: "reader", entityId: "*" }],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  AuthorizationSpaceRepository.prototype.findById = async function findById(id: string) {
    if (id !== "space_new_app") {
      return null;
    }

    return {
      id,
      slug: "new-app",
      name: "New App",
      description: null,
      enabled: true,
      resourceServerId: "resource_new_app",
      onboardingEnabled: true,
      onboardingAllowedTriggers: [{ kind: "oauth_client", id: "new-client" }],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };
  AuthorizationModelRepository.prototype.findById = async function findById(id: string) {
    if (id !== "model_article") {
      return null;
    }

    return {
      id,
      entityType: "space_new_app:article",
      authorizationSpaceId: "space_new_app",
      definition: {
        relations: {
          reader: [],
        },
        permissions: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  };

  try {
    const service = new RegistrationContextService();
    const result = await service.validateSignupIntentPolicy(
      {
        kind: "signup_intent",
        flow: "new-app-reader",
        trigger: { kind: "oauth_client", id: "new-client" },
        authorizationSpaceId: "space_new_app",
        requestedGrants: [{ entityTypeId: "model_article", relation: "reader", entityId: "article-1" }],
        returnUrl: "https://new.example.com/onboarding/complete",
        nonce: "nonce",
        exp: Date.now() + 60_000,
      },
      "person@example.com"
    );

    assert.equal(result.valid, true);

    const denied = await service.validateSignupIntentPolicy({
      kind: "signup_intent",
      flow: "new-app-reader",
      trigger: { kind: "oauth_client", id: "other-client" },
      authorizationSpaceId: "space_new_app",
      requestedGrants: [{ entityTypeId: "model_article", relation: "reader", entityId: "article-1" }],
      returnUrl: "https://new.example.com/onboarding/complete",
      nonce: "nonce",
      exp: Date.now() + 60_000,
    });

    assert.equal(denied.valid, false);
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
    (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = originalFindBySlug;
    AuthorizationSpaceRepository.prototype.findById = originalFindSpaceById;
    AuthorizationModelRepository.prototype.findById = originalFindModelById;
  }
});

test("signup intent policy rejects stale or invalid grant target configuration", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;
  const originalFindSpaceById = AuthorizationSpaceRepository.prototype.findById;
  const originalFindModelById = AuthorizationModelRepository.prototype.findById;

  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: true,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = async () => ({
    id: "ctx_blog",
    slug: "blog-commenter",
    name: "Blog commenter",
    description: null,
    clientId: null,
    triggerKind: "oauth_client",
    triggerClientId: "blog-client",
    targetKind: "authorization_space",
    targetId: "space_blog",
    allowedOrigins: [],
    allowedDomains: null,
    signupMode: "public_signed_intent",
    allowedTriggerPrincipals: [{ kind: "oauth_client", id: "blog-client" }],
    allowedReturnUrls: ["https://blog.example.com/signup"],
    theme: null,
    grants: [{ entityTypeId: "deleted_model", relation: "commenter", entityId: "*" }],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  AuthorizationSpaceRepository.prototype.findById = async () => ({
    id: "space_blog",
    slug: "blog",
    name: "Blog",
    description: null,
    enabled: true,
    resourceServerId: null,
    onboardingEnabled: true,
    onboardingAllowedTriggers: [{ kind: "oauth_client", id: "blog-client" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  AuthorizationModelRepository.prototype.findById = async () => null;

  try {
    const result = await new RegistrationContextService().validateSignupIntentPolicy({
      kind: "signup_intent",
      flow: "blog-commenter",
      trigger: { kind: "oauth_client", id: "blog-client" },
      authorizationSpaceId: "space_blog",
      requestedGrants: [{ entityTypeId: "deleted_model", relation: "commenter" }],
      returnUrl: "https://blog.example.com/signup/complete",
      nonce: "nonce",
      exp: Date.now() + 60_000,
    });

    assert.equal(result.valid, false);
    assert.equal(result.error, "Authorization model not found for entityTypeId deleted_model");
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
    (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = originalFindBySlug;
    AuthorizationSpaceRepository.prototype.findById = originalFindSpaceById;
    AuthorizationModelRepository.prototype.findById = originalFindModelById;
  }
});

test("pending signup intent grants fail closed when policy changes before verification", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;

  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: false,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = async () => ({
    id: "ctx_blog",
    slug: "blog-commenter",
    name: "Blog commenter",
    description: null,
    clientId: null,
    triggerKind: "oauth_client",
    triggerClientId: "blog-client",
    targetKind: "authorization_space",
    targetId: "space_blog",
    allowedOrigins: [],
    allowedDomains: null,
    signupMode: "public_signed_intent",
    allowedTriggerPrincipals: [{ kind: "oauth_client", id: "blog-client" }],
    allowedReturnUrls: ["https://blog.example.com/signup"],
    theme: null,
    grants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "*" }],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  try {
    const result = await new RegistrationContextService().validatePendingGrantApplication(
      {
        contextSlug: "blog-commenter",
        triggerKind: "oauth_client",
        triggerId: "blog-client",
        requestedGrants: [{ entityTypeId: "model_book", relation: "commenter" }],
        returnUrl: "https://blog.example.com/signup/complete",
        nonce: "nonce",
        tokenExpiresAt: new Date(Date.now() + 60_000),
      },
      "reader@example.com"
    );

    assert.equal(result.valid, false);
    assert.equal(result.error, "Public signup is disabled");
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
    (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = originalFindBySlug;
  }
});

test("signup intent policy rejects disabled flow, invalid target space, relation, redirect, and email domain", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;
  const originalFindSpaceById = AuthorizationSpaceRepository.prototype.findById;
  const originalFindModelById = AuthorizationModelRepository.prototype.findById;
  const context = {
    id: "ctx_blog",
    slug: "blog-commenter",
    name: "Blog commenter",
    description: null,
    clientId: null,
    triggerKind: "oauth_client",
    triggerClientId: "blog-client",
    targetKind: "authorization_space",
    targetId: "space_blog",
    allowedOrigins: [],
    allowedDomains: ["example.com"],
    signupMode: "public_signed_intent",
    allowedTriggerPrincipals: [{ kind: "oauth_client" as const, id: "blog-client" }],
    allowedReturnUrls: ["https://blog.example.com/signup"],
    theme: null,
    grants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "*" }],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const model: {
    id: string;
    entityType: string;
    authorizationSpaceId: string;
    definition: {
      relations: Record<string, string[]>;
      permissions: Record<string, { relation: string }>;
    };
    createdAt: Date;
    updatedAt: Date;
  } = {
    id: "model_book",
    entityType: "space_blog:book",
    authorizationSpaceId: "space_blog",
    definition: {
      relations: {
        commenter: [],
      },
      permissions: {},
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: true,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = async () => context;
  AuthorizationSpaceRepository.prototype.findById = async () => ({
    id: "space_blog",
    slug: "blog",
    name: "Blog",
    description: null,
    enabled: true,
    resourceServerId: null,
    onboardingEnabled: true,
    onboardingAllowedTriggers: [{ kind: "oauth_client", id: "blog-client" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  AuthorizationModelRepository.prototype.findById = async () => model;

  const payload = {
    kind: "signup_intent" as const,
    flow: "blog-commenter",
    trigger: { kind: "oauth_client" as const, id: "blog-client" },
    authorizationSpaceId: "space_blog",
    requestedGrants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "book-1" }],
    returnUrl: "https://blog.example.com/signup/complete",
    nonce: "nonce",
    exp: Date.now() + 60_000,
  };

  try {
    const service = new RegistrationContextService();

    context.enabled = false;
    const disabled = await service.validateSignupIntentPolicy(payload, "reader@example.com");
    assert.equal(disabled.valid, false);
    assert.equal(disabled.error, "Onboarding Flow is not active");

    context.enabled = true;
    const wrongSpace = await service.validateSignupIntentPolicy({
      ...payload,
      authorizationSpaceId: "space_other",
    }, "reader@example.com");
    assert.equal(wrongSpace.valid, false);
    assert.equal(wrongSpace.error, "Signup intent targets the wrong authorization space");

    const badRedirect = await service.validateSignupIntentPolicy({
      ...payload,
      returnUrl: "https://evil.example.com/signup/complete",
    }, "reader@example.com");
    assert.equal(badRedirect.valid, false);
    assert.equal(badRedirect.error, "Return URL is not allowed");

    const badDomain = await service.validateSignupIntentPolicy(payload, "reader@blocked.com");
    assert.equal(badDomain.valid, false);
    assert.equal(badDomain.error, "Email domain is not allowed");

    model.definition.relations = {};
    const badRelation = await service.validateSignupIntentPolicy(payload, "reader@example.com");
    assert.equal(badRelation.valid, false);
    assert.equal(badRelation.error, "Relation 'commenter' is not defined on model 'space_blog:book'");
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
    (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = originalFindBySlug;
    AuthorizationSpaceRepository.prototype.findById = originalFindSpaceById;
    AuthorizationModelRepository.prototype.findById = originalFindModelById;
  }
});

test("signup intent verification rejects expired and replayed tokens", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;
  const originalFindSpaceById = AuthorizationSpaceRepository.prototype.findById;
  const originalFindModelById = AuthorizationModelRepository.prototype.findById;
  const originalNonceCreate = signupIntentNonceRepo.create;
  const originalNonceFindByNonce = signupIntentNonceRepo.findByNonce;

  (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = async () => ({
    id: "global",
    directSignupEnabled: false,
    publicSignedIntentEnabled: true,
    inviteEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = async () => ({
    id: "ctx_blog",
    slug: "blog-commenter",
    name: "Blog commenter",
    description: null,
    clientId: null,
    triggerKind: "oauth_client",
    triggerClientId: "blog-client",
    targetKind: "authorization_space",
    targetId: "space_blog",
    allowedOrigins: [],
    allowedDomains: ["example.com"],
    signupMode: "public_signed_intent",
    allowedTriggerPrincipals: [{ kind: "oauth_client", id: "blog-client" }],
    allowedReturnUrls: ["https://blog.example.com/signup"],
    theme: null,
    grants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "*" }],
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  AuthorizationSpaceRepository.prototype.findById = async () => ({
    id: "space_blog",
    slug: "blog",
    name: "Blog",
    description: null,
    enabled: true,
    resourceServerId: null,
    onboardingEnabled: true,
    onboardingAllowedTriggers: [{ kind: "oauth_client", id: "blog-client" }],
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  AuthorizationModelRepository.prototype.findById = async () => ({
    id: "model_book",
    entityType: "space_blog:book",
    authorizationSpaceId: "space_blog",
    definition: {
      relations: {
        commenter: [],
      },
      permissions: {},
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  type SignupIntentNonceRow = Awaited<ReturnType<typeof signupIntentNonceRepo.create>>;
  const nonceRows = new Map<string, SignupIntentNonceRow>();
  (signupIntentNonceRepo as unknown as { create: typeof signupIntentNonceRepo.create }).create = async (data) => {
    const row = {
      id: `nonce_${data.nonce}`,
      nonce: data.nonce,
      flowSlug: data.flowSlug,
      triggerKind: data.triggerKind,
      triggerId: data.triggerId,
      returnUrl: data.returnUrl ?? null,
      expiresAt: data.expiresAt,
      consumedAt: null,
      consumedByEmail: null,
      createdAt: new Date(),
    };
    nonceRows.set(data.nonce, row);
    return row;
  };
  (signupIntentNonceRepo as unknown as { findByNonce: typeof signupIntentNonceRepo.findByNonce }).findByNonce = async (nonce) => nonceRows.get(nonce) ?? null;

  try {
    const service = new RegistrationContextService();
    const random = "random";
    const expiredPayload = {
      kind: "signup_intent" as const,
      flow: "blog-commenter",
      trigger: { kind: "oauth_client" as const, id: "blog-client" },
      authorizationSpaceId: "space_blog",
      requestedGrants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "*" }],
      returnUrl: "https://blog.example.com/signup/complete",
      nonce: "expired-nonce",
      exp: Date.now() - 1_000,
    };
    const expiredSig = (service as unknown as {
      signPayload: (payload: object, random: string) => string;
    }).signPayload(expiredPayload, random);
    const expiredToken = Buffer.from(JSON.stringify({
      payload: expiredPayload,
      random,
      sig: expiredSig,
    })).toString("base64url");

    const expired = await service.validateSignupIntent(expiredToken, "reader@example.com");
    assert.equal(expired.valid, false);
    assert.equal(expired.error, "Signup link has expired");

    const intent = await service.createSignedSignupIntent({
      flow: "blog-commenter",
      trigger: { kind: "oauth_client", id: "blog-client" },
      authorizationSpaceId: "space_blog",
      requestedGrants: [{ entityTypeId: "model_book", relation: "commenter", entityId: "*" }],
      returnUrl: "https://blog.example.com/signup/complete",
      expiresInSeconds: 60,
    });
    const row = nonceRows.get(intent.nonce);
    assert.ok(row);
    row.consumedAt = new Date();
    row.consumedByEmail = "reader@example.com";

    const replayed = await service.validateSignupIntent(intent.token, "reader@example.com");
    assert.equal(replayed.valid, false);
    assert.equal(replayed.error, "Signup link is no longer active");
  } finally {
    (signupPolicyRepo as unknown as { get: typeof signupPolicyRepo.get }).get = originalSignupPolicyGet;
    (registrationContextRepo as unknown as { findBySlug: typeof registrationContextRepo.findBySlug }).findBySlug = originalFindBySlug;
    AuthorizationSpaceRepository.prototype.findById = originalFindSpaceById;
    AuthorizationModelRepository.prototype.findById = originalFindModelById;
    (signupIntentNonceRepo as unknown as { create: typeof signupIntentNonceRepo.create }).create = originalNonceCreate;
    (signupIntentNonceRepo as unknown as { findByNonce: typeof signupIntentNonceRepo.findByNonce }).findByNonce = originalNonceFindByNonce;
  }
});
