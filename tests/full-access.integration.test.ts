import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";

import { NextRequest } from "next/server";
import { importSPKI, jwtVerify } from "jose";
import { symmetricEncrypt } from "better-auth/crypto";

import { env } from "@/env";
import { PermissionService } from "@/lib/auth/permission-service";
import type { Tuple } from "@/lib/repositories/tuple-repository";
import { auth } from "@/lib/auth";
import { jwksRepository, tupleRepository } from "@/lib/repositories";
import { apiKeyPermissionResolver } from "@/lib/services";
import { metricsService } from "@/lib/services/metrics-service";
import { POST as exchangeRoutePost } from "@/app/api/auth/api-key/exchange/route";
import { POST as checkPermissionRoutePost } from "@/app/api/auth/check-permission/route";

const originalMetricsCount = metricsService.count;
const originalMetricsHistogram = metricsService.histogram;

test.beforeEach(() => {
  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).count = async () => {};

  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).histogram = async () => {};
});

test.after(() => {
  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).count = originalMetricsCount;

  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).histogram = originalMetricsHistogram;
});

function makeTuple(overrides: Partial<Tuple>): Tuple {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "tpl_test",
    entityType: "oauth_client",
    entityTypeId: null,
    entityId: "abc",
    relation: "full_access",
    subjectType: "apikey",
    subjectId: "key_1",
    subjectRelation: null,
    condition: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("full_access allows multiple client entity types and revoke removes broad access", async () => {
  const service = new PermissionService();
  let fullAccessActive = true;

  (service as unknown as {
    userRepo: { findById: (id: string) => Promise<{ role: string } | null> };
  }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as {
    expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>>;
  }).expandSubjects = async () => [{ type: "apikey", id: "key_1" }];

  (service as unknown as {
    tupleRepo: {
      findExact: (params: {
        entityType: string;
        entityId: string;
        relation: string;
        subjectType: string;
        subjectId: string;
      }) => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findExact: async (params) => {
      if (
        fullAccessActive &&
        params.entityType === "oauth_client" &&
        params.entityId === "abc" &&
        params.relation === "full_access" &&
        params.subjectType === "apikey" &&
        params.subjectId === "key_1"
      ) {
        return makeTuple({});
      }

      return null;
    },
  };

  (service as unknown as {
    modelService: { getModel: (entityType: string) => Promise<object | null> };
  }).modelService = {
    getModel: async () => null,
  };

  const invoiceAllowedBefore = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );
  const reportAllowedBefore = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:report",
    "rep_1",
    "read"
  );

  assert.equal(invoiceAllowedBefore, true);
  assert.equal(reportAllowedBefore, true);

  fullAccessActive = false;

  const invoiceAllowedAfter = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );
  const reportAllowedAfter = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:report",
    "rep_1",
    "read"
  );

  assert.equal(invoiceAllowedAfter, false);
  assert.equal(reportAllowedAfter, false);
});

