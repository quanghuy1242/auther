import assert from "node:assert/strict";
import test from "node:test";

import { ApiKeyPermissionResolver } from "@/lib/services/api-key-permission-resolver";
import { tupleRepository, type Tuple } from "@/lib/repositories";

function makeTuple(overrides: Partial<Tuple>): Tuple {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "tpl_test",
    entityType: "oauth_client",
    entityTypeId: null,
    entityId: "client_a",
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

test("resolveClientFullAccess returns direct API key full_access client IDs", async () => {
  const resolver = new ApiKeyPermissionResolver();

  const originalFindBySubject = tupleRepository.findBySubject;
  const originalFindBySubjectAndEntityTypeAndRelation =
    tupleRepository.findBySubjectAndEntityTypeAndRelation;

  try {
    tupleRepository.findBySubject = async () => [];
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      async (subjectType, subjectId, entityType, relation) => {
        if (
          subjectType === "apikey" &&
          subjectId === "key_1" &&
          entityType === "oauth_client" &&
          relation === "full_access"
        ) {
          return [makeTuple({ entityId: "client_a" })];
        }

        return [];
      };

    const clientIds = await resolver.resolveClientFullAccess("key_1");
    assert.deepEqual(clientIds, ["client_a"]);
  } finally {
    tupleRepository.findBySubject = originalFindBySubject;
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      originalFindBySubjectAndEntityTypeAndRelation;
  }
});

test("resolveClientFullAccess returns group-inherited full_access client IDs", async () => {
  const resolver = new ApiKeyPermissionResolver();

  const originalFindBySubject = tupleRepository.findBySubject;
  const originalFindBySubjectAndEntityTypeAndRelation =
    tupleRepository.findBySubjectAndEntityTypeAndRelation;

  try {
    tupleRepository.findBySubject = async () => [
      makeTuple({
        id: "tpl_group_member",
        entityType: "group",
        entityId: "group_a",
        relation: "member",
        subjectType: "apikey",
        subjectId: "key_1",
      }),
    ];

    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      async (subjectType, subjectId) => {
        if (subjectType === "group" && subjectId === "group_a") {
          return [
            makeTuple({
              id: "tpl_group_full_access",
              subjectType: "group",
              subjectId: "group_a",
              entityId: "client_a",
            }),
          ];
        }

        return [];
      };

    const clientIds = await resolver.resolveClientFullAccess("key_1");
    assert.deepEqual(clientIds, ["client_a"]);
  } finally {
    tupleRepository.findBySubject = originalFindBySubject;
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      originalFindBySubjectAndEntityTypeAndRelation;
  }
});

test("resolveClientFullAccess returns empty list when no full_access grants exist", async () => {
  const resolver = new ApiKeyPermissionResolver();

  const originalFindBySubject = tupleRepository.findBySubject;
  const originalFindBySubjectAndEntityTypeAndRelation =
    tupleRepository.findBySubjectAndEntityTypeAndRelation;

  try {
    tupleRepository.findBySubject = async () => [];
    tupleRepository.findBySubjectAndEntityTypeAndRelation = async () => [];

    const clientIds = await resolver.resolveClientFullAccess("key_1");
    assert.deepEqual(clientIds, []);
  } finally {
    tupleRepository.findBySubject = originalFindBySubject;
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      originalFindBySubjectAndEntityTypeAndRelation;
  }
});

test("resolveClientFullAccess returns unique client IDs when multiple grants exist", async () => {
  const resolver = new ApiKeyPermissionResolver();

  const originalFindBySubject = tupleRepository.findBySubject;
  const originalFindBySubjectAndEntityTypeAndRelation =
    tupleRepository.findBySubjectAndEntityTypeAndRelation;

  try {
    tupleRepository.findBySubject = async () => [
      makeTuple({
        id: "tpl_group_member",
        entityType: "group",
        entityId: "group_a",
        relation: "member",
        subjectType: "apikey",
        subjectId: "key_1",
      }),
    ];

    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      async (subjectType, subjectId) => {
        if (subjectType === "apikey" && subjectId === "key_1") {
          return [
            makeTuple({ id: "tpl_direct_a", entityId: "client_a" }),
            makeTuple({ id: "tpl_direct_b", entityId: "client_b" }),
          ];
        }

        if (subjectType === "group" && subjectId === "group_a") {
          return [
            makeTuple({
              id: "tpl_group_a",
              subjectType: "group",
              subjectId: "group_a",
              entityId: "client_a",
            }),
          ];
        }

        return [];
      };

    const clientIds = await resolver.resolveClientFullAccess("key_1");
    assert.deepEqual(clientIds.sort(), ["client_a", "client_b"]);
  } finally {
    tupleRepository.findBySubject = originalFindBySubject;
    tupleRepository.findBySubjectAndEntityTypeAndRelation =
      originalFindBySubjectAndEntityTypeAndRelation;
  }
});
