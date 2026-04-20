import assert from "node:assert/strict";
import test from "node:test";

import { db } from "@/lib/db";
import {
  TupleRepository,
  type Tuple,
} from "@/lib/repositories/tuple-repository";

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

test("findBySubjectAndEntityTypeAndRelation returns only matching tuples", async () => {
  const repository = new TupleRepository();

  const matchingTuple = makeTuple({
    id: "tpl_match",
    entityId: "client_match",
    subjectId: "apikey_match",
  });

  const nonMatchingTuple = makeTuple({
    id: "tpl_non_match",
    entityId: "client_other",
    subjectId: "apikey_other",
  });

  // Simulate SQL filtering outcome for a fixture that contains one match + one non-match.
  const filteredResult = [matchingTuple];

  const dbWithMutableSelect = db as unknown as {
    select: () => {
      from: () => {
        where: (_condition: unknown) => Promise<Tuple[]>;
      };
    };
  };

  const originalSelect = dbWithMutableSelect.select;

  try {
    dbWithMutableSelect.select = () => ({
      from: () => ({
        where: async () => {
          assert.equal(nonMatchingTuple.id, "tpl_non_match");
          return filteredResult;
        },
      }),
    });

    const result = await repository.findBySubjectAndEntityTypeAndRelation(
      "apikey",
      "apikey_match",
      "oauth_client",
      "full_access"
    );

    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, matchingTuple.id);
  } finally {
    dbWithMutableSelect.select = originalSelect;
  }
});

test("findBySubjectAndEntityTypeAndRelation throws on db errors", async () => {
  const repository = new TupleRepository();

  const dbWithMutableSelect = db as unknown as {
    select: () => {
      from: () => {
        where: (_condition: unknown) => Promise<Tuple[]>;
      };
    };
  };

  const originalSelect = dbWithMutableSelect.select;

  try {
    dbWithMutableSelect.select = () => ({
      from: () => ({
        where: async () => {
          throw new Error("db failure");
        },
      }),
    });

    await assert.rejects(
      repository.findBySubjectAndEntityTypeAndRelation(
        "apikey",
        "apikey_match",
        "oauth_client",
        "full_access"
      ),
      /db failure/
    );
  } finally {
    dbWithMutableSelect.select = originalSelect;
  }
});