test("scoped tuple remains effective after full_access is revoked", async () => {
  const service = new PermissionService();
  let fullAccessActive = true;

  (service as unknown as {
    userRepo: { findById: (id: string) => Promise<{ role: string } | null> };
  }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as {
    expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>>;
  }).expandSubjects = async () => [{ type: "apikey", id: "key_1" }];

  const scopedTuple = makeTuple({
    id: "tpl_scoped",
    entityType: "client_abc:invoice",
    entityTypeId: "model_invoice",
    entityId: "inv_1",
    relation: "viewer",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  (service as unknown as {
    tupleRepo: {
      findExact: (params: {
        entityType: string;
        entityId: string;
        relation: string;
        subjectType: string;
        subjectId: string;
      }) => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findExact: async (params) => {
      if (
        fullAccessActive &&
        params.entityType === "oauth_client" &&
        params.entityId === "abc" &&
        params.relation === "full_access" &&
        params.subjectType === "apikey" &&
        params.subjectId === "key_1"
      ) {
        return makeTuple({ id: "tpl_full_access" });
      }

      if (
        params.entityType === "client_abc:invoice" &&
        params.entityId === "inv_1" &&
        params.relation === "viewer" &&
        params.subjectType === "apikey" &&
        params.subjectId === "key_1"
      ) {
        return scopedTuple;
      }

      return null;
    },
  };

  (service as unknown as {
    modelService: {
      getModel: (entityType: string) => Promise<{
        relations: Record<string, string[]>;
        permissions: Record<string, { relation: string }>;
      } | null>;
    };
  }).modelService = {
    getModel: async (entityType) => {
      if (entityType !== "client_abc:invoice") {
        return null;
      }

      return {
        relations: {
          viewer: [],
        },
        permissions: {
          read: {
            relation: "viewer",
          },
        },
      };
    },
  };

  const allowedWithFullAccess = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );
  assert.equal(allowedWithFullAccess, true);

  fullAccessActive = false;

  const allowedAfterRevokingFullAccess = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );
  assert.equal(allowedAfterRevokingFullAccess, true);
});

test("user with group-inherited full_access passes permission check", async () => {
  const service = new PermissionService();

  (service as unknown as {
    userRepo: { findById: (id: string) => Promise<{ role: string } | null> };
  }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as {
    groupRepo: { getUserGroups: (id: string) => Promise<Array<{ id: string }>> };
  }).groupRepo = {
    getUserGroups: async () => [{ id: "group_a" }],
  };

  (service as unknown as {
    tupleRepo: {
      findBySubject: (subjectType: string, subjectId: string) => Promise<Tuple[]>;
      findExact: (params: {
        entityType: string;
        entityId: string;
        relation: string;
        subjectType: string;
        subjectId: string;
      }) => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findBySubject: async () => [],
    findExact: async (params) => {
      if (
        params.entityType === "oauth_client" &&
        params.entityId === "abc" &&
        params.relation === "full_access" &&
        params.subjectType === "group" &&
        params.subjectId === "group_a"
      ) {
        return makeTuple({
          subjectType: "group",
          subjectId: "group_a",
        });
      }

      return null;
    },
  };

  (service as unknown as {
    modelService: { getModel: (entityType: string) => Promise<object | null> };
  }).modelService = {
    getModel: async () => null,
  };

  const allowed = await service.checkPermission(
    "user",
    "user_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );

  assert.equal(allowed, true);
});

test("check-permission route rejects cross-client API key request before permission check", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalCheckPermission = PermissionService.prototype.checkPermission;

  let checkPermissionCalled = false;

  try {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    PermissionService.prototype.checkPermission = async () => {
      checkPermissionCalled = true;
      return true;
    };

    const request = new NextRequest("http://localhost/api/auth/check-permission", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({
        entityType: "client_clientB:invoice",
        entityId: "inv_1",
        permission: "read",
      }),
    });

    const response = await checkPermissionRoutePost(request);
    assert.equal(response.status, 403);
    assert.equal(checkPermissionCalled, false);
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    PermissionService.prototype.checkPermission = originalCheckPermission;
  }
});

test("check-permission route rejects client-scoped request when API key metadata lacks oauth_client_id", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalCheckPermission = PermissionService.prototype.checkPermission;

  let checkPermissionCalled = false;

  try {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {},
        },
      });

    PermissionService.prototype.checkPermission = async () => {
      checkPermissionCalled = true;
      return true;
    };

    const request = new NextRequest("http://localhost/api/auth/check-permission", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({
        entityType: "client_clientB:invoice",
        entityId: "inv_1",
        permission: "read",
      }),
    });

    const response = await checkPermissionRoutePost(request);
    assert.equal(response.status, 403);
    assert.equal(checkPermissionCalled, false);
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    PermissionService.prototype.checkPermission = originalCheckPermission;
  }
});

