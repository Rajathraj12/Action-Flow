package com.actionflow.presentation.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.actionflow.data.models.AiSuggestion
import com.actionflow.data.models.TaskSummary
import com.actionflow.data.repository.TaskRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class DashboardUiState(
    val summary: TaskSummary = TaskSummary(
        total = 12,
        completed = 7,
        inProgress = 3,
        overdue = 2,
        pending = 0,
        completionRate = 58,
        velocity = 3.8
    ),
    val aiSuggestions: List<AiSuggestion> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null
)

class DashboardViewModel(
    private val repository: TaskRepository = TaskRepository()
) : ViewModel() {
    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState = _uiState.asStateFlow()

    init {
        // Seed initial suggestions matching web manager dashboard
        val initialSuggestions = listOf(
            AiSuggestion(
                id = "ai-1",
                title = "Complete manager dashboard metrics review",
                assignee = "Rajath",
                assigneeInitials = "R",
                deadline = "Friday, 5:00 PM",
                priority = "HIGH",
                source = "Engineering Sprint Chat",
                context = "\"Need you to complete the manager dashboard metrics and AI task extraction review by Friday @Rajath\"",
                confidence = 0.94
            ),
            AiSuggestion(
                id = "ai-2",
                title = "Database migration script test on staging",
                assignee = "Ankit",
                assigneeInitials = "A",
                deadline = "Tomorrow, 4:00 PM",
                priority = "MEDIUM",
                source = "Direct Chat with Ankit",
                context = "\"Let's connect at 4 PM for the database migration.\"",
                confidence = 0.88
            ),
            AiSuggestion(
                id = "ai-3",
                title = "Update mobile icons and token definitions",
                assignee = "Chirag",
                assigneeInitials = "C",
                deadline = "Next Monday",
                priority = "LOW",
                source = "Design Sync",
                context = "\"Shared the updated Figma tokens and specs.\"",
                confidence = 0.82
            )
        )
        _uiState.value = _uiState.value.copy(aiSuggestions = initialSuggestions)
    }

    fun loadDashboard(workspaceId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            val result = repository.fetchTaskSummary(workspaceId)
            result.onSuccess {
                _uiState.value = _uiState.value.copy(summary = it, isLoading = false)
            }.onFailure {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }
        }
    }

    fun approveSuggestion(suggestion: AiSuggestion, workspaceId: String) {
        viewModelScope.launch {
            // Convert to real task
            repository.createTask(
                workspaceId = workspaceId,
                title = suggestion.title,
                description = "Extracted from: ${suggestion.source}\nContext: ${suggestion.context}",
                priority = suggestion.priority,
                dueDate = suggestion.deadlineDate,
                assigneeId = suggestion.assigneeId
            )
            // Remove from suggestions queue
            _uiState.value = _uiState.value.copy(
                aiSuggestions = _uiState.value.aiSuggestions.filterNot { it.id == suggestion.id }
            )
        }
    }

    fun dismissSuggestion(suggestion: AiSuggestion) {
        rejectSuggestion(suggestion.id)
    }

    fun rejectSuggestion(suggestionId: String) {
        _uiState.value = _uiState.value.copy(
            aiSuggestions = _uiState.value.aiSuggestions.filterNot { it.id == suggestionId }
        )
    }
}
