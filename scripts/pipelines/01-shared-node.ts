
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 01: Shared Node (Universal Logger) ---");

    // 1. Create a Shared Script (e.g., "Audit Logger")
    // This script runs for ANY trigger and just logs the time and event.
    const auditScript = await pipelineRepository.createScript({
        name: "Audit Logger",
        code: `
      local event = context.trigger_event
      local time = helpers.now()
      helpers.log("AUDIT [" .. event .. "]: " .. time)
      return { allowed = true, data = { audited = true } }
    `,
    });

    // 2. Wire it to MULTIPLE triggers (Login and Signup)
    // This demonstrates "Fan-In" conceptually (multiple sources use one node)
    // or just "Shared Logic" reuse.
    await pipelineRepository.updateExecutionPlan("before_login", [[auditScript.id]]);
    await pipelineRepository.updateExecutionPlan("before_signup", [[auditScript.id]]);

    // 3. Execute "Login"
    console.log("\n> Triggering 'before_login'...");
    await pipelineEngine.executeTrigger("before_login", { trigger_event: "before_login" });

    // 4. Execute "Signup"
    console.log("\n> Triggering 'before_signup'...");
    await pipelineEngine.executeTrigger("before_signup", { trigger_event: "before_signup" });

    console.log("\nPASS: Shared Logic reused across different events.");
    process.exit(0);
}

main().catch(console.error);