test("check-permission route allows same-client API key request and non-client-scoped entity type", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalCheckPermission = PermissionService.prototype.checkPermission;

  let checkPermissionCalls = 0;

  try {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    PermissionService.prototype.checkPermission = async () => {
      checkPermissionCalls += 1;
      return true;
    };

    const sameClientRequest = new NextRequest("http://localhost/api/auth/check-permission", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({
        entityType: "client_clientA:invoice",
        entityId: "inv_1",
        permission: "read",
      }),
    });

    const sameClientResponse = await checkPermissionRoutePost(sameClientRequest);
    assert.equal(sameClientResponse.status, 200);

    const nonClientScopedRequest = new NextRequest("http://localhost/api/auth/check-permission", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "test_key",
      },
      body: JSON.stringify({
        entityType: "invoice",
        entityId: "inv_legacy",
        permission: "read",
      }),
    });

    const nonClientScopedResponse = await checkPermissionRoutePost(nonClientScopedRequest);
    assert.equal(nonClientScopedResponse.status, 200);
    assert.equal(checkPermissionCalls, 2);
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    PermissionService.prototype.checkPermission = originalCheckPermission;
  }
});

async function buildEncryptedSigningMaterial() {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });

  const privateKeyPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString();
  const publicKeyPem = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();

  const encryptedPrivateKey = await symmetricEncrypt({
    key: env.BETTER_AUTH_SECRET,
    data: privateKeyPem,
  });

  return {
    publicKeyPem,
    encryptedPrivateKey,
  };
}

test("api-key exchange includes client_full_access claim when grants exist", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalFindLatest = jwksRepository.findLatest;
  const originalResolvePermissionsWithABACInfo =
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo;
  const originalResolveClientFullAccess =
    apiKeyPermissionResolver.resolveClientFullAccess;

  try {
    const { publicKeyPem, encryptedPrivateKey } = await buildEncryptedSigningMaterial();

    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    jwksRepository.findLatest = async () => ({
      id: "kid_test",
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: new Date(),
    });

    apiKeyPermissionResolver.resolvePermissionsWithABACInfo = async () => ({
      permissions: {
        "client_clientA:invoice": ["read"],
      },
      abac_required: {
        "client_clientA:invoice": ["refund"],
      },
    });

    apiKeyPermissionResolver.resolveClientFullAccess = async () => ["clientA"];

    const request = new NextRequest("http://localhost/api/auth/api-key/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test_key",
      }),
    });

    const response = await exchangeRoutePost(request);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { token: string };
    assert.ok(body.token);

    const importedPublicKey = await importSPKI(publicKeyPem, "RS256");
    const verified = await jwtVerify(body.token, importedPublicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE[0],
    });

    const payload = verified.payload as {
      client_full_access?: string[];
      permissions?: Record<string, string[]>;
      abac_required?: Record<string, string[]>;
    };

    assert.deepEqual(payload.client_full_access, ["clientA"]);
    assert.deepEqual(payload.permissions, {
      "client_clientA:invoice": ["read"],
    });
    assert.deepEqual(payload.abac_required, {
      "client_clientA:invoice": ["refund"],
    });
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    jwksRepository.findLatest = originalFindLatest;
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo =
      originalResolvePermissionsWithABACInfo;
    apiKeyPermissionResolver.resolveClientFullAccess =
      originalResolveClientFullAccess;
  }
});

