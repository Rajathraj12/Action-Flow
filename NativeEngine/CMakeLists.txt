cmake_minimum_required(VERSION 3.15)
project(ActionFlowDSA VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Include directories
include_directories(include)

# Static library for core algorithms
add_library(actionflow_dsa_core STATIC
    src/TopologicalSorter.cpp
)

# Benchmark / standalone CLI executable
add_executable(dsa_benchmark
    tests/standalone_benchmark.cpp
)
target_link_libraries(dsa_benchmark PRIVATE actionflow_dsa_core)
