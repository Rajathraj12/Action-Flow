package com.actionflow.data.repository

import com.actionflow.data.api.ActionFlowApiService
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.models.Workspace
import com.actionflow.data.models.WorkspaceMember
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

class WorkspaceRepository(
    private val apiService: ActionFlowApiService = NetworkClient.apiService
) {
    private val _workspaces = MutableStateFlow<List<Workspace>>(emptyList())
    val workspaces = _workspaces.asStateFlow()

    private val _activeWorkspace = MutableStateFlow<Workspace?>(null)
    val activeWorkspace = _activeWorkspace.asStateFlow()

    private val _members = MutableStateFlow<List<WorkspaceMember>>(emptyList())
    val members = _members.asStateFlow()

    private var selectedWorkspaceId: String? = null

    suspend fun fetchWorkspaces(): Result<List<Workspace>> = runCatching {
        val res = apiService.getWorkspaces()
        val list = res.workspaces
        _workspaces.value = list

        if (list.isNotEmpty()) {
            val savedId = selectedWorkspaceId
            val matched = list.find { it.effectiveId == savedId }
            val selected = matched
                ?: list.find { it.name.contains("Soul Business Solutions", ignoreCase = true) }
                ?: list.first()
            selectWorkspace(selected)
        } else {
            _activeWorkspace.value = null
            NetworkClient.setActiveWorkspace(null)
        }
        list
    }

    fun selectWorkspace(workspace: Workspace) {
        selectedWorkspaceId = workspace.effectiveId
        _activeWorkspace.value = workspace
        NetworkClient.setActiveWorkspace(workspace.effectiveId)
    }

    suspend fun createWorkspace(name: String): Result<Workspace> = runCatching {
        val res = apiService.createWorkspace(mapOf("name" to name))
        val created = res.workspace
        _workspaces.value = _workspaces.value + created
        selectWorkspace(created)
        created
    }

    suspend fun fetchMembers(workspaceId: String): Result<List<WorkspaceMember>> = runCatching {
        val res = apiService.getWorkspaceMembers(workspaceId)
        _members.value = res.members
        res.members
    }
}
