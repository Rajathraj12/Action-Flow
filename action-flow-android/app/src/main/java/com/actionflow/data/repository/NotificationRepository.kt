package com.actionflow.data.repository

import android.util.Log
import com.actionflow.data.api.ActionFlowApiService
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.api.SocketManager
import com.actionflow.data.models.NotificationItem
import com.actionflow.services.NotificationHelper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject

class NotificationRepository(
    private val apiService: ActionFlowApiService = NetworkClient.apiService,
    private val socketManager: SocketManager = NetworkClient.socketManager
) {
    private val scope = CoroutineScope(Dispatchers.IO)
    private val tag = "ActionFlowNotifRepo"

    private val _notifications = MutableStateFlow<List<NotificationItem>>(emptyList())
    val notifications = _notifications.asStateFlow()

    private val _unreadCount = MutableStateFlow(0)
    val unreadCount = _unreadCount.asStateFlow()

    init {
        scope.launch {
            socketManager.notificationEvents.collect { json ->
                try {
                    handleSocketNotification(json)
                } catch (e: Exception) {
                    Log.w(tag, "Error handling socket notification: ${e.message}", e)
                }
            }
        }
    }

    private fun handleSocketNotification(json: JSONObject) {
        val title = json.optString("title")
            .ifEmpty { json.optString("message") }
            .ifEmpty { "ActionFlow Notification" }

        val description = json.optString("description")
            .ifEmpty { json.optString("body") }
            .ifEmpty { json.optString("title") }

        val type = json.optString("type")
        val destObj = json.optJSONObject("destination")
        val destType = destObj?.optString("type")
            ?: json.optString("destinationType")
            ?: if (json.has("taskId")) "task" else if (json.has("conversationId")) "conversation" else null

        val destId = destObj?.optString("id")
            ?: json.optString("destinationId")
            ?: json.optString("taskId")
            .ifEmpty { json.optString("conversationId") }

        Log.d(tag, "[Socket Notification] title='$title', desc='$description', type=$type")

        NetworkClient.applicationContext?.let { ctx ->
            NotificationHelper.showNotification(
                context = ctx,
                title = title,
                body = description,
                destinationType = destType,
                destinationId = destId
            )
        }

        if (json.has("unreadCount")) {
            _unreadCount.value = json.optInt("unreadCount", _unreadCount.value)
        }
    }

    suspend fun fetchNotifications(): Result<List<NotificationItem>> = runCatching {
        val res = apiService.getNotifications()
        _notifications.value = res.notifications
        res.notifications
    }

    suspend fun markAllRead(): Result<Unit> = runCatching {
        apiService.markAllNotificationsRead()
        _unreadCount.value = 0
    }
}