test("api-key exchange omits client_full_access claim when no grants exist", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalFindLatest = jwksRepository.findLatest;
  const originalResolvePermissionsWithABACInfo =
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo;
  const originalResolveClientFullAccess =
    apiKeyPermissionResolver.resolveClientFullAccess;

  try {
    const { publicKeyPem, encryptedPrivateKey } = await buildEncryptedSigningMaterial();

    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    jwksRepository.findLatest = async () => ({
      id: "kid_test",
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: new Date(),
    });

    apiKeyPermissionResolver.resolvePermissionsWithABACInfo = async () => ({
      permissions: {
        "client_clientA:invoice": ["read"],
        "client_clientB:invoice": ["read"],
        "oauth_client:clientB": ["full_access"],
        platform: ["member"],
      },
      abac_required: {
        "client_clientB:invoice": ["refund"],
        "oauth_client:clientB": ["full_access"],
        platform: ["member"],
      },
    });

    apiKeyPermissionResolver.resolveClientFullAccess = async () => [];

    const request = new NextRequest("http://localhost/api/auth/api-key/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test_key",
      }),
    });

    const response = await exchangeRoutePost(request);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { token: string };
    assert.ok(body.token);

    const importedPublicKey = await importSPKI(publicKeyPem, "RS256");
    const verified = await jwtVerify(body.token, importedPublicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE[0],
    });

    const payload = verified.payload as {
      client_full_access?: string[];
      permissions?: Record<string, string[]>;
      abac_required?: Record<string, string[]>;
    };

    assert.equal(payload.client_full_access, undefined);
    assert.deepEqual(payload.permissions, {
      "client_clientA:invoice": ["read"],
      platform: ["member"],
    });
    assert.deepEqual(payload.abac_required, {
      platform: ["member"],
    });
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    jwksRepository.findLatest = originalFindLatest;
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo =
      originalResolvePermissionsWithABACInfo;
    apiKeyPermissionResolver.resolveClientFullAccess =
      originalResolveClientFullAccess;
  }
});

test("api-key exchange filters out-of-scope client_full_access claims by API key client", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalFindLatest = jwksRepository.findLatest;
  const originalResolvePermissionsWithABACInfo =
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo;
  const originalResolveClientFullAccess =
    apiKeyPermissionResolver.resolveClientFullAccess;

  try {
    const { publicKeyPem, encryptedPrivateKey } = await buildEncryptedSigningMaterial();

    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    jwksRepository.findLatest = async () => ({
      id: "kid_test",
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: new Date(),
    });

    apiKeyPermissionResolver.resolvePermissionsWithABACInfo = async () => ({
      permissions: {
        "client_clientA:invoice": ["read"],
      },
      abac_required: {},
    });

    apiKeyPermissionResolver.resolveClientFullAccess = async () => [
      "clientA",
      "clientB",
    ];

    const request = new NextRequest("http://localhost/api/auth/api-key/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test_key",
      }),
    });

    const response = await exchangeRoutePost(request);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { token: string };
    const importedPublicKey = await importSPKI(publicKeyPem, "RS256");
    const verified = await jwtVerify(body.token, importedPublicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE[0],
    });

    const payload = verified.payload as {
      client_full_access?: string[];
      permissions?: Record<string, string[]>;
      abac_required?: Record<string, string[]>;
    };

    assert.deepEqual(payload.client_full_access, ["clientA"]);
    assert.deepEqual(payload.permissions, {
      "client_clientA:invoice": ["read"],
    });
    assert.equal(payload.abac_required, undefined);
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    jwksRepository.findLatest = originalFindLatest;
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo =
      originalResolvePermissionsWithABACInfo;
    apiKeyPermissionResolver.resolveClientFullAccess =
      originalResolveClientFullAccess;
  }
});

test("api-key exchange fails when API key metadata lacks oauth_client_id", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalFindLatest = jwksRepository.findLatest;
  const originalResolvePermissionsWithABACInfo =
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo;
  const originalResolveClientFullAccess =
    apiKeyPermissionResolver.resolveClientFullAccess;

  try {
    const { publicKeyPem, encryptedPrivateKey } = await buildEncryptedSigningMaterial();

    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {},
        },
      });

    jwksRepository.findLatest = async () => ({
      id: "kid_test",
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: new Date(),
    });

    apiKeyPermissionResolver.resolvePermissionsWithABACInfo = async () => ({
      permissions: {
        "client_clientA:invoice": ["read"],
      },
      abac_required: {
        "client_clientA:invoice": ["refund"],
      },
    });

    apiKeyPermissionResolver.resolveClientFullAccess = async () => ["clientA"];

    const request = new NextRequest("http://localhost/api/auth/api-key/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test_key",
      }),
    });

    const response = await exchangeRoutePost(request);
    assert.equal(response.status, 403);

    const body = (await response.json()) as {
      error: string;
      message: string;
    };
    assert.equal(body.error, "forbidden");
    assert.equal(body.message, "API key is missing client scope metadata");
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    jwksRepository.findLatest = originalFindLatest;
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo =
      originalResolvePermissionsWithABACInfo;
    apiKeyPermissionResolver.resolveClientFullAccess =
      originalResolveClientFullAccess;
  }
});

