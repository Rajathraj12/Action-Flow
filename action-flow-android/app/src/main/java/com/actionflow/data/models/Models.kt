package com.actionflow.data.models

import com.actionflow.data.api.NetworkClient
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AuthUser(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val firebaseUid: String = "",
    val email: String = "",
    val displayName: String = "",
    val initials: String = "",
    val role: String = "Member",
    val online: Boolean = false,
    val lastSeen: String? = null,
    val avatarUrl: String? = null
) {
    val uid: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")
}

@Serializable
data class AuthResponse(
    val token: String? = null,
    val user: AuthUser? = null,
    val error: String? = null
)

@Serializable
data class Workspace(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val name: String = "",
    val slug: String? = null,
    val createdBy: String? = null,
    val ownerId: String? = null,
    val myRole: String? = null,
    val userRole: String = "Member",
    val myStatus: String? = null,
    val joinedAt: String? = null,
    val createdAt: String? = null
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")

    val effectiveRole: String
        get() = myRole ?: userRole
}

@Serializable
data class WorkspaceMember(
    val userId: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val displayName: String = "",
    val email: String = "",
    val initials: String = "",
    val role: String = "Member",
    val online: Boolean = false
) {
    val effectiveUserId: String
        get() = if (userId.isNotEmpty()) userId else (mongoId ?: "")
}

@Serializable
data class Participant(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val displayName: String = "",
    val email: String = "",
    val initials: String = "",
    val groupRole: String = "MEMBER",
    val role: String = "Member",
    val online: Boolean = false
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")
}

@Serializable
data class OtherUser(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val displayName: String = "",
    val email: String = "",
    val initials: String = "",
    val online: Boolean = false,
    val role: String? = null
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")
}

@Serializable
data class Conversation(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val workspaceId: String? = null,
    @SerialName("workspace") val mongoWorkspaceId: String? = null,
    val type: String = "DIRECT", // "DIRECT" or "GROUP"
    val name: String = "",
    val description: String? = null,
    val role: String = "",
    val initials: String = "",
    val online: Boolean = false,
    val unread: Int = 0,
    val lastMessageText: String = "",
    val lastMessageTime: String = "",
    val lastMessageAt: String? = null,
    val lastMessageId: String? = null,
    val createdBy: String? = null,
    val admins: List<String> = emptyList(),
    val myGroupRole: String? = null,
    val participantCount: Int = 0,
    val participants: List<Participant> = emptyList(),
    val otherUser: OtherUser? = null
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")

    val effectiveName: String
        get() {
            if (name.isNotEmpty()) return name
            if (otherUser != null && otherUser.displayName.isNotEmpty()) return otherUser.displayName
            val meId = NetworkClient.currentUserId
            val otherPart = participants.find { (it.id.isNotEmpty() && it.id != meId) || (it.mongoId != null && it.mongoId != meId) }
            if (otherPart != null && otherPart.displayName.isNotEmpty()) return otherPart.displayName
            return if (type == "GROUP") "Group Chat" else "Direct Message"
        }

    val effectiveInitials: String
        get() {
            if (initials.isNotEmpty()) return initials
            val title = effectiveName
            return if (title.isNotEmpty()) title.take(2).uppercase() else "U"
        }

    val effectiveLastMessageText: String
        get() {
            if (lastMessageText.isNotEmpty()) return lastMessageText
            return "No messages yet"
        }

    val effectiveLastMessageTime: String
        get() {
            if (lastMessageTime.isNotEmpty()) return lastMessageTime
            if (!lastMessageAt.isNullOrEmpty()) {
                return formatIsoTime(lastMessageAt)
            }
            return ""
        }
}

fun formatIsoTime(isoString: String): String {
    return try {
        if (isoString.contains("T")) {
            val timePart = isoString.substringAfter("T").substringBefore(".")
            val parts = timePart.split(":")
            if (parts.size >= 2) {
                val hour = parts[0].toIntOrNull() ?: 0
                val min = parts[1]
                val ampm = if (hour >= 12) "PM" else "AM"
                val h12 = if (hour % 12 == 0) 12 else hour % 12
                String.format("%02d:%s %s", h12, min, ampm)
            } else isoString
        } else isoString
    } catch (_: Exception) {
        isoString
    }
}

@Serializable
data class MessageSender(
    val id: String = "",
    val displayName: String = "",
    val initials: String = ""
)

@Serializable
data class AiExtractedTask(
    val title: String = "",
    val assigneeName: String? = null,
    val priority: String? = null,
    val deadlineText: String? = null,
    val deadlineDate: String? = null
)

@Serializable
data class AiTaskDetection(
    val isTaskCandidate: Boolean = false,
    val category: String = "general",
    val confidence: Double? = null,
    val tasks: List<AiExtractedTask> = emptyList()
)

