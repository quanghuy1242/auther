import assert from "node:assert/strict";
import test from "node:test";

import { createRestrictedSignupPaths, validateInternalSignupAccess } from "@/lib/utils/auth-middleware";
import { RegistrationContextService } from "@/lib/services/registration-context-service";
import { AuthorizationSpaceRepository } from "@/lib/repositories/authorization-space-repository";
import {
  registrationContextRepo,
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
});

test("signup intent policy is data-configured for arbitrary clients, spaces, models, and flows", async () => {
  const originalSignupPolicyGet = signupPolicyRepo.get;
  const originalFindBySlug = registrationContextRepo.findBySlug;
  const originalFindSpaceById = AuthorizationSpaceRepository.prototype.findById;

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
  }
});
