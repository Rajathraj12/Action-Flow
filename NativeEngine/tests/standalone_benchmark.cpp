#include "TopologicalSorter.hpp"
#include <iostream>
#include <vector>
#include <string>

using namespace ActionFlow::DSA;

int main() {
    std::cout << "=== ActionFlow C++ Topological Sorter Standalone Test ===\n";

    TopologicalSorter sorter;

    // Test 1: Simple DAG
    std::vector<TaskNode> tasks = {
        {"T1", "Setup DB", 2},
        {"T2", "Build API", 2},
        {"T3", "Build UI", 1},
        {"T4", "Deploy", 3}
    };

    // T1 -> T2 -> T4, and T3 -> T4
    std::vector<DependencyEdge> edges = {
        {"T1", "T2"},
        {"T2", "T4"},
        {"T3", "T4"}
    };

    auto res = sorter.analyzeDependencies(tasks, edges);
    std::cout << "Test 1 (DAG): Success=" << res.success << ", HasCycle=" << res.hasCycle << "\n";
    std::cout << "Sorted Order: ";
    for (const auto& id : res.sortedTaskIds) {
        std::cout << id << " ";
    }
    std::cout << "\nTime: " << res.executionTimeMs << " ms\n";

    // Test 2: Cycle
    edges.push_back({"T4", "T1"});
    auto resCycle = sorter.analyzeDependencies(tasks, edges);
    std::cout << "Test 2 (Cycle): Success=" << resCycle.success << ", HasCycle=" << resCycle.hasCycle << "\n";
    std::cout << "Cycle Path: ";
    for (const auto& id : resCycle.cyclePath) {
        std::cout << id << " ";
    }
    std::cout << "\n";

    return 0;
}
