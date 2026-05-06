import assert from "node:assert/strict";
import test from "node:test";

import { PermissionService } from "@/lib/auth/permission-service";
import { authorizationModelRepository } from "@/lib/repositories";
import { metricsService } from "@/lib/services/metrics-service";
import type { Tuple } from "@/lib/repositories/tuple-repository";

const originalMetricsCount = metricsService.count;
const originalMetricsHistogram = metricsService.histogram;
const originalFindByEntityType = authorizationModelRepository.findByEntityType.bind(authorizationModelRepository);

test.beforeEach(() => {
  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).count = async () => {};

  (metricsService as unknown as {
    count: typeof metricsService.count;
    histogram: typeof metricsService.histogram;
  }).histogram = async () => {};

  authorizationModelRepository.findByEntityType = originalFindByEntityType;
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

  authorizationModelRepository.findByEntityType = originalFindByEntityType;
});

function makeTuple(overrides: Partial<Tuple>): Tuple {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "tpl_test",
    entityType: "authorization_space",
    entityTypeId: null,
    entityId: "space_1",
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

function mockCanonicalInvoiceModel(service: PermissionService, authorizationSpaceId = "space_1") {
  (service as unknown as { userRepo: { findById: (id: string) => Promise<{ role: string } | null> } }).userRepo = {
    findById: async () => null,
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
      if (entityType !== "invoice") return null;
      return {
        relations: { viewer: [] },
        permissions: { read: { relation: "viewer" } },
      };
    },
  };

  authorizationModelRepository.findByEntityType = async (entityType) => {
    if (entityType !== "invoice") return null;
    return {
      id: "model_invoice",
      entityType: "invoice",
      authorizationSpaceId,
      definition: {
        relations: { viewer: [] },
        permissions: { read: { relation: "viewer" } },
      },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  };
}

test("checkPermission allows direct authorization-space full_access for a canonical model", async () => {
  const service = new PermissionService();
  const metrics = createMetricsRecorder();

  try {
    mockCanonicalInvoiceModel(service);

    (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
      async () => [{ type: "apikey", id: "key_1" }];

    (service as unknown as {
      tupleRepo: {
        findBySubjectAndEntityTypeAndRelation: (
          subjectType: string,
          subjectId: string,
          entityType: string,
          relation: string
        ) => Promise<Tuple[]>;
      };
    }).tupleRepo = {
      findBySubjectAndEntityTypeAndRelation: async (subjectType, subjectId, entityType, relation) => {
        if (
          subjectType === "apikey" &&
          subjectId === "key_1" &&
          entityType === "authorization_space" &&
          relation === "full_access"
        ) {
          return [makeTuple({})];
        }

        return [];
      },
    };

    const allowed = await service.checkPermission("apikey", "key_1", "invoice", "inv_1", "read");

    assert.equal(allowed, true);
    assert.ok(
      metrics.countCalls.some(
        (call) =>
          call.name === "authz.decision.count" &&
          call.tags?.result === "allowed" &&
          call.tags?.source === "authorization_space_full_access"
      )
    );
  } finally {
    metrics.restore();
  }
});

test("checkPermission allows group-inherited authorization-space full_access", async () => {
  const service = new PermissionService();
  mockCanonicalInvoiceModel(service);

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [
      { type: "apikey", id: "key_1" },
      { type: "group", id: "group_a" },
    ];

  (service as unknown as {
    tupleRepo: {
      findBySubjectAndEntityTypeAndRelation: (
        subjectType: string,
        subjectId: string,
        entityType: string,
        relation: string
      ) => Promise<Tuple[]>;
    };
  }).tupleRepo = {
    findBySubjectAndEntityTypeAndRelation: async (subjectType, subjectId, entityType, relation) => {
      if (
        subjectType === "group" &&
        subjectId === "group_a" &&
        entityType === "authorization_space" &&
        relation === "full_access"
      ) {
        return [makeTuple({ subjectType: "group", subjectId: "group_a" })];
      }

      return [];
    },
  };

  const allowed = await service.checkPermission("apikey", "key_1", "invoice", "inv_1", "read");

  assert.equal(allowed, true);
});

test("checkPermission does not allow authorization-space full_access from another space", async () => {
  const service = new PermissionService();
  mockCanonicalInvoiceModel(service, "space_1");

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [{ type: "apikey", id: "key_1" }];

  (service as unknown as {
    tupleRepo: {
      findBySubjectAndEntityTypeAndRelation: () => Promise<Tuple[]>;
      findExact: () => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findBySubjectAndEntityTypeAndRelation: async () => [makeTuple({ entityId: "space_2" })],
    findExact: async () => null,
  };

  const allowed = await service.checkPermission("apikey", "key_1", "invoice", "inv_1", "read");

  assert.equal(allowed, false);
});

test("checkPermission falls through to scoped tuple checks when no full_access exists", async () => {
  const service = new PermissionService();
  mockCanonicalInvoiceModel(service);

  const directScopedTuple = makeTuple({
    id: "tpl_scoped",
    entityType: "invoice",
    entityTypeId: "model_invoice",
    entityId: "inv_1",
    relation: "viewer",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  (service as unknown as { expandSubjects: (type: string, id: string) => Promise<Array<{ type: string; id: string }>> }).expandSubjects =
    async () => [{ type: "apikey", id: "key_1" }];

  (service as unknown as {
    tupleRepo: {
      findBySubjectAndEntityTypeAndRelation: () => Promise<Tuple[]>;
      findExact: (params: {
        entityType: string;
        entityId: string;
        relation: string;
        subjectType: string;
        subjectId: string;
      }) => Promise<Tuple | null>;
    };
  }).tupleRepo = {
    findBySubjectAndEntityTypeAndRelation: async () => [],
    findExact: async (params) => {
      if (
        params.entityType === "invoice" &&
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

  const allowed = await service.checkPermission("apikey", "key_1", "invoice", "inv_1", "read");

  assert.equal(allowed, true);
});
