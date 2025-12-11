
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

// --- MOCK APPLICATION FUNCTION ---
// This simulates the actual TypeScript code in Better-Auth or the Main App
async function handleUserSignup(user: { id: string, country: string }) {
    console.log(`\n[TS APP] 1. Starting Signup Process for ${user.id}...`);
    console.log(`[TS APP] 2. Validating Form Data...`);

    // --- PIPELINE HOOK POINT ---
    // The App asks the Pipeline: "Can I proceed?"
    console.log(`[TS APP] 3. Calling Pipeline Trigger 'signup_check'...`);

    const result = await pipelineEngine.executeTrigger("signup_check", {
        user_country: user.country,
        user_id: user.id
    });

    // CRITICAL: The TS code explicitly CHECKS the result
    if (result.allowed === false) {
        console.error(`[TS APP] 🛑 STOP! Pipeline blocked this request: "${result.error}"`);
        // We RETURN here. The code below NEVER RIES.
        return { success: false, reason: result.error };
    }

    // --- CODE THAT SHOULD NOT RUN IF BLOCKED ---
    console.log(`[TS APP] ✅ Pipeline Passed. Proceeding...`);
    console.log(`[TS APP] 4. Inserting User into Database (Simulated)`);
    console.log(`[TS APP] 5. Sending Welcome Email`);

    return { success: true };
}


async function main() {
    console.log("--- DEMO 03: Blocking (Control Flow Interrupt) ---");

    // 1. Define Policy Script
    const geoBlockScript = await pipelineRepository.createScript({
        name: "Geo Policy",
        code: `
      if context.user_country == "BANNED" then
         return { allowed = false, error = "Country is Sanctioned" }
      end
      return { allowed = true }
    `,
    });
    await pipelineRepository.updateExecutionPlan("signup_check", [[geoBlockScript.id]]);


    // SCENARIO 1: Good User
    console.log("------------------------------------------------");
    console.log("SCENARIO A: Good User (US)");
    await handleUserSignup({ id: "user_good", country: "US" });


    // SCENARIO 2: Bad User
    console.log("------------------------------------------------");
    console.log("SCENARIO B: Bad User (BANNED)");
    const result = await handleUserSignup({ id: "user_bad", country: "BANNED" });

    if (result.success === false) {
        console.log("\nPASS: TypeScript App logic was successfully HALTED by Pipeline.");
    } else {
        console.error("\nFAIL: TypeScript App logic continued execution!");
        process.exit(1);
    }

    process.exit(0);
}

main().catch(console.error);
