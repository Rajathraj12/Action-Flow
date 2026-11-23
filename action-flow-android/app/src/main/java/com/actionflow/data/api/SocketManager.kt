package com.actionflow.data.api

import android.util.Log
import io.socket.client.IO
import io.socket.client.Socket
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import org.json.JSONObject

class SocketManager {
    private var socket: Socket? = null
    private val tag = "ActionFlowSocket"
    private var currentToken: String? = null
    private var currentBaseUrl: String? = null

    // Real-time Event Streams
    private val _messageEvents = MutableSharedFlow<Pair<String, JSONObject>>(extraBufferCapacity = 64)
    val messageEvents = _messageEvents.asSharedFlow()

    private val _taskEvents = MutableSharedFlow<Pair<String, JSONObject>>(extraBufferCapacity = 64)
    val taskEvents = _taskEvents.asSharedFlow()

    private val _conversationEvents = MutableSharedFlow<JSONObject>(extraBufferCapacity = 64)
    val conversationEvents = _conversationEvents.asSharedFlow()

    private val _notificationEvents = MutableSharedFlow<JSONObject>(extraBufferCapacity = 64)
    val notificationEvents = _notificationEvents.asSharedFlow()

    fun connect(baseUrl: String, token: String?) {
        try {
            if ((socket?.connected() == true) && (currentToken == token) && (currentBaseUrl == baseUrl)) {
                return
            }

            disconnect()
            currentToken = token
            currentBaseUrl = baseUrl

            Log.d(tag, "[Socket] Connecting to $baseUrl (token present=${!token.isNullOrEmpty()})")

            val options = IO.Options().apply {
                transports = arrayOf("websocket", "polling")
                reconnection = true
                reconnectionAttempts = 20
                reconnectionDelay = 1000
                if (!token.isNullOrEmpty()) {
                    val bearerToken = if (token.startsWith("Bearer ", ignoreCase = true)) token else "Bearer $token"
                    val authMap = mutableMapOf<String, String>()
                    authMap["token"] = token
                    authMap["authorization"] = bearerToken
                    auth = authMap
                    query = "token=$token"
                    extraHeaders = mapOf("Authorization" to listOf(bearerToken))
                }
            }

            socket = IO.socket(baseUrl, options).apply {
                on(Socket.EVENT_CONNECT) {
                    Log.d(tag, "[Socket CONNECTED] Connected to ActionFlow Socket.IO server at $baseUrl (socket ID: ${id()})")
                }
                on(Socket.EVENT_DISCONNECT) { args ->
                    Log.d(tag, "[Socket DISCONNECTED] Reason: ${args.getOrNull(0)}")
                }
                on(Socket.EVENT_CONNECT_ERROR) { args ->
                    Log.w(tag, "[Socket CONNECT_ERROR] Connection error: ${args.getOrNull(0)}")
                }

                // Chat Messages (Standard + Aliases)
                val messageNewEvents = listOf(
                    "message:new",
                    "message_received",
                    "message:created",
                    "new_message",
                    "new-message",
                    "message",
                    "chat:message",
                    "send_message",
                )
                messageNewEvents.forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: return@on
                        Log.d(tag, "[Socket Event Received] [$eventName]: $data")
                        _messageEvents.tryEmit("message:new" to data)
                    }
                }

                val messageUpdatedEvents = listOf("message:updated", "message_edited", "message:edit")
                messageUpdatedEvents.forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: return@on
                        Log.d(tag, "[Socket Event Received] [$eventName]: $data")
                        _messageEvents.tryEmit("message:updated" to data)
                    }
                }

                val messageDeletedEvents = listOf("message:deleted", "message_deleted", "message:delete")
                messageDeletedEvents.forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: return@on
                        Log.d(tag, "[Socket Event Received] [$eventName]: $data")
                        _messageEvents.tryEmit("message:deleted" to data)
                    }
                }

                // Conversations
                val conversationEventsList = listOf(
                    "conversation:updated",
                    "conversation_updated",
                    "conversation:new",
                    "new_conversation",
                    "conversation_created",
                )
                conversationEventsList.forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: return@on
                        Log.d(tag, "[Socket Event Received] [$eventName]: $data")
                        _conversationEvents.tryEmit(data)
                    }
                }

                // Tasks
                val taskTriggers = listOf(
                    "task:created",
                    "task:updated",
                    "task:assigned",
                    "task:status_changed",
                    "task:completed",
                    "task:deleted",
                    "task_created",
                    "task_updated",
                    "task_deleted",
                )
                taskTriggers.forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: JSONObject()
                        Log.d(tag, "[Socket Event Received] [$eventName]: $data")
                        _taskEvents.tryEmit(eventName to data)
                    }
                }

                // Notifications
                listOf("notification:new", "notification:unread_count").forEach { eventName ->
                    on(eventName) { args ->
                        val data = args.getOrNull(0) as? JSONObject ?: return@on
                        Log.d(tag, "[Socket Event Received] [Notification]: $data")
                        _notificationEvents.tryEmit(data)
                    }
                }

                connect()
            }
        } catch (e: Exception) {
            Log.e(tag, "[Socket Error] Socket connection error: ${e.message}", e)
        }
    }

    fun joinWorkspace(workspaceId: String) {
        Log.d(tag, "[Socket Join] Joining workspace room: $workspaceId")
        val payload = JSONObject().put("workspaceId", workspaceId)
        socket?.emit("workspace:join", payload)
        socket?.emit("join_workspace", payload)
        socket?.emit("join_room", workspaceId)
        socket?.emit("join", workspaceId)
    }

    fun leaveWorkspace(workspaceId: String) {
        Log.d(tag, "[Socket Leave] Leaving workspace room: $workspaceId")
        val payload = JSONObject().put("workspaceId", workspaceId)
        socket?.emit("workspace:leave", payload)
        socket?.emit("leave_workspace", payload)
        socket?.emit("leave_room", workspaceId)
        socket?.emit("leave", workspaceId)
    }

    fun joinConversation(conversationId: String, workspaceId: String? = null) {
        Log.d(tag, "[Socket Join] Joining conversation room: $conversationId (ws: $workspaceId)")
        val payload = JSONObject().put("conversationId", conversationId)
        workspaceId?.let { payload.put("workspaceId", it) }
        socket?.emit("conversation:join", payload)
        socket?.emit("join_conversation", payload)
        socket?.emit("join_room", conversationId)
        socket?.emit("join", conversationId)
    }

    fun leaveConversation(conversationId: String) {
        Log.d(tag, "[Socket Leave] Leaving conversation room: $conversationId")
        val payload = JSONObject().put("conversationId", conversationId)
        socket?.emit("conversation:leave", payload)
        socket?.emit("leave_conversation", payload)
        socket?.emit("leave_room", conversationId)
        socket?.emit("leave", conversationId)
    }

    fun markConversationRead(conversationId: String, workspaceId: String? = null) {
        val payload = JSONObject().put("conversationId", conversationId)
        workspaceId?.let { payload.put("workspaceId", it) }
        socket?.emit("conversation:read", payload)
        socket?.emit("mark_conversation_read", payload)
    }

    fun disconnect() {
        Log.d(tag, "[Socket Disconnect] Disconnecting socket")
        socket?.disconnect()
        socket?.off()
        socket = null
        currentToken = null
        currentBaseUrl = null
    }
}
