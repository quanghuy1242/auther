import { luaEnginePool } from "./lua-engine-pool";

export class LuaPolicyEngine {
  private readonly TIMEOUT_MS = 1000; // 1 second timeout
  private readonly MAX_SCRIPT_SIZE = 10240; // 10KB limit

  /**
   * Executes a Lua policy script with the provided context.
   * Uses a pooled Lua engine for performance.
   * Includes timeout protection and script size validation.
   */
  async execute(
    policyScript: string,
    context: Record<string, unknown>,
    throwOnError = false
  ): Promise<boolean> {
    // Validate script size
    if (policyScript.length > this.MAX_SCRIPT_SIZE) {
      const msg = `LuaPolicyEngine: Script exceeds ${this.MAX_SCRIPT_SIZE} byte limit (${policyScript.length} bytes)`;
      console.error(msg);
      if (throwOnError) throw new Error(msg);
      return false;
    }

    // Warn if context is empty
    if (Object.keys(context).length === 0) {
      console.warn(
        "LuaPolicyEngine: Executing policy with empty context - ABAC checks may not work correctly"
      );
    }

    let pooled = null;

    try {
      pooled = await luaEnginePool.acquire();
      const { engine } = pooled;

      // Log pool utilization for debugging
      const stats = luaEnginePool.getStats();
      console.debug(
        `LuaPolicyEngine pool: ${stats.inUse}/${stats.total} in use`
      );

      // Inject context
      engine.global.set("context", context);

      // Execute with timeout protection
      const result = await Promise.race([
        engine.doString(policyScript),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Policy execution timeout")),
            this.TIMEOUT_MS
          )
        ),
      ]);

      // Clean up globals for next use
      engine.global.set("context", undefined);

      return result === true;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Policy execution timeout"
      ) {
        console.error(
          "LuaPolicyEngine: Script execution timed out after 1 second"
        );
      } else {
        console.error("LuaPolicyEngine execution error:", error);
      }

      if (throwOnError) throw error;
      return false;
    } finally {
      if (pooled) {
        luaEnginePool.release(pooled);
      }
    }
  }
}
