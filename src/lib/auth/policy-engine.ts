import { LuaFactory, LuaEngine } from "wasmoon";
import { getWasmPath } from "@/lib/utils/wasm-path";

interface PooledEngine {
  engine: LuaEngine;
  inUse: boolean;
  createdAt: number;
}

export class LuaPolicyEngine {
  private factory: LuaFactory;
  private pool: PooledEngine[] = [];
  private maxPoolSize = 10;
  private creatingCount = 0;
  private ttlMs = 1000 * 60 * 5; // 5 minutes

  constructor() {
    this.factory = new LuaFactory(getWasmPath());
  }

  private readonly TIMEOUT_MS = 1000; // 1 second timeout
  private readonly MAX_SCRIPT_SIZE = 10240; // 10KB limit

  /**
   * Executes a Lua policy script with the provided context.
   * Uses a pooled Lua engine for performance.
   * Includes timeout protection and script size validation.
   */
  async execute(policyScript: string, context: Record<string, unknown>, throwOnError = false): Promise<boolean> {
    // Validate script size
    if (policyScript.length > this.MAX_SCRIPT_SIZE) {
      const msg = `LuaPolicyEngine: Script exceeds ${this.MAX_SCRIPT_SIZE} byte limit (${policyScript.length} bytes)`;
      console.error(msg);
      if (throwOnError) throw new Error(msg);
      return false;
    }

    // Warn if context is empty
    if (Object.keys(context).length === 0) {
      console.warn("LuaPolicyEngine: Executing policy with empty context - ABAC checks may not work correctly");
    }

    let pooled: PooledEngine | null = null;

    try {
      pooled = await this.acquire();
      const { engine } = pooled;

      // Log pool utilization for debugging
      console.debug(`LuaPolicyEngine pool: ${this.pool.filter(p => p.inUse).length}/${this.pool.length} in use`);

      // Inject context
      engine.global.set("context", context);

      // Execute with timeout protection
      const result = await Promise.race([
        engine.doString(policyScript),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Policy execution timeout")), this.TIMEOUT_MS)
        )
      ]);

      // Clean up globals for next use
      engine.global.set("context", undefined);

      return result === true;
    } catch (error) {
      if (error instanceof Error && error.message === "Policy execution timeout") {
        console.error("LuaPolicyEngine: Script execution timed out after 1 second");
      } else {
        console.error("LuaPolicyEngine execution error:", error);
      }

      if (throwOnError) throw error;
      return false;
    } finally {
      if (pooled) {
        this.release(pooled);
      }
    }
  }

  private async acquire(): Promise<PooledEngine> {
    this.cleanup();

    // Try to find an available engine
    const available = this.pool.find((p) => !p.inUse);
    if (available) {
      available.inUse = true;
      return available;
    }

    // If pool is full, wait or expand? 
    // For now, if full, we just create a temporary one (or burst).
    // Let's stick to soft limit: if < max, create new. If >= max, create non-pooled one?
    // Better: Create a new one and add to pool if space, else just use and dispose.

    // Check against pool size AND pending creations
    if (this.pool.length + this.creatingCount < this.maxPoolSize) {
      this.creatingCount++;
      try {
        const engine = await this.factory.createEngine();
        const pooled: PooledEngine = {
          engine,
          inUse: true,
          createdAt: Date.now(),
        };
        this.pool.push(pooled);
        return pooled;
      } finally {
        this.creatingCount--;
      }
    }

    // Pool is full, force create a temp one (burst)
    // We mark it as 'createdAt: 0' to indicate it shouldn't be kept?
    // Actually, let's just wait/block in a real system. 
    // Here, we'll just create a fresh one to avoid blocking.
    const engine = await this.factory.createEngine();
    return {
      engine,
      inUse: true,
      createdAt: Date.now(), // standard
    };
  }

  private release(pooled: PooledEngine) {
    pooled.inUse = false;

    // If this engine was a "burst" engine (pool is over capacity), close and remove it.
    if (this.pool.length > this.maxPoolSize) {
      // Identify if this specific object is in the pool
      const index = this.pool.indexOf(pooled);
      if (index === -1) {
        // It wasn't in the pool (or was removed), just close it
        pooled.engine.global.close();
        return;
      }
      // It is in the pool, but we are over capacity. 
      // We could implement LRU, but simple FIFO/Removal is fine.
      // actually, if it IS in the pool, we leave it.
    }

    // If it wasn't in the pool array (because we created it as burst and didn't push), close it.
    if (!this.pool.includes(pooled)) {
      pooled.engine.global.close();
    }
  }

  private cleanup() {
    const now = Date.now();
    // Remove expired engines
    // We only remove if they are NOT in use
    this.pool = this.pool.filter(p => {
      if (!p.inUse && (now - p.createdAt > this.ttlMs)) {
        p.engine.global.close();
        return false;
      }
      return true;
    });
  }
}
