package com.actionflow.services

import android.os.Build
import android.util.Log
import com.actionflow.data.api.FcmTokenRequest
import com.actionflow.data.api.NetworkClient
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class ActionFlowFirebaseMessagingService : FirebaseMessagingService() {

    private val tag = "ActionFlowFCM"
    private val serviceScope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(tag, "Refreshed FCM Registration Token: ${token.take(15)}...")

        if (!token.isNullOrEmpty() && NetworkClient.authInterceptor.authToken != null) {
            serviceScope.launch {
                try {
                    val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
                    NetworkClient.apiService.registerFcmToken(
                        FcmTokenRequest(
                            fcmToken = token,
                            deviceType = "android",
                            deviceName = deviceName
                        )
                    )
                    Log.d(tag, "[FCM Token] Automatically registered new token with backend")
                } catch (e: Exception) {
                    Log.w(tag, "[FCM Token] Failed to register refreshed token with backend: ${e.message}")
                }
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(tag, "FCM Message received from: ${remoteMessage.from}")

        val dataMap: Map<String, String> = remoteMessage.data

        val title: String = remoteMessage.notification?.title
            ?: dataMap["title"]
            ?: ""

        val body: String = remoteMessage.notification?.body
            ?: dataMap["body"]
            ?: dataMap["message"]
            ?: ""

        // Skip generic notifications without specific titles or bodies
        if (title.isBlank() || title.equals("ActionFlow Notification", ignoreCase = true) || body.isBlank()) {
            Log.d(tag, "Skipped generic FCM notification payload: title='$title', body='$body'")
            return
        }

        val destinationType: String? = dataMap["destinationType"]
            ?: if (dataMap.containsKey("conversationId")) "conversation" else if (dataMap.containsKey("taskId")) "task" else null

        val destinationId: String? = dataMap["destinationId"]
            ?: dataMap["conversationId"]
            ?: dataMap["taskId"]

        NotificationHelper.showNotification(
            context = this.applicationContext,
            title = title,
            body = body,
            destinationType = destinationType,
            destinationId = destinationId
        )
    }
}
