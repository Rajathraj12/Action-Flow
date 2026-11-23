package com.actionflow.services

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import com.actionflow.MainActivity
import com.actionflow.R
import kotlin.math.abs

object NotificationHelper {
    const val CHANNEL_ID = "actionflow_notifications"
    const val CHANNEL_NAME = "ActionFlow Notifications"
    private const val TAG = "ActionFlowNotifHelper"

    private val recentNotificationCache = HashMap<String, Long>()
    private const val DEDUPLICATION_WINDOW_MS = 5000L

    @Synchronized
    private fun isDuplicate(dedupKey: String): Boolean {
        val now = System.currentTimeMillis()
        val lastTime = recentNotificationCache[dedupKey] ?: 0L
        if (now - lastTime < DEDUPLICATION_WINDOW_MS) {
            return true
        }
        if (recentNotificationCache.size > 100) {
            recentNotificationCache.entries.removeIf { now - it.value > 10000L }
        }
        recentNotificationCache[dedupKey] = now
        return false
    }

    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val existing = manager.getNotificationChannel(CHANNEL_ID)
            if (existing == null) {
                val channel = NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Real-time task and message notifications for ActionFlow"
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 250, 100, 250)
                    enableLights(true)
                    setShowBadge(true)
                }
                manager.createNotificationChannel(channel)
                Log.d(TAG, "Created NotificationChannel $CHANNEL_ID with IMPORTANCE_HIGH")
            }
        }
    }

    fun showNotification(
        context: Context,
        title: String,
        body: String,
        destinationType: String? = null,
        destinationId: String? = null,
        explicitNotificationId: Int? = null
    ) {
        try {
            val trimmedTitle = title.trim()
            val trimmedBody = body.trim()

            // Filter out generic fallback titles/bodies so only detailed main notifications are posted
            if (trimmedTitle.isBlank() || trimmedTitle.equals("ActionFlow Notification", ignoreCase = true)) {
                Log.d(TAG, "Suppressed generic notification title: '$title'")
                return
            }
            if (trimmedBody.isBlank() || trimmedBody.equals("You have a new update in ActionFlow.", ignoreCase = true)) {
                Log.d(TAG, "Suppressed generic notification body: '$body'")
                return
            }

            // Deduplication key based on normalized title and body text
            val normalizedTitle = trimmedTitle.lowercase()
            val normalizedBody = trimmedBody.lowercase().replace("\"", "")
            val dedupKey = "$normalizedTitle:$normalizedBody"

            if (isDuplicate(dedupKey)) {
                Log.d(TAG, "Skipped duplicate notification within 5s window: '$title' - '$body'")
                return
            }

            createNotificationChannel(context)

            // Permission check for Android 13+
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                    Log.w(TAG, "Cannot show notification: POST_NOTIFICATIONS permission not granted")
                    return
                }
            }

            // Derive stable notification ID per conversation or task so updates replace in-place
            val notificationId = explicitNotificationId ?: if (!destinationId.isNullOrEmpty()) {
                abs(destinationId.hashCode())
            } else if (normalizedTitle.isNotEmpty()) {
                abs(normalizedTitle.hashCode())
            } else {
                10001
            }

            val intent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
                destinationType?.let { putExtra("destinationType", it) }
                destinationId?.let { putExtra("destinationId", it) }
            }

            val pendingIntent = PendingIntent.getActivity(
                context,
                notificationId,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

            val builder = NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_actionflow_logo)
                .setContentTitle(trimmedTitle)
                .setContentText(trimmedBody)
                .setStyle(NotificationCompat.BigTextStyle().bigText(trimmedBody))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setSound(defaultSoundUri)
                .setVibrate(longArrayOf(0, 250, 100, 250))
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)

            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.notify(notificationId, builder.build())
            Log.d(TAG, "Main notification posted successfully (id=$notificationId): title='$trimmedTitle', body='$trimmedBody'")
        } catch (e: Exception) {
            Log.e(TAG, "Error showing notification: ${e.message}", e)
        }
    }
}
