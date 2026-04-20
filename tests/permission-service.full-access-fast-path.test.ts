import assert from "node:assert/strict";
import test from "node:test";

import {
  extractClientIdFromEntityType,
  PermissionService,
} from "@/lib/auth/permission-service";
import { metricsService } from "@/lib/services/metrics-service";
import type { Tuple } from "@/lib/repositories/tuple-repository";

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

function createMetricsRecorder() {
  const countCalls: Array<{ name: string; tags?: Record<string, string> }> = [];
  const histogramCalls: Array<{ name: string; tags?: Record<string, string> }> = [];

  const originalCount = metricsService.count;
  const originalHistogram = metricsService.histogram;

  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).count = async (name, _value, tags) => {
    countCalls.push({ name, tags });
  };

  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).histogram = async (name, _value, tags) => {
    histogramCalls.push({ name, tags });
  };

  const restore = () => {
    (metricsService as unknown as {
      count: typeof metricsService.count;
      histogram: typeof metricsService.histogram;
    }).count = originalCount;

    (metricsService as unknown as {
      count: typeof metricsService.count;
      histogram: typeof metricsService.histogram;
    }).histogram = originalHistogram;
  };

  return { countCalls, histogramCalls, restore };
}

test("extractClientIdFromEntityType parses only namespaced client entity types", () => {
  assert.equal(extractClientIdFromEntityType("client_abc:invoice"), "abc");
  assert.equal(extractClientIdFromEntityType("client_abc"), null);
  assert.equal(extractClientIdFromEntityType("oauth_client"), null);
});

test("checkPermission allows direct apikey full_access and emits client_full_access metric", async () => {
  const service = new PermissionService();
  const metrics = createMetricsRecorder();

  let modelLookups = 0;

  try {
    (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
      findById: async () => null,
    };

    (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
      async () => [{ type: "apikey", id: "key_1" }];

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

    (service as unknown as { modelService: { getModel: (entityType: string) => Promise<object | null> } }).modelService = {
      getModel: async () => {
        modelLookups += 1;
        return null;
      },
    };

    const allowed = await service.checkPermission(
      "apikey",
      "key_1",
      "client_abc:invoice",
      "inv_1",
      "read"
    );

    assert.equal(allowed, true);
    assert.equal(modelLookups, 0);
    assert.ok(
      metrics.countCalls.some(
        (call) =>
          call.name === "authz.decision.count" &&
          call.tags?.result === "allowed" &&
          call.tags?.source === "client_full_access"
      )
    );
  } finally {
    metrics.restore();
  }
});

test("checkPermission allows group-inherited full_access", async () => {
  const service = new PermissionService();

  (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [
      { type: "user", id: "user_1" },
      { type: "group", id: "group_a" },
    ];

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

  (service as unknown as { modelService: { getModel: (entityType: string) => Promise<object | null> } }).modelService = {
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

test("checkPermission does not bypass with full_access from another client", async () => {
  const service = new PermissionService();

  (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [{ type: "apikey", id: "key_1" }];

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
        params.entityType === "oauth_client" &&
        params.entityId === "xyz" &&
        params.relation === "full_access"
      ) {
        return makeTuple({ entityId: "xyz" });
      }

      return null;
    },
  };

  (service as unknown as { modelService: { getModel: (entityType: string) => Promise<object | null> } }).modelService = {
    getModel: async () => null,
  };

  const allowed = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );

  assert.equal(allowed, false);
});

test("checkPermission falls through to scoped tuple checks when no full_access exists", async () => {
  const service = new PermissionService();

  const directScopedTuple = makeTuple({
    id: "tpl_scoped",
    entityType: "client_abc:invoice",
    entityTypeId: "model_1",
    entityId: "inv_1",
    relation: "viewer",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [{ type: "apikey", id: "key_1" }];

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
        params.entityType === "client_abc:invoice" &&
        params.entityId === "inv_1" &&
        params.relation === "viewer" &&
        params.subjectType === "apikey" &&
        params.subjectId === "key_1"
      ) {
        return directScopedTuple;
      }

      return null;
    },
  };

  const allowed = await service.checkPermission(
    "apikey",
    "key_1",
    "client_abc:invoice",
    "inv_1",
    "read"
  );

  assert.equal(allowed, true);
});

test("checkPermission does not trigger full_access path for oauth_client entity type", async () => {
  const service = new PermissionService();

  let expandSubjectsCalls = 0;

  (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
    findById: async () => null,
  };

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => {
      expandSubjectsCalls += 1;
      return [{ type: "apikey", id: "key_1" }];
    };

  (service as unknown as { modelService: { getModel: (entityType: string) => Promise<object | null> } }).modelService = {
    getModel: async () => null,
  };

  (service as unknown as {
    tupleRepo: {
      findExact: () => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findExact: async () => makeTuple({}),
  };

  const allowed = await service.checkPermission(
    "apikey",
    "key_1",
    "oauth_client",
    "abc",
    "read"
  );

  assert.equal(allowed, false);
  assert.equal(expandSubjectsCalls, 0);
});
