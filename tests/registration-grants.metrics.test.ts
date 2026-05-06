import assert from "node:assert/strict";
import test from "node:test";

test("registration-grants no longer exports client authorize-time grant application", async () => {
  const registrationGrants = await import("@/lib/pipelines/registration-grants");
  assert.equal("applyClientContextGrants" in registrationGrants, false);
});
