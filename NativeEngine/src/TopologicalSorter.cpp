#include "TopologicalSorter.hpp"
#include <algorithm>
#include <stack>

namespace ActionFlow::DSA {

TopologicalResult TopologicalSorter::analyzeDependencies(
    const std::vector<TaskNode>& tasks,
    const std::vector<DependencyEdge>& edges
) {
    const auto startTime = std::chrono::high_resolution_clock::now();
    TopologicalResult result;

    if (tasks.empty()) {
        result.success = true;
        result.hasCycle = false;
        result.executionTimeMs = 0.0;
        return result;
    }

    // 1. Build Task ID Set for O(1) existence verification
    std::unordered_set<std::string> taskSet;
    taskSet.reserve(tasks.size());
    for (const auto& task : tasks) {
        if (task.id.empty()) {
            result.success = false;
            result.errorMessage = "Encountered task with empty ID.";
            return result;
        }
        if (taskSet.find(task.id) != taskSet.end()) {
            result.success = false;
            result.errorMessage = "Duplicate task ID detected in input: " + task.id;
            return result;
        }
        taskSet.insert(task.id);
    }

    // 2. Build Adjacency List, In-degree and Out-degree maps
    // Edge: fromTaskId (prerequisite) -> toTaskId (dependent)
    std::unordered_map<std::string, std::vector<std::string>> adj;
    std::unordered_map<std::string, int> inDegrees;
    std::unordered_map<std::string, int> outDegrees;

    adj.reserve(tasks.size());
    inDegrees.reserve(tasks.size());
    outDegrees.reserve(tasks.size());

    for (const auto& task : tasks) {
        adj[task.id] = std::vector<std::string>();
        inDegrees[task.id] = 0;
        outDegrees[task.id] = 0;
    }

    // Deduplicate edges and validate endpoints
    std::unordered_set<std::string> seenEdges;
    seenEdges.reserve(edges.size());

    for (const auto& edge : edges) {
        if (taskSet.find(edge.fromTaskId) == taskSet.end()) {
            result.success = false;
            result.errorMessage = "Invalid edge: source task does not exist: " + edge.fromTaskId;
            return result;
        }
        if (taskSet.find(edge.toTaskId) == taskSet.end()) {
            result.success = false;
            result.errorMessage = "Invalid edge: target task does not exist: " + edge.toTaskId;
            return result;
        }

        // Self-dependency validation: Task cannot depend on itself
        if (edge.fromTaskId == edge.toTaskId) {
            result.success = false;
            result.hasCycle = true;
            result.cyclePath = {edge.fromTaskId, edge.toTaskId};
            result.errorMessage = "Self-dependency detected on task: " + edge.fromTaskId;

            const auto endTime = std::chrono::high_resolution_clock::now();
            result.executionTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();
            return result;
        }

        const std::string edgeKey = edge.fromTaskId + "->" + edge.toTaskId;
        if (seenEdges.find(edgeKey) == seenEdges.end()) {
            seenEdges.insert(edgeKey);
            adj[edge.fromTaskId].push_back(edge.toTaskId);
            inDegrees[edge.toTaskId]++;
            outDegrees[edge.fromTaskId]++;
        }
    }

    result.inDegrees = inDegrees;

    // 3. Identify Independent & Ready-To-Execute Tasks
    for (const auto& task : tasks) {
        if (inDegrees[task.id] == 0) {
            result.readyToExecuteTaskIds.push_back(task.id);
            if (outDegrees[task.id] == 0) {
                result.independentTaskIds.push_back(task.id);
            }
        }
    }

    // 4. Run DFS Three-Color Cycle Detection
    std::unordered_map<std::string, Color> colors;
    std::unordered_map<std::string, std::string> parent;
    colors.reserve(tasks.size());
    parent.reserve(tasks.size());

    for (const auto& task : tasks) {
        colors[task.id] = Color::WHITE;
    }

    std::vector<std::string> detectedCycle;
    for (const auto& task : tasks) {
        if (colors[task.id] == Color::WHITE) {
            if (dfsVisit(task.id, adj, colors, parent, detectedCycle)) {
                result.hasCycle = true;
                result.cyclePath = detectedCycle;
                result.success = false;
                result.errorMessage = "Circular dependency detected.";

                const auto endTime = std::chrono::high_resolution_clock::now();
                result.executionTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();
                return result;
            }
        }
    }

    // 5. Run Kahn's Algorithm (BFS) for Topological Sorting
    std::queue<std::string> q;
    std::unordered_map<std::string, int> dynamicInDegrees = inDegrees;

    for (const auto& task : tasks) {
        if (dynamicInDegrees[task.id] == 0) {
            q.push(task.id);
        }
    }

    std::vector<std::string> sorted;
    sorted.reserve(tasks.size());

    while (!q.empty()) {
        const std::string u = q.front();
        q.pop();
        sorted.push_back(u);

        for (const auto& v : adj[u]) {
            dynamicInDegrees[v]--;
            if (dynamicInDegrees[v] == 0) {
                q.push(v);
            }
        }
    }

    if (sorted.size() != tasks.size()) {
        result.hasCycle = true;
        result.success = false;
        result.errorMessage = "Kahn's BFS detected a cycle (unresolved in-degrees remain).";
    } else {
        result.hasCycle = false;
        result.success = true;
        result.sortedTaskIds = sorted;
    }

    const auto endTime = std::chrono::high_resolution_clock::now();
    result.executionTimeMs = std::chrono::duration<double, std::milli>(endTime - startTime).count();
    return result;
}

bool TopologicalSorter::dfsVisit(
    const std::string& startNode,
    const std::unordered_map<std::string, std::vector<std::string>>& adj,
    std::unordered_map<std::string, Color>& colors,
    std::unordered_map<std::string, std::string>& parent,
    std::vector<std::string>& detectedCycle
) {
    struct DfsFrame {
        std::string u;
        size_t edgeIndex;
    };

    std::vector<DfsFrame> stack;
    stack.push_back({startNode, 0});
    colors[startNode] = Color::GRAY;

    while (!stack.empty()) {
        auto& top = stack.back();
        const std::string u = top.u;

        auto it = adj.find(u);
        const auto* neighbors = (it != adj.end()) ? &(it->second) : nullptr;
        const size_t numNeighbors = neighbors ? neighbors->size() : 0;

        if (top.edgeIndex < numNeighbors) {
            const std::string& v = (*neighbors)[top.edgeIndex];
            top.edgeIndex++;

            if (colors[v] == Color::GRAY) {
                // Back-edge detected! Reconstruct the exact cycle path
                detectedCycle.clear();
                detectedCycle.push_back(v);

                std::string curr = u;
                while (curr != v && !curr.empty()) {
                    detectedCycle.push_back(curr);
                    auto pIt = parent.find(curr);
                    curr = (pIt != parent.end()) ? pIt->second : "";
                }
                detectedCycle.push_back(v);
                std::reverse(detectedCycle.begin(), detectedCycle.end());
                return true;
            }

            if (colors[v] == Color::WHITE) {
                parent[v] = u;
                colors[v] = Color::GRAY;
                stack.push_back({v, 0});
            }
        } else {
            colors[u] = Color::BLACK;
            stack.pop_back();
        }
    }

    return false;
}

TopologicalResult TopologicalSorter::kahnSort(
    const std::vector<TaskNode>& tasks,
    const std::vector<DependencyEdge>& edges
) {
    return analyzeDependencies(tasks, edges);
}

TopologicalResult TopologicalSorter::detectCycleDFS(
    const std::vector<TaskNode>& tasks,
    const std::vector<DependencyEdge>& edges
) {
    return analyzeDependencies(tasks, edges);
}

} // namespace ActionFlow::DSA
