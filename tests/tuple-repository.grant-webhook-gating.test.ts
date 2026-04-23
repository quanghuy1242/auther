import assert from "node:assert/strict";
import test from "node:test";

import { TupleRepository, type Tuple } from "@/lib/repositories/tuple-repository";

function makeTuple(overrides: Partial<Tuple>): Tuple {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: "tpl_test",
    entityType: "client_abc:invoice",
    entityTypeId: "model_invoice",
    entityId: "*",
    relation: "read",
    subjectType: "user",
    subjectId: "user_1",
    subjectRelation: null,
    condition: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test("shouldEmitGrantWebhook emits for normal user and group grants", () => {
  const repository = new TupleRepository();

  const userTuple = makeTuple({
    subjectType: "user",
    subjectId: "user_1",
  });
  const groupTuple = makeTuple({
    subjectType: "group",
    subjectId: "group_a",
  });

  const shouldEmitForUser = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(userTuple);

  const shouldEmitForGroup = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(groupTuple);

  assert.equal(shouldEmitForUser, true);
  assert.equal(shouldEmitForGroup, true);
});

test("shouldEmitGrantWebhook does not emit for group member tuples", () => {
  const repository = new TupleRepository();

  const groupMemberTuple = makeTuple({
    entityType: "group",
    relation: "member",
    subjectType: "user",
    subjectId: "user_1",
  });

  const shouldEmit = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(groupMemberTuple);

  assert.equal(shouldEmit, false);
});

test("shouldEmitGrantWebhook emits for apikey oauth_client full_access only", () => {
  const repository = new TupleRepository();

  const apikeyFullAccessTuple = makeTuple({
    entityType: "oauth_client",
    entityId: "clientA",
    relation: "full_access",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  const apikeyScopedTuple = makeTuple({
    entityType: "client_clientA:invoice",
    relation: "read",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  const apikeyOtherOauthClientTuple = makeTuple({
    entityType: "oauth_client",
    entityId: "clientA",
    relation: "admin",
    subjectType: "apikey",
    subjectId: "key_1",
  });

  const shouldEmitFullAccess = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(apikeyFullAccessTuple);

  const shouldEmitScoped = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(apikeyScopedTuple);

  const shouldEmitOtherOauthClientRelation = (repository as unknown as {
    shouldEmitGrantWebhook: (tuple: Tuple) => boolean;
  }).shouldEmitGrantWebhook(apikeyOtherOauthClientTuple);

  assert.equal(shouldEmitFullAccess, true);
  assert.equal(shouldEmitScoped, false);
  assert.equal(shouldEmitOtherOauthClientRelation, false);
});