test("api-key exchange can derive client_full_access claim from resolver tuple lookup", async () => {
  const originalVerifyApiKey = auth.api.verifyApiKey;
  const originalFindLatest = jwksRepository.findLatest;
  const originalResolvePermissionsWithABACInfo =
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo;
  const originalExpandSubjectsForResolution =
    (apiKeyPermissionResolver as unknown as {
      permissionService: {
        expandSubjectsForResolution: (
          type: string,
          id: string
        ) => Promise<Array<{ type: string; id: string }>>;
      };
    }).permissionService.expandSubjectsForResolution;
  const originalFindBySubjectAndEntityTypeAndRelation =
    tupleRepository.findBySubjectAndEntityTypeAndRelation;

  try {
    const { publicKeyPem, encryptedPrivateKey } = await buildEncryptedSigningMaterial();

    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey =
      async () => ({
        valid: true,
        error: null,
        key: {
          id: "key_1",
          userId: "user_1",
          metadata: {
            oauth_client_id: "clientA",
          },
        },
      });

    jwksRepository.findLatest = async () => ({
      id: "kid_test",
      publicKey: publicKeyPem,
      privateKey: encryptedPrivateKey,
      createdAt: new Date(),
    });

    apiKeyPermissionResolver.resolvePermissionsWithABACInfo = async () => ({
      permissions: {
        "client_clientA:invoice": ["read"],
      },
      abac_required: {},
    });

    (apiKeyPermissionResolver as unknown as {
      permissionService: {
        expandSubjectsForResolution: (
          type: string,
          id: string
        ) => Promise<Array<{ type: string; id: string }>>;
      };
    }).permissionService.expandSubjectsForResolution = async () => [
      { type: "apikey", id: "key_1" },
      { type: "group", id: "group_a" },
    ];

    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      async (subjectType, subjectId, entityType, relation) => {
        if (
          entityType === "oauth_client" &&
          relation === "full_access" &&
          subjectType === "group" &&
          subjectId === "group_a"
        ) {
          return [
            makeTuple({
              id: "tpl_group_full_access",
              subjectType: "group",
              subjectId: "group_a",
              entityId: "clientA",
            }),
          ];
        }

        return [];
      };

    const request = new NextRequest("http://localhost/api/auth/api-key/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        apiKey: "test_key",
      }),
    });

    const response = await exchangeRoutePost(request);
    assert.equal(response.status, 200);

    const body = (await response.json()) as { token: string };
    const importedPublicKey = await importSPKI(publicKeyPem, "RS256");
    const verified = await jwtVerify(body.token, importedPublicKey, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE[0],
    });

    const payload = verified.payload as {
      client_full_access?: string[];
    };

    assert.deepEqual(payload.client_full_access, ["clientA"]);
  } finally {
    (auth.api as unknown as { verifyApiKey: unknown }).verifyApiKey = originalVerifyApiKey;
    jwksRepository.findLatest = originalFindLatest;
    apiKeyPermissionResolver.resolvePermissionsWithABACInfo =
      originalResolvePermissionsWithABACInfo;
    (apiKeyPermissionResolver as unknown as {
      permissionService: {
        expandSubjectsForResolution: (
          type: string,
          id: string
        ) => Promise<Array<{ type: string; id: string }>>;
      };
    }).permissionService.expandSubjectsForResolution =
      originalExpandSubjectsForResolution;
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      originalFindBySubjectAndEntityTypeAndRelation;
  }
});
