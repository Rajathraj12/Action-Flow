package com.actionflow.presentation.viewmodels

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.models.Workspace
import com.actionflow.data.models.WorkspaceMember
import com.actionflow.data.repository.AuthRepository
import com.actionflow.data.repository.WorkspaceRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class WorkspaceUiState(
    val workspaces: List<Workspace> = emptyList(),
    val activeWorkspace: Workspace? = null,
    val members: List<WorkspaceMember> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

class WorkspaceViewModel(
    private val repository: WorkspaceRepository = WorkspaceRepository(),
    private val authRepository: AuthRepository = AuthRepository()
) : ViewModel() {
    private val tag = "ActionFlowWorkspaceVM"
    private val _uiState = MutableStateFlow(WorkspaceUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.workspaces.collect {
                _uiState.value = _uiState.value.copy(workspaces = it)
            }
        }
        viewModelScope.launch {
            repository.activeWorkspace.collect {
                _uiState.value = _uiState.value.copy(activeWorkspace = it)
                if (it != null && it.effectiveId.isNotEmpty()) {
                    loadMembers(it.effectiveId)
                } else {
                    _uiState.value = _uiState.value.copy(members = emptyList())
                }
            }
        }
        viewModelScope.launch {
            repository.members.collect {
                _uiState.value = _uiState.value.copy(members = it)
            }
        }
        viewModelScope.launch {
            authRepository.currentUser.collect { user ->
                Log.d(tag, "Collected currentUser from AuthRepository: ${user?.email}")
                if (user != null || NetworkClient.authInterceptor.authToken != null) {
                    loadWorkspaces()
                } else {
                    _uiState.value = WorkspaceUiState()
                }
            }
        }
    }

    fun loadWorkspaces() {
        viewModelScope.launch {
            Log.d(tag, "loadWorkspaces starting... (authToken present=${NetworkClient.authInterceptor.authToken != null})")
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.fetchWorkspaces()
            result.onSuccess { list ->
                Log.d(tag, "loadWorkspaces succeeded: received ${list.size} workspaces")
                _uiState.value = _uiState.value.copy(isLoading = false, error = null)
            }.onFailure { err ->
                Log.e(tag, "loadWorkspaces failed: ${err.message}", err)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Failed to load workspaces"
                )
            }
        }
    }

    fun selectWorkspace(workspace: Workspace) {
        repository.selectWorkspace(workspace)
    }

    fun createWorkspace(name: String, onCreated: ((Workspace) -> Unit)? = null) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.createWorkspace(name)
            result.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false)
                onCreated?.invoke(it)
            }.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Failed to create workspace"
                )
            }
        }
    }

    private fun loadMembers(workspaceId: String) {
        viewModelScope.launch {
            repository.fetchMembers(workspaceId)
        }
    }
}
