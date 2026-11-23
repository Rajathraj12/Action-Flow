package com.actionflow.data.repository

import android.util.Log
import com.actionflow.data.api.ActionFlowApiService
import com.actionflow.data.api.CreateDirectConvRequest
import com.actionflow.data.api.CreateGroupConvRequest
import com.actionflow.data.api.DeleteMessageRequest
import com.actionflow.data.api.EditMessageRequest
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.api.SendMessageRequest
import com.actionflow.data.api.SocketManager
import com.actionflow.data.models.Conversation
import com.actionflow.data.models.Message
import com.actionflow.data.models.MessageSender
import com.actionflow.services.NotificationHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

class ChatRepository(
    private val apiService: ActionFlowApiService = NetworkClient.apiService,
    private val socketManager: SocketManager = NetworkClient.socketManager
) {
    private val repositoryScope = CoroutineScope(Dispatchers.IO)
    private val tag = "ActionFlowChatRepo"

    private val _conversations = MutableStateFlow<List<Conversation>>(emptyList())
    val conversations = _conversations.asStateFlow()

    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages = _messages.asStateFlow()

    private val _lastHttpStatus = MutableStateFlow<String>("Not requested")
    val lastHttpStatus = _lastHttpStatus.asStateFlow()

    private var activeConversationId: String? = null
    private var lastWorkspaceId: String? = null

    init {
        // Subscribe to real-time message events from Socket.IO
        repositoryScope.launch {
            socketManager.messageEvents.collect { (event, json) ->
                try {
                    handleSocketMessageEvent(event, json)
                } catch (e: Exception) {
                    Log.w(tag, "Error handling socket message event: ${e.message}", e)
                }
            }
        }

        // Subscribe to real-time conversation updates from Socket.IO
        repositoryScope.launch {
            socketManager.conversationEvents.collect { json ->
                try {
                    handleSocketConversationUpdate(json)
                } catch (e: Exception) {
                    Log.w(tag, "Error handling socket conversation event: ${e.message}", e)
                }
            }
        }
    }

    private fun handleSocketMessageEvent(event: String, json: JSONObject) {
        val data = if (json.has("message") && json.optJSONObject("message") != null) {
            json.optJSONObject("message")!!
        } else if (json.has("data") && json.optJSONObject("data") != null) {
            json.optJSONObject("data")!!
        } else {
            json
        }

        val convId = data.optString("conversationId")
            .ifEmpty { data.optString("conversation") }
            .ifEmpty { data.optString("convId") }
            .ifEmpty { data.optString("channelId") }
            .ifEmpty { data.optJSONObject("conversation")?.optString("_id") ?: "" }
            .ifEmpty { data.optJSONObject("conversation")?.optString("id") ?: "" }

        val msgId = data.optString("id")
            .ifEmpty { data.optString("_id") }
            .ifEmpty { data.optString("messageId") }

        Log.d(tag, "[Socket Event] Received $event for convId=$convId, msgId=$msgId")

        if (event == "message:new" || event == "message_received") {
            val text = data.optString("text")
                .ifEmpty { data.optString("content") }
                .ifEmpty { data.optString("body") }
                .ifEmpty { data.optString("message") }

            val time = data.optString("time").ifEmpty { "Just now" }
            val status = data.optString("status", "delivered")

            val senderObj = data.optJSONObject("sender")
                ?: data.optJSONObject("user")
                ?: data.optJSONObject("from")

            val senderId = senderObj?.optString("id")
                ?.ifEmpty { senderObj.optString("_id") }
                ?: data.optString("senderId")
                    .ifEmpty { data.optString("userId") }

            val senderName = senderObj?.optString("displayName")
                ?.ifEmpty { senderObj.optString("name") }
                ?: data.optString("senderName")

            val senderInitials = senderObj?.optString("initials")
                ?: if (senderName.isNotEmpty()) senderName.take(2).uppercase() else "U"

            val sender = if (!senderId.isNullOrEmpty() || senderName.isNotEmpty()) {
                MessageSender(
                    id = senderId ?: "",
                    displayName = senderName,
                    initials = senderInitials
                )
            } else null

            val currentUserId = NetworkClient.currentUserId
            val rawFrom = data.optString("from")
            val isMine = rawFrom == "me" ||
                    (!currentUserId.isNullOrEmpty() && (senderId == currentUserId || senderObj?.optString("email") == currentUserId))

            val fromType = if (isMine) "me" else if (rawFrom.isNotEmpty()) rawFrom else "them"

            val incomingMessage = Message(
                id = msgId.ifEmpty { "msg-${System.currentTimeMillis()}" },
                from = fromType,
                text = text,
                time = time,
                status = status,
                sender = sender
            )

            val isActiveConv = activeConversationId != null &&
                    (convId.isEmpty() || convId == activeConversationId)

            if (isActiveConv) {
                val currentList = _messages.value
                val existingIndex = currentList.indexOfFirst { msg ->
                    msg.effectiveId == incomingMessage.effectiveId || (msgId.isNotEmpty() && msg.id == msgId)
                }
                if (existingIndex >= 0) {
                    val updated = currentList.toMutableList()
                    updated[existingIndex] = incomingMessage
                    _messages.value = updated
                } else {
                    _messages.value = currentList + incomingMessage
                }
            } else if (!isMine) {
                // Show native notification banner for incoming message from colleague
                NetworkClient.applicationContext?.let { ctx ->
                    NotificationHelper.showNotification(
                        context = ctx,
                        title = "New message from ${senderName.ifEmpty { "Colleague" }}",
                        body = text.ifEmpty { "Sent a message" },
                        destinationType = "conversation",
                        destinationId = convId
                    )
                }
            }

            if (convId.isNotEmpty()) {
                val found = _conversations.value.any { it.effectiveId == convId }
                if (found) {
                    _conversations.value = _conversations.value.map { conv ->
                        if (conv.effectiveId == convId) {
                            conv.copy(
                                lastMessageText = text,
                                lastMessageTime = time,
                                unread = if (activeConversationId == convId) 0 else conv.unread + 1
                            )
                        } else conv
                    }
                } else {
                    lastWorkspaceId?.let { wsId ->
                        repositoryScope.launch { fetchConversations(wsId) }
                    }
                }
            }
        } else if (event == "message:updated") {
            val text = data.optString("text").ifEmpty { data.optString("content") }
            _messages.value = _messages.value.map {
                if (it.effectiveId == msgId) it.copy(text = text, isEdited = true) else it
            }
        } else if (event == "message:deleted") {
            _messages.value = _messages.value.map {
                if (it.effectiveId == msgId) it.copy(isDeletedForEveryone = true, text = "🚫 This message was deleted") else it
            }
        }
    }

    private fun handleSocketConversationUpdate(json: JSONObject) {
        val convId = json.optString("conversationId")
            .ifEmpty { json.optString("id") }
            .ifEmpty { json.optString("_id") }

        val lastText = json.optString("lastMessageText")
            .ifEmpty { json.optString("lastMessage") }
        val lastTime = json.optString("lastMessageTime")
            .ifEmpty { json.optString("updatedAt") }

        Log.d(tag, "[Socket Event] Conversation update for convId=$convId, lastText=$lastText")

        val found = _conversations.value.any { it.effectiveId == convId }
        if (found) {
            _conversations.value = _conversations.value.map { conv ->
                if (conv.effectiveId == convId) {
                    conv.copy(
                        lastMessageText = if (lastText.isNotEmpty()) lastText else conv.lastMessageText,
                        lastMessageTime = if (lastTime.isNotEmpty()) lastTime else conv.lastMessageTime
                    )
                } else conv
            }
        } else {
            lastWorkspaceId?.let { wsId ->
                repositoryScope.launch { fetchConversations(wsId) }
            }
        }
    }

    fun setActiveConversation(conversationId: String?, workspaceId: String? = null) {
        activeConversationId?.let { socketManager.leaveConversation(it) }
        activeConversationId = conversationId
        conversationId?.let {
            socketManager.joinConversation(it, workspaceId)
            socketManager.markConversationRead(it, workspaceId)
        }
    }

    suspend fun fetchConversations(workspaceId: String): Result<List<Conversation>> = runCatching {
        lastWorkspaceId = workspaceId
        val requestUrl = "${NetworkClient.currentBaseUrl}api/workspaces/$workspaceId/conversations"
        Log.d(tag, "[REST API] Requesting GET $requestUrl (workspaceId=$workspaceId)")
        _lastHttpStatus.value = "Fetching from $requestUrl..."
        val res = apiService.getConversations(workspaceId)
        val statusMsg = "200 OK (Received ${res.conversations.size} convs)"
        _lastHttpStatus.value = statusMsg
        Log.d(tag, "[REST API] Success: $statusMsg")
        _conversations.value = res.conversations
        res.conversations
    }.onFailure { err ->
        val errMsg = err.message ?: "Network error"
        _lastHttpStatus.value = "Error: $errMsg"
        Log.e(tag, "[REST API Error] Failed GET conversations for workspace $workspaceId: $errMsg", err)
    }

    suspend fun fetchMessages(conversationId: String): Result<List<Message>> = runCatching {
        val requestUrl = "${NetworkClient.currentBaseUrl}api/conversations/$conversationId/messages"
        Log.d(tag, "[REST API] Requesting GET $requestUrl (conversationId=$conversationId)")
        val res = apiService.getMessages(conversationId)
        val currentUserId = NetworkClient.currentUserId
        val processed = res.messages.map { msg ->
            val isMine = currentUserId != null && (
                msg.sender?.id == currentUserId ||
                (msg.sender?.id?.isNotEmpty() == true && msg.sender.id == currentUserId)
            )
            msg.copy(from = if (isMine || msg.from == "me") "me" else "them")
        }
        Log.d(tag, "[REST API] Success: Received ${processed.size} messages for conversation $conversationId")
        _messages.value = processed
        processed
    }.onFailure { err ->
        Log.e(tag, "[REST API Error] Failed GET messages for conv $conversationId: ${err.message}", err)
    }

    suspend fun sendMessage(conversationId: String, text: String): Result<Message> = runCatching {
        Log.d(tag, "[REST API] Sending message in conv $conversationId")
        val res = apiService.sendMessage(conversationId, SendMessageRequest(text = text))
        val rawMsg = res.message
        val currentUserId = NetworkClient.currentUserId
        val isMine = currentUserId != null && (rawMsg.sender?.id == currentUserId)
        val sentMessage = rawMsg.copy(from = if (isMine || rawMsg.from == "me") "me" else "them")

        val currentList = _messages.value
        val existingIndex = currentList.indexOfFirst { msg -> msg.effectiveId == sentMessage.effectiveId }
        if (existingIndex >= 0) {
            val updated = currentList.toMutableList()
            updated[existingIndex] = sentMessage
            _messages.value = updated
        } else {
            _messages.value = currentList + sentMessage
        }

        _conversations.value = _conversations.value.map { conv ->
            if (conv.effectiveId == conversationId) {
                conv.copy(
                    lastMessageText = sentMessage.effectiveText,
                    lastMessageTime = if (sentMessage.effectiveTime.isNotEmpty()) sentMessage.effectiveTime else "Just now"
                )
            } else conv
        }
        sentMessage
    }.onFailure { err ->
        Log.e(tag, "[REST API Error] Failed to send message in conv $conversationId: ${err.message}", err)
    }

    suspend fun editMessage(conversationId: String, messageId: String, newText: String): Result<Message> = runCatching {
        val res = apiService.editMessage(conversationId, messageId, EditMessageRequest(text = newText))
        _messages.value = _messages.value.map { if (it.effectiveId == messageId) res.message else it }
        res.message
    }

    suspend fun deleteMessage(conversationId: String, messageId: String, forEveryone: Boolean): Result<Unit> = runCatching {
        val deleteType = if (forEveryone) "everyone" else "me"
        apiService.deleteMessage(conversationId, messageId, DeleteMessageRequest(deleteType = deleteType))
        _messages.value = _messages.value.map {
            if (it.effectiveId == messageId) {
                if (forEveryone) it.copy(isDeletedForEveryone = true, text = "🚫 This message was deleted")
                else it
            } else it
        }.filterNot { it.effectiveId == messageId && !forEveryone }
    }

    suspend fun createDirectConversation(workspaceId: String, participantId: String): Result<Conversation> = runCatching {
        val res = apiService.createDirectConversation(workspaceId, CreateDirectConvRequest(participantId = participantId))
        _conversations.value = listOf(res.conversation) + _conversations.value.filterNot { it.effectiveId == res.conversation.effectiveId }
        res.conversation
    }

    suspend fun createGroupConversation(
        workspaceId: String,
        name: String,
        description: String?,
        participantIds: List<String>
    ): Result<Conversation> = runCatching {
        val res = apiService.createGroupConversation(
            workspaceId,
            CreateGroupConvRequest(name = name, description = description, participantIds = participantIds)
        )
        _conversations.value = listOf(res.conversation) + _conversations.value.filterNot { it.effectiveId == res.conversation.effectiveId }
        res.conversation
    }
}
