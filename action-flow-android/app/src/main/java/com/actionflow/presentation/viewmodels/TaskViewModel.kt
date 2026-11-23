package com.actionflow.presentation.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.actionflow.data.models.Task
import com.actionflow.data.repository.TaskRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class TasksUiState(
    val tasks: List<Task> = emptyList(),
    val filteredTasks: List<Task> = emptyList(),
    val selectedTask: Task? = null,
    val activeTab: String = "ALL", // ALL, ASSIGNED, CREATED, COMPLETED, OVERDUE
    val statusFilter: String = "ALL",
    val priorityFilter: String = "ALL",
    val searchQuery: String = "",
    val viewMode: String = "LIST", // LIST or CALENDAR
    val isLoading: Boolean = false,
    val error: String? = null
)

class TaskViewModel(
    private val repository: TaskRepository = TaskRepository()
) : ViewModel() {
    private val _uiState = MutableStateFlow(TasksUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.tasks.collect {
                _uiState.value = _uiState.value.copy(tasks = it)
                applyFilters()
            }
        }
    }

    fun loadTasks(workspaceId: String) {
        if (workspaceId.isBlank()) {
            _uiState.value = _uiState.value.copy(tasks = emptyList(), isLoading = false)
            applyFilters()
            return
        }
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.fetchTasks(workspaceId)
            result.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Failed to load tasks"
                )
                applyFilters()
            }.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false, error = null)
            }
        }
    }

    fun setTab(tab: String) {
        _uiState.value = _uiState.value.copy(activeTab = tab)
        applyFilters()
    }

    fun setPriorityFilter(priority: String) {
        _uiState.value = _uiState.value.copy(priorityFilter = priority)
        applyFilters()
    }

    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        applyFilters()
    }

    fun setViewMode(mode: String) {
        _uiState.value = _uiState.value.copy(viewMode = mode)
    }

    fun selectTask(task: Task?) {
        _uiState.value = _uiState.value.copy(selectedTask = task)
    }

    fun toggleTaskStatus(task: Task) {
        val newStatus = if (task.isDone) "TODO" else "DONE"
        viewModelScope.launch {
            repository.updateTask(
                workspaceId = task.workspaceId,
                taskId = task.effectiveId,
                status = newStatus
            )
        }
    }

    fun createTask(
        workspaceId: String,
        title: String,
        description: String,
        priority: String,
        dueDate: String?,
        assigneeId: String?
    ) {
        if (workspaceId.isBlank() || title.isBlank()) return
        viewModelScope.launch {
            repository.createTask(
                workspaceId = workspaceId,
                title = title.trim(),
                description = description.trim(),
                priority = priority,
                dueDate = dueDate,
                assigneeId = assigneeId
            )
        }
    }

    private fun applyFilters() {
        val all = _uiState.value.tasks
        val tab = _uiState.value.activeTab
        val priority = _uiState.value.priorityFilter
        val query = _uiState.value.searchQuery.trim().lowercase()

        val filtered = all.filter { task ->
            val matchesTab = when (tab) {
                "COMPLETED" -> task.isDone
                "OVERDUE" -> !task.isDone && (task.isOverdue || (!task.dueDate.isNullOrBlank()))
                else -> true
            }
            val matchesPriority = if (priority != "ALL") task.priority.uppercase() == priority else true
            val matchesQuery = if (query.isNotEmpty()) {
                task.title.lowercase().contains(query) || task.description.lowercase().contains(query)
            } else true

            matchesTab && matchesPriority && matchesQuery
        }
        _uiState.value = _uiState.value.copy(filteredTasks = filtered)
    }
}
