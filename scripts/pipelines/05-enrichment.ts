
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

// --- MOCK APPLICATION FUNCTION ---
async function createSessionForUser(user: { id: string, role: string }) {
  console.log(`\n[TS APP] 1. Initializing Session Object...`);

  // Initial State in TypeScript
  let sessionState = {
    userId: user.id,
    permissions: ["read:public"], // Default
    accessLevel: 1,
    // metadata might be empty initially
    metadata: {}
  };

  console.log(`[TS APP]    Current State:`, JSON.stringify(sessionState));

  // --- PIPELINE HOOK POINT ---
  // The App asks Pipeline to ENRICH the state
  console.log(`[TS APP] 2. Calling Pipeline Trigger 'session_enrich'...`);

  const result = await pipelineEngine.executeTrigger("session_enrich", {
    user_role: user.role,
    current_perms: sessionState.permissions
  });

  // CRITICAL: The TS code MODIFIES its own state based on result
  if (result.data) {
    console.log(`[TS APP] 🔄 Pipeline returned data. Modifying State...`);

    // Merging logic (Implementation specific, but here we just merge)
    sessionState = { ...sessionState, ...result.data };
  }

  // --- CODE PROCEEDS WITH MODIFIED STATE ---
  console.log(`[TS APP] 3. Finalizing Session Creation`);
  console.log(`[TS APP]    Final State:`, JSON.stringify(sessionState, null, 2));

  return sessionState;
}


async function main() {
  console.log("--- DEMO 05: Enrichment (State Modification) ---");

  // 1. Define Enrichment Script
  const roleScript = await pipelineRepository.createScript({
    name: "Role Enricher",
    code: `
      local role = context.user_role
      
      -- Logic to determine extra data
      if role == "admin" then
         -- Return data to OVERWRITE/APPEND to TS State
         return { 
            allowed = true, 
            data = { 
                permissions = {"read:public", "write:all", "delete:users"},
                accessLevel = 99,
                metadata = { verified = true }
            } 
         }
      end
      
      return { allowed = true, data = {} }
    `,
  });
  await pipelineRepository.updateExecutionPlan("session_enrich", [[roleScript.id]]);


  // SCENARIO: Admin User
  console.log("------------------------------------------------");
  const finalSession = await createSessionForUser({ id: "admin_user", role: "admin" });

  // Verification
  if (finalSession.accessLevel === 99 && finalSession.permissions.includes("delete:users")) {
    console.log("\nPASS: TypeScript State was successfully MUTATED by Pipeline data.");
  } else {
    console.error("\nFAIL: State was not updated correctly!");
    process.exit(1);
  }

  process.exit(0);
}

main().catch(console.error);
