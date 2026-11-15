#pragma once

#include "GraphTypes.hpp"
#include <unordered_map>
#include <unordered_set>
#include <vector>
#include <string>
#include <queue>
#include <chrono>

namespace ActionFlow::DSA {

class TopologicalSorter {
public:
    TopologicalSorter() = default;
    ~TopologicalSorter() = default;

    /**
     * Complete end-to-end task dependency analysis:
     * 1. Validates task references and checks for self-dependencies.
     * 2. Runs DFS Three-Color cycle detection; reconstructs cycle path if present.
     * 3. Runs Kahn's BFS algorithm to compute valid linear execution sequence.
     * 4. Identifies independent and immediately actionable tasks.
     * 5. Benchmarks execution time in milliseconds.
     */
    TopologicalResult analyzeDependencies(
        const std::vector<TaskNode>& tasks,
        const std::vector<DependencyEdge>& edges
    );

    /**
     * Isolated Kahn's BFS Algorithm implementation.
     * Time Complexity: O(V + E)
     * Space Complexity: O(V + E)
     */
    TopologicalResult kahnSort(
        const std::vector<TaskNode>& tasks,
        const std::vector<DependencyEdge>& edges
    );

    /**
     * Isolated DFS Three-Color Cycle Detection with Path Reconstruction.
     * Time Complexity: O(V + E)
     * Space Complexity: O(V)
     */
    TopologicalResult detectCycleDFS(
        const std::vector<TaskNode>& tasks,
        const std::vector<DependencyEdge>& edges
    );

private:
    bool dfsVisit(
        const std::string& u,
        const std::unordered_map<std::string, std::vector<std::string>>& adj,
        std::unordered_map<std::string, Color>& colors,
        std::unordered_map<std::string, std::string>& parent,
        std::vector<std::string>& detectedCycle
    );
};

} // namespace ActionFlow::DSA
