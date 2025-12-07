/**
 * DEMO 10: Heavy Computation Protection
 * Tests that the instruction limit (50k ops) is enforced.
 */
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 10: Heavy Computation Protection ---\n");

    // ==========================================================================
    // TEST 1: Heavy Loop (should hit instruction limit)
    // ==========================================================================
    console.log("TEST 1: Heavy Loop (100,000 iterations)");

    const heavyScript = await pipelineRepository.createScript({
        name: "heavy_loop",
        code: `
        local sum = 0
        for i = 1, 100000 do
            sum = sum + i
        end
        return { allowed = true, data = { sum = sum } }
        `
    });
    await pipelineRepository.updateExecutionPlan("heavy_test", [[heavyScript.id]]);

    const startTime = Date.now();
    const heavyResult = await pipelineEngine.executeTrigger("heavy_test", {});
    const duration = Date.now() - startTime;

    console.log(`  Duration: ${duration}ms`);
    console.log("  Result:", heavyResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${heavyResult.error}`);
    const passed1 = heavyResult.allowed === false &&
        (heavyResult.error?.includes("instruction limit") || heavyResult.error?.includes("timeout"));
    console.log("  Status:", passed1 ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 2: Moderate Loop (should pass - ~10k iterations)
    // ==========================================================================
    console.log("\nTEST 2: Moderate Loop (10,000 iterations)");

    const moderateScript = await pipelineRepository.createScript({
        name: "moderate_loop",
        code: `
        local sum = 0
        for i = 1, 10000 do
            sum = sum + i
        end
        return { allowed = true, data = { sum = sum } }
        `
    });
    await pipelineRepository.updateExecutionPlan("moderate_test", [[moderateScript.id]]);

    const moderateResult = await pipelineEngine.executeTrigger("moderate_test", {});
    console.log("  Result:", moderateResult.allowed ? `ALLOWED (sum = ${moderateResult.data?.sum})` : `BLOCKED: ${moderateResult.error}`);
    console.log("  Status:", moderateResult.allowed === true ? "✅ PASS" : "❌ FAIL");

    // ==========================================================================
    // TEST 3: Nested Loops (should hit instruction limit)
    // ==========================================================================
    console.log("\nTEST 3: Nested Loops (300 x 300 = 90,000 iterations)");

    const nestedScript = await pipelineRepository.createScript({
        name: "nested_loop",
        code: `
        local count = 0
        for i = 1, 300 do
            for j = 1, 300 do
                count = count + 1
            end
        end
        return { allowed = true, data = { count = count } }
        `
    });
    await pipelineRepository.updateExecutionPlan("nested_test", [[nestedScript.id]]);

    const nestedResult = await pipelineEngine.executeTrigger("nested_test", {});
    console.log("  Result:", nestedResult.allowed ? "UNEXPECTED PASS" : `BLOCKED: ${nestedResult.error}`);
    const passed3 = nestedResult.allowed === false &&
        (nestedResult.error?.includes("instruction limit") || nestedResult.error?.includes("timeout"));
    console.log("  Status:", passed3 ? "✅ PASS" : "❌ FAIL");

    console.log("\n--- DEMO 10 Complete ---");
}

main().catch(console.error);
