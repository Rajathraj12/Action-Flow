import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export interface TaskDependencyNode {
  id: string;
  title?: string;
  priority?: number; // 0: LOW, 1: MEDIUM, 2: HIGH, 3: URGENT
}

export interface TaskDependencyEdge {
  fromTaskId: string; // Prerequisite task
  toTaskId: string;   // Dependent task
}

export interface DependencyAnalysisResult {
  success: boolean;
  hasCycle: boolean;
  sortedTaskIds: string[];
  cyclePath: string[];
  independentTaskIds: string[];
  readyToExecuteTaskIds: string[];
  inDegrees: Record<string, number>;
  executionTimeMs: number;
  engineUsed: "NATIVE_CPP" | "TYPESCRIPT_FALLBACK";
  errorMessage?: string;
}

// Internal Three-Color Enum for DFS
enum DfsColor {
  WHITE = 0, // Unvisited
  GRAY = 1,  // Visiting (in recursion stack)
  BLACK = 2, // Fully explored
}

// Attempt to load the compiled C++ Native Addon
let nativeModule: any = null;
let nativeLoadError: string | null = null;

const candidatePaths = [
  path.resolve(process.cwd(), "NativeEngine/build/Release/actionflow_dsa.node"),
  path.resolve(process.cwd(), "../NativeEngine/build/Release/actionflow_dsa.node"),
  path.resolve(process.cwd(), "NativeEngine/build/Debug/actionflow_dsa.node"),
  path.resolve(process.cwd(), "dist/NativeEngine/build/Release/actionflow_dsa.node"),
];

for (const p of candidatePaths) {
  if (fs.existsSync(p)) {
    try {
      nativeModule = require(p);
      console.log(`[DsaEngine] Successfully loaded C++ Native Addon from: ${p}`);
      break;
    } catch (err: any) {
      nativeLoadError = err?.message || String(err);
      console.warn(`[DsaEngine] Failed to load binary at ${p}:`, nativeLoadError);
    }
  }
}

if (!nativeModule) {
  console.log(
    "[DsaEngine] C++ Native Addon not loaded. Operating in high-performance TYPESCRIPT_FALLBACK mode (zero-downtime architecture)."
  );
}

/**
 * Pure TypeScript algorithmic implementation of Topological Sort (Kahn's)
 * and DFS Three-Color Cycle Detection with cycle path reconstruction.
 */
