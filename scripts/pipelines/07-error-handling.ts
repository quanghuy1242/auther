/**
 * DEMO 07: Error Handling
 * Tests pipeline robustness against various error conditions.
 */
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 07: Error Handling ---\n");

    // ==========================================================================
    // TEST 1: Script Syntax Error
    // ==========================================================================
    console.log("TEST 1: Syntax Error");
    const syntaxErrorScript = await pipelineRepository.createScript({
        name: "syntax_error",
        code: `return { allowed = true -- Missing closing brace`
    });
    await pipelineRepository.updateExecutionPlan("syntax_test", [[syntaxErrorScript.id]]);

    const syntaxResult = await pipelineEngine.executeTrigger("syntax_test", {});
    console.log("  Result:", syntaxResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${syntaxResult.error}`);
    console.log("  Status:", syntaxResult.allowed === false ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 2: Script Timeout (infinite loop)
    // ==========================================================================
    console.log("\nTEST 2: Timeout (Infinite Loop)");
    const timeoutScript = await pipelineRepository.createScript({
        name: "timeout_loop",
        code: `
        while true do
            -- Infinite loop, should timeout after 1s or hit instruction limit
        end
        return { allowed = true }
        `
    });
    await pipelineRepository.updateExecutionPlan("timeout_test", [[timeoutScript.id]]);

    const startTime = Date.now();
    const timeoutResult = await pipelineEngine.executeTrigger("timeout_test", {});
    const duration = Date.now() - startTime;
    console.log(`  Duration: ${duration}ms`);
    console.log("  Result:", timeoutResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${timeoutResult.error}`);
    console.log("  Status:", timeoutResult.allowed === false ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 3: Missing Output (returns nil)
    // ==========================================================================
    console.log("\nTEST 3: Missing Output (returns nil)");
    const nilScript = await pipelineRepository.createScript({
        name: "nil_output",
        code: `-- Does nothing, returns nil`
    });
    await pipelineRepository.updateExecutionPlan("nil_test", [[nilScript.id]]);

    const nilResult = await pipelineEngine.executeTrigger("nil_test", {});
    console.log("  Result:", nilResult.allowed ? "ALLOWED (nil defaults to allowed)" : "BLOCKED");
    console.log("  Status:", nilResult.allowed === true ? "✅ PASS (graceful handling)" : "❌ FAIL");

    // ==========================================================================
    // TEST 4: Script Size Limit (> 5KB)
    // ==========================================================================
    console.log("\nTEST 4: Script Size Limit");
    const bigCode = "a".repeat(6000); // 6KB > 5KB limit
    const bigScript = await pipelineRepository.createScript({
        name: "big_script",
        code: bigCode
    });
    await pipelineRepository.updateExecutionPlan("size_test", [[bigScript.id]]);

    const sizeResult = await pipelineEngine.executeTrigger("size_test", {});
    console.log("  Result:", sizeResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${sizeResult.error}`);
    console.log("  Status:", sizeResult.allowed === false ? "✅ PASS" : "❌ FAIL");

    console.log("\n--- DEMO 07 Complete ---");
}

main().catch(console.error);
