import assert from "node:assert/strict";
import test from "node:test";

import {
  createClientApiKey,
  getClientApiKeysWithDeps,
  revokeClientApiKeyWithDeps,
} from "@/app/admin/clients/[id]/access/actions";
import { metricsService } from "@/lib/services/metrics-service";
import { tupleRepository, type Tuple } from "@/lib/repositories";

function makeTuple(overrides: Partial<Tuple>): Tuple {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "tpl_test",
    entityType: "oauth_client",
    entityTypeId: null,
    entityId: "clientA",
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

const originalMetricsGauge = metricsService.gauge;
const originalFindByEntity = tupleRepository.findByEntity;

test.beforeEach(() => {
  (metricsService as unknown as {
    gauge: typeof metricsService.gauge;
  }).gauge = async () => {};

  tupleRepository.findByEntity = async () => [];
});

test.after(() => {
  (metricsService as unknown as {
    gauge: typeof metricsService.gauge;
  }).gauge = originalMetricsGauge;

  tupleRepository.findByEntity = originalFindByEntity;
});

test("getClientApiKeysWithDeps keeps accessMode scoped without direct full_access tuple", async () => {
  const keys = await getClientApiKeysWithDeps("clientA", {
    guardView: async () => {},
    getHeadersFn: async () => new Headers(),
    listApiKeysFn: async () => [
      {
        id: "key_1",
        name: "Key One",
        metadata: {
          oauth_client_id: "clientA",
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: null,
      },
    ] as Array<{
      id: string;
      name: string;
      metadata: { oauth_client_id: string };
      createdAt: Date;
      expiresAt: Date | null;
    }>,
    findBySubjectFn: async () => [
      makeTuple({
        id: "tpl_group_member",
        entityType: "group",
        entityId: "group_a",
        relation: "member",
      }),
      makeTuple({
        id: "tpl_scoped",
        entityType: "client_clientA:invoice",
        entityId: "*",
        relation: "read",
      }),
    ],
  });

  assert.equal(keys.length, 1);
  assert.equal(keys[0]?.accessMode, "scoped");
});

test("getClientApiKeysWithDeps sets accessMode full_access for direct tuple", async () => {
  const keys = await getClientApiKeysWithDeps("clientA", {
    guardView: async () => {},
    getHeadersFn: async () => new Headers(),
    listApiKeysFn: async () => [
      {
        id: "key_1",
        name: "Key One",
        metadata: {
          oauth_client_id: "clientA",
        },
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        expiresAt: null,
      },
    ] as Array<{
      id: string;
      name: string;
      metadata: { oauth_client_id: string };
      createdAt: Date;
      expiresAt: Date | null;
    }>,
    findBySubjectFn: async () => [
      makeTuple({
        id: "tpl_full",
        entityType: "oauth_client",
        entityId: "clientA",
        relation: "full_access",
      }),
    ],
  });

  assert.equal(keys.length, 1);
  assert.equal(keys[0]?.accessMode, "full_access");
  assert.deepEqual(keys[0]?.permissions, {});
});

test("createClientApiKey creates direct full_access tuple in full_access mode", async () => {
  let createdTuple:
    | {
        entityType: string;
        entityId: string;
        relation: string;
        subjectType: string;
        subjectId: string;
      }
    | undefined;
  let observedMetric:
    | { name: string; value: number; tags?: Record<string, string> }
    | undefined;

  (metricsService as unknown as {
    gauge: typeof metricsService.gauge;
  }).gauge = async (name, value, tags) => {
    observedMetric = { name, value, tags };
  };

  const result = await createClientApiKey(
    {
      clientId: "clientA",
      name: "CI Key",
      accessMode: "full_access",
    },
    {
      guardView: async () => {},
      getSessionFn: async () => ({ user: { id: "user_1" } } as { user: { id: string } }),
      getCurrentUserAccessLevelFn: async () => ({
        level: "admin",
        canEditModel: true,
        canManageAccess: true,
      }),
      createApiKeyFn: async () => ({
        id: "key_1",
        key: "secret_key",
        name: "CI Key",
        expiresAt: null,
      }),
      findAuthorizationModelFn: async () => null,
      createTupleIfNotExistsFn: async (params) => {
        createdTuple = {
          entityType: params.entityType,
          entityId: params.entityId,
          relation: params.relation,
          subjectType: params.subjectType,
          subjectId: params.subjectId,
        };

        return {
          tuple: makeTuple({
            id: "tpl_created",
            entityType: params.entityType,
            entityId: params.entityId,
            relation: params.relation,
            subjectType: params.subjectType,
            subjectId: params.subjectId,
          }),
          created: true,
        };
      },
      deleteTuplesBySubjectFn: async () => 0,
      deleteApiKeyFn: async () => ({ success: true }),
      getHeadersFn: async () => new Headers(),
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(createdTuple, {
    entityType: "oauth_client",
    entityId: "clientA",
    relation: "full_access",
    subjectType: "apikey",
    subjectId: "key_1",
  });
  assert.deepEqual(observedMetric, {
    name: "authz.client_full_access.grant_count",
    value: 0,
    tags: { client_id: "clientA" },
  });
});

test("createClientApiKey rolls back API key when full_access tuple write fails", async () => {
  let tuplesRollbackCalled = false;
  let keyRollbackCalled = false;

  const result = await createClientApiKey(
    {
      clientId: "clientA",
      name: "CI Key",
      accessMode: "full_access",
    },
    {
      guardView: async () => {},
      getSessionFn: async () => ({ user: { id: "user_1" } } as { user: { id: string } }),
      getCurrentUserAccessLevelFn: async () => ({
        level: "admin",
        canEditModel: true,
        canManageAccess: true,
      }),
      createApiKeyFn: async () => ({
        id: "key_1",
        key: "secret_key",
        name: "CI Key",
        expiresAt: null,
      }),
      findAuthorizationModelFn: async () => null,
      createTupleIfNotExistsFn: async () => {
        throw new Error("tuple write failed");
      },
      deleteTuplesBySubjectFn: async () => {
        tuplesRollbackCalled = true;
        return 1;
      },
      deleteApiKeyFn: async () => {
        keyRollbackCalled = true;
        return { success: true };
      },
      getHeadersFn: async () => new Headers(),
    }
  );

  assert.equal(result.success, false);
  assert.equal(tuplesRollbackCalled, true);
  assert.equal(keyRollbackCalled, true);
  assert.match(result.error || "", /rolled back/i);
});

test("revokeClientApiKeyWithDeps removes key tuples and succeeds", async () => {
  let deleteBySubjectCalled = false;
  let observedMetric:
    | { name: string; value: number; tags?: Record<string, string> }
    | undefined;

  (metricsService as unknown as {
    gauge: typeof metricsService.gauge;
  }).gauge = async (name, value, tags) => {
    observedMetric = { name, value, tags };
  };

  const result = await revokeClientApiKeyWithDeps("key_1", {
    guardView: async () => {},
    getHeadersFn: async () => new Headers(),
    listApiKeysFn: async () => [
      {
        id: "key_1",
        metadata: {
          oauth_client_id: "clientA",
        },
      },
    ] as Array<{
      id: string;
      metadata: { oauth_client_id: string };
    }>,
    getCurrentUserAccessLevelFn: async () => ({
      level: "admin",
      canEditModel: true,
      canManageAccess: true,
    }),
    deleteApiKeyFn: async () => ({ success: true }),
    deleteTuplesBySubjectFn: async () => {
      deleteBySubjectCalled = true;
      return 1;
    },
  });

  assert.equal(result.success, true);
  assert.equal(deleteBySubjectCalled, true);
  assert.deepEqual(observedMetric, {
    name: "authz.client_full_access.grant_count",
    value: 0,
    tags: { client_id: "clientA" },
  });
});
