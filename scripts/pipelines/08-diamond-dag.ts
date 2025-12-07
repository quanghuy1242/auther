/**
 * DEMO 08: Diamond DAG Pattern
 * Tests the most complex realistic graph: A → B, A → C, B+C → D
 */
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 08: Diamond DAG Pattern ---\n");

    // ==========================================================================
    // SETUP: Create 4 scripts forming a diamond
    // ==========================================================================
    //      A (Root: User Data)
    //     / \
    //    B   C  (Layer 2: Parallel Enrichment)
    //     \ /
    //      D   (Layer 3: Final Decision)

    const scriptA = await pipelineRepository.createScript({
        name: "diamond_A",
        code: `
        helpers.log("Node A: Extracting user data")
        local userId = context.userId or "anonymous"
        return { allowed = true, data = { userId = userId, tier = "premium" } }
        `
    });

    const scriptB = await pipelineRepository.createScript({
        name: "diamond_B",
        code: `
        helpers.log("Node B: Calculating score from A")
        local score = 100
        if context.prev.tier == "premium" then score = score + 50 end
        return { allowed = true, data = { score = score } }
        `
    });

    const scriptC = await pipelineRepository.createScript({
        name: "diamond_C",
        code: `
        helpers.log("Node C: Checking reputation from A")
        local reputation = "trusted"
        if context.prev.tier == "basic" then reputation = "standard" end
        return { allowed = true, data = { reputation = reputation } }
        `
    });

    const scriptD = await pipelineRepository.createScript({
        name: "diamond_D",
        code: `
        helpers.log("Node D: Final Decision (Fan-in from B + C)")
        -- Access specific node outputs
        local bScore = context.outputs["${scriptB.id}"] and context.outputs["${scriptB.id}"].score or 0
        local cRep = context.outputs["${scriptC.id}"] and context.outputs["${scriptC.id}"].reputation or "unknown"
        
        helpers.log("  B.score: " .. tostring(bScore))
        helpers.log("  C.reputation: " .. cRep)
        
        local approved = bScore >= 100 and cRep == "trusted"
        return { 
            allowed = approved, 
            data = { 
                final_score = bScore, 
                final_reputation = cRep,
                decision = approved and "approved" or "rejected"
            }
        }
        `
    });

    // DAG: Layer 1 = [A], Layer 2 = [B, C], Layer 3 = [D]
    await pipelineRepository.updateExecutionPlan("diamond_test", [
        [scriptA.id],
        [scriptB.id, scriptC.id],
        [scriptD.id]
    ]);

    console.log("Executing Diamond DAG...\n");
    const result = await pipelineEngine.executeTrigger("diamond_test", { userId: "user123" });

    console.log("Result:", JSON.stringify(result, null, 2));

    const passed = result.allowed === true &&
        result.data?.decision === "approved" &&
        result.data?.final_score === 150 &&
        result.data?.final_reputation === "trusted";

    console.log(`\nStatus: ${passed ? "✅ PASS" : "❌ FAIL"}`);
    console.log("--- DEMO 08 Complete ---");
}

main().catch(console.error);
