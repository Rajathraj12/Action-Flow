#include <napi.h>
#include "TopologicalSorter.hpp"
#include <string>
#include <vector>

using namespace ActionFlow::DSA;

/**
 * Helper to convert Napi::Value to std::string safely.
 */
static std::string SafeGetString(Napi::Value val, const std::string& defaultVal = "") {
    if (val.IsString()) {
        return val.As<Napi::String>().Utf8Value();
    }
    return defaultVal;
}

/**
 * Node-API Function: analyzeDependencies(tasksArray, edgesArray)
 */
Napi::Value AnalyzeDependenciesWrapped(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsArray() || !info[1].IsArray()) {
        Napi::TypeError::New(env, "Invalid arguments: expected (tasksArray: Task[], edgesArray: Edge[])")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    try {
        Napi::Array jsTasks = info[0].As<Napi::Array>();
        Napi::Array jsEdges = info[1].As<Napi::Array>();

        std::vector<TaskNode> tasks;
        tasks.reserve(jsTasks.Length());

        for (uint32_t i = 0; i < jsTasks.Length(); ++i) {
            Napi::Value item = jsTasks[i];
            if (!item.IsObject()) continue;

            Napi::Object obj = item.As<Napi::Object>();
            TaskNode node;
            node.id = SafeGetString(obj.Get("id"));
            node.title = SafeGetString(obj.Get("title"), "Untitled Task");
            if (obj.Has("priority") && obj.Get("priority").IsNumber()) {
                node.priority = obj.Get("priority").As<Napi::Number>().Int32Value();
            }
            tasks.push_back(node);
        }

        std::vector<DependencyEdge> edges;
        edges.reserve(jsEdges.Length());

        for (uint32_t i = 0; i < jsEdges.Length(); ++i) {
            Napi::Value item = jsEdges[i];
            if (!item.IsObject()) continue;

            Napi::Object obj = item.As<Napi::Object>();
            DependencyEdge edge;
            edge.fromTaskId = SafeGetString(obj.Get("fromTaskId"));
            edge.toTaskId = SafeGetString(obj.Get("toTaskId"));
            edges.push_back(edge);
        }

        TopologicalSorter sorter;
        TopologicalResult result = sorter.analyzeDependencies(tasks, edges);

        // Convert C++ Result to JavaScript Object
        Napi::Object jsResult = Napi::Object::New(env);
        jsResult.Set("success", Napi::Boolean::New(env, result.success));
        jsResult.Set("hasCycle", Napi::Boolean::New(env, result.hasCycle));
        jsResult.Set("executionTimeMs", Napi::Number::New(env, result.executionTimeMs));

        if (!result.errorMessage.empty()) {
            jsResult.Set("errorMessage", Napi::String::New(env, result.errorMessage));
        }

        // Sorted Task IDs
        Napi::Array jsSorted = Napi::Array::New(env, result.sortedTaskIds.size());
        for (size_t i = 0; i < result.sortedTaskIds.size(); ++i) {
            jsSorted[i] = Napi::String::New(env, result.sortedTaskIds[i]);
        }
        jsResult.Set("sortedTaskIds", jsSorted);

        // Cycle Path
        Napi::Array jsCycle = Napi::Array::New(env, result.cyclePath.size());
        for (size_t i = 0; i < result.cyclePath.size(); ++i) {
            jsCycle[i] = Napi::String::New(env, result.cyclePath[i]);
        }
        jsResult.Set("cyclePath", jsCycle);

        // Independent Tasks
        Napi::Array jsIndep = Napi::Array::New(env, result.independentTaskIds.size());
        for (size_t i = 0; i < result.independentTaskIds.size(); ++i) {
            jsIndep[i] = Napi::String::New(env, result.independentTaskIds[i]);
        }
        jsResult.Set("independentTaskIds", jsIndep);

        // Ready to execute tasks
        Napi::Array jsReady = Napi::Array::New(env, result.readyToExecuteTaskIds.size());
        for (size_t i = 0; i < result.readyToExecuteTaskIds.size(); ++i) {
            jsReady[i] = Napi::String::New(env, result.readyToExecuteTaskIds[i]);
        }
        jsResult.Set("readyToExecuteTaskIds", jsReady);

        // In-Degrees map
        Napi::Object jsInDegrees = Napi::Object::New(env);
        for (const auto& pair : result.inDegrees) {
            jsInDegrees.Set(pair.first, Napi::Number::New(env, pair.second));
        }
        jsResult.Set("inDegrees", jsInDegrees);

        return jsResult;
    } catch (const std::exception& ex) {
        Napi::Error::New(env, std::string("C++ Exception in DSA Engine: ") + ex.what())
            .ThrowAsJavaScriptException();
        return env.Null();
    } catch (...) {
        Napi::Error::New(env, "Unknown C++ Exception in DSA Engine.")
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    exports.Set(
        Napi::String::New(env, "analyzeDependencies"),
        Napi::Function::New(env, AnalyzeDependenciesWrapped)
    );
    exports.Set(
        Napi::String::New(env, "kahnTopologicalSort"),
        Napi::Function::New(env, AnalyzeDependenciesWrapped)
    );
    exports.Set(
        Napi::String::New(env, "detectCycleDFS"),
        Napi::Function::New(env, AnalyzeDependenciesWrapped)
    );
    return exports;
}

NODE_API_MODULE(actionflow_dsa, InitAll)