export function analyzeDependenciesTypeScript(
  tasks: TaskDependencyNode[],
  edges: TaskDependencyEdge[]
): DependencyAnalysisResult {
  const startHr = process.hrtime.bigint();

  if (!tasks || tasks.length === 0) {
    return {
      success: true,
      hasCycle: false,
      sortedTaskIds: [],
      cyclePath: [],
      independentTaskIds: [],
      readyToExecuteTaskIds: [],
      inDegrees: {},
      executionTimeMs: 0.0,
      engineUsed: "TYPESCRIPT_FALLBACK",
    };
  }

  // 1. Task ID Set & validation
  const taskSet = new Set<string>();
  for (const t of tasks) {
    if (!t.id) {
      return {
        success: false,
        hasCycle: false,
        sortedTaskIds: [],
        cyclePath: [],
        independentTaskIds: [],
        readyToExecuteTaskIds: [],
        inDegrees: {},
        executionTimeMs: Number(process.hrtime.bigint() - startHr) / 1_000_000,
        engineUsed: "TYPESCRIPT_FALLBACK",
        errorMessage: "Encountered task with empty ID.",
      };
    }
    if (taskSet.has(t.id)) {
      return {
        success: false,
        hasCycle: false,
        sortedTaskIds: [],
        cyclePath: [],
        independentTaskIds: [],
        readyToExecuteTaskIds: [],
        inDegrees: {},
        executionTimeMs: Number(process.hrtime.bigint() - startHr) / 1_000_000,
        engineUsed: "TYPESCRIPT_FALLBACK",
        errorMessage: `Duplicate task ID detected in input: ${t.id}`,
      };
    }
    taskSet.add(t.id);
  }

  // 2. Adjacency list, In-Degrees & Out-Degrees
  const adj = new Map<string, string[]>();
  const inDegrees: Record<string, number> = {};
  const outDegrees: Record<string, number> = {};

  for (const t of tasks) {
    adj.set(t.id, []);
    inDegrees[t.id] = 0;
    outDegrees[t.id] = 0;
  }

  const seenEdges = new Set<string>();
  for (const e of edges) {
    if (!taskSet.has(e.fromTaskId)) {
      return {
        success: false,
        hasCycle: false,
        sortedTaskIds: [],
        cyclePath: [],
        independentTaskIds: [],
        readyToExecuteTaskIds: [],
        inDegrees,
        executionTimeMs: Number(process.hrtime.bigint() - startHr) / 1_000_000,
        engineUsed: "TYPESCRIPT_FALLBACK",
        errorMessage: `Invalid edge: source task does not exist: ${e.fromTaskId}`,
      };
    }
    if (!taskSet.has(e.toTaskId)) {
      return {
        success: false,
        hasCycle: false,
        sortedTaskIds: [],
        cyclePath: [],
        independentTaskIds: [],
        readyToExecuteTaskIds: [],
        inDegrees,
        executionTimeMs: Number(process.hrtime.bigint() - startHr) / 1_000_000,
        engineUsed: "TYPESCRIPT_FALLBACK",
        errorMessage: `Invalid edge: target task does not exist: ${e.toTaskId}`,
      };
    }

    // Self-dependency
    if (e.fromTaskId === e.toTaskId) {
      const elapsed = Number(process.hrtime.bigint() - startHr) / 1_000_000;
      return {
        success: false,
        hasCycle: true,
        sortedTaskIds: [],
        cyclePath: [e.fromTaskId, e.toTaskId],
        independentTaskIds: [],
        readyToExecuteTaskIds: [],
        inDegrees,
        executionTimeMs: elapsed,
        engineUsed: "TYPESCRIPT_FALLBACK",
        errorMessage: `Self-dependency detected on task: ${e.fromTaskId}`,
      };
    }

    const edgeKey = `${e.fromTaskId}->${e.toTaskId}`;
    if (!seenEdges.has(edgeKey)) {
      seenEdges.add(edgeKey);
      adj.get(e.fromTaskId)!.push(e.toTaskId);
      inDegrees[e.toTaskId] = (inDegrees[e.toTaskId] || 0) + 1;
      outDegrees[e.fromTaskId] = (outDegrees[e.fromTaskId] || 0) + 1;
    }
  }

  // 3. Identify Independent & Ready-to-Execute tasks
  const independentTaskIds: string[] = [];
  const readyToExecuteTaskIds: string[] = [];
  for (const t of tasks) {
    if (inDegrees[t.id] === 0) {
      readyToExecuteTaskIds.push(t.id);
      if (outDegrees[t.id] === 0) {
        independentTaskIds.push(t.id);
      }
    }
  }

  // 4. DFS Three-Color Cycle Detection with Path Reconstruction (Stack-Safe Iterative Implementation)
  const colors = new Map<string, DfsColor>();
  const parent = new Map<string, string>();
  for (const t of tasks) {
    colors.set(t.id, DfsColor.WHITE);
  }

  let detectedCycle: string[] = [];

  function iterativeDfsVisit(startNode: string): boolean {
    interface DfsFrame {
      u: string;
      edgeIndex: number;
    }

    const stack: DfsFrame[] = [{ u: startNode, edgeIndex: 0 }];
    colors.set(startNode, DfsColor.GRAY);

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const u = top.u;
      const neighbors = adj.get(u) || [];

      if (top.edgeIndex < neighbors.length) {
        const v = neighbors[top.edgeIndex];
        top.edgeIndex++;

        const vColor = colors.get(v);
        if (vColor === DfsColor.GRAY) {
          // Back-edge detected! Reconstruct cycle path
          detectedCycle = [v];
          let curr = u;
          while (curr !== v && curr) {
            detectedCycle.push(curr);
            curr = parent.get(curr) || "";
          }
          detectedCycle.push(v);
          detectedCycle.reverse();
          return true;
        }

        if (vColor === DfsColor.WHITE) {
          parent.set(v, u);
          colors.set(v, DfsColor.GRAY);
          stack.push({ u: v, edgeIndex: 0 });
        }
      } else {
        // All outgoing edges explored: transition from GRAY to BLACK
        colors.set(u, DfsColor.BLACK);
        stack.pop();
      }
    }

    return false;
  }

  for (const t of tasks) {
    if (colors.get(t.id) === DfsColor.WHITE) {
      if (iterativeDfsVisit(t.id)) {
        const elapsed = Number(process.hrtime.bigint() - startHr) / 1_000_000;
        return {
          success: false,
          hasCycle: true,
          sortedTaskIds: [],
          cyclePath: detectedCycle,
          independentTaskIds,
          readyToExecuteTaskIds,
          inDegrees,
          executionTimeMs: elapsed,
          engineUsed: "TYPESCRIPT_FALLBACK",
          errorMessage: "Circular dependency detected.",
        };
      }
    }
  }

  // 5. Kahn's Algorithm (BFS) for Topological Sorting
  const queue: string[] = [];
  const dynamicInDegrees: Record<string, number> = { ...inDegrees };

  for (const t of tasks) {
    if (dynamicInDegrees[t.id] === 0) {
      queue.push(t.id);
    }
  }

  const sortedTaskIds: string[] = [];
  let head = 0; // O(1) queue shift simulation

  while (head < queue.length) {
    const u = queue[head++];
    sortedTaskIds.push(u);

    const neighbors = adj.get(u) || [];
    for (const v of neighbors) {
      dynamicInDegrees[v]--;
      if (dynamicInDegrees[v] === 0) {
        queue.push(v);
      }
    }
  }

  const elapsed = Number(process.hrtime.bigint() - startHr) / 1_000_000;

  if (sortedTaskIds.length !== tasks.length) {
    return {
      success: false,
      hasCycle: true,
      sortedTaskIds: [],
      cyclePath: detectedCycle,
      independentTaskIds,
      readyToExecuteTaskIds,
      inDegrees,
      executionTimeMs: elapsed,
      engineUsed: "TYPESCRIPT_FALLBACK",
      errorMessage: "Kahn's BFS detected a cycle (unresolved in-degrees remain).",
    };
  }

  return {
    success: true,
    hasCycle: false,
    sortedTaskIds,
    cyclePath: [],
    independentTaskIds,
    readyToExecuteTaskIds,
    inDegrees,
    executionTimeMs: elapsed,
    engineUsed: "TYPESCRIPT_FALLBACK",
  };
}

