import assert from "node:assert/strict";
import test from "node:test";

import type { AuthorizationModelEntity } from "@/lib/repositories/authorization-model-repository";
import {
  getAuthorizationModelOwnerClientId,
  resolveRegistrationContextGrantTargets,
} from "@/lib/utils/registration-context-grants";

function makeModel(overrides: Partial<AuthorizationModelEntity>): AuthorizationModelEntity {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "model_default",
    entityType: "client_payload:book",
    authorizationSpaceId: null,
    definition: {
      relations: {
        viewer: {},
      },
      permissions: {},
    },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("getAuthorizationModelOwnerClientId extracts the owning client from scoped entity types", () => {
  assert.equal(getAuthorizationModelOwnerClientId("client_payload:book"), "payload");
  assert.equal(getAuthorizationModelOwnerClientId("client_blog"), "blog");
  assert.equal(getAuthorizationModelOwnerClientId("group"), null);
});

test("resolveRegistrationContextGrantTargets allows same-client and projected targets", async () => {
  const models = new Map<string, AuthorizationModelEntity>([
    ["book", makeModel({ id: "book", entityType: "client_payload:book" })],
    ["chapter", makeModel({ id: "chapter", entityType: "client_blog:chapter" })],
  ]);

  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: ["payload"],
    grants: [
      { entityTypeId: "chapter", relation: "viewer" },
      { entityTypeId: "book", relation: "viewer" },
    ],
    resolveModelById: async (entityTypeId) => models.get(entityTypeId) ?? null,
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.targets.length, 2);
  assert.equal(result.targets[0]?.isProjected, false);
  assert.equal(result.targets[1]?.ownerClientId, "payload");
  assert.equal(result.targets[1]?.isProjected, true);
});

test("resolveRegistrationContextGrantTargets rejects disallowed target clients", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: [],
    grants: [{ entityTypeId: "book", relation: "viewer" }],
    resolveModelById: async () => makeModel({ id: "book", entityType: "client_payload:book" }),
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.match(result.error, /Target client 'payload' is not allowed/);
});

test("resolveRegistrationContextGrantTargets allows models in linked authorization spaces", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: [],
    allowedAuthorizationSpaceIds: ["space_payload"],
    grants: [{ entityTypeId: "book", relation: "viewer" }],
    resolveModelById: async () =>
      makeModel({
        id: "book",
        entityType: "client_payload:book",
        authorizationSpaceId: "space_payload",
      }),
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.targets[0]?.authorizationSpaceId, "space_payload");
});

test("resolveRegistrationContextGrantTargets rejects unlinked authorization spaces", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: ["payload"],
    allowedAuthorizationSpaceIds: ["space_other"],
    grants: [{ entityTypeId: "book", relation: "viewer" }],
    resolveModelById: async () =>
      makeModel({
        id: "book",
        entityType: "client_payload:book",
        authorizationSpaceId: "space_payload",
      }),
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.match(result.error, /Authorization space 'space_payload' is not linked/);
});

test("resolveRegistrationContextGrantTargets keeps client allowlist compatibility for unbackfilled models", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: ["payload"],
    allowedAuthorizationSpaceIds: ["space_payload"],
    grants: [{ entityTypeId: "book", relation: "viewer" }],
    resolveModelById: async () =>
      makeModel({
        id: "book",
        entityType: "client_payload:book",
        authorizationSpaceId: null,
      }),
  });

  assert.equal(result.ok, true);
});

test("resolveRegistrationContextGrantTargets rejects missing relations", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: "blog",
    allowedProjectionClientIds: ["payload"],
    grants: [{ entityTypeId: "book", relation: "editor" }],
    resolveModelById: async () => makeModel({ id: "book", entityType: "client_payload:book" }),
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.match(result.error, /Relation 'editor' is not defined/);
});

test("resolveRegistrationContextGrantTargets can reject disabled space targets for platform contexts", async () => {
  const result = await resolveRegistrationContextGrantTargets({
    sourceClientId: null,
    allowedProjectionClientIds: [],
    allowedAuthorizationSpaceIds: ["space_enabled"],
    enforceAllowedAuthorizationSpaces: true,
    grants: [{ entityTypeId: "book", relation: "viewer" }],
    resolveModelById: async () =>
      makeModel({
        id: "book",
        entityType: "client_payload:book",
        authorizationSpaceId: "space_disabled",
      }),
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.match(result.error, /not enabled/);
});
