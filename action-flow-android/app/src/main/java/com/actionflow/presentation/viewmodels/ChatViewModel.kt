package com.actionflow.presentation.viewmodels

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.actionflow.data.models.Conversation
import com.actionflow.data.models.Message
import com.actionflow.data.repository.ChatRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ChatUiState(
    val conversations: List<Conversation> = emptyList(),
    val filteredConversations: List<Conversation> = emptyList(),
    val activeConversation: Conversation? = null,
    val messages: List<Message> = emptyList(),
    val filterTab: String = "ALL", // ALL, UNREAD
    val searchQuery: String = "",
    val isLoading: Boolean = false,
    val isSending: Boolean = false,
    val error: String? = null,
    val userEmail: String = "",
    val lastHttpStatus: String = "Not requested",
    val socketStatus: String = "Disconnected"
)

class ChatViewModel(
    private val repository: ChatRepository = ChatRepository()
) : ViewModel() {
    private val tag = "ActionFlowChatViewModel"
    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.conversations.collect { convs ->
                Log.d(tag, "Collected ${convs.size} conversations from repository")
                _uiState.value = _uiState.value.copy(conversations = convs)
                applyFilters()
            }
        }
        viewModelScope.launch {
            repository.messages.collect { msgs ->
                _uiState.value = _uiState.value.copy(messages = msgs)
            }
        }
        viewModelScope.launch {
            repository.lastHttpStatus.collect { status ->
                _uiState.value = _uiState.value.copy(lastHttpStatus = status)
            }
        }
    }

    fun loadConversations(workspaceId: String) {
        if (workspaceId.isBlank()) {
            Log.w(tag, "loadConversations called with blank workspaceId")
            _uiState.value = _uiState.value.copy(
                conversations = emptyList(),
                filteredConversations = emptyList(),
                isLoading = false,
                lastHttpStatus = "Blank workspace ID"
            )
            return
        }
        viewModelScope.launch {
            Log.d(tag, "loadConversations starting for workspaceId: $workspaceId")
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.fetchConversations(workspaceId)
            result.onFailure { err ->
                Log.e(tag, "loadConversations failed for $workspaceId: ${err.message}", err)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Failed to load conversations"
                )
                applyFilters()
            }.onSuccess { list ->
                Log.d(tag, "loadConversations succeeded for $workspaceId: received ${list.size} conversations")
                _uiState.value = _uiState.value.copy(
                    conversations = list,
                    isLoading = false,
                    error = null
                )
                applyFilters()
            }
        }
    }

    fun setFilterTab(tab: String) {
        _uiState.value = _uiState.value.copy(filterTab = tab)
        applyFilters()
    }

    fun setSearchQuery(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        applyFilters()
    }

    private fun applyFilters() {
        val all = _uiState.value.conversations
        val query = _uiState.value.searchQuery.trim().lowercase()
        val tab = _uiState.value.filterTab

        val filtered = all.filter { conv ->
            val matchesTab = if (tab == "UNREAD") conv.unread > 0 else true
            val matchesQuery = if (query.isNotEmpty()) {
                conv.effectiveName.lowercase().contains(query) || conv.effectiveLastMessageText.lowercase().contains(query)
            } else true
            matchesTab && matchesQuery
        }
        Log.d(tag, "applyFilters: total=${all.size}, filtered=${filtered.size}, tab=$tab, query=$query")
        _uiState.value = _uiState.value.copy(filteredConversations = filtered)
    }

    fun selectConversation(conversationId: String, workspaceId: String? = null) {
        val conv = _uiState.value.conversations.find { it.effectiveId == conversationId }
            ?: Conversation(id = conversationId, name = "Chat", type = "DIRECT", initials = "C")
        _uiState.value = _uiState.value.copy(activeConversation = conv)
        repository.setActiveConversation(conversationId, workspaceId)
        loadMessages(conversationId)
    }

    fun closeConversation() {
        repository.setActiveConversation(null)
        _uiState.value = _uiState.value.copy(activeConversation = null, messages = emptyList())
    }

    fun loadMessages(conversationId: String) {
        if (conversationId.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.fetchMessages(conversationId)
            result.onFailure { err ->
                Log.e(tag, "loadMessages failed for conv $conversationId: ${err.message}", err)
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Failed to load messages"
                )
            }.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false, error = null)
            }
        }
    }

    fun sendMessage(text: String) {
        val convId = _uiState.value.activeConversation?.effectiveId ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSending = true)
            repository.sendMessage(convId, text.trim())
            _uiState.value = _uiState.value.copy(isSending = false)
        }
    }

    fun editMessage(messageId: String, newText: String) {
        val convId = _uiState.value.activeConversation?.effectiveId ?: return
        viewModelScope.launch {
            repository.editMessage(convId, messageId, newText)
        }
    }

    fun deleteMessage(messageId: String, forEveryone: Boolean) {
        val convId = _uiState.value.activeConversation?.effectiveId ?: return
        viewModelScope.launch {
            repository.deleteMessage(convId, messageId, forEveryone)
        }
    }
}