/**
 * Unified DSA Engine Facade:
 * Routes to compiled C++ Native Addon if available;
 * Falls back to optimized TypeScript engine with zero downtime.
 */
export class DsaEngine {
  public static isNativeAvailable(): boolean {
    return nativeModule !== null && typeof nativeModule.analyzeDependencies === "function";
  }

  public static getEngineStatus(): {
    isNative: boolean;
    engineName: string;
    loadError: string | null;
  } {
    return {
      isNative: this.isNativeAvailable(),
      engineName: this.isNativeAvailable() ? "ActionFlow C++ Native Addon (Node-API)" : "ActionFlow TypeScript Fallback",
      loadError: nativeLoadError,
    };
  }

  public static analyzeDependencies(
    tasks: TaskDependencyNode[],
    edges: TaskDependencyEdge[],
    forceEngine?: "NATIVE_CPP" | "TYPESCRIPT_FALLBACK"
  ): DependencyAnalysisResult {
    // 1. Forced TypeScript mode (e.g. for benchmarking comparisons)
    if (forceEngine === "TYPESCRIPT_FALLBACK") {
      return analyzeDependenciesTypeScript(tasks, edges);
    }

    // 2. C++ Native Engine execution if loaded
    if (this.isNativeAvailable()) {
      try {
        const startHr = process.hrtime.bigint();
        const nativeResult = nativeModule.analyzeDependencies(tasks, edges);
        const elapsed = Number(process.hrtime.bigint() - startHr) / 1_000_000;

        return {
          ...nativeResult,
          executionTimeMs: nativeResult.executionTimeMs || elapsed,
          engineUsed: "NATIVE_CPP",
        };
      } catch (err: any) {
        console.warn("[DsaEngine] Native execution error, falling back to TypeScript:", err?.message || err);
        return analyzeDependenciesTypeScript(tasks, edges);
      }
    }

    // 3. Default to TypeScript fallback
    return analyzeDependenciesTypeScript(tasks, edges);
  }
}
