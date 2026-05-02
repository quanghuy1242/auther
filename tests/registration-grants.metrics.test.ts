import assert from "node:assert/strict";
import test from "node:test";

process.env.BLOG_CLIENT_ID ??= "blog-spa-client";
process.env.BLOG_REDIRECT_URI ??= "http://localhost:3003/api/auth/callback/auther";
process.env.BLOG_LOGOUT_REDIRECT_URIS ??= "http://localhost:3003";

let registrationContextRepo: typeof import("@/lib/repositories/platform-access-repository").registrationContextRepo;
let metricsService: typeof import("@/lib/services").metricsService;
let registrationContextService: typeof import("@/lib/services/registration-context-service").registrationContextService;
let applyClientContextGrants: typeof import("@/lib/pipelines/registration-grants").applyClientContextGrants;
let originalFindByClientId: typeof import("@/lib/repositories/platform-access-repository").registrationContextRepo.findByClientId;
let originalFindPlatformContexts: typeof import("@/lib/repositories/platform-access-repository").registrationContextRepo.findPlatformContexts;
let originalApplyContextGrants: typeof import("@/lib/services/registration-context-service").registrationContextService.applyContextGrants;
let originalMetricsCount: typeof import("@/lib/services").metricsService.count;

test.before(async () => {
  ({ registrationContextRepo } = await import("@/lib/repositories/platform-access-repository"));
  ({ metricsService } = await import("@/lib/services"));
  ({ registrationContextService } = await import("@/lib/services/registration-context-service"));
  ({ applyClientContextGrants } = await import("@/lib/pipelines/registration-grants"));
  originalFindByClientId = registrationContextRepo.findByClientId;
  originalFindPlatformContexts = registrationContextRepo.findPlatformContexts;
  originalApplyContextGrants = registrationContextService.applyContextGrants;
  originalMetricsCount = metricsService.count;
});

test.afterEach(() => {
  registrationContextRepo.findByClientId = originalFindByClientId;
  registrationContextRepo.findPlatformContexts = originalFindPlatformContexts;
  registrationContextService.applyContextGrants = originalApplyContextGrants;
  metricsService.count = originalMetricsCount;
});

test("applyClientContextGrants emits projected grant metrics for client-owned contexts", async () => {
  const metricCalls: Array<{ name: string; value: number | undefined; tags?: Record<string, string> }> = [];

  registrationContextRepo.findByClientId = async () => ([
    {
      id: "ctx_1",
      slug: "blog-reader",
      name: "Blog Reader",
      description: null,
      clientId: "blog",
      allowedOrigins: null,
      allowedDomains: null,
      grants: [],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  registrationContextRepo.findPlatformContexts = async () => [];
  registrationContextService.applyContextGrants = async () => ({
    appliedCount: 2,
    projectedCount: 1,
  });
  metricsService.count = async (name, value, tags) => {
    metricCalls.push({ name, value, tags });
  };

  await applyClientContextGrants("blog", "user_1");

  assert.deepEqual(metricCalls, [
    {
      name: "auth.context_grant.applied.count",
      value: 2,
      tags: {
        source_client_id: "blog",
        context_slug: "blog-reader",
      },
    },
    {
      name: "auth.context_grant.projected.count",
      value: 1,
      tags: {
        source_client_id: "blog",
        context_slug: "blog-reader",
      },
    },
  ]);
});

test("applyClientContextGrants emits projected error metrics when a client context fails", async () => {
  const metricCalls: Array<{ name: string; value: number | undefined; tags?: Record<string, string> }> = [];

  registrationContextRepo.findByClientId = async () => ([
    {
      id: "ctx_1",
      slug: "blog-reader",
      name: "Blog Reader",
      description: null,
      clientId: "blog",
      allowedOrigins: null,
      allowedDomains: null,
      grants: [],
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);
  registrationContextRepo.findPlatformContexts = async () => [];
  registrationContextService.applyContextGrants = async () => {
    throw new Error("boom");
  };
  metricsService.count = async (name, value, tags) => {
    metricCalls.push({ name, value, tags });
  };

  await applyClientContextGrants("blog", "user_1");

  assert.deepEqual(metricCalls, [
    {
      name: "auth.context_grant.projected.error.count",
      value: 1,
      tags: {
        source_client_id: "blog",
        context_slug: "blog-reader",
      },
    },
  ]);
});