@Serializable
data class Message(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val localKey: String? = null,
    val from: String = "me", // "me" or "them"
    val text: String = "",
    val content: String = "",
    val time: String = "",
    val createdAt: String = "",
    val status: String = "sent", // "sent", "delivered", "read"
    val isEdited: Boolean = false,
    val editedAt: String? = null,
    val isDeletedForEveryone: Boolean = false,
    val isDeleted: Boolean = false,
    val deliveredAt: String? = null,
    val readAt: String? = null,
    val sender: MessageSender? = null,
    val aiTaskDetection: AiTaskDetection? = null
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")

    val effectiveText: String
        get() {
            if (isDeletedForEveryone || isDeleted) return "🚫 This message was deleted"
            if (text.isNotEmpty()) return text
            if (content.isNotEmpty()) return content
            return ""
        }

    val effectiveTime: String
        get() {
            if (time.isNotEmpty()) return time
            if (createdAt.isNotEmpty()) return formatIsoTime(createdAt)
            return "Just now"
        }
}

@Serializable
data class Task(
    val id: String = "",
    @SerialName("_id") val mongoId: String? = null,
    val workspaceId: String = "",
    val title: String = "",
    val description: String = "",
    val status: String = "TODO", // TODO, IN_PROGRESS, DONE (or PENDING, COMPLETED)
    val priority: String = "MEDIUM", // LOW, MEDIUM, HIGH, URGENT
    val dueDate: String? = null,
    val completedAt: String? = null,
    val isOverdue: Boolean = false,
    val createdAt: String = "",
    val updatedAt: String? = null,
    val creatorId: String? = null,
    val assigneeId: String? = null,
    val assignee: AuthUser? = null,
    val createdBy: AuthUser? = null,
    val creator: AuthUser? = null,
    val sourceMessageId: String? = null,
    val sourceConversationId: String? = null,
    val sourceSnippet: String? = null
) {
    val effectiveId: String
        get() = if (id.isNotEmpty()) id else (mongoId ?: "")

    val isDone: Boolean
        get() = status.equals("DONE", ignoreCase = true) || status.equals("COMPLETED", ignoreCase = true)

    val effectiveAssigneeName: String
        get() = assignee?.displayName ?: "Unassigned"

    val effectiveAssigneeInitials: String
        get() = assignee?.initials ?: (if (assignee?.displayName?.isNotEmpty() == true) assignee.displayName.take(2).uppercase() else "U")
}

@Serializable
data class TaskSummary(
    val total: Int = 0,
    val totalTasks: Int = 0,
    val completed: Int = 0,
    val completedTasks: Int = 0,
    val activeTasks: Int = 0,
    val inProgress: Int = 0,
    val overdue: Int = 0,
    val overdueTasks: Int = 0,
    val pending: Int = 0,
    val completionRate: Int = 0,
    val velocity: Double = 0.0
) {
    val effectiveTotal: Int
        get() = if (total > 0) total else totalTasks

    val effectiveCompleted: Int
        get() = if (completed > 0) completed else completedTasks

    val effectiveInProgress: Int
        get() = if (inProgress > 0) inProgress else activeTasks

    val effectiveOverdue: Int
        get() = if (overdue > 0) overdue else overdueTasks

    val calculatedRate: Int
        get() = if (effectiveTotal > 0) ((effectiveCompleted.toDouble() / effectiveTotal) * 100).toInt() else completionRate
}

@Serializable
data class TaskSummaryResponse(
    val summary: TaskSummary = TaskSummary()
)

@Serializable
data class AiSuggestion(
    val id: String = "",
    val title: String = "",
    val assignee: String = "Unassigned",
    val assigneeId: String? = null,
    val assigneeInitials: String = "U",
    val isUnassigned: Boolean = false,
    val deadline: String = "No deadline",
    val deadlineDate: String? = null,
    val priority: String = "MEDIUM",
    val source: String = "",
    val context: String = "",
    val confidence: Double = 0.85,
    val messageId: String? = null,
    val conversationId: String? = null
)

@Serializable
data class NotificationItem(
    val id: String = "",
    val type: String = "TASK_ASSIGNED",
    val title: String = "",
    val message: String = "",
    val isRead: Boolean = false,
    val createdAt: String = "",
    val taskId: String? = null,
    val conversationId: String? = null
)

@Serializable
data class SearchResultItem(
    val id: String = "",
    val type: String = "message", // "message", "task", "conversation", "person"
    val title: String = "",
    val subtitle: String? = null,
    val snippet: String? = null,
    val conversationId: String? = null,
    val taskId: String? = null
)

@Serializable
data class SearchResults(
    val messages: List<SearchResultItem> = emptyList(),
    val tasks: List<SearchResultItem> = emptyList(),
    val conversations: List<SearchResultItem> = emptyList(),
    val people: List<SearchResultItem> = emptyList()
)

@Serializable
data class GlobalSearchResponse(
    val query: String = "",
    val total: Int = 0,
    val results: SearchResults = SearchResults()
)
