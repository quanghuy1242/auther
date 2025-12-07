
import { pipelineRepository } from "../../src/lib/auth/pipeline-repository";
import { pipelineEngine } from "../../src/lib/auth/pipeline-engine";

async function main() {
    console.log("--- DEMO 02: Chaining (Pipeline Logic) ---");

    // Script 1: Calculates a raw score (e.g., from generic inputs)
    const calcScript = await pipelineRepository.createScript({
        name: "Calculate Score",
        code: `
      -- Imagine calculating based on inputs
      local score = 85
      helpers.log("Calculated Raw Score: " .. score)
      return { allowed = true, data = { raw_score = score } }
    `,
    });

    // Script 2: Grades the score (Dependent on Script 1)
    const gradeScript = await pipelineRepository.createScript({
        name: "Assign Grade",
        code: `
      -- Read output from previous execution (context.prev)
      local score = context.prev.raw_score
      local grade = "F"
      if score > 90 then grade = "A"
      elseif score > 80 then grade = "B" 
      else grade = "C" end
      
      helpers.log("Assigned Grade: " .. grade)
      return { allowed = true, data = { grade = grade } }
    `,
    });

    // Wire: [ [Calc], [Grade] ] -> Run Calc, then Run Grade
    await pipelineRepository.updateExecutionPlan("grading_event", [[calcScript.id], [gradeScript.id]]);

    console.log("\n> Executing Grading Pipeline...");
    const result = await pipelineEngine.executeTrigger("grading_event", {});

    console.log("Final Pipeline Output:", result.data);
    process.exit(0);
}

main().catch(console.error);
