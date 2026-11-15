#pragma once

#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>

namespace ActionFlow::DSA {

/**
 * Represents a single task vertex in the dependency graph.
 */
struct TaskNode {
    std::string id;
    std::string title;
    int priority = 1; // 0: LOW, 1: MEDIUM, 2: HIGH, 3: URGENT
};

/**
 * Directed dependency relationship:
 * fromTaskId is the PREREQUISITE.
 * toTaskId is the DEPENDENT task (cannot execute until fromTaskId completes).
 * Edge: fromTaskId -> toTaskId
 */
struct DependencyEdge {
    std::string fromTaskId;
    std::string toTaskId;
};

/**
 * Comprehensive analysis output returned to Express/TypeScript layer.
 */
struct TopologicalResult {
    bool success = false;
    bool hasCycle = false;
    std::vector<std::string> sortedTaskIds;
    std::vector<std::string> cyclePath; // e.g., ["task-A", "task-B", "task-A"]
    std::vector<std::string> independentTaskIds; // In-degree 0 and out-degree 0
    std::vector<std::string> readyToExecuteTaskIds; // In-degree 0 (no uncompleted blockers)
    std::unordered_map<std::string, int> inDegrees;
    double executionTimeMs = 0.0;
    std::string errorMessage;
};

/**
 * Three-color traversal state for DFS-based cycle detection.
 * WHITE: Unvisited vertex.
 * GRAY:  Currently visiting (in active recursion stack).
 * BLACK: Fully explored vertex (all descendants processed).
 */
enum class Color {
    WHITE = 0,
    GRAY = 1,
    BLACK = 2
};

} // namespace ActionFlow::DSA
