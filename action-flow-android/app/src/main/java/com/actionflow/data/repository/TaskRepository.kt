package com.actionflow.data.repository

import android.util.Log
import com.actionflow.data.api.ActionFlowApiService
import com.actionflow.data.api.CreateTaskRequest
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.api.SocketManager
import com.actionflow.data.api.UpdateTaskRequest
import com.actionflow.data.models.AuthUser
import com.actionflow.data.models.Task
import com.actionflow.data.models.TaskSummary
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

class TaskRepository(
    private val apiService: ActionFlowApiService = NetworkClient.apiService,
    private val socketManager: SocketManager = NetworkClient.socketManager,
) {
    private val repositoryScope = CoroutineScope(Dispatchers.IO)
    private val tag = "ActionFlowTaskRepo"

    private val _tasks = MutableStateFlow<List<Task>>(emptyList())
    val tasks = _tasks.asStateFlow()

    private val _summary = MutableStateFlow<TaskSummary?>(null)
    val summary = _summary.asStateFlow()

    init {
        // Subscribe to real-time task events from Socket.IO
        repositoryScope.launch {
            socketManager.taskEvents.collect { (event, json) ->
                try {
                    handleSocketTaskEvent(event, json)
                } catch (e: Exception) {
                    Log.w(tag, "Error handling socket task event: ${e.message}", e)
                }
            }
        }
    }

    private fun handleSocketTaskEvent(event: String, json: JSONObject) {
        val data = if (json.has("task") && json.optJSONObject("task") != null) {
            json.optJSONObject("task")!!
        } else if (json.has("data") && json.optJSONObject("data") != null) {
            json.optJSONObject("data")!!
        } else {
            json
        }

        val taskId = data.optString("id").ifEmpty { data.optString("_id") }
        if (taskId.isEmpty()) return

        val incomingTask = parseTaskJson(data)

        when (event) {
            "task:created" -> {
                val current = _tasks.value
                if (current.none { it.effectiveId == incomingTask.effectiveId }) {
                    _tasks.value = listOf(incomingTask) + current
                }
            }
            "task:updated", "task:status_changed", "task:completed", "task:assigned" -> {
                _tasks.value = _tasks.value.map {
                    if (it.effectiveId == incomingTask.effectiveId) incomingTask else it
                }
            }
            "task:deleted" -> {
                _tasks.value = _tasks.value.filterNot { it.effectiveId == taskId }
            }
        }
    }

    private fun parseUserJson(jsonObj: JSONObject?): AuthUser? {
        if (jsonObj == null) return null
        val id = jsonObj.optString("id").ifEmpty { jsonObj.optString("_id") }
        val displayName = jsonObj.optString("displayName").ifEmpty { jsonObj.optString("name") }
        val email = jsonObj.optString("email")
        val initials = jsonObj.optString("initials").ifEmpty { if (displayName.isNotEmpty()) displayName.take(2).uppercase() else "U" }
        val avatarUrl = jsonObj.optString("avatarUrl").ifEmpty { null }
        if (id.isEmpty() && displayName.isEmpty()) return null
        return AuthUser(
            id = id,
            email = email,
            displayName = displayName,
            initials = initials,
            avatarUrl = avatarUrl
        )
    }

    private fun parseTaskJson(json: JSONObject): Task {
        val taskId = json.optString("id").ifEmpty { json.optString("_id") }
        val workspaceId = json.optString("workspaceId")
        val title = json.optString("title")
        val description = json.optString("description")
        val status = json.optString("status", "TODO")
        val priority = json.optString("priority", "MEDIUM")
        val dueDate = json.optString("dueDate").ifEmpty { null }
        val isOverdue = json.optBoolean("isOverdue", false)
        val assigneeObj = json.optJSONObject("assignee")
        val createdByObj = json.optJSONObject("createdBy") ?: json.optJSONObject("creator")
        val srcMsgId = json.optString("sourceMessageId").ifEmpty { null }
        val srcConvId = json.optString("sourceConversationId").ifEmpty { null }

        return Task(
            id = taskId,
            workspaceId = workspaceId,
            title = title,
            description = description,
            status = status,
            priority = priority,
            dueDate = dueDate,
            isOverdue = isOverdue,
            assignee = parseUserJson(assigneeObj),
            createdBy = parseUserJson(createdByObj),
            sourceMessageId = srcMsgId,
            sourceConversationId = srcConvId
        )
    }

    suspend fun fetchTasks(
        workspaceId: String,
        filter: String? = null,
        status: String? = null,
        priority: String? = null,
        assigneeId: String? = null,
        search: String? = null,
    ): Result<List<Task>> = runCatching {
        val res = apiService.getTasks(
            workspaceId = workspaceId,
            filter = filter,
            status = status,
            priority = priority,
            assigneeId = assigneeId,
            search = search,
        )
        _tasks.value = res.tasks
        res.tasks
    }

    suspend fun createTask(
        workspaceId: String,
        title: String,
        description: String = "",
        priority: String = "MEDIUM",
        dueDate: String? = null,
        assigneeId: String? = null,
        sourceMessageId: String? = null,
        sourceConversationId: String? = null,
    ): Result<Task> = runCatching {
        val res = apiService.createTask(
            workspaceId = workspaceId,
            body = CreateTaskRequest(
                title = title,
                description = description,
                priority = priority,
                dueDate = dueDate,
                assigneeId = assigneeId,
                sourceMessageId = sourceMessageId,
                sourceConversationId = sourceConversationId,
            ),
        )
        _tasks.value = listOf(res.task) + _tasks.value.filterNot { it.effectiveId == res.task.effectiveId }
        res.task
    }

    suspend fun updateTask(
        workspaceId: String,
        taskId: String,
        title: String? = null,
        description: String? = null,
        status: String? = null,
        priority: String? = null,
        dueDate: String? = null,
        assigneeId: String? = null,
    ): Result<Task> = runCatching {
        val res = apiService.updateTask(
            workspaceId = workspaceId,
            taskId = taskId,
            body = UpdateTaskRequest(
                title = title,
                description = description,
                status = status,
                priority = priority,
                dueDate = dueDate,
                assigneeId = assigneeId,
            ),
        )
        _tasks.value = _tasks.value.map { if (it.effectiveId == taskId) res.task else it }
        res.task
    }

    suspend fun deleteTask(workspaceId: String, taskId: String): Result<Unit> = runCatching {
        apiService.deleteTask(workspaceId, taskId)
        _tasks.value = _tasks.value.filterNot { it.effectiveId == taskId }
    }

    suspend fun fetchTaskSummary(workspaceId: String): Result<TaskSummary> = runCatching {
        val res = apiService.getTaskSummary(workspaceId)
        _summary.value = res.summary
        res.summary
    }
}
